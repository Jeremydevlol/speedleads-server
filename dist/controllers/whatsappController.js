import pkg from '@whiskeysockets/baileys'
import { exec } from 'child_process'
import crypto from 'crypto'
import * as mammoth from 'mammoth'
import pdfParse from 'pdf-parse-debugging-disabled'
import qrcode from 'qrcode'
import { promisify } from 'util'
import pool, { supabaseAdmin } from '../config/db.js'
import { generateBotResponse } from '../services/openaiService.js'
import { emitToUser, getCachedQr, sessions, startSession } from '../services/whatsappService.js'
import { extractImageText, extractPdfText } from '../utils/mediaUtils.js'
import { checkRateLimit } from '../utils/rateLimit.js'
import { getUserIdFromToken } from './authController.js'
const { downloadContentFromMessage, getMediaKeys, generateThumbnail } = pkg
const execAsync = promisify(exec)

// Set para rastrear mensajes enviados desde el backend
const sentMessageIds = new Set();



/**
 * Normaliza un número de teléfono a JID de WhatsApp
 * @param {string} raw - Número en cualquier formato
 * @param {string} defaultCountry - Código de país por defecto (ej: '34' para España)
 * @returns {string} JID normalizado (ej: '34612345678@s.whatsapp.net')
 */
function normalizeToJid(raw, defaultCountry = '34') {
  if (!raw) throw new Error('Número de teléfono requerido');
  
  // Si ya es un JID válido, devolverlo
  if (raw.includes('@s.whatsapp.net')) {
    return raw;
  }
  
  // Limpiar número: solo dígitos
  let n = raw.replace(/[^\d]/g, '');
  
  // Quitar prefijos internacionales comunes
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('+')) n = n.slice(1);
  
  // Si no tiene código de país, añadir el por defecto
  if (!n.startsWith(defaultCountry) && n.length <= 9) {
    n = defaultCountry + n;
  }
  
  // Validar longitud mínima
  if (n.length < 8) {
    throw new Error('Número de teléfono demasiado corto');
  }
  
  return `${n}@s.whatsapp.net`;
}

/**
 * Mapea tipo MIME a clave de Baileys para adjuntos
 * @param {string} mime - Tipo MIME (ej: 'application/pdf')
 * @returns {string} Clave de Baileys ('image', 'video', 'audio', 'document')
 */
function mediaKeyFromMime(mime) {
  if (!mime) return 'document';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  // Todo lo demás (PDFs, docs, etc.) va como documento
  return 'document';
}

// Función OPTIMIZADA para obtener historial de conversación con CONTEXTO COMPLETO
async function getConversationHistory(conversationId, userId, limit = 50) { // Aumentado a 50 para contexto completo
  try {
    console.log(`🧠 Obteniendo historial de conversación: conversationId=${conversationId}, userId=${userId}, limit=${limit}`);
    
    // Usar Supabase API para mejor rendimiento y consistencia
    const { data: messages, error } = await supabaseAdmin
      .from('messages_new')
      .select(`
        text_content,
        sender_type,
        whatsapp_created_at,
        created_at,
        message_type
      `)
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('whatsapp_created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`❌ Error obteniendo historial: ${error.message}`);
      return [];
    }

    if (!messages || messages.length === 0) {
      console.log(`📝 No hay mensajes en el historial para conversación ${conversationId}`);
      return [];
    }

    console.log(`📚 Historial obtenido: ${messages.length} mensajes`);

    // Invertir el orden para tener la conversación en orden cronológico
    // y mapear correctamente los roles con contexto mejorado
    const processedMessages = messages.reverse().map((msg, index) => {
      let role;
      if (msg.sender_type === 'user') {
        role = 'user';
      } else if (msg.sender_type === 'system') {
        role = 'system';
      } else if (msg.sender_type === 'ia' || msg.sender_type === 'assistant') {
        role = 'assistant';
      } else if (msg.sender_type === 'you') {
        role = 'assistant'; // Los mensajes del usuario de WhatsApp se tratan como assistant
      } else {
        role = 'assistant'; // Por defecto, cualquier otro tipo se trata como assistant
      }
      
      // Agregar contexto temporal para mejor memoria
      const messageContext = {
        role: role,
        content: msg.text_content || '',
        sender_type: msg.sender_type,
        text_content: msg.text_content,
        whatsapp_created_at: msg.whatsapp_created_at,
        created_at: msg.created_at,
        message_type: msg.message_type,
        position: index + 1, // Posición en la conversación
        isRecent: index >= messages.length - 5 // Últimos 5 mensajes son recientes
      };

      // Log para debugging del contexto
      if (index < 3 || index >= messages.length - 3) {
        console.log(`   ${index + 1}. [${role.toUpperCase()}] ${msg.text_content ? msg.text_content.substring(0, 50) + '...' : 'Sin texto'} (${msg.sender_type})`);
      }

      return messageContext;
    });

    console.log(`🧠 Contexto procesado: ${processedMessages.length} mensajes con roles y contexto temporal`);
    return processedMessages;
  } catch (error) {
    console.error('❌ Error general obteniendo historial de conversación:', error);
    return [];
  }
}

// *** AÑADIMOS ESTA FUNCIÓN ***
function getLastQrForUser(userId) {
  const sessionObj = sessions.get(userId)
  return sessionObj?.qr || null
}

/**
 * 1) OBTENER QR
 */
export async function getQrCode(userId) {
  try {
    // Verificar si ya hay una sesión activa
    const existingSession = sessions.get(userId);
    if (existingSession && existingSession.user) {
      return {
        success: true,
        message: 'WhatsApp ya está conectado',
        qr: null,
        connected: true
      };
    }

    // Iniciar sesión para generar QR
    await startSession(userId);
    
    // Esperar un momento para que se genere el QR
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const rawQr = getLastQrForUser(userId) || getCachedQr(userId);
    if (!rawQr) {
      // Si no hay QR, puede que la sesión ya esté conectada
      const session = sessions.get(userId);
      if (session && session.user) {
        return {
          success: true,
          message: 'WhatsApp ya está conectado',
          qr: null,
          connected: true
        };
      }
      throw new Error('QR no disponible (no generado o ya escaneado)');
    }
    
    const qrImage = await qrcode.toDataURL(rawQr);
    return {
      success: true,
      message: 'Escanea este código QR con WhatsApp',
      qr: qrImage,
      connected: false
    };
  } catch (error) {
    console.error('Error obteniendo QR:', error);
    throw error;
  }
}
let googleAccessToken = null;

// Método para recibir y devolver el token (no se guarda en la base de datos)
export const saveCalendarToken = (req, res) => {
  try {
    const { token } = req.body;  // Obtener el token desde el cuerpo de la solicitud
    console.log("TOKEN RECIBIDO: ", token);
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token no proporcionado' });
    }
    googleAccessToken = token;  // Guardamos el token en una variable temporal

    // Retornamos el token para poder usarlo en otro proceso
    return res.status(200).json({ success: true, token });
  } catch (error) {
    console.error('Error al recibir el token:', error);
    return res.status(500).json({ success: false, message: 'Error al recibir el token' });
  }
};


/**
 * 2) OBTENER CONTACTO POR ID
 */
export async function getContactById(userId, contactId) {
  const sock = sessions.get(userId);
  if (!sock) {
    console.warn(`No hay sesión WA para userId=${userId}, contacto ${contactId}`);
    return { id: contactId, name: contactId.split('@')[0], avatar: null };
  }

  let name = contactId.split('@')[0];
  let avatar = null;

  try {
    if (contactId.endsWith('@g.us')) {
      const meta = await sock.groupMetadata(contactId);
      name = meta.subject || name;
    } else {
      avatar = await sock.profilePictureUrl(contactId, 'image');
    }
  } catch (error) {
    console.warn(`Error obteniendo datos para contacto ${contactId}:`, error);
  }

  // Ya no se actualiza nada en la base de datos en esta función

  return { id: contactId, name, avatar };
}


/**
 * 4) OBTENER CONTACTOS DEL USUARIO
 */
export async function getContacts(userId) {
  try {
    // Verificar si hay una sesión activa
    const sock = sessions.get(userId);
    if (!sock) {
      throw new Error('WhatsApp no está conectado. Por favor, escanea el código QR.');
    }

    // Obtener contactos desde la base de datos
    const { rows: contacts } = await pool.query(`
      SELECT DISTINCT 
        c.external_id,
        c.contact_name,
        c.contact_photo_url,
        c.started_at,
        c.unread_count,
        c.last_message_at,
        COALESCE(
          (SELECT m.text_content 
           FROM messages_new m 
           WHERE m.conversation_id = c.id 
           ORDER BY m.created_at DESC 
           LIMIT 1), 
          'Sin mensajes'
        ) as last_message
      FROM conversations_new c
      WHERE c.user_id = $1 
        AND c.external_id NOT LIKE '%@g.us%'  -- Excluir grupos
      ORDER BY c.last_message_at DESC NULLS LAST, c.started_at DESC
    `, [userId]);

    // Enriquecer con información de WhatsApp si está disponible
    const enrichedContacts = await Promise.all(
      contacts.map(async (contact) => {
        try {
          // Intentar obtener información actualizada del contacto
          if (sock.user) {
            try {
              const profilePic = await sock.profilePictureUrl(contact.external_id, 'image');
              contact.contact_photo_url = profilePic;
            } catch (error) {
              // Si no se puede obtener la foto, mantener la existente
              console.log(`No se pudo obtener foto para ${contact.external_id}:`, error.message);
            }
          }
          
          return {
            id: contact.external_id,
            name: contact.contact_name || contact.external_id.split('@')[0],
            phone: contact.external_id.split('@')[0],
            photo: contact.contact_photo_url,
            lastMessage: contact.last_message,
            unreadCount: contact.unread_count || 0,
            lastMessageAt: contact.last_message_at,
            startedAt: contact.started_at
          };
        } catch (error) {
          console.error(`Error procesando contacto ${contact.external_id}:`, error);
          return {
            id: contact.external_id,
            name: contact.contact_name || contact.external_id.split('@')[0],
            phone: contact.external_id.split('@')[0],
            photo: null,
            lastMessage: contact.last_message,
            unreadCount: contact.unread_count || 0,
            lastMessageAt: contact.last_message_at,
            startedAt: contact.started_at
          };
        }
      })
    );

    return enrichedContacts;
  } catch (error) {
    console.error('Error obteniendo contactos:', error);
    throw error;
  }
}

