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
// ⚠️ Imports dinámicos (lazy) para romper dependencia circular:
//   whatsappService → whatsappController → whatsappService
//   whatsappService → personalityController → (usa authController que puede importar indirectamente)
let _getSingleAgentForUser = null;
let _saveIncomingMessage = null;

async function getSingleAgentForUser(userId) {
  if (!_getSingleAgentForUser) {
    const mod = await import('../controllers/personalityController.js');
    _getSingleAgentForUser = mod.getSingleAgentForUser;
  }
  return _getSingleAgentForUser(userId);
}

async function saveIncomingMessage(...args) {
  if (!_saveIncomingMessage) {
    const mod = await import('../controllers/whatsappController.js');
    _saveIncomingMessage = mod.saveIncomingMessage;
  }
  return _saveIncomingMessage(...args);
}

import { analyzeImageBufferWithVision, analyzePdfBufferWithVision } from '../services/googleVisionService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const limit = pLimit(8);
const CONTACT_PROGRESS_EVERY = 10;
const PROFILE_PICTURE_TIMEOUT_MS = 5000;
const SYNC_CONTACT_TIMEOUT_MS = 12000; // por contacto (Supabase puede tardar)
const STORE_FETCH_TIMEOUT_MS = 8000;   // store.chats.all() / toJSON()

function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]).catch(() => fallback);
}

/** Ejecuta syncContactWithRetry con timeout; si se excede, no bloquea el lote. */
async function syncContactWithTimeout(sock, userId, jid, newName, newPhotoUrl, waUserId) {
  await withTimeout(
    syncContactWithRetry(sock, userId, jid, newName, newPhotoUrl, waUserId),
    SYNC_CONTACT_TIMEOUT_MS,
    undefined
  );
}

/** Resuelve userId desde token JWT; intenta verify local, si falla usa decode (token Supabase ya validado por middleware). */
function getUserIdFromSocketToken(token) {
  if (!token) return null;
  
  // Verificar si el JWT_SECRET es un placeholder
  const hasValidSecret = JWT_SECRET
    && JWT_SECRET !== 'fallback-secret'
    && JWT_SECRET !== 'clave-secreta-de-desarrollo'
    && JWT_SECRET !== 'tu_jwt_secret_muy_seguro_aqui'
    && JWT_SECRET !== 'PEGA_AQUI_TU_JWT_SECRET_DE_SUPABASE';
  
  if (hasValidSecret) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return payload.userId || payload.sub || null;
    } catch (err) {
      // Verificación local falló — continuar a decode
    }
  }
  
  // Decodificar sin verificar (el token ya fue validado por el middleware antes de llegar al socket)
  try {
    const decoded = jwt.decode(token);
    if (decoded && (decoded.userId || decoded.sub)) return decoded.userId || decoded.sub;
  } catch (err) {
    // No se pudo decodificar
  }
  
  return null;
}

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

// Debounce de chats-updated (evita recargas/skeleton en bucle cuando el front refetcha en cada evento)
const chatsUpdatedDebounceMs = 2000;
const lastChatsUpdatedEmit = new Map();
function shouldEmitChatsUpdated(userId) {
  const now = Date.now();
  const last = lastChatsUpdatedEmit.get(userId) || 0;
  if (now - last < chatsUpdatedDebounceMs) return false;
  lastChatsUpdatedEmit.set(userId, now);
  return true;
}

// Función para emitir eventos a través del socket IO
export function emitToUser(userId, event, data) {
  if (event === 'chats-updated' && !shouldEmitChatsUpdated(userId)) return;
  if (globalIO) {
    globalIO.to(userId).emit(event, data);
    if (event !== 'contact-progress' || process.env.VERBOSE_WHATSAPP === '1') {
      console.log(`📡 [emitToUser] Evento "${event}" emitido a usuario ${userId}`, data ? `con datos: ${JSON.stringify(data).substring(0, 80)}` : 'sin datos');
    }
  } else if (event !== 'contact-progress') {
    console.warn(`⚠️ [emitToUser] globalIO no configurado, no se puede emitir evento "${event}" a usuario ${userId}`);
  }
}

// Función para verificar si la sesión está realmente conectada
export function isSessionConnected(userId) {
  const sock = sessions.get(userId);
  if (!sock) {
    return false;
  }
  
  // Verificar que tenga usuario (indica que está autenticado)
  if (!sock.user) {
    return false;
  }
  
  // Verificar el estado del WebSocket si está disponible
  if (sock.ws) {
    const readyState = sock.ws.readyState;
    // 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
    return readyState === 1;
  }
  
  // Si no hay ws pero hay user, asumir conectado
  return true;
}

/**
 * Restaura sesiones de WhatsApp al arranque del servidor (usuarios con auth guardada).
 * Así, tras un reinicio, los contactos y el estado "conectado" se recuperan.
 */
export async function restoreSessions() {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;
    const dirs = fs.readdirSync(AUTH_DIR, { withFileTypes: true });
    const userIds = dirs.filter(d => d.isDirectory() && d.name).map(d => d.name);
    if (userIds.length === 0) return;
    console.log(`🔄 [WhatsApp] Restaurando sesiones para ${userIds.length} usuario(s): ${userIds.join(', ')}`);
    for (const uid of userIds) {
      if (sessions.has(uid) || initializing.has(uid)) continue;
      startSession(uid).catch(err => {
        console.error(`❌ [WhatsApp] Error restaurando sesión para ${uid}:`, err.message);
      });
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err) {
    console.error('❌ [WhatsApp] Error en restoreSessions:', err.message);
  }
}

