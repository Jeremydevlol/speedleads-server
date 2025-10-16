// Importar la función createConversation desde el controlador de WhatsApp

import { DisconnectReason, downloadContentFromMessage, fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import NodeCache from 'node-cache';
import pLimit from 'p-limit';
import path, { dirname } from 'path';
import pino from 'pino';
import { fileURLToPath } from 'url';
// Removemos la importación circular de io
// import { io as ioSocket } from '../app.js';
import pool, { supabaseAdmin } from '../config/db.js';
import { saveIncomingMessage } from '../controllers/whatsappController.js';
import { analyzeImageBufferWithVision, analyzePdfBufferWithVision } from '../services/googleVisionService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const limit = pLimit(5);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Session store
export const sessions = new Map();
const initializing = new Map();

// Auth directory per user
const AUTH_DIR = path.resolve(__dirname, 'baileys_auth');
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// Cache for last QR (3 min)
const qrCache = new NodeCache({ stdTTL: 180 });

// Variable global para el socket IO (se configurará desde app.js)
let globalIO = null;

// Función para configurar el socket IO desde app.js
export function configureIO(io) {
  globalIO = io;
}

// Expose helper to read last QR for a user
export function getCachedQr(userId) {
  try {
    return qrCache.get(userId) || null;
  } catch {
    return null;
  }
}

// Función para emitir eventos a través del socket IO
export function emitToUser(userId, event, data) {
  if (globalIO) {
    globalIO.to(userId).emit(event, data);
    console.log(`📡 Evento emitido a usuario ${userId}: ${event}`);
  } else {
    console.warn('⚠️ globalIO no configurado, no se puede emitir evento:', event);
  }
}
/*
export const verifyGoogleTokenAndCreateEvent = async (req, res) => {
  const { token } = req.body;  // Solo recibimos el token

  if (!token) {
    return res.status(400).json({ success: false, message: 'Token de Google no proporcionado' });
  }

  try {
    // Crear el cliente OAuth2 de Google
    const oauth2Client = new google.auth.OAuth2();
    // Verificar el token con el ID de cliente de Google
    const ticket = await oauth2Client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID || "", // Tu ID de cliente
    });

    const payload = ticket.getPayload();
    console.log('Token verificado con éxito:', payload);

    // Aquí obtenemos el userId desde el payload de Google
    const userId = payload.sub;  // 'sub' es el ID del usuario en Google

    // Llamar a saveIncomingMessage para guardar el evento
    const result = await saveIncomingMessage(userId, { key: { remoteJid: req.body.conversationId }, message: { conversation: req.body.messageContent } }, req.body.messageContent);

    // Si el evento se guardó correctamente, podemos enviar una respuesta positiva
    return res.status(200).json({
      success: true,
      message: 'Evento creado con éxito',
      data: result,  // Devuelve los datos del evento si es necesario
    });

  } catch (error) {
    console.error('Error al verificar el token de Google o crear el evento:', error);
    return res.status(500).json({ success: false, message: 'Error al verificar el token o crear el evento' });
  }
};*/


export async function startSession(userId) {
  console.log(`Starting session for user ${userId}`);  // Debugging
  if (sessions.has(userId)) {
    console.log(`Session already active for user ${userId}`);  // Debugging
    return sessions.get(userId);
  }
  if (initializing.has(userId)) {
    console.log(`Session for user ${userId} is already being initialized.`);  // Debugging
    return initializing.get(userId);
  }

  const startPromise = (async () => {
    console.log(`Initializing session for user ${userId}`);  // Debugging
    const userAuthDir = `${AUTH_DIR}/${userId}`;
    const { state, saveCreds } = await useMultiFileAuthState(userAuthDir);
    const versionResponse = await fetchLatestBaileysVersion();
    const version = Array.isArray(versionResponse)
      ? versionResponse[0]
      : versionResponse.version;
    const P = pino({ level: 'silent' });
    const sock = makeWASocket({
      version,
      auth: state,
      logger: P,
      browser: ['Uniclick CRM', 'Chrome', '10.15.7'], // Personalizar el navegador que se muestra
      defaultQueryTimeoutMs: 60000,
      printQRInTerminal: false,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      shouldSyncHistoryMessage: () => false,
      options: {
        phoneNumber: '',
        qrTimeout: 30000,
      }
    });
    let contactsSynced = false;  // Bandera para saber si los contactos han sido sincronizados
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      console.log(`Connection update for user ${userId}: ${connection}`);  // Debugging
      if (qr) {
        qrCache.set(userId, qr);
        emitToUser(userId, 'qr-code', qr);
      }
      if (connection === 'open') {
        if (!sessions.has(userId)) {
          console.log(`Guardando la sesión para el usuario ${userId}`);  // Debugging
          sessions.set(userId, sock);  // Guardamos la sesión en sessions
        }
        console.log("Conexión abierta - Esperando contactos...");
        emitToUser(userId, "session-ready", true);
        setTimeout(() => emitToUser(userId, 'chats-updated'), 3000);
        
        // MIGRADO: Usar API de Supabase para verificar configuración de usuario
        const { data: userSettings, error: settingsError } = await supabaseAdmin
          .from('user_settings')
          .select('id')
          .eq('users_id', userId)
          .single();

        if (settingsError && settingsError.code === 'PGRST116') {
          console.log(`No se encontró configuración de usuario, creando con valores predeterminados para ${userId}`);
          
          // MIGRADO: Usar API de Supabase para insertar configuración por defecto
          const { error: insertError } = await supabaseAdmin
            .from('user_settings')
            .insert({
              users_id: userId,
              default_personality_id: 1,
              ai_global_active: false,
              updated_at: new Date().toISOString(),
              tenant: ''
            });
          
          if (insertError) {
            console.error('Error creando configuración de usuario:', insertError);
          } else {
            console.log(`Configuración de usuario ${userId} creada con valores predeterminados.`);
          }
        } else if (settingsError) {
          console.error('Error al verificar configuración de usuario:', settingsError);
        }
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log(`Connection closed: ${code === DisconnectReason.loggedOut ? 'Logged out' : 'Other reason'}`);
        const loggedOut = code === DisconnectReason.loggedOut;
        console.log(`Connection closed for user ${userId}: ${loggedOut ? 'Logged out' : 'Other error'}`);
        initializing.delete(userId);

        if (loggedOut) {
          console.log(`User ${userId} logged out, removing auth files`);  // Debugging
          sessions.delete(userId);
          fs.rmSync(`${AUTH_DIR}/${userId}`, { recursive: true, force: true });
          emitToUser(userId, 'session-closed', { reason: 'logged_out' });
        }

        // Si se cierra la conexión por cualquier motivo, intentamos reconectar
        setTimeout(() => startSession(userId).catch((e) => {
          console.error(`Error intentando reconectar el socket para el usuario ${userId}:`, e);
          // Aquí podrías agregar un delay de reintentos si lo necesitas
        }), 1000);  // Espera 1 segundo antes de intentar reconectar
      }
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        const from = msg.key.remoteJid;
        const waUserId = sock.user.id.split('@')[0].split(':')[0];

        // Verificamos si la conversación existe en la base de datos usando Supabase API
        let convId;
        try {
          const { data: convRows, error } = await supabaseAdmin
            .from('conversations_new')
            .select('id')
            .eq('external_id', from)
            .eq('user_id', userId)
            .eq('wa_user_id', waUserId)
            .limit(1);

          if (error) {
            console.log(`❌ Error verificando conversación: ${error.message}, continuando...`);
            continue;
          }

          // Si no se encuentra la conversación, saltamos este mensaje
          if (!convRows || convRows.length === 0) {
            console.log(`No se encontró la conversación con ID externo: ${from}, ignorando mensaje.`);
            continue;
          }

          // Si la conversación existe, obtenemos el id
          convId = convRows[0].id;
        } catch (error) {
          console.log(`❌ Error general verificando conversación: ${error.message}, continuando...`);
          continue;
        }

        let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        
        // Verificar si hay medios directamente en el mensaje
        const hasMedia = !!(msg.message?.audioMessage || msg.message?.imageMessage || msg.message?.documentMessage);
        
        console.log(`📱 Mensaje recibido - Texto: "${text}" | Tiene medios: ${hasMedia}`);

        // Si no hay texto ni medios, saltamos el mensaje
        if (!text && !hasMedia) {
          console.log('⚠️ Mensaje sin contenido, ignorando');
          continue;
        }

        const senderType = msg.key.fromMe ? 'you' : 'user';

        // Verificamos si el mensaje ya existe en la base de datos usando Supabase API
        // IMPORTANTE: Verificar por conversation_id Y last_msg_id juntos para evitar falsos duplicados
        try {
          const { data: existingMessages, error } = await supabaseAdmin
            .from('messages_new')
            .select('id')
            .eq('conversation_id', convId)
            .eq('last_msg_id', msg.key.id)
            .limit(1);

          if (error) {
            console.log(`⚠️ Error verificando mensaje duplicado: ${error.message}, continuando...`);
          } else if (existingMessages && existingMessages.length > 0) {
            console.log(`Mensaje con ID ${msg.key.id} ya existe en la conversación ${convId}, ignorando.`);
            continue;
          }
        } catch (error) {
          console.log(`⚠️ Error general verificando mensaje duplicado: ${error.message}, continuando...`);
          // Continuar procesando el mensaje aunque falle la verificación
        }

        // Procesar el mensaje con saveIncomingMessage (que ya maneja medios correctamente)
        console.log(`🔄 Procesando mensaje ${msg.key.id} con saveIncomingMessage...`);
        const result = await saveIncomingMessage(userId, msg, text, [], senderType);
        
        // Si hay una respuesta de la IA, la enviamos
        if (result && result.aiReply) {
          console.log('✅ Respuesta de la IA generada:', result.aiReply.substring(0, 100) + '...');
        }
      }
    });
    sock.ev.on('contacts.upsert', async (contacts) => {
      console.log(`Contactos recibidos: ${contacts.length}`);
      const waUserId = sock.user.id.split('@')[0].split(':')[0];
      let processedContacts = 0;
      const totalContacts = contacts.length;
      const contactPromises = contacts.map(contact => limit(async () => {
        const jid = contact.id;
        const cacheKey = `${userId}:contact:${jid}`;
        if (jid === 'status@broadcast' || jid.split('@')[0] === '0') {
          console.log(`Contacto excluido: ${jid}`);
          return;
        }


        const localPart = jid.split('@')[0];
        const newName = contact.name || contact.notify || localPart;
        let newPhotoUrl = null;
        try {
          newPhotoUrl = await sock.profilePictureUrl(jid);
        } catch (err) {
          newPhotoUrl = null;
          console.error(`No se pudo obtener foto de perfil para ${jid}:`, err);
        }

        await syncContactWithRetry(sock, userId, jid, newName, newPhotoUrl, waUserId);
        processedContacts = processedContacts + 1
        emitToUser(userId, 'contact-progress', {
          total: totalContacts,
          processed: processedContacts,
          avatarUrl: newPhotoUrl,
          contactName: newName
        });
      }));

      await Promise.all(contactPromises);
      contactsSynced = true;
      emitToUser(userId, 'chats-updated');
    });
    sock.ev.on('messaging-history.set', async ({ contacts, messages }) => {
      emitToUser(userId, 'open-dialog');
      const waUserId = sock.user.id.split('@')[0].split(':')[0];
      if (contacts && contacts.length) {
        let processedContacts = 0;
        const totalContacts = contacts.length;
        const contactPromises = contacts.map(contact => limit(async () => {
          const jid = contact.id;
          if (jid === 'status@broadcast' || jid.split('@')[0] === '0') {
            console.log(`Contacto excluido: ${jid}`);
            return;
          }
          const cacheKey = `${userId}:contact:${jid}`;
          const localPart2 = jid.split('@')[0];
          const newName = contact.name || contact.notify || localPart2;
          let newPhotoUrl = null;
          try {
            newPhotoUrl = await sock.profilePictureUrl(jid);
          } catch {
            newPhotoUrl = null;
          }
          processedContacts = processedContacts + 1
          await syncContactWithRetry(sock, userId, jid, newName, newPhotoUrl, waUserId);
          emitToUser(userId, 'contact-progress', {
            total: totalContacts,
            processed: processedContacts,
            avatarUrl: newPhotoUrl,
            info: newName,
            capitalText: "Sincronizando contactos",
            text: "Procesando contactos..."
          });
        }));

        await Promise.all(contactPromises);
        contactsSynced = true;
        emitToUser(userId, 'chats-updated');
        emitToUser(userId, 'close-dialog');
      } else {
        console.log("No se recibieron contactos durante la sincronización.");
      }

      if (!contactsSynced) {
        console.log("Esperando a que los contactos sean sincronizados...");
        return;
      }

      //   if (messages && messages.length) {
      //     // Agrupar los mensajes por conversación (jid)
      //     const messagesByChat = messages.reduce((acc, message) => {
      //         const jid = message.key.remoteJid;
      //         if (!acc[jid]) acc[jid] = [];
      //         acc[jid].push(message);
      //         return acc;
      //     }, {});

      //     // Emitir el total de mensajes a procesar al frontend
      //     // Dentro de 'messaging-history.set'
      //     const totalMessages = messages.length;
      //     let processedMessages = 0;

      //     // Emitir el total de mensajes a procesar al frontend
      //     ioSocket.to(userId).emit('sync-progress', {
      //       totalMessages,
      //       processedMessages: 0, // Inicialmente no hay mensajes procesados
      //       capitalText:"Procesando mensajes usuarios",
      //       text: 'Iniciando el procesamiento de mensajes...',
      //     });

      //     // Procesar mensajes por lotes
      //     for (const [remoteJid, msgs] of Object.entries(messagesByChat)) {
      //       try {
      //         // Ordenar los mensajes por timestamp
      //         const sortedMsgs = msgs.sort((a, b) => {
      //           const aTime = a.messageTimestamp.low + (a.messageTimestamp.high * 2 ** 32);
      //           const bTime = b.messageTimestamp.low + (b.messageTimestamp.high * 2 ** 32);
      //           return bTime - aTime;
      //         });

      //         // Limitar a los últimos 50 mensajes
      //         const limitedMsgs = sortedMsgs.slice(0, 50);

      //         // Procesar mensajes (con validación e inserción en la base de datos)
      //         await saveMessagesInBatch(userId, limitedMsgs);

      //         // Incrementar el contador de mensajes procesados
      //         processedMessages += limitedMsgs.length;

      //         // Emitir progreso por cada lote de mensajes procesados
      //         ioSocket.to(userId).emit('sync-progress', {
      //           totalMessages,
      //           processedMessages,
      //           capitalText:"Procesando mensajes usuarios",
      //           text: 'Iniciando el procesamiento de mensajes...',
      //           info: `Procesando mensajes para ${remoteJid}...`,
      //         });

      //       } catch (error) {
      //         console.error(`Error guardando mensajes para ${remoteJid}:`, error);
      //         processedMessages++; // Aseguramos que el contador se incremente aunque haya error
      //       }
      //     }
      //     // Emitir progreso final
      //     ioSocket.to(userId).emit('sync-progress', {
      //       totalMessages,
      //       processedMessages,
      //       capitalText:"!Listo!",
      //       text: 'Procesamiento completado.',
      //     });
      //     ioSocket.to(userId).emit('chats-updated');

      // } 
    });
    sock.ev.on('contacts.update', async (contacts) => {
      for (const contact of contacts) {
        const jid = contact.id;
        const localPart3 = jid.split('@')[0];
        const newName = contact.name || contact.notify || localPart3;
        if (jid === 'status@broadcast' || jid.split('@')[0] === '0') {
          console.log(`Contacto excluido: ${jid}`);
          return;
        }
        // Solo si WhatsApp nos envía un name explícito, lanzamos el UPDATE
        if (newName && newName.trim() !== '') {
          try {
            const { data, error } = await supabaseAdmin
              .from('conversations_new')
              .update({ contact_name: newName })
              .eq('external_id', jid)
              .eq('user_id', userId)
              .neq('contact_name', newName);

            if (error) {
              console.error(`Error actualizando nombre de contacto ${jid}:`, error);
            } else if (data && data.length > 0) {
              console.log(`Contacto ${jid} renombrado a "${newName}"`);
            }
          } catch (dbErr) {
            console.error(`Error actualizando nombre de contacto ${jid}:`, dbErr);
          }
        } else {
          console.log(`No hay nuevo nombre para ${jid}, no se actualiza.`);
        }

      }
    });
    sock.ev.on('error', async (error) => {
      console.error('WebSocket error for user', userId, error);

      // Intenta reconectar automáticamente sin lanzar excepciones
      try {
        console.log(`Intentando reconectar...`);
        await startSession(userId);
      } catch (e) {
        console.error('Error al reconectar el socket:', e);
        setTimeout(() => startSession(userId), 1000);  // Reintenta después de 1 segundo
      }
    });
    return sock;
  })();

  initializing.set(userId, startPromise);
  return startPromise;
}