/**
 * 5) GUARDAR MENSAJE ENTRANTE
 */
//
export async function saveIncomingMessage(userId, msg, textContent, media = [], senderType = 'user') {
  const sock = sessions.get(userId);
  const conversationId = msg.key.remoteJid;
  console.log("📱 Procesando mensaje del usuario:", textContent);
  
  if (!sock) {
    console.log(`❌ No se encontró sesión WA para el usuario ${userId}`);
    return;
  }

  const waUserId = sock?.user?.id || '';
  const phoneNumber = waUserId.split('@')[0].split(':')[0];

  // Ajuste del timestamp para la zona horaria local
  const timestamp = new Date(msg.messageTimestamp * 1000);
  const timezoneOffset = new Date().getTimezoneOffset();
  const adjustedTimestamp = new Date(timestamp.getTime() - timezoneOffset * 60000);

  let conv = null;
  const { rows } = await pool.query(`
    SELECT id, wa_user_id, ai_active, personality_id, no_ac_ai
    FROM conversations_new
    WHERE external_id = $1 
      AND user_id = $2 
      AND wa_user_id = $3
    LIMIT 1
  `, [conversationId, userId, phoneNumber]);

  if (rows.length > 0) {
    conv = rows[0];
    console.log(`✅ Conversación existente encontrada con ID: ${conv.id}`);
  } else {
    let contactName, contactPhotoUrl;
    if (conversationId.endsWith('@g.us')) {
      const meta = await sock.groupMetadata(conversationId);
      contactName = meta.subject || 'Grupo sin nombre';
      contactPhotoUrl = meta.iconUrl || await sock.profilePictureUrl(conversationId, 'image').catch(() => null);
    } else {
      contactName = conversationId.split('@')[0];
      contactPhotoUrl = await sock.profilePictureUrl(conversationId, 'image').catch(() => null);
    }

    const insertRes = await pool.query(`
      INSERT INTO conversations_new
      (external_id, contact_name, contact_photo_url, started_at, user_id, wa_user_id)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5)
      RETURNING id, ai_active, personality_id, no_ac_ai
    `, [conversationId, contactName, contactPhotoUrl, userId, phoneNumber]);

    conv = insertRes.rows[0];
    console.log(`✅ Nueva conversación creada con ID: ${conv.id}`);
  }

  const convId = conv.id;
  
  // Verificar si el mensaje ya existe (DESHABILITADO TEMPORALMENTE PARA IA GLOBAL)
  // const { rows: existingMsgs } = await pool.query(`
  //   SELECT id
  //   FROM messages_new
  //   WHERE conversation_id = $1 AND last_msg_id = $2
  //   LIMIT 1
  // `, [convId, msg.key.id]);

  // if (existingMsgs.length > 0) {
  //   console.log('⚠️ Mensaje ya existe en DB, evitando duplicados');
  //   return { success: true, aiReply: null };
  // }

  console.log('✅ Verificación de duplicados deshabilitada - Procesando mensaje para IA global');

  // Guardar mensaje principal del usuario usando Supabase API
  let userMessageId = null;
  try {
    console.log(`💾 Insertando mensaje principal: conversation_id=${convId}, sender_type=${senderType}, text_content="${textContent}"`);
    
    const { data: insertedMessage, error } = await supabaseAdmin
      .from('messages_new')
      .insert({
        conversation_id: convId,
        sender_type: senderType,
        message_type: 'text',
        text_content: textContent,
        created_at: new Date().toISOString(),
        user_id: userId,
        whatsapp_created_at: timestamp,
        last_msg_id: msg.key.id
      })
      .select('id')
      .single();

    if (error) {
      console.error(`❌ Error insertando mensaje principal: ${error.message}`);
      return;
    }

    userMessageId = insertedMessage.id;
    console.log(`💾 Mensaje principal guardado con ID: ${userMessageId}`);
  } catch (error) {
    console.error('❌ Error general insertando mensaje principal:', error);
    return;
  }

  // Procesar y guardar contenido de media extraído
  const extractedTexts = [];
  
  // Si no se pasaron medios explícitamente, detectar y procesar medios del mensaje
  if (!media || media.length === 0) {
    console.log('🔍 Detectando medios en el mensaje...');
    
    // Verificar si hay medios en el mensaje
    const hasAudio = msg.message?.audioMessage;
    const hasImage = msg.message?.imageMessage;
    const hasDocument = msg.message?.documentMessage;
    
    if (hasAudio || hasImage || hasDocument) {
      console.log(`📎 Medios detectados - Audio: ${!!hasAudio}, Imagen: ${!!hasImage}, Documento: ${!!hasDocument}`);
      
      // Procesar medios automáticamente
      const processedMedia = await processMedia(msg, userId, conversationId, convId, null, timestamp);
      
      // Agregar el contenido extraído al array
      if (processedMedia && processedMedia.length > 0) {
        for (const mediaItem of processedMedia) {
          if (mediaItem.extractedText && mediaItem.extractedText.length > 10) {
            console.log(`📝 Contenido extraído de ${mediaItem.type}:`, mediaItem.extractedText.substring(0, 100) + '...');
            extractedTexts.push(mediaItem.extractedText);
          }
        }
      }
    }
  } else if (media && media.length > 0) {
    console.log(`📎 Procesando ${media.length} archivos multimedia pasados explícitamente`);
    
    for (let i = 0; i < media.length; i++) {
      const mediaItem = media[i];
      if (mediaItem.extractedText && mediaItem.extractedText.length > 10) {
        console.log(`📝 Contenido extraído de ${mediaItem.type}:`, mediaItem.extractedText.substring(0, 100) + '...');
        extractedTexts.push(mediaItem.extractedText);
      }
    }
  }

  // Si hay contenido extraído, actualizar el mensaje original del usuario con el contenido combinado
  if (extractedTexts.length > 0 && userMessageId) {
    let combinedContent = textContent || '';
    
    // Limpiar el contenido extraído
    let cleanedExtractedText = extractedTexts[0];
    if (cleanedExtractedText.includes('Final del audio')) {
      cleanedExtractedText = cleanedExtractedText
        .replace(/\nFinal del audio.*$/s, '')
        .replace(/^.*?(?=\w)/s, '')
        .trim();
    }
    
    // Combinar contenido
    if (combinedContent && combinedContent.trim().length > 0) {
      // Si hay texto original, combinarlo con el contenido extraído
      if (extractedTexts[0].includes('Final del audio')) {
        combinedContent = `${combinedContent}\n\n[Audio transcrito: ${cleanedExtractedText}]`;
      } else if (extractedTexts[0].includes('Final de la imagen')) {
        combinedContent = `${combinedContent}\n\n[Contenido de imagen: ${cleanedExtractedText}]`;
      } else if (extractedTexts[0].includes('Final del PDF')) {
        combinedContent = `${combinedContent}\n\n[Contenido de PDF: ${cleanedExtractedText}]`;
      } else if (extractedTexts[0].includes('Final del documento Word')) {
        combinedContent = `${combinedContent}\n\n[Contenido de documento Word: ${cleanedExtractedText}]`;
      } else {
        combinedContent = `${combinedContent}\n\n[Contenido multimedia: ${cleanedExtractedText}]`;
      }
    } else {
      // Si no hay texto original, usar solo el contenido extraído limpio
      if (extractedTexts[0].includes('Final del audio')) {
        combinedContent = `[Audio transcrito: ${cleanedExtractedText}]`;
      } else if (extractedTexts[0].includes('Final de la imagen')) {
        combinedContent = `[Contenido de imagen: ${cleanedExtractedText}]`;
      } else if (extractedTexts[0].includes('Final del PDF')) {
        combinedContent = `[Contenido de PDF: ${cleanedExtractedText}]`;
      } else if (extractedTexts[0].includes('Final del documento Word')) {
        combinedContent = `[Contenido de documento Word: ${cleanedExtractedText}]`;
      } else {
        combinedContent = cleanedExtractedText;
      }
    }
    
    // Actualizar el mensaje original del usuario con el contenido combinado
    const { error: updateError } = await supabaseAdmin
      .from('messages_new')
      .update({ text_content: combinedContent })
      .eq('id', userMessageId);
    
    if (updateError) {
      console.error(`❌ Error actualizando mensaje con contenido multimedia: ${updateError.message}`);
    } else {
      console.log(`✅ Mensaje del usuario actualizado con contenido multimedia combinado`);
    }
    
    console.log(`✅ Mensaje del usuario actualizado con contenido multimedia combinado`);
  }

  // Actualizar la conversación
  const { error: convUpdateError } = await supabaseAdmin
    .from('conversations_new')
    .update({
      updated_at: new Date().toISOString(),
      last_msg_id: msg.key.id,
      last_msg_time: timestamp
    })
    .eq('id', convId);
  
  if (convUpdateError) {
    console.error(`❌ Error actualizando conversación: ${convUpdateError.message}`);
  } else {
    console.log(`✅ Conversación actualizada correctamente`);
  }

  // Emitir eventos para interfaz
  emitToUser(userId, 'chats-updated');
  emitToUser(userId, 'new-message', {
    conversationId: convId,
    from: senderType,
    message: textContent,
    timestamp: Date.now(),
    isAI: senderType === 'ia',
    isSticker: false,
    media: []
  });

  if (senderType !== 'user') return { success: true, aiReply: null };

  // Gestión de respuesta IA
  const { ai_active, personality_id, no_ac_ai } = conv;

  if (no_ac_ai) {
    console.log('🚫 IA deshabilitada para esta conversación');
    return { success: true, aiReply: null };
  }

  const { data: settingsData, error: settingsError } = await supabaseAdmin
    .from('user_settings')
    .select('ai_global_active, default_personality_id')
    .eq('users_id', userId)
    .single();

  let ai_global_active = false;
  let default_personality_id = null;

  if (settingsError) {
    if (settingsError.code !== 'PGRST116') {
      console.error('Error al obtener configuración del usuario:', settingsError);
      throw settingsError;
    }
    // Si no hay configuración, usar valores por defecto
    console.log('🔧 No hay configuración de usuario, usando valores por defecto');
  } else {
    ai_global_active = settingsData.ai_global_active || false;
    default_personality_id = settingsData.default_personality_id;
  }

  if (!ai_active && !ai_global_active) {
    console.log('🚫 No hay IA activa, no se generará respuesta.');
    return { success: true, aiReply: null };
  }

  // Obtener personalidad
  let personalityData = null;
  if (ai_active) {
    const { data: personalityFromAI, error: personalityError } = await supabaseAdmin
      .from('personalities')
      .select('*')
      .eq('id', personality_id)
      .single();

    if (personalityError) {
      if (personalityError.code !== 'PGRST116') {
        console.error('Error al obtener personalidad específica:', personalityError);
        throw personalityError;
      }
    } else {
      personalityData = personalityFromAI;
    }
  } else {
    const { data: personalityFromGlobal, error: personalityError } = await supabaseAdmin
      .from('personalities')
      .select('*')
      .eq('id', default_personality_id)
      .single();

    if (personalityError) {
      if (personalityError.code !== 'PGRST116') {
        console.error('Error al obtener personalidad global:', personalityError);
        throw personalityError;
      }
    } else {
      personalityData = personalityFromGlobal;
    }
  }

  if (!personalityData) {
    console.log('❌ No se encontró personalidad para la IA.');
    return { success: true, aiReply: null };
  }

  console.log(`🤖 Usando personalidad: ${personalityData.nombre} (ID: ${personalityData.id})`);

  // Obtener historial completo (incluyendo mensajes del sistema con contenido extraído)
  const history = await getConversationHistory(convId, userId, 20);
  console.log(`📚 Historial obtenido: ${history.length} mensajes`);

  // Determinar mensaje final para IA
  let finalMessage = textContent;
  const hasExtractedContent = extractedTexts.length > 0;

  // Si hay contenido extraído, el mensaje ya fue actualizado con el contenido combinado
  if (hasExtractedContent) {
    // Obtener el mensaje actualizado de la base de datos
    const { rows: updatedMsg } = await pool.query(`
      SELECT text_content FROM messages_new WHERE id = $1
    `, [userMessageId]);
    
    if (updatedMsg.length > 0) {
      finalMessage = updatedMsg[0].text_content;
      console.log(`📋 Usando mensaje combinado para IA: ${finalMessage.substring(0, 100)}...`);
    }
  }

  // Generar respuesta usando el mismo sistema que personalidades
  try {
    console.log('🧠 Generando respuesta de IA...');
    
    // Convertir historial al formato que espera OpenAI
    const historyForAI = history.map(h => ({
      role: h.sender_type === 'user' ? 'user' : 
            h.sender_type === 'system' ? 'system' : 'assistant',
      content: h.text_content || ''
    }));

    // Detectar tipo de media para instrucciones específicas
    const isMediaMessage = hasExtractedContent;
    const mediaType = media.length > 0 ? media[0].type : null;

    const botReply = await generateBotResponse({
      personality: personalityData,
      userMessage: finalMessage,
      userId,
      history: historyForAI,
      mediaType: isMediaMessage ? mediaType : null,
      mediaContent: isMediaMessage ? finalMessage : null
    });

    if (botReply && botReply.trim().length > 0) {
      console.log(`✅ Respuesta generada: ${botReply.substring(0, 100)}...`);
      
      try {
        // Verificar que la sesión sigue activa antes de enviar
        if (!sock || !sock.user) {
          console.log('⚠️ Sesión de WhatsApp no activa, no se puede enviar respuesta');
          return { success: true, aiReply: null };
        }

        // Enviar respuesta a WhatsApp con timeout
        const sendPromise = sock.sendMessage(conversationId, { text: botReply });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout sending message')), 30000)
        );
        
        const msgInfo = await Promise.race([sendPromise, timeoutPromise]);

        // Guardar mensaje de IA en BD
        if (msgInfo?.key?.id) {
          await pool.query(`
            INSERT INTO messages_new
            (conversation_id, sender_type, message_type, text_content, created_at, user_id, whatsapp_created_at, last_msg_id)
            VALUES ($1, $2, 'text', $3, CURRENT_TIMESTAMP, $4, $5, $6)
          `, [convId, 'ia', botReply, userId, timestamp, msgInfo.key.id]);

          console.log('💾 Mensaje de IA guardado en BD');
        }

        // Emitir eventos
        emitToUser(userId, 'chats-updated');
        emitToUser(userId, 'new-message', {
          conversationId: convId,
          from: 'IA',
          message: botReply,
          timestamp: Date.now(),
          isAI: true,
          isSticker: false,
          media: []
        });

        // Marcar como leído con manejo de errores
        try {
          await sock.readMessages([
            { remoteJid: conversationId, id: msg.key.id, participant: msg.key.participant || undefined }
          ]);
        } catch (readError) {
          console.log('⚠️ Error marcando como leído (no crítico):', readError.message);
        }

        console.log('🚀 Respuesta de IA enviada exitosamente');
        
        // 🎯 AUTO-CREACIÓN DE LEAD (después de procesar IA)
        await autoCreateLead(userId, conversationId, textContent, conv);
        
        return { success: true, aiReply: botReply };
        
      } catch (sendError) {
        console.error('❌ Error enviando respuesta de IA:', sendError);
        
        // Si el error es de conexión cerrada, intentar reconectar
        if (sendError.message.includes('Connection Closed') || sendError.message.includes('Timeout')) {
          console.log('🔄 Intentando reconectar sesión de WhatsApp...');
          try {
            await startSession(userId);
          } catch (reconnectError) {
            console.error('❌ Error reconectando:', reconnectError);
          }
        }
        
        // 🎯 AUTO-CREACIÓN DE LEAD (incluso si falla el envío de IA)
        await autoCreateLead(userId, conversationId, textContent, conv);
        
        return { success: true, aiReply: null };
      }
    } else {
      console.log('⚠️ No se generó respuesta de IA');
      
      // 🎯 AUTO-CREACIÓN DE LEAD (aunque no haya respuesta de IA)
      await autoCreateLead(userId, conversationId, textContent, conv);
      
      return { success: true, aiReply: null };
    }
    
  } catch (error) {
    console.error('❌ Error generando respuesta de IA:', error);
    
    // 🎯 AUTO-CREACIÓN DE LEAD (incluso con errores)
    await autoCreateLead(userId, conversationId, textContent, conv);
    
    return { success: true, aiReply: null };
  }
}