// Función para desconectar la sesión de WhatsApp
export async function disconnectSession(userId) {
  console.log(`🔌 Desconectando sesión WhatsApp para usuario: ${userId}`);
  
  const sock = sessions.get(userId);
  
  if (!sock) {
    console.log(`⚠️ No hay sesión activa para userId=${userId}`);
    return { success: true, message: 'No hay sesión activa', alreadyDisconnected: true };
  }
  
  try {
    // Cerrar el socket de WhatsApp
    if (sock.ws) {
      sock.ws.close();
    }
    
    // Hacer logout si es posible
    if (sock.logout) {
      await sock.logout();
    } else if (sock.end) {
      sock.end();
    }
    
    // Eliminar la sesión de memoria
    sessions.delete(userId);
    initializing.delete(userId);
    
    // Limpiar el cache del QR
    qrCache.del(userId);
    
    // Eliminar archivos de autenticación para forzar nuevo QR
    const userAuthDir = path.join(AUTH_DIR, userId);
    if (fs.existsSync(userAuthDir)) {
      fs.rmSync(userAuthDir, { recursive: true, force: true });
      console.log(`🗑️ Archivos de autenticación eliminados para userId=${userId}`);
    }
    
    // Emitir evento para limpiar los chats de la barra lateral al desconectar manualmente
    emitToUser(userId, 'chats-updated');
    emitToUser(userId, 'clear-chats');
    
    console.log(`✅ Sesión WhatsApp desconectada para userId=${userId}`);
    return { success: true, message: 'WhatsApp desconectado exitosamente' };
    
  } catch (error) {
    console.error(`❌ Error desconectando sesión para userId=${userId}:`, error);
    // Aún así eliminar de memoria
    sessions.delete(userId);
    initializing.delete(userId);
    return { success: true, message: 'Sesión eliminada (con errores menores)', warning: error.message };
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
  console.log(`🔄 [startSession] Intentando iniciar sesión para userId=${userId}`);
  
  // Verificar si ya hay una sesión activa y conectada
  if (sessions.has(userId)) {
    const sock = sessions.get(userId);
    if (sock && sock.user && sock.user.id) {
      console.log(`✅ [startSession] Sesión ya existe y está conectada para userId=${userId}`);
      return sock;
    }
    // Si hay sesión pero no está conectada, eliminarla
    console.log(`⚠️ [startSession] Sesión existe pero no está conectada, eliminando...`);
    sessions.delete(userId);
  }
  
  // Verificar si ya se está inicializando
  if (initializing.has(userId)) {
    console.log(`⏳ [startSession] Sesión para userId=${userId} ya está siendo inicializada. Esperando...`);
    // Esperar a que termine la inicialización
    const existingPromise = initializing.get(userId);
    if (existingPromise) {
      try {
        return await existingPromise;
      } catch (error) {
        console.error(`❌ [startSession] Error esperando inicialización existente:`, error);
        initializing.delete(userId);
        // Continuar con nueva inicialización
      }
    } else {
      return; // Ya está inicializando, no hacer nada
    }
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
      browser: ['SpeedLeads CRM', 'Chrome', '10.15.7'], // Personalizar el navegador que se muestra
      defaultQueryTimeoutMs: 60000,
      printQRInTerminal: false,
      markOnlineOnConnect: true,
      syncFullHistory: true, // ✅ ACTIVADO: Sincronizar historial completo de contactos
      generateHighQualityLinkPreview: false,
      shouldSyncHistoryMessage: () => true, // ✅ ACTIVADO: Permitir sincronización de mensajes históricos
      options: {
        phoneNumber: '',
        qrTimeout: 30000,
      }
    });
    let contactsSynced = false;  // Bandera para saber si los contactos han sido sincronizados
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      console.log(`📡 [connection.update] userId=${userId}, connection=${connection}, hasQR=${!!qr}, lastDisconnect=${!!lastDisconnect}`);
      
      // Si hay QR, significa que WhatsApp está desconectado y necesita autenticación
      if (qr) {
        // Verificar si es el mismo QR para evitar emitir eventos duplicados
        const lastQr = qrCache.get(userId);
        if (lastQr === qr) {
          // Ya se emitió este QR, no hacer nada más
          return;
        }
        
        console.log(`📱 [connection.update] QR recibido para userId=${userId} - WhatsApp necesita autenticación`);
        
        // NO eliminar la sesión aquí - el socket todavía está activo generando el QR
        // Solo guardar el QR y emitir eventos (una sola vez por QR único)
        qrCache.set(userId, qr);
        emitToUser(userId, 'qr-code', qr);
        
        // Notificar que hay QR; NO emitir clear-chats para no borrar la lista de contactos (p. ej. al activar IA o cambiar personalidad)
        console.log(`📡 [connection.update] QR listo para userId=${userId}`);
        emitToUser(userId, 'chats-updated');
        // No emitir clear-chats aquí: la lista puede seguir mostrándose desde la DB mientras se muestra el QR
        
        // NO intentar reconectar aquí - esperar a que el usuario escanee el QR
        return; // Salir temprano para evitar procesar más eventos
      }
      if (connection === 'open') {
        if (!sessions.has(userId)) {
          console.log(`Guardando la sesión para el usuario ${userId}`);  // Debugging
          sessions.set(userId, sock);  // Guardamos la sesión en sessions
        }
        console.log("✅ Conexión abierta - WhatsApp conectado y listo para recibir mensajes");
        console.log(`📡 [connection.open] Listener messages.upsert está activo para userId=${userId}`);
        emitToUser(userId, "session-ready", true);

        // Keepalive: enviar presencia cada 25s para reducir desconexiones 428 (connectionClosed)
        if (sock._presenceInterval) clearInterval(sock._presenceInterval);
        sock._presenceInterval = setInterval(() => {
          try {
            if (sock && typeof sock.sendPresenceUpdate === 'function') sock.sendPresenceUpdate('available');
          } catch (_) {}
        }, 25000);
        
        // Obtener y guardar la foto de perfil del usuario de WhatsApp (con timeout)
        if (sock.user && sock.user.id) {
          try {
            const userProfilePicture = await withTimeout(sock.profilePictureUrl(sock.user.id, 'image'), PROFILE_PICTURE_TIMEOUT_MS, null);
            if (userProfilePicture) {
              console.log(`✅ Foto de perfil de WhatsApp obtenida para userId=${userId}`);
              // Guardar en profilesusers
              try {
                await pool.query(
                `INSERT INTO public.profilesusers (user_id, avatar_url, username)
                 VALUES ($1, $2, COALESCE((SELECT username FROM profilesusers WHERE user_id = $1), 'user'))
                 ON CONFLICT (user_id) DO UPDATE
                   SET avatar_url = EXCLUDED.avatar_url`,
                [userId, userProfilePicture]
              );
              console.log(`✅ Foto de perfil guardada en profilesusers para userId=${userId}`);
            } catch (dbError) {
              console.error(`⚠️ Error guardando foto en profilesusers: ${dbError.message}`);
            }
            
            // Guardar en user_metadata de Supabase Auth
            try {
              const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                user_metadata: { avatar_url: userProfilePicture }
              });
              if (updateError) {
                console.error(`⚠️ Error actualizando user_metadata: ${updateError.message}`);
              } else {
                console.log(`✅ Foto de perfil guardada en user_metadata para userId=${userId}`);
              }
            } catch (authError) {
              console.error(`⚠️ Error actualizando user_metadata: ${authError.message}`);
            }
            }
          } catch (profileError) {
            console.warn(`⚠️ No se pudo obtener foto de perfil de WhatsApp para userId=${userId}: ${profileError.message}`);
          }
        }
        
        // Intentar obtener chats manualmente después de que la conexión se abre
        // Esto asegura que los contactos se carguen incluso si los eventos no se disparan
        setTimeout(async () => {
          try {
            console.log(`🔍 [Carga manual] Iniciando para userId=${userId}`);
            
            if (!sock.user || !sock.user.id) {
              console.log(`⚠️ [Carga manual] sock.user no disponible aún para userId=${userId}`);
              return;
            }
            
            const waUserId = sock.user.id.split('@')[0].split(':')[0];
            console.log(`🔍 [Carga manual] Intentando obtener chats para userId=${userId}, waUserId=${waUserId}, sock.user.id=${sock.user.id}`);
            
            // Intentar obtener chats desde el store si está disponible (con timeout para no colgar)
            let chats = [];
            try {
              if (sock.store && typeof sock.store.chats === 'object') {
                try {
                  if (typeof sock.store.chats.all === 'function') {
                    const raw = await withTimeout(sock.store.chats.all(), STORE_FETCH_TIMEOUT_MS, []);
                    chats = (Array.isArray(raw) ? raw : []).map(chat => {
                      const chatId = typeof chat.id === 'string' ? chat.id : (chat.id || '');
                      return {
                        id: chatId,
                        name: chat.name || chat.subject || chat.notify || '',
                        notify: chat.notify || ''
                      };
                    }).filter(chat => chat.id);
                    if (chats.length) console.log(`📱 [Carga manual] store.all(): ${chats.length}`);
                  } else if (typeof sock.store.chats.toJSON === 'function') {
                    const chatsObj = await withTimeout(sock.store.chats.toJSON(), STORE_FETCH_TIMEOUT_MS, {});
                    chats = Object.entries(chatsObj || {}).map(([id, chat]) => ({
                      id: id,
                      name: (chat && chat.name) || chat?.subject || chat?.notify || '',
                      notify: (chat && chat.notify) || ''
                    }));
                    if (chats.length) console.log(`📱 [Carga manual] store.toJSON(): ${chats.length}`);
                  }
                } catch (storeError) {
                  if (process.env.VERBOSE_WHATSAPP === '1') console.error(`❌ [Carga manual] store:`, storeError.message);
                }
              }
              
              // Método 2: Si no hay chats del store, los eventos contacts.upsert y messaging-history.set deberían dispararse
              // cuando WhatsApp Web envíe la información. Si no se disparan, los contactos aparecerán cuando:
              // 1. Se reciban mensajes (se crearán automáticamente las conversaciones)
              // 2. Se envíen mensajes a números nuevos (se crearán las conversaciones)
              if (chats.length === 0) {
                console.log(`💡 [Carga manual] No se pudieron obtener chats del store. Los contactos se sincronizarán cuando:`);
                console.log(`   1. WhatsApp envíe los eventos contacts.upsert o messaging-history.set`);
                console.log(`   2. Se reciban o envíen mensajes (se crearán las conversaciones automáticamente)`);
              }
            } catch (fetchError) {
              console.error(`❌ [Carga manual] Error obteniendo chats:`, fetchError.message);
              console.error(`   Stack:`, fetchError.stack);
            }
            
            if (chats && chats.length > 0) {
              emitToUser(userId, 'open-dialog');
              try {
                const totalContacts = chats.length;
                const progress = { count: 0 };
                const contactPromises = chats.map(chat => limit(async () => {
                  const jid = typeof chat.id === 'string' ? chat.id : (chat.id?.user || chat.id);
                  if (!jid || jid.includes('@g.us') || jid === 'status@broadcast' || jid.split('@')[0] === '0') return;
                  const contactName = chat.name || chat.notify || jid.split('@')[0];
                  let contactPhotoUrl = null;
                  try {
                    contactPhotoUrl = await withTimeout(sock.profilePictureUrl(jid), PROFILE_PICTURE_TIMEOUT_MS, null);
                  } catch {
                    contactPhotoUrl = null;
                  }
                  await syncContactWithTimeout(sock, userId, jid, contactName, contactPhotoUrl, waUserId);
                  progress.count++;
                  if (progress.count % CONTACT_PROGRESS_EVERY === 0 || progress.count === totalContacts) {
                    emitToUser(userId, 'contact-progress', { total: totalContacts, processed: progress.count, info: contactName, capitalText: 'Sincronizando contactos', text: `${progress.count}/${totalContacts}` });
                    if (process.env.VERBOSE_WHATSAPP === '1') console.log(`📊 [Carga manual] ${progress.count}/${totalContacts}`);
                  }
                }));
                await Promise.allSettled(contactPromises);
                console.log(`✅ [Carga manual] ${progress.count} contactos sincronizados para userId=${userId}`);
                emitToUser(userId, 'chats-updated');
              } finally {
                emitToUser(userId, 'close-dialog');
              }
            } else {
              console.log(`⚠️ [Carga manual] No se encontraron chats para sincronizar para userId=${userId}`);
            }
          } catch (error) {
            console.error(`❌ [Carga manual] Error obteniendo chats manualmente para userId=${userId}:`, error);
            console.error(`   Stack:`, error.stack);
            emitToUser(userId, 'close-dialog');
            // No lanzar el error, solo loguearlo
          }
        }, 3000); // Esperar 3 segundos después de que la conexión se abre para dar tiempo a que se cargue el store
        
        setTimeout(() => emitToUser(userId, 'chats-updated'), 3000);
        
        // MIGRADO: Usar API de Supabase para verificar configuración de usuario
        const { data: userSettings, error: settingsError } = await supabaseAdmin
          .from('user_settings')
          .select('id')
          .eq('user_id', userId)
          .single();

        if (settingsError && settingsError.code === 'PGRST116') {
          console.log(`No se encontró configuración de usuario, creando con valores predeterminados para ${userId}`);
          
          // MIGRADO: Usar API de Supabase para insertar configuración por defecto
          const { error: insertError } = await supabaseAdmin
            .from('user_settings')
            .insert({
              user_id: userId,
              global_personality_id: '1',
              updated_at: new Date().toISOString()
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
        const loggedOut = code === DisconnectReason.loggedOut;
        const restartRequired = code === 515; // DisconnectReason.restartRequired
        const connectionClosed = code === 428; // DisconnectReason.connectionClosed
        const willReconnect = !loggedOut;

        const reasonLabel = loggedOut ? 'Logged out (401)' : restartRequired ? 'Restart required (515)' : connectionClosed ? 'Connection closed (428)' : `Other (${code})`;
        console.log(`🔌 [connection.update] Conexión cerrada para userId=${userId}`);
        console.log(`   - Código: ${code} - ${reasonLabel}`);
        if (loggedOut) console.log(`   💡 Si no cerraste sesión desde el teléfono, puede ser conflicto con otro cliente o WhatsApp revocó el dispositivo.`);
        if (restartRequired) console.log(`   💡 WhatsApp pide reiniciar el socket; se creará una nueva sesión en 2s.`);
        if (connectionClosed) console.log(`   💡 Servidor cerró la conexión (timeout/red). Se reintentará en 4s.`);

        initializing.delete(userId);
        sessions.delete(userId);
        if (sock._presenceInterval) {
          clearInterval(sock._presenceInterval);
          sock._presenceInterval = null;
        }
        try {
          if (sock.ws) sock.ws.close();
        } catch (_) {}

        if (loggedOut) {
          console.log(`🗑️ [connection.update] User ${userId} logged out, removing auth files`);
          try {
            fs.rmSync(`${AUTH_DIR}/${userId}`, { recursive: true, force: true });
          } catch (fsError) {
            console.error(`❌ Error eliminando archivos de auth: ${fsError.message}`);
          }
        }

        console.log(`📡 [connection.update] Emitiendo eventos de desconexión para userId=${userId}`);
        emitToUser(userId, 'whatsapp-disconnected', { reason: loggedOut ? 'logged_out' : 'connection_closed' });
        emitToUser(userId, 'chats-updated');
        if (loggedOut) emitToUser(userId, 'clear-chats');
        emitToUser(userId, 'session-closed', { reason: loggedOut ? 'logged_out' : 'connection_closed' });

        if (willReconnect) {
          const reconnectDelayMs = restartRequired ? 2000 : 4000;
          console.log(`🔄 [connection.update] Reconectando en ${reconnectDelayMs / 1000}s para userId=${userId}`);
          setTimeout(() => startSession(userId).catch((e) => {
            console.error(`Error intentando reconectar el socket para el usuario ${userId}:`, e);
          }), reconnectDelayMs);
        } else {
          console.log(`🔄 Usuario ${userId} desvinculado, se requerirá nuevo QR para reconectar`);
        }
      }
    });
    sock.ev.on('creds.update', saveCreds);
    
    // Registrar listener de mensajes - esto se ejecuta cuando se crea el socket
    console.log(`📡 [startSession] Registrando listener messages.upsert para userId=${userId}`);
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      console.log(`📨 [messages.upsert] Evento recibido: type=${type}, cantidad=${messages?.length || 0}`);
      
      // Verificar que la sesión esté activa y el usuario esté disponible
      if (!sock || !sock.user || !sock.user.id) {
        console.log(`⚠️ [messages.upsert] Sesión no disponible o usuario no autenticado, ignorando mensajes`);
        return;
      }
      
      if (!messages || messages.length === 0) {
        console.log(`⚠️ [messages.upsert] No hay mensajes en el evento`);
        return;
      }
      
      // Procesar solo mensajes nuevos (notify) - estos son los mensajes en tiempo real
      // Los mensajes 'append' son del historial y no necesitamos procesarlos en tiempo real
      if (type !== 'notify') {
        console.log(`⏭️ [messages.upsert] Saltando mensajes de tipo ${type} (solo procesamos 'notify' en tiempo real)`);
        return;
      }
      
      for (const msg of messages) {
        const from = msg.key.remoteJid;
        
        if (!from) {
          console.log(`⚠️ [messages.upsert] Mensaje sin remoteJid, ignorando: ${msg.key.id}`);
          continue;
        }
        
        const waUserId = sock.user.id.split('@')[0].split(':')[0];
        
        console.log(`📨 [messages.upsert] Procesando mensaje de ${from}, ID: ${msg.key.id}, fromMe: ${msg.key.fromMe}, type: ${type}`);

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

          // Si no se encuentra la conversación, crearla automáticamente
          if (!convRows || convRows.length === 0) {
            console.log(`📝 [Auto-crear] No se encontró la conversación con ID externo: ${from}, creándola automáticamente...`);
            
            // Detectar tipo de chat
            const isGroup = from.endsWith('@g.us');
            const isNewsletter = from.endsWith('@newsletter');
            let chatType = 'individual';
            let contactName = from.split('@')[0];
            let contactPhotoUrl = null;
            
            if (isGroup) {
              chatType = 'group';
              try {
                const meta = await sock.groupMetadata(from);
                contactName = meta.subject || 'Grupo sin nombre';
                contactPhotoUrl = meta.iconUrl || null;
                try {
                  contactPhotoUrl = contactPhotoUrl || await sock.profilePictureUrl(from, 'image');
                } catch {}
              } catch (groupError) {
                console.log(`⚠️ Error obteniendo metadata del grupo ${from}: ${groupError.message}`);
                contactName = 'Grupo';
              }
            } else if (isNewsletter) {
              chatType = 'channel';
              contactName = 'Canal';
            } else {
              // Chat individual - usar pushName del mensaje como fuente más confiable
              const msgPushName = msg.pushName || '';
              
              if (msgPushName && msgPushName.trim() !== '' && !/^\d+$/.test(msgPushName.trim())) {
                contactName = msgPushName.trim();
                console.log(`✅ [Auto-crear] Nombre obtenido desde pushName: ${contactName}`);
              } else {
                try {
                  const contact = await sock.onWhatsApp(from);
                  if (contact && contact[0]) {
                    contactName = contact[0].name || contact[0].notify || contactName;
                  }
                } catch (contactError) {
                  console.log(`⚠️ No se pudo obtener información del contacto ${from}, usando nombre por defecto`);
                }
              }
              
              // Intentar obtener la foto de perfil
              try {
                contactPhotoUrl = await sock.profilePictureUrl(from, 'image');
              } catch {
                // Si no se puede obtener, mantener null
              }
            }
            
            // Modelo agente único: obtener agente del usuario para asignar a la nueva conversación
            const agent = await getSingleAgentForUser(userId);
            const insertData = {
              user_id: userId,
              external_id: from,
              contact_name: contactName,
              contact_photo_url: contactPhotoUrl,
              wa_user_id: waUserId,
              started_at: new Date().toISOString(),
              ai_active: true,
              tenant: 'whatsapp',
              chat_type: chatType
            };
            if (agent?.id) insertData.personality_id = agent.id;
            const { data: newConv, error: createError } = await supabaseAdmin
              .from('conversations_new')
              .insert(insertData)
              .select('id')
              .single();
            
            if (createError) {
              console.error(`❌ Error creando conversación para ${from}:`, createError);
              continue;
            }
            
            convId = newConv.id;
            console.log(`✅ [Auto-crear] Conversación creada para ${from} (${contactName}) con ID: ${convId} (tipo: ${chatType})`);
            
            // 📡 Emitir nuevo contacto al frontend
            emitToUser(userId, 'new-contact', {
              id: from,
              name: contactName,
              phone: from.split('@')[0],
              photo: contactPhotoUrl,
              chatType: chatType,
              lastMessage: '',
              unreadCount: 0,
              lastMessageAt: new Date().toISOString(),
              startedAt: new Date().toISOString()
            });
          } else {
            // Si la conversación existe, obtenemos el id
            convId = convRows[0].id;
          }
        } catch (error) {
          console.log(`❌ Error general verificando conversación: ${error.message}, continuando...`);
          continue;
        }

        // Detectar reacciones ANTES de verificar texto o medios
        const hasReaction = !!msg.message?.reactionMessage;
        
        if (hasReaction) {
          // Procesar reacción
          const reaction = msg.message.reactionMessage;
          const reactionEmoji = reaction.text || '';
          const reactedToMessageId = reaction.key?.id;
          const reactedToFromMe = reaction.key?.fromMe || false;
          
          console.log(`😊 Reacción recibida: "${reactionEmoji}" al mensaje ${reactedToMessageId} (fromMe: ${reactedToFromMe})`);
          
          // Buscar el mensaje al que se reacciona en la BD
          try {
            const { data: reactedMessage, error: msgError } = await supabaseAdmin
              .from('messages_new')
              .select('id, conversation_id')
              .eq('last_msg_id', reactedToMessageId)
              .eq('user_id', userId)
              .limit(1)
              .single();
            
            if (!msgError && reactedMessage) {
              // Emitir evento de reacción recibida
              emitToUser(userId, 'message-reaction', {
                messageId: reactedMessage.id,
                conversationId: reactedMessage.conversation_id,
                emoji: reactionEmoji || null,
                removed: !reactionEmoji || reactionEmoji === '',
                fromMe: msg.key.fromMe
              });
              
              console.log(`✅ Reacción procesada y evento emitido para mensaje ${reactedMessage.id}`);
            } else {
              console.log(`⚠️ No se encontró el mensaje al que se reacciona (last_msg_id: ${reactedToMessageId})`);
            }
          } catch (reactionError) {
            console.error(`❌ Error procesando reacción:`, reactionError);
          }
          
          // Las reacciones no se procesan como mensajes normales, continuar con el siguiente
          continue;
        }
        
        let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        
        // Verificar si hay medios directamente en el mensaje (incluyendo stickers)
        const hasMedia = !!(msg.message?.audioMessage || msg.message?.imageMessage || msg.message?.documentMessage || msg.message?.stickerMessage);
        
        console.log(`📱 Mensaje recibido - Texto: "${text}" | Tiene medios: ${hasMedia} | Sticker: ${!!msg.message?.stickerMessage}`);

        // Si no hay texto ni medios, saltamos el mensaje
        if (!text && !hasMedia) {
          console.log('⚠️ Mensaje sin contenido, ignorando');
          continue;
        }

        const senderType = msg.key.fromMe ? 'you' : 'user';

        // Procesar el mensaje con saveIncomingMessage (que ya maneja verificación de duplicados internamente)
        console.log(`🔄 [messages.upsert] Llamando a saveIncomingMessage para mensaje ${msg.key.id}...`);
        try {
          const result = await saveIncomingMessage(userId, msg, text, [], senderType);
          
          if (result) {
            console.log(`✅ [messages.upsert] saveIncomingMessage completado para ${msg.key.id}, duplicate: ${result.duplicate || false}`);
            
            // Si hay una respuesta de la IA, la enviamos
            if (result.aiReply) {
              console.log('✅ Respuesta de la IA generada:', result.aiReply.substring(0, 100) + '...');
            }
          } else {
            console.log(`⚠️ [messages.upsert] saveIncomingMessage retornó null/undefined para ${msg.key.id}`);
          }
        } catch (saveError) {
          console.error(`❌ [messages.upsert] Error en saveIncomingMessage para ${msg.key.id}:`, saveError);
        }
      }
    });
    sock.ev.on('contacts.upsert', async (contacts) => {
      if (process.env.VERBOSE_WHATSAPP === '1') console.log(`🔍 contacts.upsert: ${contacts.length} contactos`);
      if (!sock.user || !sock.user.id) {
        console.error('❌ No se puede obtener wa_user_id: sock.user no está disponible');
        return;
      }
      emitToUser(userId, 'open-dialog');
      try {
        const waUserId = sock.user.id.split('@')[0].split(':')[0];
        const totalContacts = contacts.length;
        const progress = { count: 0 };
        const contactPromises = contacts.map(contact => limit(async () => {
          const jid = contact.id;
          if (jid === 'status@broadcast' || jid.split('@')[0] === '0') return;
          const localPart = jid.split('@')[0];
          const newName = contact.notify || contact.name || contact.verifiedName || contact.pushname || localPart;
          let newPhotoUrl = null;
          try {
            newPhotoUrl = await withTimeout(sock.profilePictureUrl(jid), PROFILE_PICTURE_TIMEOUT_MS, null);
          } catch {
            newPhotoUrl = null;
          }
          await syncContactWithTimeout(sock, userId, jid, newName, newPhotoUrl, waUserId);
          progress.count++;
          if (progress.count % CONTACT_PROGRESS_EVERY === 0 || progress.count === totalContacts) {
            emitToUser(userId, 'contact-progress', {
              total: totalContacts,
              processed: progress.count,
              avatarUrl: newPhotoUrl,
              info: newName,
              capitalText: 'Sincronizando contactos',
              text: `${progress.count}/${totalContacts}`
            });
          }
        }));
        await Promise.allSettled(contactPromises);
        contactsSynced = true;
        emitToUser(userId, 'chats-updated');
      } finally {
        emitToUser(userId, 'close-dialog');
      }
    });
    sock.ev.on('messaging-history.set', async ({ contacts, messages }) => {
      emitToUser(userId, 'open-dialog');
      try {
        if (!sock.user || !sock.user.id) {
          console.error('❌ messaging-history.set: sock.user no disponible');
          return;
        }
        const waUserId = sock.user.id.split('@')[0].split(':')[0];
        if (contacts && contacts.length) {
          const totalContacts = contacts.length;
          const progress = { count: 0 };
          const contactPromises = contacts.map(contact => limit(async () => {
            const jid = contact.id;
            if (jid === 'status@broadcast' || jid.split('@')[0] === '0') return;
            const localPart2 = jid.split('@')[0];
            const newName = contact.notify || contact.name || contact.verifiedName || contact.pushname || localPart2;
            let newPhotoUrl = null;
            try {
              newPhotoUrl = await withTimeout(sock.profilePictureUrl(jid), PROFILE_PICTURE_TIMEOUT_MS, null);
            } catch {
              newPhotoUrl = null;
            }
            await syncContactWithTimeout(sock, userId, jid, newName, newPhotoUrl, waUserId);
            progress.count++;
            if (progress.count % CONTACT_PROGRESS_EVERY === 0 || progress.count === totalContacts) {
              emitToUser(userId, 'contact-progress', {
                total: totalContacts,
                processed: progress.count,
                avatarUrl: newPhotoUrl,
                info: newName,
                capitalText: 'Sincronizando contactos',
                text: `${progress.count}/${totalContacts}`
              });
            }
          }));
          await Promise.allSettled(contactPromises);
          contactsSynced = true;
          emitToUser(userId, 'chats-updated');
        } else {
          if (process.env.VERBOSE_WHATSAPP === '1') console.log('messaging-history.set: sin contactos');
        }
      } finally {
        emitToUser(userId, 'close-dialog');
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
        const newName = contact.notify || contact.name || localPart3;
        if (jid === 'status@broadcast' || jid.split('@')[0] === '0') {
          if (process.env.VERBOSE_WHATSAPP === '1') console.log(`Contacto excluido: ${jid}`);
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
            } else if (data && data.length > 0 && process.env.VERBOSE_WHATSAPP === '1') {
              console.log(`Contacto ${jid} renombrado a "${newName}"`);
            }
          } catch (dbErr) {
            console.error(`Error actualizando nombre de contacto ${jid}:`, dbErr);
          }
        } else if (process.env.VERBOSE_WHATSAPP === '1') {
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
    socket.on('join', async ({ token } = {}) => {
      const authToken = token || socket.handshake?.auth?.token;
      const uid = getUserIdFromSocketToken(authToken);
      if (!uid) {
        socket.emit('error-message', 'No se pudo identificar al usuario');
        return;
      }
      socket.join(uid);
      // No iniciar sesión WhatsApp aquí: solo al entrar a Chats (get-qr o GET /api/whatsapp/status)
    })
    
    socket.on('send-message', async ({ token, conversationId, textContent, attachments }) => {
      const userId = getUserIdFromSocketToken(token || socket.handshake?.auth?.token);
      if (!userId) {
        socket.emit('error', 'Token inválido');
        return;
      }
      try {
        
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
        
        // Asegurar que conversationId sea un string (JID de WhatsApp)
        // Si es un número (ID interno), obtener el external_id de la conversación
        let jid = conversationId;
        if (typeof conversationId !== 'string' || !conversationId.includes('@')) {
          // Es probablemente un ID interno, necesitamos obtener el external_id
          const { supabaseAdmin } = await import('../config/db.js');
          const { data: convData, error: convError } = await supabaseAdmin
            .from('conversations_new')
            .select('external_id')
            .eq('id', conversationId)
            .eq('user_id', userId)
            .single();
          
          if (convError || !convData) {
            socket.emit('error', 'Conversación no encontrada');
            return;
          }
          
          jid = convData.external_id;
        }
        
        // Validar que jid sea un string válido
        if (typeof jid !== 'string' || !jid.includes('@')) {
          socket.emit('error', 'ID de conversación inválido');
          return;
        }
        
        // Usar la función sendMessage del controlador que guarda en BD y emite eventos
        const { sendMessage } = await import('../controllers/whatsappController.js');
        const result = await sendMessage(userId, jid, textContent, attachments || [], 'you');
        
        if (result && result.success) {
          socket.emit('message-sent', { success: true, conversationId: jid });
        } else {
          socket.emit('error', 'Error al guardar el mensaje');
        }
      } catch (error) {
        console.error('Error al procesar el mensaje:', error);
        socket.emit('error', `Error al procesar el mensaje: ${error.message}`);
      }
    });

    // Nuevo evento para envío directo a número
    socket.on('send-to-number', async ({ token, to, text, attachments, defaultCountry }) => {
      const userId = getUserIdFromSocketToken(token || socket.handshake?.auth?.token);
      if (!userId) {
        socket.emit('error', 'Token inválido o usuario no identificado');
        return;
      }
      try {
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
      const userId = getUserIdFromSocketToken(token || socket.handshake?.auth?.token);
      if (!userId) {
        socket.emit('error', 'Token inválido o usuario no identificado');
        return;
      }
      try {
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
    
    socket.on('get-qr', async (payload = {}) => {
      const token = payload?.token || socket.handshake?.auth?.token;
      const userId = getUserIdFromSocketToken(token);
      if (!userId) {
        socket.emit('error', 'Token no proporcionado o inválido');
        return;
      }
      try {
        const qr = getCachedQr(userId);
        if (qr) {
          socket.emit('qr-code', qr);
        } else {
          await startSession(userId);
        }
      } catch (error) {
        console.error('Error obteniendo QR:', error);
        socket.emit('error', 'Error obteniendo código QR');
      }
    });

    socket.on('get-contacts', async (payload = {}) => {
      const token = payload?.token || socket.handshake?.auth?.token;
      const userId = getUserIdFromSocketToken(token);
      if (!userId) {
        socket.emit('contacts-loaded', { success: false, sessionActive: false, message: 'Token no proporcionado o inválido', contacts: [], total: 0 });
        return;
      }
      const connected = isSessionConnected(userId);
      // Check if there's persisted auth on disk (session will restore) or is currently initializing
      const hasPersistedAuth = fs.existsSync(path.join(AUTH_DIR, userId));
      const isRestoring = initializing.has(userId);

      if (!connected && !hasPersistedAuth && !isRestoring) {
        // No session, no auth data, truly disconnected
        socket.emit('contacts-loaded', { success: true, sessionActive: false, contacts: [], total: 0, message: 'No hay sesión de WhatsApp activa' });
        return;
      }
      // Session is connected OR has persisted auth (restoring/will restore) → load contacts from DB
      emitToUser(userId, 'contacts-loading', { started: true });
      try {
        const { getContacts } = await import('../controllers/whatsappController.js');
        const contacts = await getContacts(userId);
        socket.emit('contacts-loaded', { success: true, sessionActive: true, contacts, total: contacts.length });
        // If session is not yet connected but has auth, try to restore it now
        if (!connected && (hasPersistedAuth || isRestoring) && !sessions.has(userId)) {
          startSession(userId).catch(err => {
            console.error(`❌ [get-contacts] Error restaurando sesión para ${userId}:`, err.message);
          });
        }
      } catch (error) {
        console.error('Error obteniendo contactos:', error);
        socket.emit('contacts-loaded', { success: false, sessionActive: connected || hasPersistedAuth, message: error.message, contacts: [], total: 0 });
      } finally {
        emitToUser(userId, 'contacts-loading', { started: false });
      }
    });

    // Handler for whatsapp:status — frontend asks this to know connection state
    socket.on('whatsapp:status', async (payload = {}) => {
      const token = payload?.token || socket.handshake?.auth?.token;
      const userId = getUserIdFromSocketToken(token);
      if (!userId) {
        socket.emit('whatsapp:status', { connected: false });
        return;
      }
      const connected = isSessionConnected(userId);
      const hasPersistedAuth = fs.existsSync(path.join(AUTH_DIR, userId));
      const isRestoring = initializing.has(userId);
      // Consider "connected" if session is active OR if auth is persisted (will restore)
      socket.emit('whatsapp:status', { connected: connected || hasPersistedAuth || isRestoring });
    });
    
    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${socket.id}`);
    });
  })
}

async function syncContactWithRetry(sock, userId, jid, newName, newPhotoUrl, waUserId, retryCount = 0) {
  // Si no hay nombre, usar el número de teléfono como nombre
  const finalName = (newName && newName.trim() !== '') 
    ? newName.trim() 
    : jid.split('@')[0];
  
  if (!waUserId) {
    console.error(`⚠️ No se pudo obtener wa_user_id para el contacto ${jid}, no se sincroniza.`);
    return;
  }

  if (!userId) {
    console.error(`⚠️ No se pudo obtener user_id para el contacto ${jid}, no se sincroniza.`);
    return;
  }

  if (process.env.VERBOSE_WHATSAPP === '1') {
    console.log(`🔄 Sincronizando contacto: userId=${userId}, jid=${jid}, name=${finalName}, waUserId=${waUserId}`);
  }

  try {
    // Primero verificar si existe el contacto
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('conversations_new')
      .select('id, contact_name')
      .eq('external_id', jid)
      .eq('user_id', userId)
      .limit(1);

    if (checkError && checkError.code !== 'PGRST116') {
      console.error(`❌ Error verificando contacto existente ${jid}:`, checkError);
    }

    if (existing && existing.length > 0) {
      // ✅ El contacto ya existe - SIEMPRE actualizar el nombre y foto
      const { error: updateError } = await supabaseAdmin
        .from('conversations_new')
        .update({
          contact_name: finalName,
          contact_photo_url: newPhotoUrl,
          wa_user_id: waUserId,
          updated_at: new Date().toISOString()
        })
        .eq('external_id', jid)
        .eq('user_id', userId);

      if (updateError) {
        console.error(`❌ Error actualizando contacto ${jid}:`, updateError);
      } else if (process.env.VERBOSE_WHATSAPP === '1') {
        console.log(`✅ Contacto ${jid} actualizado: "${existing[0].contact_name}" → "${finalName}"`);
      }
    } else {
      // El contacto no existe - insertar nuevo
      const { error: insertError } = await supabaseAdmin
        .from('conversations_new')
        .insert({
          user_id: userId,
          external_id: jid,
          contact_name: finalName,
          contact_photo_url: newPhotoUrl,
          wa_user_id: waUserId,
          started_at: new Date().toISOString(),
          ai_active: true,
          tenant: 'whatsapp'
        });

      if (insertError) {
        // Si es error de duplicado, intentar actualizar
        if (insertError.code === '23505') {
          if (process.env.VERBOSE_WHATSAPP === '1') console.log(`⚠️ Contacto ${jid} ya existe, actualizando...`);
          const { error: updateError } = await supabaseAdmin
            .from('conversations_new')
            .update({
              contact_name: finalName,
              contact_photo_url: newPhotoUrl,
              wa_user_id: waUserId,
              updated_at: new Date().toISOString()
            })
            .eq('external_id', jid)
            .eq('user_id', userId);
          
          if (!updateError && process.env.VERBOSE_WHATSAPP === '1') {
            console.log(`✅ Contacto ${jid} (${finalName}) actualizado después de conflicto`);
          }
        } else {
          console.error(`❌ Error insertando contacto ${jid}:`, insertError);
        }
      } else if (process.env.VERBOSE_WHATSAPP === '1') {
        console.log(`✅ Contacto ${jid} (${finalName}) creado para userId=${userId}`);
      }
    }
  } catch (error) {
    console.error(`❌ Error al sincronizar el contacto ${jid} para userId=${userId}:`, error);
    console.error(`   Stack:`, error.stack);
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
        .select('id, wa_user_id')
        .eq('external_id', conversationId)
        .eq('user_id', userId)
        .order('wa_user_id', { ascending: false }) // Preferir el que tiene wa_user_id (no null)
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