async function processMedia(conversationId, msg, userId) {
  console.log(`🎯 Iniciando procesamiento de media para mensaje: ${msg.key.remoteJid}`);
  const mediaItems = [];

  const mediaDefs = [
    { field: 'imageMessage', type: 'image', downloadType: 'image' },
    { field: 'documentMessage', type: 'pdf', downloadType: 'document' },
    { field: 'audioMessage', type: 'audio', downloadType: 'audio' }
  ];

  for (const { field, type, downloadType } of mediaDefs) {
    const content = msg.message?.[field];
    
    if (!content) {
      console.log(`No hay contenido para el campo: ${field}`);
      continue;
    }

    try {
      // Verificar si el mensaje ya existe en la base de datos usando Supabase API
      try {
        const { data: existingMessages, error } = await supabaseAdmin
          .from('messages_new')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('last_msg_id', msg.key.id)
          .limit(1);

        if (error) {
          console.log(`⚠️ Error verificando mensaje duplicado en media: ${error.message}, continuando...`);
        } else if (existingMessages && existingMessages.length > 0) {
          console.log(`Mensaje con ID ${msg.key.id} ya existe en la conversación ${conversationId}, ignorando.`);
          continue;
        }
      } catch (error) {
        console.log(`⚠️ Error general verificando mensaje duplicado en media: ${error.message}, continuando...`);
        // Continuar procesando el mensaje aunque falle la verificación
      }

      // Emitir evento de inicio de análisis
      emitToUser(msg.key.remoteJid, 'analyzing-media', { 
        conversationId: msg.key.remoteJid,
        type: type
      });

      console.log(`📥 Descargando contenido de tipo ${downloadType} para el mensaje ${msg.key.id}`);
      const stream = await downloadContentFromMessage(content, downloadType);
      let buffer = Buffer.alloc(0);

      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      let extractedText = '';

      // Procesar según el tipo de medio (OPTIMIZADO)
      switch (type) {
        case 'audio':
          console.log('🎵 Procesando audio...');
          try {
            // Verificar que tenemos todo lo necesario
            if (!userId) {
              throw new Error('UserId no disponible para procesamiento de audio');
            }

            // Verificar que la sesión sigue activa antes de procesar
            const sock = sessions.get(userId);
            if (!sock || !sock.user) {
              console.log('⚠️ Sesión no disponible, saltando procesamiento de audio');
              extractedText = 'Audio recibido pero no se pudo procesar (sesión no activa)';
            } else if (buffer.length === 0) {
              console.log('⚠️ Buffer de audio vacío');
              extractedText = 'Audio recibido pero el archivo está vacío';
            } else if (buffer.length > 25 * 1024 * 1024) {
              console.log('⚠️ Audio demasiado grande');
              extractedText = 'Audio recibido pero es demasiado grande para procesar (máx 25MB)';
            } else {
              // Transcribir con timeout adicional
              console.log(`🎵 Iniciando transcripción de audio (${(buffer.length / 1024 / 1024).toFixed(2)}MB)...`);
              
              const { transcribeAudioBuffer } = await import('../services/openaiService.js');
              
              // Agregar timeout al procesamiento completo
              const transcriptionPromise = transcribeAudioBuffer(buffer);
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout de transcripción (60s)')), 60000)
              );
              
              extractedText = await Promise.race([transcriptionPromise, timeoutPromise]);
              
              if (!extractedText || extractedText.trim().length === 0) {
                extractedText = 'Audio procesado pero la transcripción está vacía';
              } else {
                console.log(`✅ Audio transcrito exitosamente (${extractedText.length} caracteres):`, extractedText.substring(0, 100) + '...');
              }
            }
          } catch (audioError) {
            console.error('❌ Error transcribiendo audio:', audioError);
            // Proveer mensaje más específico según el error
            if (audioError.message.includes('Cuota de OpenAI agotada')) {
              extractedText = 'Audio recibido pero no se pudo procesar: cuota de OpenAI agotada';
            } else if (audioError.message.includes('conexión') || audioError.message.includes('Connection')) {
              extractedText = 'Audio recibido pero no se pudo procesar: error de conexión con OpenAI';
            } else if (audioError.message.includes('demasiado grande') || audioError.message.includes('25MB')) {
              extractedText = 'Audio recibido pero es demasiado grande para procesar';
            } else if (audioError.message.includes('Timeout')) {
              extractedText = 'Audio recibido pero la transcripción tardó demasiado';
            } else if (audioError.message.includes('UserId no disponible')) {
              extractedText = 'Audio recibido pero error interno de sesión';
            } else {
              extractedText = `Audio recibido pero no se pudo transcribir: ${audioError.message}`;
            }
          }
          break;

        case 'image':
          console.log('🖼️ Procesando imagen con Google Vision...');
          try {
            extractedText = await analyzeImageBufferWithVision(buffer);
            console.log(`✅ Texto extraído de la imagen (${extractedText.length} caracteres):`, extractedText.substring(0, 200) + '...');
          } catch (visionError) {
            console.error('❌ Error en Google Vision para imagen:', visionError);
            extractedText = 'Imagen procesada pero no se pudo extraer texto';
          }
          break;

        case 'pdf':
          console.log('📄 Procesando PDF...');
          try {
            // Primero intentar con Google Vision directamente
            extractedText = await analyzePdfBufferWithVision(buffer);
            
            // Si no se extrae texto, intentar con pdf-parse
            if (!extractedText || extractedText.trim().length < 10) {
              console.log('📸 Intentando extracción alternativa del PDF...');
              // Crear archivo temporal para procesamiento adicional
              const tempDir = path.join(process.cwd(), 'uploads');
              if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
              }
              
              const tempFile = path.join(tempDir, `pdf-${Date.now()}.pdf`);
              fs.writeFileSync(tempFile, buffer);
              
              try {
                // Intentar con pdf-parse
                const pdfParse = (await import('pdf-parse-debugging-disabled')).default;
                const data = await pdfParse(buffer);
                extractedText = data.text.trim();
                
                // Si aún no hay texto, usar OCR
                if (!extractedText || extractedText.length < 10) {
                  const { ocrPdfScaneado } = await import('../utils/fileUtils.js');
                  extractedText = await ocrPdfScaneado(tempFile);
                }
              } finally {
                // Limpiar archivo temporal
                try {
                  fs.unlinkSync(tempFile);
                } catch {}
              }
            }
            
            console.log(`✅ Texto extraído del PDF (${extractedText.length} caracteres):`, extractedText.substring(0, 200) + '...');
          } catch (visionError) {
            console.error('❌ Error procesando PDF:', visionError);
            extractedText = 'Documento PDF procesado pero no se pudo extraer texto';
          }
          break;
      }

      // Agregar sufijos específicos según el tipo
      if (type === 'audio') {
        extractedText += "\nFinal del audio";
      } else if (type === 'image') {
        extractedText += "\nFinal de la imagen";
      } else if (type === 'pdf') {
        extractedText += "\nFinal del PDF";
      }

      // Agregar instrucción para análisis conciso
      extractedText += "\nQuiero que seas conciso y hagas un análisis con la información que contiene este archivo";

      // Agregar el elemento de media con texto extraído
      mediaItems.push({
        type,
        mimeType: content.mimetype,
        data: buffer.toString('base64'),
        extractedText: extractedText || `Contenido de ${type} procesado`,
        filename: content.fileName || `${type}-${Date.now()}`
      });

      // Emitir evento de fin de análisis
      emitToUser(msg.key.remoteJid, 'media-analyzed', { 
        conversationId: msg.key.remoteJid,
        type: type,
        extractedText: extractedText
      });

    } catch (e) {
      console.error(`❌ Error descargando media de tipo ${downloadType} para el mensaje ${msg.key.id}:`, e);
      // Emitir evento de error
      emitToUser(msg.key.remoteJid, 'media-analysis-error', { 
        conversationId: msg.key.remoteJid,
        type: type,
        error: e.message
      });
    }
  }

  if (mediaItems.length === 0) {
    console.log('No se encontraron elementos multimedia para este mensaje.');
  } else {
    console.log(`✅ Se procesaron ${mediaItems.length} elementos multimedia`);
  }

  return mediaItems;
}