/**
 * 🎯 FUNCIÓN DE AUTO-CREACIÓN DE LEADS
 * Crea automáticamente un lead en la primera columna cuando llega un mensaje nuevo
 */
async function autoCreateLead(userId, conversationId, textContent, conv) {
  try {
    console.log(`🎯 Iniciando auto-creación de lead para usuario ${userId}, conversación ${conversationId}`);
    
    // 1) Verificar si ya existe un lead para esta conversación
    const existingLead = await pool.query(`
      SELECT id FROM leads_contacts 
      WHERE user_id = $1 AND conversation_id = $2 
      LIMIT 1
    `, [userId, conversationId]);
    
    if (existingLead.rows.length > 0) {
      console.log(`⚠️ Ya existe un lead para esta conversación: ${existingLead.rows[0].id}`);
      return;
    }
    
    // 2) Obtener o crear la primera columna del usuario
    let firstColumn = await pool.query(`
      SELECT id FROM leads 
      WHERE user_id = $1 
      ORDER BY created_at ASC 
      LIMIT 1
    `, [userId]);
    
    let columnId;
    
    if (firstColumn.rows.length === 0) {
      // Crear primera columna si no existe
      const newColumn = await pool.query(`
        INSERT INTO leads (user_id, title, color, created_at) 
        VALUES ($1, $2, $3, NOW()) 
        RETURNING id
      `, [userId, 'Nuevos Contactos', 'blue']);
      
      columnId = newColumn.rows[0].id;
      console.log(`✅ Primera columna creada: ${columnId}`);
    } else {
      columnId = firstColumn.rows[0].id;
    }
    
    // 3) Extraer información del contacto
    const contactName = conv?.contact_name || conversationId.split('@')[0];
    const shortMessage = textContent ? 
      (textContent.length > 100 ? textContent.substring(0, 100) + '...' : textContent) : 
      'Mensaje recibido';
    
    // 4) Crear el lead
    const newLead = await pool.query(`
      INSERT INTO leads_contacts (
        user_id, name, message, avatar_url, 
        column_id, conversation_id, created_at
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
      RETURNING id
    `, [
      userId, 
      contactName, 
      shortMessage, 
      conv?.contact_photo_url || null, 
      columnId, 
      conversationId
    ]);
    
    console.log(`🎉 Lead creado automáticamente: ${newLead.rows[0].id} para contacto ${contactName}`);
    
    // 5) Emitir evento para actualizar el frontend en tiempo real
    emitToUser(userId, 'lead-created', {
      leadId: newLead.rows[0].id,
      contactName: contactName,
      conversationId: conversationId,
      columnId: columnId,
      message: shortMessage
    });
    
  } catch (error) {
    // No queremos que falle el procesamiento del mensaje por un error en leads
    console.error('❌ Error en auto-creación de lead (no crítico):', error);
  }
}

// Función auxiliar para procesar medios (OPTIMIZADA Y SIMPLIFICADA)
async function processMedia(msg, userId, conversationId, convId, personalityData, timestamp) {
  const sock = sessions.get(userId);
  if (!sock) {
    console.log('❌ No hay sesión de WhatsApp activa para procesar medios');
    return [];
  }

  const processedMedia = [];

  // Definir tipos de media a procesar
  const mediaTypes = [
    { field: 'audioMessage', type: 'audio', downloadType: 'audio' },
    { field: 'imageMessage', type: 'image', downloadType: 'image' },
    { field: 'documentMessage', type: 'document', downloadType: 'document' }
  ];

  for (const { field, type, downloadType } of mediaTypes) {
    const mediaContent = msg.message?.[field];
    
    if (!mediaContent) continue;

    try {
      console.log(`📥 Procesando ${type} - Tamaño: ${mediaContent.fileLength || 'desconocido'} bytes`);

      // Descargar el medio con timeout
      const downloadPromise = downloadContentFromMessage(mediaContent, downloadType);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout descargando ${type}`)), 30000)
      );
      
      const stream = await Promise.race([downloadPromise, timeoutPromise]);

      let buffer = Buffer.alloc(0);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      if (buffer.length === 0) {
        console.log(`⚠️ Buffer vacío para ${type}`);
        continue;
      }

      console.log(`✅ ${type} descargado - Tamaño: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

      let extractedText = '';

      // Procesar según el tipo de medio
      switch (type) {
        case 'audio':
          try {
            console.log('🎵 Transcribiendo audio con OpenAI Whisper...');
            console.log(`📊 Tamaño del audio: ${(buffer.length / 1024).toFixed(2)} KB`);
            
            // Verificaciones previas
            if (buffer.length === 0) {
              throw new Error('Buffer de audio vacío');
            }
            
            if (buffer.length > 25 * 1024 * 1024) {
              throw new Error('Audio demasiado grande (máximo 25MB)');
            }
            
            const { transcribeAudioBuffer } = await import('../services/openaiService.js');
            const startTime = Date.now();
            extractedText = await transcribeAudioBuffer(buffer, 'audio.ogg');
            const endTime = Date.now();
            
            console.log(`⏱️ Tiempo de transcripción: ${endTime - startTime}ms`);
            
            if (!extractedText || extractedText.trim().length === 0) {
              console.log('⚠️ Transcripción vacía, ejecutando diagnóstico...');
              
              // Ejecutar diagnóstico automático
              try {
                const { diagnoseAudioIssues } = await import('../services/productionDiagnostics.js');
                const diagnosis = await diagnoseAudioIssues();
                
                if (diagnosis.hasIssues) {
                  console.log('🚨 Problemas detectados en diagnóstico:', diagnosis.issues);
                  extractedText = `Audio recibido pero hay problemas de configuración: ${diagnosis.issues.join(', ')}`;
                } else {
                  extractedText = 'Audio procesado pero la transcripción está vacía (posible silencio o audio inaudible)';
                }
              } catch (diagError) {
                console.error('❌ Error en diagnóstico:', diagError);
                extractedText = 'Audio procesado pero la transcripción está vacía';
              }
            } else {
              console.log(`✅ Audio transcrito exitosamente (${extractedText.length} caracteres):`, extractedText.substring(0, 100) + '...');
            }
          } catch (error) {
            console.error('❌ Error transcribiendo audio:', error);
            
            // Diagnóstico específico según el tipo de error
            if (error.message.includes('insufficient_quota')) {
              extractedText = `Audio procesado pero se agotó la cuota de OpenAI: ${error.message}`;
            } else if (error.message.includes('Connection')) {
              extractedText = `Audio procesado pero hay problemas de conexión con OpenAI: ${error.message}`;
            } else if (error.message.includes('Invalid API key')) {
              extractedText = `Audio procesado pero la API key de OpenAI no es válida: ${error.message}`;
            } else if (error.message.includes('demasiado grande')) {
              extractedText = `Audio procesado pero el archivo es demasiado grande: ${error.message}`;
            } else {
              extractedText = `Audio procesado pero no se pudo transcribir: ${error.message}`;
            }
            
            // Log adicional para debugging en producción
            console.error('🔍 Detalles del error de audio:', {
              message: error.message,
              code: error.code,
              status: error.status,
              type: error.type,
              stack: error.stack?.split('\n')[0]
            });
          }
          break;

        case 'image':
          try {
            console.log('🖼️ Analizando imagen con Google Vision...');
            const { analyzeImageBufferWithVision } = await import('../services/googleVisionService.js');
            const imagePromise = analyzeImageBufferWithVision(buffer);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout procesando imagen')), 20000)
            );
            extractedText = await Promise.race([imagePromise, timeoutPromise]);
            
            if (!extractedText || extractedText.trim().length === 0) {
              extractedText = 'Imagen procesada pero no se encontró texto';
            } else {
              console.log(`✅ Texto extraído de imagen (${extractedText.length} caracteres):`, extractedText.substring(0, 100) + '...');
            }
          } catch (error) {
            console.error('❌ Error procesando imagen:', error);
            extractedText = `Imagen procesada pero no se pudo extraer texto: ${error.message}`;
          }
          break;

        case 'document':
          if (mediaContent.mimetype === 'application/pdf') {
            try {
              console.log('📄 Analizando PDF con Google Vision...');
              const { analyzePdfBufferWithVision } = await import('../services/googleVisionService.js');
              const pdfPromise = analyzePdfBufferWithVision(buffer);
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout procesando PDF')), 30000)
              );
              extractedText = await Promise.race([pdfPromise, timeoutPromise]);
              
              // Si Google Vision no encuentra texto, intentar con pdf-parse
              if (!extractedText || extractedText.trim().length === 0 || 
                  extractedText.includes('no se encontró texto legible')) {
                console.log('📄 Google Vision no encontró texto, intentando con pdf-parse...');
                try {
                  const pdfData = await pdfParse(buffer);
                  if (pdfData.text && pdfData.text.trim().length > 0) {
                    extractedText = pdfData.text.trim();
                    console.log(`✅ Texto extraído con pdf-parse (${extractedText.length} caracteres):`, extractedText.substring(0, 100) + '...');
                  } else {
                    console.log('⚠️ pdf-parse tampoco encontró texto');
                    extractedText = 'PDF procesado pero no contiene texto extraíble. Puede ser un PDF de solo imágenes o protegido.';
                  }
                } catch (pdfParseError) {
                  console.error('❌ Error con pdf-parse:', pdfParseError);
                  extractedText = extractedText || 'PDF procesado pero no se pudo extraer texto con ningún método.';
                }
              }
              
              if (!extractedText || extractedText.trim().length === 0) {
                extractedText = 'PDF procesado pero no se encontró texto';
              } else {
                console.log(`✅ Texto extraído de PDF (${extractedText.length} caracteres):`, extractedText.substring(0, 100) + '...');
              }
            } catch (error) {
              console.error('❌ Error procesando PDF:', error);
              extractedText = `PDF procesado pero no se pudo extraer texto: ${error.message}`;
            }
          } else if (mediaContent.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            // Procesamiento de archivos Word (.docx)
            try {
              console.log('📝 Analizando documento Word (.docx)...');
              console.log(`📊 Tamaño del documento: ${(buffer.length / 1024).toFixed(2)} KB`);
              
              // Verificar tamaño del archivo
              if (buffer.length > 50 * 1024 * 1024) { // 50MB límite para Word
                throw new Error('Documento Word demasiado grande (máximo 50MB)');
              }
              
              const wordPromise = mammoth.extractRawText({ buffer: buffer });
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout procesando documento Word')), 20000)
              );
              
              const result = await Promise.race([wordPromise, timeoutPromise]);
              extractedText = result.value?.trim() || '';
              
              if (!extractedText || extractedText.length === 0) {
                extractedText = 'Documento Word procesado pero no se encontró texto';
              } else {
                console.log(`✅ Texto extraído de Word (${extractedText.length} caracteres):`, extractedText.substring(0, 100) + '...');
              }
              
              // Log de advertencias si las hay
              if (result.messages && result.messages.length > 0) {
                console.log('⚠️ Advertencias del procesamiento Word:', result.messages);
              }
              
            } catch (error) {
              console.error('❌ Error procesando documento Word:', error);
              extractedText = `Documento Word procesado pero no se pudo extraer texto: ${error.message}`;
            }
          } else if (mediaContent.mimetype === 'application/msword') {
            // Documentos Word antiguos (.doc)
            extractedText = 'Documento Word (.doc) detectado. Por favor, convierte el archivo a formato .docx para poder procesarlo.';
          } else {
            extractedText = `Documento de tipo ${mediaContent.mimetype} no soportado. Formatos soportados: PDF (.pdf), Word (.docx)`;
          }
          break;
      }

      // Agregar sufijos específicos
      if (type === 'audio') {
        extractedText += "\nFinal del audio";
      } else if (type === 'image') {
        extractedText += "\nFinal de la imagen";
      } else if (type === 'document') {
        if (mediaContent.mimetype === 'application/pdf') {
          extractedText += "\nFinal del PDF";
        } else if (mediaContent.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          extractedText += "\nFinal del documento Word";
        } else {
          extractedText += "\nFinal del documento";
        }
      }

      // Agregar instrucción para análisis
      extractedText += "\nQuiero que seas conciso y hagas un análisis con la información que contiene este archivo";

      // Agregar al array de medios procesados
      processedMedia.push({
        type,
        mimeType: mediaContent.mimetype,
        extractedText,
        filename: mediaContent.fileName || `${type}-${Date.now()}`,
        size: buffer.length
      });

    } catch (error) {
      console.error(`❌ Error procesando ${type}:`, error);
      
      // Agregar entrada de error
      processedMedia.push({
        type,
        mimeType: mediaContent.mimetype || 'unknown',
        extractedText: `${type} recibido pero no se pudo procesar: ${error.message}`,
        filename: mediaContent.fileName || `${type}-error`,
        size: 0,
        error: true
      });
    }
  }

  console.log(`✅ Procesamiento de medios completado: ${processedMedia.length} elementos`);
  return processedMedia;
}