export function configureSocket(io) {
  // Configurar el socket IO global para el servicio de WhatsApp
  configureIO(io);
  
  io.on('connection', (socket) => {
    socket.on('join', async ({ token }) => {
      let uid
      if (token) {
        try {
          const payload = jwt.verify(token, JWT_SECRET)
          uid = payload.userId || payload.sub
        } catch (err) {
          console.error('Error verificando token:', err);
          socket.emit('error-message', 'Token inválido')
          return;
        }
      }
      
      if (!uid) {
        socket.emit('error-message', 'No se pudo identificar al usuario')
        return;
      }
      
      socket.join(uid)
      try {
        console.log(`Starting session for user ${uid}`);
        await startSession(uid)
      } catch (err) {
        console.error('Error starting session:', err);
        socket.emit('error-message', 'Error iniciando sesión')
      }
    })
    
    socket.on('send-message', async ({ token, conversationId, textContent, attachments }) => {
      let userId;
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        userId = payload.userId || payload.sub;
        
        // Importar y verificar rate limiting
        const { checkRateLimit } = await import('../utils/rateLimit.js');
        try {
          checkRateLimit(userId);
        } catch (rateLimitError) {
          socket.emit('error', rateLimitError.message);
          return;
        }
        
        const sock = sessions.get(userId);
        
        if (!sock || !sock.user) {
          socket.emit('error', 'WhatsApp no está conectado. Por favor, escanea el código QR.');
          return;
        }
        
        await sock.sendMessage(conversationId, { text: textContent });
        socket.emit('message-sent', { success: true, conversationId });
      } catch (error) {
        console.error('Error al procesar el mensaje:', error);
        socket.emit('error', `Error al procesar el mensaje: ${error.message}`);
      }
    });

    // Nuevo evento para envío directo a número
    socket.on('send-to-number', async ({ token, to, text, attachments, defaultCountry }) => {
      let userId;
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        userId = payload.userId || payload.sub;
        
        if (!userId) {
          socket.emit('error', 'Token inválido o usuario no identificado');
          return;
        }

        const sock = sessions.get(userId);
        if (!sock) {
          socket.emit('error', 'WhatsApp no está conectado. Por favor, escanea el código QR.');
          return;
        }

        if (!to || !text) {
          socket.emit('error', 'Se requieren "to" y "text"');
          return;
        }

        console.log(`📱 Socket: Enviando mensaje a número ${to}`);

        // Usar la función del controlador que maneja JID y BD
        const { sendMessageToNumber } = await import('../controllers/whatsappController.js');
        const result = await sendMessageToNumber(
          userId, 
          to, 
          text, 
          attachments || [], 
          'you',
          defaultCountry || '34'
        );

        socket.emit('message-sent', { 
          success: true, 
          externalId: result.externalId,
          conversationId: result.conversationId,
          messageId: result.messageId,
          normalizedJid: result.normalizedJid
        });

      } catch (error) {
        console.error('Error en send-to-number:', error);
        socket.emit('error', `Error al enviar mensaje: ${error.message}`);
      }
    });

    // Nuevo evento para envío de mensaje generado por IA
    socket.on('send-ai-message', async ({ token, to, prompt, defaultCountry, personalityId }) => {
      let userId;
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        userId = payload.userId || payload.sub;
        
        if (!userId) {
          socket.emit('error', 'Token inválido o usuario no identificado');
          return;
        }

        const sock = sessions.get(userId);
        if (!sock || !sock.user) {
          socket.emit('error', 'WhatsApp no está conectado. Por favor, escanea el código QR.');
          return;
        }

        if (!to || !prompt) {
          socket.emit('error', 'Se requieren "to" y "prompt"');
          return;
        }

        console.log(`🤖 Socket: Generando mensaje IA para número ${to} con prompt: "${prompt.substring(0, 50)}..."`);

        // Usar la función del controlador
        const { sendAIMessage } = await import('../controllers/whatsappController.js');
        const result = await sendAIMessage(
          userId, 
          to, 
          prompt, 
          defaultCountry || '34',
          personalityId
        );

        socket.emit('ai-message-sent', { 
          success: true, 
          externalId: result.externalId,
          conversationId: result.conversationId,
          messageId: result.messageId,
          aiPrompt: result.aiPrompt,
          aiResponse: result.aiResponse,
          personalityUsed: result.personalityUsed,
          normalizedJid: result.normalizedJid
        });

      } catch (error) {
        console.error('Error en send-ai-message:', error);
        socket.emit('error', `Error generando mensaje IA: ${error.message}`);
      }
    });
    
    socket.on('get-qr', async ({ token }) => {
      let userId;
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        userId = payload.userId || payload.sub;
        
        // Intentar obtener el QR
        const qr = getCachedQr(userId);
        if (qr) {
          socket.emit('qr-code', qr);
        } else {
          // Iniciar sesión para generar nuevo QR
          await startSession(userId);
          // El QR se emitirá automáticamente cuando esté disponible
        }
      } catch (error) {
        console.error('Error obteniendo QR:', error);
        socket.emit('error', 'Error obteniendo código QR');
      }
    });

    socket.on('get-contacts', async ({ token }) => {
      let userId;
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        userId = payload.userId || payload.sub;
        
        // Importar la función getContacts dinámicamente para evitar importación circular
        const { getContacts } = await import('../controllers/whatsappController.js');
        const contacts = await getContacts(userId);
        
        socket.emit('contacts-loaded', { 
          success: true, 
          contacts,
          total: contacts.length 
        });
      } catch (error) {
        console.error('Error obteniendo contactos:', error);
        socket.emit('contacts-loaded', { 
          success: false, 
          message: error.message,
          contacts: [],
          total: 0
        });
      }
    });
    
    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${socket.id}`);
    });
  })
}

async function syncContactWithRetry(sock, userId, jid, newName, newPhotoUrl, waUserId, retryCount = 0) {
  console.log(newName);
  if (!newName || newName.trim() === '') {
    console.error(`El contacto ${jid} no tiene un nombre válido, no se sincroniza.`);
    return;
  }
  try {
    try {
      // Usar Supabase API directamente para evitar problemas con el pool personalizado
      const { data, error } = await supabaseAdmin
        .from('conversations_new')
        .upsert({
          user_id: userId,
          external_id: jid,
          contact_name: newName,
          contact_photo_url: newPhotoUrl,
          wa_user_id: waUserId,
          started_at: new Date().toISOString(),
          ai_active: false,
          tenant: 'whatsapp'
        }, {
          onConflict: 'user_id,external_id,wa_user_id'
        });

      if (error) {
        console.error(`Error al sincronizar el contacto ${jid}:`, error);
      } else {
        console.log(`Contacto ${jid} procesado: insertado/actualizado en BD.`);
      }
    } catch (error) {
      console.error(`Error al sincronizar el contacto ${jid}:`, error);
    }
  } catch (error) {
    console.error(`Error al sincronizar el contacto ${jid}:`, error);
  }
}

export async function saveMessagesInBatch(userId, messages) {
  const sock = sessions.get(userId);
  if (!sock) {
    console.log(`No se encontró sesión WA para el usuario ${userId}`);
    return;
  }
  const batchSize = 50;
  const waUserId = sock.user?.id || '';
  const phoneNumber = waUserId.split('@')[0].split(':')[0];
  let batch = [];

  for (const msg of messages) {
    const conversationId = msg.key.remoteJid;

    if (conversationId === 'status@broadcast' || conversationId.startsWith('0')) {
      continue;
    }

    try {
      const { data: convRows, error } = await supabaseAdmin
        .from('conversations_new')
        .select('id')
        .eq('external_id', conversationId)
        .eq('user_id', userId)
        .eq('wa_user_id', phoneNumber)
        .limit(1);

      if (error) {
        console.log(`Error obteniendo conversación: ${error.message}, continuando...`);
        continue;
      }

      if (!convRows || convRows.length === 0) {
        continue;
      }
      const convId = convRows[0].id;
    } catch (error) {
      console.log(`Error general obteniendo conversación: ${error.message}, continuando...`);
      continue;
    }

    let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    let mediaItems = [];

    if (!text) {
      mediaItems = await processMedia(convId, msg, userId);
    }

    if (!text && mediaItems.length) {
      text = mediaItems[0].type === 'pdf' ? 'Analiza el pdf adjunto' :
        mediaItems[0].type === 'image' ? 'Analiza la imagen adjunta' :
          'Analiza el audio adjunto';
    }

    const senderType = msg.key.fromMe ? 'you' : 'user';

    try {
      const { data: existingMessages, error } = await supabaseAdmin
        .from('messages_new')
        .select('id')
        .eq('conversation_id', convId)
        .eq('last_msg_id', msg.key.id)
        .limit(1);

      if (error) {
        console.log(`Error verificando mensaje duplicado: ${error.message}, continuando...`);
      } else if (existingMessages && existingMessages.length > 0) {
        continue;
      }
    } catch (error) {
      console.log(`Error general verificando mensaje duplicado: ${error.message}, continuando...`);
      // Continuar procesando el mensaje aunque falle la verificación
    }
    
    batch.push([convId, senderType, text, userId, convertMessageTimestamp(msg.messageTimestamp), msg.key.id]);
    
    if (batch.length >= batchSize) {
      await insertMessagesBatch(batch);
      batch = [];
    }
  }
  
  if (batch.length > 0) {
    await insertMessagesBatch(batch);
  }
}

async function insertMessagesBatch(batch) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const message of batch) {
      const [conversationId, senderType, textContent, userId, timestamp, lastMsgId] = message;
      await client.query(`
        INSERT INTO messages_new
        (conversation_id, sender_type, message_type, text_content, created_at, user_id, whatsapp_created_at, last_msg_id)
        VALUES ($1, $2, 'text', $3, CURRENT_TIMESTAMP, $4, $5, $6)
      `, [conversationId, senderType, textContent, userId, timestamp, lastMsgId]);

      await client.query(`
        UPDATE conversations_new
        SET updated_at = CURRENT_TIMESTAMP,
        last_msg_id = $1,
        last_msg_time = $2
        WHERE id = $3
      `, [lastMsgId, timestamp, conversationId]);
      emitToUser(userId, 'chats-updated');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al insertar mensajes en batch:', error);
  } finally {
    client.release();
  }
}

function convertMessageTimestamp(messageTimestamp) {
  const timestampInSeconds = messageTimestamp.low + (messageTimestamp.high * Math.pow(2, 32));
  return new Date(timestampInSeconds * 1000);
}

export async function handleIncomingMessage(msg, userId) {
  try {
    const sock = sessions.get(userId);
    if (!sock) {
      console.error('No hay sesión activa de WhatsApp para el usuario:', userId);
      return;
    }

    const message = {
      id: msg.key.id,
      from: msg.key.remoteJid,
      timestamp: msg.messageTimestamp,
      type: 'text',
      text: null,
      image: null,
      audio: null,
      document: null
    };

    if (msg.message?.conversation) {
      message.text = { body: msg.message.conversation };
    } else if (msg.message?.imageMessage) {
      message.type = 'image';
      message.image = {
        url: msg.message.imageMessage.url,
        mimetype: msg.message.imageMessage.mimetype
      };
    } else if (msg.message?.audioMessage) {
      message.type = 'audio';
      message.audio = {
        url: msg.message.audioMessage.url,
        mimetype: msg.message.audioMessage.mimetype
      };
    } else if (msg.message?.documentMessage) {
      message.type = 'document';
      message.document = {
        url: msg.message.documentMessage.url,
        mimetype: msg.message.documentMessage.mimetype,
        fileName: msg.message.documentMessage.fileName
      };
    }

    await saveIncomingMessage(message, userId);
    await sock.readMessages([msg.key]);

  } catch (error) {
    console.error('Error manejando mensaje entrante:', error);
    throw error;
  }
}

export async function sendWhatsAppMessage(to, message, userId) {
  try {
    const sock = sessions.get(userId);
    if (!sock) {
      throw new Error('No hay sesión activa de WhatsApp');
    }

    const msgInfo = await sock.sendMessage(to, { text: message });
    return msgInfo;
  } catch (error) {
    console.error('Error enviando mensaje de WhatsApp:', error);
    throw error;
  }
}

export async function getActiveWhatsAppSession(userId) {
  try {
    const sock = sessions.get(userId);
    if (!sock) {
      return null;
    }

    return { sock };
  } catch (error) {
    console.error('Error obteniendo sesión activa:', error);
    return null;
  }
}

export async function getContactName(contactId, userId) {
  try {
    const sock = sessions.get(userId);
    if (!sock) {
      return contactId.split('@')[0];
    }

    if (contactId.endsWith('@g.us')) {
      const meta = await sock.groupMetadata(contactId);
      return meta.subject || 'Grupo sin nombre';
    }

    const contact = await sock.contactAddOrGet(contactId);
    return contact?.pushname || contactId.split('@')[0];
  } catch (error) {
    console.error('Error obteniendo nombre del contacto:', error);
    return contactId.split('@')[0];
  }
}

export async function getConversationHistory(contactId, userId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('messages_new')
      .select('*')
      .eq('user_id', userId)
      .eq('contact', contactId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error obteniendo historial de conversación:', error);
      return [];
    }

    return (data || []).reverse();
  } catch (error) {
    console.error('Error obteniendo historial de conversación:', error);
    return [];
  }
}