// Actualizar la función generateAIResponse para manejar mejor el contexto
async function generateAIResponse(personality, message, userId, history) {
  // Verificar si el mensaje es muy corto o vacío
  if (!message || message.trim().length < 2) {
    console.log('Mensaje demasiado corto o vacío');
    return null;
  }

  // Verificar si el mensaje ya fue respondido recientemente
  const lastMessage = history[history.length - 1];
  if (lastMessage && lastMessage.sender_type === 'ia' && 
      Date.now() - new Date(lastMessage.whatsapp_created_at).getTime() < 5001) {
    console.log('Mensaje ya fue respondido recientemente');
    return null;
  }

  // Detectar si es contenido multimedia (MEJORADO PARA PDFs)
  const isMultimedia = message.includes('imagen') || message.includes('pdf') || message.includes('PDF') ||
                      message.includes('audio') || message.includes('Final de la imagen') || 
                      message.includes('Final del PDF') || message.includes('Final del audio') ||
                      message.includes('Final del documento Word') ||
                      message.includes('[Contenido de imagen:') || 
                      message.includes('[Contenido de PDF:') ||
                      message.includes('[Contenido de documento Word:') ||
                      message.includes('[Audio transcrito:');

  console.log('🔍 Análisis de mensaje:', {
    mensaje: message.substring(0, 100) + '...',
    esMultimedia: isMultimedia,
    incluyePDF: message.includes('PDF') || message.includes('pdf'),
    incluyeFinalPDF: message.includes('Final del PDF'),
    incluyeContenidoPDF: message.includes('[Contenido de PDF:'),
    incluyeWord: message.includes('documento Word') || message.includes('Final del documento Word'),
    incluyeContenidoWord: message.includes('[Contenido de documento Word:')
  });

  // Preparar el contexto de la conversación INCLUYENDO mensajes del sistema
  const context = history.slice(-10).map(h => ({
    role: h.sender_type === 'user' ? 'user' : 
          h.sender_type === 'system' ? 'system' :
          'assistant',
    content: h.text_content || ''
  }));

  // Agregar el mensaje actual al contexto
  context.push({ role: 'user', content: message });

  // Generar respuesta usando el contexto
  try {
    console.log('Generando respuesta de IA para:', message.substring(0, 50) + '...');
    console.log('Contexto incluye mensajes del sistema:', context.filter(c => c.role === 'system').length);
    
    const response = await generateBotResponse({
      personality,
      userMessage: message,
      userId,
      history: context,
      mediaType: isMultimedia ? 'multimedia' : null,
      mediaContent: isMultimedia ? message : null
    });

    if (response) {
      console.log('✅ Respuesta de IA generada:', response.substring(0, 100) + '...');
      return response;
    }
  } catch (error) {
    console.error('Error generando respuesta:', error);
  }

  // Si falla generar respuesta básica usando el contenido extraído
  if (isMultimedia) {
    // Buscar contenido en mensajes del sistema
    const systemContent = history
      .filter(h => h.sender_type === 'system')
      .map(h => h.text_content)
      .join(' ');
    
    console.log('📋 Contenido del sistema encontrado:', systemContent.length, 'caracteres');
    
    if (systemContent && systemContent.length > 10) {
      if (message.includes('imagen') || message.includes('Final de la imagen')) {
        return `He analizado la imagen. Veo: ${systemContent.substring(0, 200)}... ¿Te gustaría que profundice en algún aspecto específico?`;
      } else if (message.includes('pdf') || message.includes('PDF') || message.includes('Final del PDF') || message.includes('[Contenido de PDF:')) {
        console.log('📄 Generando respuesta de fallback para PDF');
        return `He revisado el documento PDF. Contiene: ${systemContent.substring(0, 200)}... ¿Hay algún punto específico que te gustaría discutir?`;
      } else if (message.includes('documento Word') || message.includes('Final del documento Word') || message.includes('[Contenido de documento Word:')) {
        console.log('📝 Generando respuesta de fallback para documento Word');
        return `He revisado el documento Word. Contiene: ${systemContent.substring(0, 200)}... ¿Hay algún punto específico que te gustaría discutir?`;
      } else if (message.includes('audio') || message.includes('Final del audio')) {
        return `He procesado el audio. Transcripción: ${systemContent.substring(0, 200)}... ¿Hay algo específico que te gustaría comentar?`;
      }
    }
  }

  // Respuesta básica de fallback
  return '¡Hola! ¿En qué puedo ayudarte hoy?';
}

/**
 * 5) LISTAR CONVERSACIONES
 */
export const getConversations = async (req, res) => {
  try {
    const users_id = getUserIdFromToken(req).trim()
    if (!users_id) {
      return res.status(401).json({ success: false, message: 'No autenticado' })
    }

    // El socket de esta sesión
    let sock = sessions.get(users_id)
    if (!sock) {
      // Intentar iniciar una nueva sesión si no existe
      try {
        await startSession(users_id);
        // Esperar un momento para que la sesión se inicialice
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Verificar si la sesión se inició correctamente
        sock = sessions.get(users_id);
        if (!sock) {
          return res.status(200).json({ 
            success: false, 
            message: 'WhatsApp no conectado. Por favor, escanea el código QR.',
            needsQr: true,
            conversations: []
          });
        }
      } catch (error) {
        console.error('Error al iniciar sesión:', error);
        return res.status(200).json({ 
          success: false, 
          message: 'WhatsApp no conectado. Por favor, escanea el código QR.',
          needsQr: true,
          conversations: []
        });
      }
    }

    // Verificar si la sesión está conectada y tiene un usuario
    if (!sock || !sock.user) {
      return res.status(200).json({ 
        success: false, 
        message: 'WhatsApp no conectado. Por favor, escanea el código QR.',
        needsQr: true,
        conversations: []
      });
    }

    const waUserId = sock.user.id || ''
    const prephone = waUserId.split('@')[0]
    const phoneNumber = prephone.split(':')[0]

    const { rows: convs } = await pool.query(`
      SELECT
        c.external_id AS id,
        c.contact_name AS name,
        c.contact_photo_url AS photo,
        c.ai_active AS "aiActive",
        c.personality_id AS "personalityId",
        p.nombre AS "personalityName",
        (p.category = 'global') AS "isGlobalPersonality",
        c.no_ac_ai,
        EXTRACT(EPOCH FROM COALESCE(m_last.whatsapp_created_at, c.started_at))::BIGINT AS "updatedAt",
        m_last.text_content AS "lastMessage",
        COALESCE(unread.unread_count, 0)::INT AS "unreadCount",
        c.last_read_at
      FROM conversations_new c
      LEFT JOIN personalities p ON c.personality_id = p.id
      LEFT JOIN LATERAL (
        SELECT text_content, whatsapp_created_at
        FROM messages_new
        WHERE conversation_id = c.id
        ORDER BY whatsapp_created_at DESC LIMIT 1
      ) AS m_last ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS unread_count
        FROM messages_new
        WHERE conversation_id = c.id
          AND sender_type = 'user'
          AND whatsapp_created_at > COALESCE(c.last_read_at, '1970-01-01')
      ) AS unread ON true
      WHERE c.user_id = $1 AND c.wa_user_id = $2 AND c.external_id IS NOT NULL
      ORDER BY 
        (CASE WHEN m_last.whatsapp_created_at IS NULL THEN 1 ELSE 0 END),
        COALESCE(m_last.whatsapp_created_at, c.started_at) DESC;
    `, [users_id, phoneNumber]);

    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .select('ai_global_active, default_personality_id')
      .eq('users_id', users_id)
      .single();

    let settings = {};
    if (settingsError) {
      if (settingsError.code !== 'PGRST116') {
        console.error('Error al obtener configuración de usuario:', settingsError);
        throw settingsError;
      }
      // Si no hay configuración, usar valores por defecto
      settings = {};
    } else {
      settings = settingsData;
    }

    return res.json({
      success: true,
      conversations: convs,
      globalSettings: {
        aiGlobalActive: settings.ai_global_active ?? false,
        globalPersonalityId: settings.default_personality_id || null
      }
    })

  } catch (error) {
    console.error('getConversations error:', error)
    return res.status(500).json({ 
      success: false, 
      message: 'Error al obtener conversaciones',
      error: error.message
    })
  }
}

export const markConversationRead = async (req, res) => {
  const user_id = getUserIdFromToken(req); // Obtén el ID del usuario desde el token
  const sock = sessions.get(user_id); // Obtén la sesión activa del usuario
  const { conversationId } = req.body; // Obtén el conversationId desde el cuerpo de la solicitud

  // Consulta para obtener el external_id y last_msg_time de la conversación
  const { rows } = await pool.query(`
    SELECT external_id, last_msg_time
    FROM conversations_new
    WHERE external_id = $1 
      AND user_id = $2
    LIMIT 1
  `, [conversationId, user_id]);

  // Verifica si encontramos la conversación en la base de datos
  if (rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
  }

  const external_id = rows[0].external_id;
  const lastMsgTime = rows[0].last_msg_time; // Tiempo del último mensaje registrado en la base de datos

  // Actualiza la base de datos para establecer la fecha de lectura
  await pool.query(`
    UPDATE conversations_new
    SET last_read_at = NOW()
    WHERE external_id = $1 
      AND user_id = $2
  `, [external_id, user_id]);

  // // Obtener todos los mensajes desde el último mensaje leído (usando last_msg_time)
  // const { rows: messages } = await pool.query(`
  //   SELECT id
  //   FROM messages_new
  //   WHERE conversation_id = (SELECT id FROM conversations_new WHERE external_id = $1 AND user_id = $2)
  //   AND whatsapp_created_at > $3 
  //   ORDER BY whatsapp_created_at ASC
  // `, [external_id, user_id, lastMsgTime]);

  // Verifica si encontramos mensajes para marcar como leídos
  //  if (messages.length === 0) {
  //    console.log('No hay mensajes nuevos para marcar como leídos');
  //  }
  //       // Marca todos los mensajes más recientes como leídos
  //       for (const message of messages) {
  //         await sock.readMessages([{
  //           remoteJid: external_id, // Usamos el external_id como remoteJid
  //           id: message.id, // El ID del mensaje a marcar como leído
  //           participant: undefined, // Este valor puede ser opcional dependiendo de tu implementación
  //         }]);
  //         console.log(`Mensaje con ID ${message.id} de la conversación con ID ${external_id} marcado como leído`);
  //       }
  // Devuelve una respuesta exitosa
  res.json({ success: true });
};

/**
 * 6) ENVIAR MENSAJE
 */

export async function sendMessage(userId, conversationId, textContent, attachments = [], senderType = 'you') {
  // Verificar rate limiting
  checkRateLimit(userId);
  
  // Validar que conversationId sea un JID válido
  if (!conversationId.endsWith('@s.whatsapp.net') && !conversationId.endsWith('@g.us')) {
    throw new Error('conversationId debe ser un JID válido (@s.whatsapp.net o @g.us)');
  }

  const convRes = await pool.query(`
    SELECT id
    FROM conversations_new
    WHERE external_id = $1
      AND user_id = $2
    LIMIT 1
  `, [conversationId, userId]);

  if (!convRes.rows.length) {
    throw new Error('Conversación no encontrada');
  }

  const convId = convRes.rows[0].id;
  const sock = sessions.get(userId);

  if (!sock) {
    throw new Error('No hay sesión activa de WhatsApp. Por favor, escanea el código QR.');
  }
  
  if (!sock.user) {
    throw new Error('Sesión de WhatsApp no completamente inicializada. Intenta de nuevo en unos segundos.');
  }

  if ((senderType === 'you' || senderType === 'ia') && sock) {
    let msgInfo;
    if (attachments.length) {
      // NOTA: Actualmente solo se envía el primer adjunto
      // Para enviar múltiples, sería necesario un bucle con delays
      if (attachments.length > 1) {
        console.warn(`⚠️ Se recibieron ${attachments.length} adjuntos, pero solo se enviará el primero`);
      }
      
      const m = attachments[0];
      if (!m.data) {
        throw new Error('Adjunto sin datos válidos');
      }
      
      const buffer = Buffer.from(m.data, 'base64');
      const key = mediaKeyFromMime(m.mimeType);
      const payload = { [key]: buffer, mimetype: m.mimeType };
      if (m.filename || m.fileName) payload.fileName = m.filename || m.fileName;
      if (textContent) payload.caption = textContent;
      
      msgInfo = await sock.sendMessage(conversationId, payload);
    } else {
      if (!textContent || textContent.trim() === '') {
        throw new Error('Se requiere textContent o adjuntos');
      }
      msgInfo = await sock.sendMessage(conversationId, { text: textContent });
    }

    if (msgInfo?.key?.id) {
      sentMessageIds.add(msgInfo.key.id);
      setTimeout(() => sentMessageIds.delete(msgInfo.key.id), 2 * 60 * 1000); // Elimina el id después de 2 minutos
    }

    const sentId = msgInfo?.key?.id || null;
    await pool.query(`
      INSERT INTO messages_new
        (conversation_id, sender_type, message_type, text_content, created_at, user_id, whatsapp_created_at, last_msg_id)
      VALUES ($1, $2, $3, $4, NOW(), $5, NOW(), $6)
    `, [convId, senderType, attachments.length ? 'media' : 'text', textContent, userId, sentId]);

    await pool.query(`
      UPDATE conversations_new
      SET updated_at = NOW()
      WHERE external_id = $1
        AND user_id = $2
    `, [conversationId, userId]);

    return { success: true };
  }

  if (senderType === 'user') {
    await pool.query(`
      INSERT INTO messages_new
        (conversation_id, sender_type, message_type, text_content, created_at, user_id)
      VALUES ($1, 'user', $2, $3, NOW(), $4)
    `, [convId, attachments.length ? 'media' : 'text', textContent, userId]);

    await pool.query(`
      UPDATE conversations_new
      SET updated_at = NOW()
      WHERE external_id = $1
        AND user_id = $2
    `, [conversationId, userId]);

    return { success: true, aiReply: null };
  }

  throw new Error('senderType inválido');
}

/**
 * 6.1) ENVIAR MENSAJE A NÚMERO ESPECÍFICO
 * Crea conversación si no existe y envía mensaje
 */
export async function sendMessageToNumber(userId, phoneNumber, textContent, attachments = [], senderType = 'you', defaultCountry = '34') {
  // Verificar rate limiting
  checkRateLimit(userId);
  
  const sock = sessions.get(userId);
  
  if (!sock) {
    throw new Error('No hay sesión activa de WhatsApp. Por favor, escanea el código QR.');
  }
  
  if (!sock.user) {
    throw new Error('Sesión de WhatsApp no completamente inicializada. Intenta de nuevo en unos segundos.');
  }

  // Normalizar número a JID de WhatsApp
  const jid = normalizeToJid(phoneNumber, defaultCountry);
  console.log(`📱 Enviando mensaje a JID normalizado: ${phoneNumber} → ${jid}`);

  // Verificar si la conversación ya existe
  let convRes = await pool.query(`
    SELECT id
    FROM conversations_new
    WHERE external_id = $1
      AND user_id = $2
    LIMIT 1
  `, [jid, userId]);

  let convId;
  
  if (convRes.rows.length === 0) {
    // Crear nueva conversación
    const waUserId = sock.user.id.split('@')[0].split(':')[0];
    const contactName = jid.split('@')[0]; // Usar número limpio como nombre inicial
    
    const newConvRes = await pool.query(`
      INSERT INTO conversations_new
        (external_id, user_id, wa_user_id, contact_name, started_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
      RETURNING id
    `, [jid, userId, waUserId, contactName]);
    
    convId = newConvRes.rows[0].id;
    console.log(`✅ Nueva conversación creada: ${jid} (ID: ${convId})`);
    
    // Emitir evento de nueva conversación
    emitToUser(userId, 'new-conversation', {
      id: convId,
      external_id: jid,
      contact_name: contactName,
      started_at: new Date().toISOString(),
      unread_count: 0
    });
  } else {
    convId = convRes.rows[0].id;
    console.log(`📞 Usando conversación existente: ${jid} (ID: ${convId})`);
  }

  // Enviar mensaje usando JID normalizado
  if ((senderType === 'you' || senderType === 'ia') && sock) {
    let msgInfo;
    
    try {
      if (attachments.length) {
        // NOTA: Actualmente solo se envía el primer adjunto
        if (attachments.length > 1) {
          console.warn(`⚠️ Se recibieron ${attachments.length} adjuntos, pero solo se enviará el primero`);
        }
        
        const m = attachments[0];
        if (!m.data) {
          throw new Error('Adjunto sin datos válidos');
        }
        
        const buffer = Buffer.from(m.data, 'base64');
        const key = mediaKeyFromMime(m.mimeType);
        const payload = { [key]: buffer, mimetype: m.mimeType };
        if (m.filename || m.fileName) payload.fileName = m.filename || m.fileName;
        if (textContent) payload.caption = textContent;
        
        msgInfo = await sock.sendMessage(jid, payload);
      } else {
        if (!textContent || textContent.trim() === '') {
          throw new Error('Se requiere textContent o adjuntos');
        }
        msgInfo = await sock.sendMessage(jid, { text: textContent });
      }

      console.log(`✅ Mensaje enviado a ${jid}:`, msgInfo?.key?.id);

      if (msgInfo?.key?.id) {
        sentMessageIds.add(msgInfo.key.id);
        setTimeout(() => sentMessageIds.delete(msgInfo.key.id), 2 * 60 * 1000);
      }

      // Guardar mensaje en BD
      await pool.query(`
        INSERT INTO messages_new
          (conversation_id, sender_type, message_type, text_content, created_at, user_id, whatsapp_created_at, last_msg_id)
        VALUES ($1, $2, $3, $4, NOW(), $5, NOW(), $6)
      `, [convId, senderType, attachments.length ? 'media' : 'text', textContent, userId, msgInfo?.key?.id]);

      // Actualizar conversación
      await pool.query(`
        UPDATE conversations_new
        SET updated_at = NOW()
        WHERE external_id = $1
          AND user_id = $2
      `, [jid, userId]);

      // Emitir eventos en tiempo real
      emitToUser(userId, 'chats-updated');
      emitToUser(userId, 'new-message', {
        conversationId: convId,
        from: 'you',
        message: textContent,
        timestamp: Date.now(),
        isAI: senderType === 'ia',
        isSticker: false,
        media: attachments
      });

      return { 
        success: true, 
        conversationId: convId,
        externalId: jid,
        messageId: msgInfo?.key?.id,
        normalizedJid: jid
      };
      
    } catch (error) {
      console.error(`❌ Error enviando mensaje a ${jid}:`, error);
      throw new Error(`Error enviando mensaje: ${error.message}`);
    }
  }

  throw new Error('senderType inválido o sesión no disponible');
}

/**
 * 6.2) ENVIAR MENSAJE GENERADO POR IA
 * Genera respuesta de IA y la envía proactivamente
 */
export async function sendAIMessage(userId, phoneNumber, prompt, defaultCountry = '34', personalityId = null) {
  // Verificar rate limiting
  checkRateLimit(userId);
  
  const sock = sessions.get(userId);
  
  if (!sock) {
    throw new Error('No hay sesión activa de WhatsApp. Por favor, escanea el código QR.');
  }
  
  if (!sock.user) {
    throw new Error('Sesión de WhatsApp no completamente inicializada. Intenta de nuevo en unos segundos.');
  }

  // Normalizar número a JID de WhatsApp
  const jid = normalizeToJid(phoneNumber, defaultCountry);
  console.log(`🤖 Generando mensaje de IA para enviar a: ${phoneNumber} → ${jid}`);

  try {
    // Obtener personalidad
    let personalityData = null;
    if (personalityId) {
      const { data: personality, error: personalityError } = await supabaseAdmin
        .from('personalities')
        .select('*')
        .eq('id', personalityId)
        .eq('users_id', userId)
        .single();
        
      if (!personalityError && personality) {
        personalityData = personality;
      }
    }
    
    // Si no hay personalidad específica, usar la por defecto del usuario
    if (!personalityData) {
      const { data: userSettings } = await supabaseAdmin
        .from('user_settings')
        .select('default_personality_id')
        .eq('users_id', userId)
        .single();
        
      if (userSettings?.default_personality_id) {
        const { data: defaultPersonality } = await supabaseAdmin
          .from('personalities')
          .select('*')
          .eq('id', userSettings.default_personality_id)
          .eq('users_id', userId)
          .single();
          
        if (defaultPersonality) {
          personalityData = defaultPersonality;
        }
      }
    }

    // Verificar si la conversación existe para obtener historial
    let history = [];
    const convRes = await pool.query(`
      SELECT id FROM conversations_new 
      WHERE external_id = $1 AND user_id = $2 
      LIMIT 1
    `, [jid, userId]);
    
    if (convRes.rows.length > 0) {
      const convId = convRes.rows[0].id;
      history = await getConversationHistory(convId, userId, 10);
    }

    // Generar respuesta de IA
    console.log(`🧠 Generando respuesta de IA con prompt: "${prompt.substring(0, 50)}..."`);
    
    const aiResponse = await generateBotResponse({
      personality: personalityData,
      userMessage: prompt,
      userId,
      history: history.map(h => ({
        role: h.sender_type === 'user' ? 'user' : 
              h.sender_type === 'system' ? 'system' : 'assistant',
        content: h.text_content || ''
      }))
    });

    if (!aiResponse || aiResponse.trim() === '') {
      throw new Error('La IA no pudo generar una respuesta para el prompt proporcionado');
    }

    console.log(`✅ IA generó respuesta: "${aiResponse.substring(0, 100)}..."`);

    // Usar sendMessageToNumber para enviar como IA
    const result = await sendMessageToNumber(
      userId,
      phoneNumber,
      aiResponse,
      [], // sin adjuntos
      'ia', // sender type IA
      defaultCountry
    );

    return {
      ...result,
      aiPrompt: prompt,
      aiResponse: aiResponse,
      personalityUsed: personalityData?.nombre || 'Por defecto'
    };

  } catch (error) {
    console.error(`❌ Error generando/enviando mensaje de IA:`, error);
    throw new Error(`Error generando mensaje de IA: ${error.message}`);
  }
}

/**
 * 7) ELIMINAR CONVERS
 */
export async function deleteConversation(userId, conversationId) {
  const convRes = await pool.query(`
    SELECT id
    FROM conversations_new
    WHERE external_id = $1
      AND user_id = $2
  `, [conversationId, userId]);

  if (!convRes.rows.length) {
    throw new Error('Conversación no encontrada');
  }

  const convId = convRes.rows[0].id;

  // Borrar msgs
  await pool.query(`
    DELETE FROM messages_new
     WHERE conversation_id = $1
       AND user_id = $2
  `, [convId, userId]);

  // Borrar convers
  await pool.query(`
    DELETE FROM conversations_new
     WHERE id = $1
       AND user_id = $2
  `, [convId, userId]);

  return { success: true };
}

/**
 * Procesa un array de medios adjuntos
 */
async function processMediaArray(media, conversationId, messageId, type, userId) {
  for (const m of media) {
    try {
      // Calcular hash MD5 del contenido
      const hash = crypto.createHash('md5').update(m.data).digest('hex');
      
      // Verificar si ya existe en la base de datos
      const { rows: existingMedia } = await pool.query(
        `SELECT extracted_text FROM media WHERE hash = $1 LIMIT 1`,
        [hash]
      );

      let extractedText;
      if (existingMedia.length > 0) {
        // Reutilizar texto extraído existente
        extractedText = existingMedia[0].extracted_text;
      } else {
        // Extraer texto según el tipo de medio
        if (m.type === 'image') {
          extractedText = await extractImageText(m);
        } else if (m.type === 'pdf') {
          extractedText = await extractPdfText(m);
        }

        // Guardar en la base de datos
        if (extractedText) {
          await pool.query(
            `INSERT INTO media (message_id, users_id, media_type, mime_type, extracted_text, hash, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
            [messageId, userId, m.type, m.mimeType, extractedText, hash]
          );
        }
      }
    } catch (error) {
      console.error(`Error procesando medio:`, error);
      throw error;
    }
  }
}

/**
 * 12) ASIGNAR PERSONALIDAD A UNA CONVERS
 */
export const setConversationPersonality = async (req, res) => {
  try {
    const users_id = getUserIdFromToken(req)
    const { conversationId, personalityId } = req.body

    // Verificación de parámetros
    if (!conversationId || !personalityId) {
      return res.status(400).json({
        success: false,
        message: 'Faltan parámetros (conversationId, personalityId)'
      })
    }

    // Actualizar la personalidad y activar la IA para la conversación
    await pool.query(`
      UPDATE conversations_new
         SET personality_id = $1,
             ai_active = TRUE 
       WHERE external_id = $2
         AND user_id = $3
    `, [personalityId, conversationId, users_id])

    return res.status(200).json({
      success: true,
      message: 'Personalidad asignada a la conversación y IA activada'
    })
  } catch (error) {
    console.error('Error setConversationPersonality:', error)
    return res.status(500).json({ success: false, message: 'Error asignando personalidad y activando IA' })
  }
}

/**
 * 13) UPDATE CONTACT PREFERENCES
 */
export const updateContactPreferences = async (req, res) => {
  try {
    const users_id = getUserIdFromToken(req)
    const { contactId, name, muted, pinned } = req.body
    if (!contactId) {
      return res.status(400).json({ success: false, message: 'Falta contactId' })
    }

    await pool.query(`
      UPDATE conversations_new
         SET contact_name = COALESCE($1, contact_name),
             is_pinned    = COALESCE($2, is_pinned),
             is_muted     = COALESCE($3, is_muted)
       WHERE external_id=$4
         AND user_id=$5
    `, [
      name,
      pinned,
      muted,
      contactId,
      users_id
    ])

    return res.status(200).json({
      success: true,
      message: 'Preferencias de contacto/conversación actualizadas'
    })
  } catch (error) {
    console.error('Error updateContactPreferences:', error)
    return res.status(500).json({ success: false, message: 'Error al actualizar preferencias' })
  }
}

/**
 * 15) OBTENER MENSAJES
 */
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.query;
    const users_id = getUserIdFromToken(req);

    // Validar usuario
    if (!users_id) return res.status(401).json({ success: false, message: 'No autenticado' });
    if (!conversationId) return res.status(400).json({ success: false, message: 'conversationId requerido' });

    // Buscar la conversación interna
    const convRes = await pool.query(`
      SELECT id FROM conversations_new
      WHERE external_id = $1
        AND user_id = $2
      LIMIT 1
    `, [conversationId, users_id]);

    if (!convRes.rows.length) {
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }

    const convId = convRes.rows[0].id;

    // Traer todos los mensajes existentes ordenados correctamente
    const { rows } = await pool.query(`
      SELECT id,
             sender_type,
             message_type,
             text_content AS body,
             EXTRACT(EPOCH FROM whatsapp_created_at)::BIGINT AS timestamp
      FROM messages_new
      WHERE conversation_id = $1
        AND user_id = $2
      ORDER BY whatsapp_created_at ASC
    `, [convId, users_id]);

    // Responder con los mensajes obtenidos
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error getMessages:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener mensajes' });
  }
};

/**
 * 16) CONTADOR MENSAJES USER
 */
export const getUserMessagesCount = async (req, res) => {
  try {
    const { conversationId } = req.query
    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Se requiere conversationId' })
    }
    const users_id = getUserIdFromToken(req)
    if (!users_id) {
      return res.status(401).json({ success: false, message: 'No autenticado' })
    }

    const { rows } = await pool.query(`
      SELECT COUNT(*) AS user_message_count
        FROM messages_new
       WHERE conversation_id=$1
         AND user_id=$2
         AND sender_type='user'
         AND created_at>NOW()-INTERVAL '1 week'
    `, [conversationId, users_id])

    return res.json({ success: true, userMessageCount: rows[0].user_message_count })
  } catch (error) {
    console.error('Error getUserMessagesCount:', error)
    return res.status(500).json({ success: false, message: 'Error interno' })
  }
}

/**
 * 17) CONTADOR MENSAJES IA
 */
export const getAiMessagesCount = async (req, res) => {
  try {
    const { conversationId } = req.query
    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Se requiere conversationId' })
    }
    const users_id = getUserIdFromToken(req)
    if (!users_id) {
      return res.status(401).json({ success: false, message: 'No autenticado' })
    }

    const { rows: aiRows } = await pool.query(`
      SELECT COUNT(*) AS ai_message_count
        FROM messages_new
       WHERE conversation_id=$1
         AND user_id=$2
         AND sender_type='ia'
         AND created_at>NOW()-INTERVAL '1 week'
    `, [conversationId, users_id])
    const aiMessageCount = aiRows[0].ai_message_count

    const { rows: totalRows } = await pool.query(`
      SELECT COUNT(*) AS total_message_count
        FROM messages_new
       WHERE conversation_id=$1
         AND user_id=$2
         AND created_at>NOW()-INTERVAL '1 week'
    `, [conversationId, users_id])
    const totalMessageCount = totalRows[0].total_message_count

    const percentage = totalMessageCount > 0
      ? (aiMessageCount / totalMessageCount) * 100
      : 0

    return res.json({
      success: true,
      aiMessageCount,
      totalMessageCount,
      percentage: `${percentage.toFixed(2)}%`
    })
  } catch (error) {
    console.error('Error getAiMessagesCount:', error)
    return res.status(500).json({ success: false, message: 'Error interno' })
  }
}

/**
 * 18) Personalidad por defecto (global)
 */
export const setDefaultPersonality = async (req, res) => {
  try {
    const users_id = getUserIdFromToken(req)
    const { personalityId } = req.body

    if (!personalityId) {
      return res.status(400).json({ success: false, message: 'No enviaste personalityId' })
    }

    // Insert o Update en user_settings - MIGRADO: Usar API de Supabase
    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert({
        users_id: users_id,
        default_personality_id: personalityId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'users_id'
      });

    if (error) {
      console.error('Error al actualizar personalidad por defecto:', error);
      throw error;
    }

    return res.json({ success: true, message: 'Personalidad por defecto actualizada' })
  } catch (error) {
    console.error('setDefaultPersonality error:', error)
    return res.status(500).json({ success: false, message: 'Error en setDefaultPersonality' })
  }
}

/**
 * 10) ACTIVAR IA GLOBAL
 */
export const activateGlobalAIAll = async (req, res) => {
  try {
    const users_id = getUserIdFromToken(req)
    const aiGlobalActive = req.body.active
    // Insertar o actualizar la configuración del usuario en la base de datos - MIGRADO: Usar API de Supabase
    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert({
        users_id: users_id,
        ai_global_active: aiGlobalActive,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'users_id'
      });

    if (error) {
      console.error('Error al actualizar IA global:', error);
      throw error;
    }

    return res.json({
      success: true,
      message: aiGlobalActive ? 'IA global activada' : 'IA global desactivada'
    })
  } catch (err) {
    console.error('Error en activateGlobalAIAll:', err)
    return res.status(500).json({ success: false, message: 'Error al modificar la configuración de la IA global' })
  }
}

export const activateGlobalPersonality = async (req, res) => {
  try {
    const users_id = getUserIdFromToken(req)
    const { personalityId } = req.body
    // Insertar o actualizar la configuración del usuario en la base de datos - MIGRADO: Usar API de Supabase
    const { error } = await supabaseAdmin
      .from('user_settings')
      .upsert({
        users_id: users_id,
        default_personality_id: personalityId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'users_id'
      });

    if (error) {
      console.error('Error al actualizar personalidad global:', error);
      throw error;
    }

    return res.json({
      success: true,
      message: "Personality added"
    })
  } catch (err) {
    console.error('Error en activateGlobalAIAll:', err)
    return res.status(500).json({ success: false, message: 'Error al modificar la configuración de la IA global' })
  }
}

export const setConversationPersonalityBoolean = async (req, res) => {
  try {
    const users_id = getUserIdFromToken(req)
    const { booleanAi, contactId } = req.body
    // Actualizar la personalidad y activar la IA para la conversación
    await pool.query(`
      UPDATE conversations_new
         SET ai_active = $1 
       WHERE external_id = $2
         AND user_id = $3
    `, [booleanAi, contactId, users_id])

    return res.status(200).json({
      success: true,
      message: 'Personalidad IA activada'
    })
  } catch (error) {
    console.error('Error setConversationPersonality:', error)
    return res.status(500).json({ success: false, message: 'Error asignando personalidad y activando IA' })
  }
}

export const setGlobalProhibition = async (req, res) => {
  try {
    const users_id = getUserIdFromToken(req)
    console.log(req.body)
    // Insertar o actualizar la configuración del usuario en la base de datos
    await pool.query(`
      UPDATE conversations_new
         SET no_ac_ai = $1 
       WHERE external_id = $2
         AND user_id = $3
    `, [req.body.active, req.body.conversationId, users_id])

    return res.json({
      success: true,
      message: "Personality added"
    })
  } catch (err) {
    console.error('Error en en la prohibicion:', err)
    return res.status(500).json({ success: false, message: 'Error al modificar la configuración de la IA global' })
  }
}

/**
 * ENDPOINT DE DIAGNÓSTICO PARA AUDIOS
 */
export const diagnoseAudio = async (req, res) => {
  try {
    console.log('🔍 Iniciando diagnóstico de audio desde endpoint...');
    
    const { diagnoseAudioIssues } = await import('../services/productionDiagnostics.js');
    const diagnosis = await diagnoseAudioIssues();
    
    return res.json({
      success: true,
      diagnosis: {
        issues: diagnosis.issues,
        warnings: diagnosis.warnings,
        hasIssues: diagnosis.hasIssues,
        canProcessAudio: diagnosis.canProcessAudio,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      }
    });
    
  } catch (error) {
    console.error('❌ Error en diagnóstico de audio:', error);
    return res.status(500).json({
      success: false,
      message: 'Error ejecutando diagnóstico de audio',
      error: error.message
    });
  }
};

/**
 * ENDPOINT DE TEST PARA DOCUMENTOS WORD
 */
export const testWordDocument = async (req, res) => {
  try {
    console.log('📝 Iniciando test de documento Word...');
    
    // Verificar si se envió un archivo
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se envió ningún archivo. Usa form-data con key "document"'
      });
    }
    
    const file = req.file;
    console.log('📄 Archivo recibido:', {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: `${(file.size / 1024).toFixed(2)} KB`
    });
    
    // Verificar que sea un documento Word
    if (file.mimetype !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return res.status(400).json({
        success: false,
        message: `Tipo de archivo no soportado: ${file.mimetype}. Se esperaba: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
      });
    }
    
    // Procesar el documento
    try {
      const startTime = Date.now();
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      const endTime = Date.now();
      
      const extractedText = result.value?.trim() || '';
      
      console.log(`✅ Documento procesado en ${endTime - startTime}ms`);
      console.log(`📝 Texto extraído: ${extractedText.length} caracteres`);
      
      return res.json({
        success: true,
        result: {
          filename: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          processingTime: endTime - startTime,
          extractedText: extractedText,
          textLength: extractedText.length,
          preview: extractedText.substring(0, 200) + (extractedText.length > 200 ? '...' : ''),
          warnings: result.messages || [],
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (processingError) {
      console.error('❌ Error procesando documento Word:', processingError);
      return res.status(500).json({
        success: false,
        message: 'Error procesando el documento Word',
        error: processingError.message
      });
    }
    
  } catch (error) {
    console.error('❌ Error en test de documento Word:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno en el test',
      error: error.message
    });
  }
};

// Export default
export default {
  getQrCode,
  getContactById,
  saveIncomingMessage,
  getConversations,
  sendMessage,
  deleteConversation,
  setConversationPersonality,
  updateContactPreferences,
  getMessages,
  getUserMessagesCount,
  getAiMessagesCount,
  activateGlobalAIAll,
  activateGlobalPersonality,
  setDefaultPersonality,
  setConversationPersonalityBoolean,
  setGlobalProhibition,
  markConversationRead,
  diagnoseAudio,
  testWordDocument
}