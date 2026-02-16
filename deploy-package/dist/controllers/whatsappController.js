import pkg from '@whiskeysockets/baileys'
import { exec } from 'child_process'
import crypto from 'crypto'
import * as mammoth from 'mammoth'
import pdfParse from 'pdf-parse-debugging-disabled'
import qrcode from 'qrcode'
import { promisify } from 'util'
import pool, { supabaseAdmin } from '../config/db.js'
import { generateBotResponse } from '../services/openaiService.js'
import { emitToUser, getCachedQr, isSessionConnected, sessions, startSession } from '../services/whatsappService.js'
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
        media_content,
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
      
      // Usar media_content si está disponible (contenido extraído de OCR/transcripción), sino text_content
      const messageContent = msg.media_content || msg.text_content || '';
      
      // Agregar contexto temporal para mejor memoria
      const messageContext = {
        role: role,
        content: messageContent,
        sender_type: msg.sender_type,
        text_content: msg.text_content || msg.media_content || '',
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
      // Intentar obtener foto de perfil, si no existe o hay error, usar null
      avatar = await sock.profilePictureUrl(contactId, 'image').catch(() => null);
    }
  } catch (error) {
    // Si hay error, simplemente usar null para la foto
    avatar = null;
    console.warn(`Error obteniendo datos para contacto ${contactId}:`, error.message);
  }

  // Ya no se actualiza nada en la base de datos en esta función

  return { id: contactId, name, avatar };
}


/**
 * 4) OBTENER CONTACTOS DEL USUARIO
 */
export async function getContacts(userId) {
  try {
    console.log(`🔍 [getContacts] Iniciando para userId=${userId}`);
    
    // Verificar si hay una sesión activa de WhatsApp
    const { isSessionConnected } = await import('../services/whatsappService.js');
    const isConnected = isSessionConnected(userId);
    
    console.log(`🔍 [getContacts] isSessionConnected(${userId}) = ${isConnected}`);
    
    if (!isConnected) {
      console.log(`⚠️ [getContacts] No hay sesión activa de WhatsApp para userId=${userId}, retornando array vacío`);
      return [];
    }
    
    // Intentar obtener el wa_user_id de la sesión activa
    const sock = sessions.get(userId);
    console.log(`🔍 [getContacts] Socket obtenido: ${sock ? 'existe' : 'no existe'}, tiene user: ${sock?.user ? 'sí' : 'no'}`);
    
    let waUserId = null;
    
    if (sock && sock.user?.id) {
      waUserId = sock.user.id.split('@')[0].split(':')[0];
      console.log(`✅ [getContacts] Sesión activa encontrada, waUserId=${waUserId}`);
    } else {
      console.log(`⚠️ [getContacts] Sesión no válida aunque isSessionConnected retornó true - sock: ${!!sock}, user: ${!!sock?.user}`);
      return [];
    }

    // Obtener contactos desde la base de datos
    // Solo se ejecuta si hay sesión activa (ya verificado arriba)
    // Usar subconsulta con DISTINCT ON para evitar duplicados, luego ordenar por más recientes
    const query = `
      SELECT * FROM (
        SELECT DISTINCT ON (c.external_id)
          c.external_id,
          c.contact_name,
          c.contact_photo_url,
          c.started_at,
          c.unread_count,
          c.last_message_at,
          c.wa_user_id,
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
        ORDER BY 
          c.external_id,
          -- Priorizar contactos con wa_user_id coincidente
          (CASE 
            WHEN c.wa_user_id = $2 THEN 0 
            WHEN c.wa_user_id IS NULL THEN 1 
            ELSE 2 
          END),
          c.last_message_at DESC NULLS LAST
      ) AS unique_contacts
      ORDER BY 
        -- Ordenar por fecha más reciente primero
        COALESCE(last_message_at, started_at) DESC NULLS LAST
    `;
    const params = [userId, waUserId];
    
    const { rows: contacts } = await pool.query(query, params);
    console.log(`✅ [getContacts] Contactos encontrados en DB para userId=${userId}: ${contacts.length}`);
    if (contacts.length > 0) {
      console.log(`📋 [getContacts] Primeros contactos:`, contacts.slice(0, 3).map(c => ({
        external_id: c.external_id,
        contact_name: c.contact_name,
        wa_user_id: c.wa_user_id
      })));
    }

    // Si hay wa_user_id y contactos sin wa_user_id, actualizarlos
    if (waUserId) {
      const contactsToUpdate = contacts.filter(c => !c.wa_user_id);
      if (contactsToUpdate.length > 0) {
        console.log(`🔄 Actualizando ${contactsToUpdate.length} contactos sin wa_user_id...`);
        const updatePromises = contactsToUpdate.map(contact => 
          pool.query(
            `UPDATE conversations_new 
             SET wa_user_id = $1, updated_at = NOW()
             WHERE user_id = $2 AND external_id = $3 AND wa_user_id IS NULL`,
            [waUserId, userId, contact.external_id]
          )
        );
        await Promise.all(updatePromises);
        console.log(`✅ Contactos actualizados con wa_user_id`);
      }
    }

    // Enriquecer con información de WhatsApp si está disponible
    // Procesar contactos de forma más eficiente, sin bloquear la respuesta
    const enrichedContacts = contacts
      .filter(contact => contact.external_id) // Filtrar contactos sin external_id
      .map((contact) => {
        try {
          const externalId = contact.external_id || '';
          const phoneNumber = externalId.split('@')[0] || '';
          let contactName = contact.contact_name || phoneNumber;
          
          // Retornar contacto básico inmediatamente (sin procesamiento asíncrono pesado)
          // El enriquecimiento de nombres y fotos se puede hacer en segundo plano
          return {
            id: externalId,
            name: contactName,
            phone: phoneNumber,
            photo: contact.contact_photo_url || null, // Usar foto existente, no intentar obtener nueva
            lastMessage: contact.last_message,
            unreadCount: contact.unread_count || 0,
            lastMessageAt: contact.last_message_at,
            startedAt: contact.started_at
          };
        } catch (error) {
          console.error(`Error procesando contacto:`, error);
          const externalId = contact.external_id || '';
          const phoneNumber = externalId.split('@')[0] || '';
          return {
            id: externalId,
            name: contact.contact_name || phoneNumber,
            phone: phoneNumber,
            photo: null,
            lastMessage: contact.last_message,
            unreadCount: contact.unread_count || 0,
            lastMessageAt: contact.last_message_at,
            startedAt: contact.started_at
          };
        }
      });

    // Procesar actualizaciones de nombres en segundo plano (no bloquear respuesta)
    if (sock && sock.user) {
      // Procesar solo los primeros 50 contactos para no sobrecargar
      const contactsToEnrich = enrichedContacts.slice(0, 50).filter(c => {
        const nameIsNumber = /^\d+$/.test(c.name?.trim() || '');
        return nameIsNumber && c.id && !c.id.endsWith('@g.us');
      });
      
      if (contactsToEnrich.length > 0) {
        // Procesar en segundo plano sin esperar
        Promise.all(
          contactsToEnrich.map(async (contact) => {
            try {
              const contactData = await sock.store?.contacts?.get(contact.id);
              if (contactData && (contactData.notify || contactData.name)) {
                const realName = contactData.notify || contactData.name;
                if (realName && realName.trim() !== '' && !/^\d+$/.test(realName.trim())) {
                  // Actualizar en la base de datos en segundo plano
                  await pool.query(`
                    UPDATE conversations_new
                    SET contact_name = $1, updated_at = NOW()
                    WHERE external_id = $2 AND user_id = $3
                  `, [realName, contact.id, userId]).catch(() => {});
                }
              }
            } catch (error) {
              // Silenciar errores en segundo plano
            }
          })
        ).catch(() => {}); // No bloquear si hay errores
      }
    }

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
  console.log(`📱 [saveIncomingMessage] Iniciando para userId=${userId}, conversationId=${msg.key?.remoteJid}, msgId=${msg.key?.id}`);
  
  const sock = sessions.get(userId);
  const conversationId = msg.key.remoteJid;
  console.log(`📱 [saveIncomingMessage] Procesando mensaje del usuario: "${textContent}" (senderType: ${senderType})`);
  
  if (!sock) {
    console.log(`❌ [saveIncomingMessage] No se encontró sesión WA para el usuario ${userId}`);
    return { success: false, error: 'No session found' };
  }

  const waUserId = sock?.user?.id || '';
  const phoneNumber = waUserId.split('@')[0].split(':')[0];

  // Ajuste del timestamp para la zona horaria local
  const timestamp = new Date(msg.messageTimestamp * 1000);
  const timezoneOffset = new Date().getTimezoneOffset();
  const adjustedTimestamp = new Date(timestamp.getTime() - timezoneOffset * 60000);

  let conv = null;
  
  // Verificar si el chat ya existe - primero buscar con wa_user_id, luego sin él para evitar duplicados
  let { rows } = await pool.query(`
    SELECT id, wa_user_id, ai_active, personality_id, no_ac_ai, contact_name
    FROM conversations_new
    WHERE external_id = $1 
      AND user_id = $2 
      AND wa_user_id = $3
    LIMIT 1
  `, [conversationId, userId, phoneNumber]);

  // Si no se encuentra con wa_user_id, buscar sin él (para chats antiguos)
  if (rows.length === 0) {
    const { rows: rowsWithoutWa } = await pool.query(`
      SELECT id, wa_user_id, ai_active, personality_id, no_ac_ai, contact_name
      FROM conversations_new
      WHERE external_id = $1 
        AND user_id = $2 
        AND (wa_user_id IS NULL OR wa_user_id != $3)
      ORDER BY created_at DESC
      LIMIT 1
    `, [conversationId, userId, phoneNumber]);
    
    if (rowsWithoutWa.length > 0) {
      // Actualizar el wa_user_id del chat existente para evitar duplicados
      await pool.query(`
        UPDATE conversations_new
        SET wa_user_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [phoneNumber, rowsWithoutWa[0].id]);
      
      rows = rowsWithoutWa;
      console.log(`🔄 Chat existente actualizado con wa_user_id: ${phoneNumber}`);
    }
  }

  if (rows.length > 0) {
    conv = rows[0];
    console.log(`✅ Conversación existente encontrada con ID: ${conv.id}`);
  } else {
    // El chat no existe, crear uno nuevo
    let contactName, contactPhotoUrl;
    if (conversationId.endsWith('@g.us')) {
      const meta = await sock.groupMetadata(conversationId);
      contactName = meta.subject || 'Grupo sin nombre';
      contactPhotoUrl = meta.iconUrl || await sock.profilePictureUrl(conversationId, 'image').catch(() => null);
    } else {
      // Intentar obtener el nombre real del contacto desde WhatsApp
      try {
        // Método 1: Intentar obtener desde el store de contactos de Baileys
        const contactData = await sock.store?.contacts?.get(conversationId);
        if (contactData) {
          // Priorizar notify (nombre mostrado en WhatsApp), luego name
          contactName = contactData.notify || contactData.name || conversationId.split('@')[0];
          console.log(`✅ Nombre obtenido desde store: ${contactName} para ${conversationId}`);
        } else {
          // Método 2: Intentar usar contactAddOrGet si está disponible
          try {
            if (typeof sock.contactAddOrGet === 'function') {
              const contact = await sock.contactAddOrGet(conversationId);
              if (contact && (contact.pushname || contact.name)) {
                contactName = contact.pushname || contact.name;
                console.log(`✅ Nombre obtenido desde contactAddOrGet: ${contactName} para ${conversationId}`);
              } else {
                contactName = conversationId.split('@')[0];
              }
            } else {
              contactName = conversationId.split('@')[0];
            }
          } catch (contactError) {
            console.log(`⚠️ No se pudo obtener nombre con contactAddOrGet para ${conversationId}:`, contactError.message);
            contactName = conversationId.split('@')[0];
          }
        }
      } catch (error) {
        console.log(`⚠️ Error obteniendo nombre del contacto ${conversationId}, usando número:`, error.message);
        contactName = conversationId.split('@')[0];
      }
      
      // Obtener foto de perfil
      contactPhotoUrl = await sock.profilePictureUrl(conversationId, 'image').catch(() => null);
    }

    // Intentar insertar el chat, pero si ya existe (por race condition), obtener el existente
    try {
      const insertRes = await pool.query(`
        INSERT INTO conversations_new
        (external_id, contact_name, contact_photo_url, started_at, user_id, wa_user_id, ai_active)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, true)
        RETURNING id, ai_active, personality_id, no_ac_ai, contact_name
      `, [conversationId, contactName, contactPhotoUrl, userId, phoneNumber]);

      conv = insertRes.rows[0];
      console.log(`✅ Nueva conversación creada con ID: ${conv.id}`);
    } catch (insertError) {
      // Si falla por duplicado (race condition), obtener el chat existente
      if (insertError.code === '23505' || insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
        console.log(`⚠️ Chat duplicado detectado (race condition), obteniendo existente...`);
        const { rows: existingRows } = await pool.query(`
          SELECT id, wa_user_id, ai_active, personality_id, no_ac_ai
          FROM conversations_new
          WHERE external_id = $1 
            AND user_id = $2 
            AND wa_user_id = $3
          LIMIT 1
        `, [conversationId, userId, phoneNumber]);
        
        if (existingRows.length > 0) {
          conv = existingRows[0];
          console.log(`✅ Conversación existente obtenida después de race condition: ${conv.id}`);
        } else {
          throw insertError; // Si no se puede obtener, lanzar el error original
        }
      } else {
        throw insertError; // Si es otro error, lanzarlo
      }
    }
  }

  const convId = conv.id;
  
  // Verificar si el mensaje ya existe usando last_msg_id (ID único de WhatsApp)
  // Usar directamente la API de Supabase para esta verificación
  if (msg.key.id) {
    console.log(`🔍 [saveIncomingMessage] Verificando duplicado: conversation_id=${convId}, last_msg_id=${msg.key.id}`);
    
    try {
      const { data: existingMsgs, error } = await supabaseAdmin
        .from('messages_new')
        .select('id, text_content, created_at')
        .eq('conversation_id', convId)
        .eq('last_msg_id', msg.key.id)
        .limit(1);

      if (error) {
        console.log(`⚠️ [saveIncomingMessage] Error verificando duplicado: ${error.message}, continuando...`);
      } else if (existingMsgs && existingMsgs.length > 0) {
        console.log(`⚠️ [saveIncomingMessage] Mensaje duplicado detectado (last_msg_id: ${msg.key.id})`);
        console.log(`   - Mensaje existente ID: ${existingMsgs[0].id}`);
        console.log(`   - Texto existente: "${existingMsgs[0].text_content || ''}"`);
        console.log(`   - Creado en: ${existingMsgs[0].created_at || ''}`);
        console.log(`   - Nuevo texto: "${textContent}"`);
        return { success: true, aiReply: null, duplicate: true };
      } else {
        console.log(`✅ [saveIncomingMessage] Mensaje NO es duplicado, procediendo a guardar`);
      }
    } catch (error) {
      console.log(`⚠️ [saveIncomingMessage] Error en verificación de duplicado: ${error.message}, continuando...`);
    }
  }

  console.log('✅ Verificación de duplicados completada - Procesando mensaje nuevo');

  // Detectar si hay medios ANTES de guardar el mensaje
  const hasAudio = msg.message?.audioMessage;
  const hasImage = msg.message?.imageMessage;
  const hasDocument = msg.message?.documentMessage;
  const hasSticker = msg.message?.stickerMessage;
  const hasMedia = hasAudio || hasImage || hasDocument || hasSticker;
  
  // Guardar mensaje principal del usuario usando Supabase API
  let userMessageId = null;
  try {
    console.log(`💾 Insertando mensaje principal: conversation_id=${convId}, sender_type=${senderType}, text_content="${textContent}", hasMedia=${hasMedia}, hasSticker=${hasSticker}, last_msg_id=${msg.key.id}`);
    
    // Determinar el tipo de mensaje: 'sticker' si es sticker, 'media' si hay otros medios, 'text' si no
    const messageType = hasSticker ? 'sticker' : (hasMedia ? 'media' : 'text');
    
    const { data: insertedMessage, error } = await supabaseAdmin
      .from('messages_new')
      .insert({
        conversation_id: convId,
        sender_type: senderType,
        message_type: messageType, // 'media' si hay imágenes/audio/documentos, 'text' si no
        text_content: textContent || null, // Solo texto del usuario, sin OCR (no se mostrará en frontend si hay media)
        created_at: new Date().toISOString(),
        user_id: userId,
        whatsapp_created_at: timestamp,
        last_msg_id: msg.key.id
      })
      .select('id')
      .single();

    if (error) {
      // Si el error es por duplicado (race condition), verificar y continuar
      if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('unique')) {
        console.log(`⚠️ Mensaje duplicado detectado durante inserción (race condition), verificando...`);
        
        // Verificar si el mensaje ya existe usando Supabase API
        const { data: duplicateCheck, error: checkError } = await supabaseAdmin
          .from('messages_new')
          .select('id')
          .eq('conversation_id', convId)
          .eq('last_msg_id', msg.key.id)
          .limit(1);
        
        if (checkError) {
          console.error(`❌ Error verificando duplicado: ${checkError.message}`);
          return { success: true, aiReply: null, duplicate: true };
        }
        
        if (duplicateCheck && duplicateCheck.length > 0) {
          console.log(`✅ Mensaje duplicado confirmado, usando mensaje existente: ${duplicateCheck[0].id}`);
          userMessageId = duplicateCheck[0].id;
        } else {
          console.error(`❌ Error de duplicado pero mensaje no encontrado: ${error.message}`);
          return { success: true, aiReply: null, duplicate: true };
        }
      } else {
        console.error(`❌ Error insertando mensaje principal: ${error.message}`);
        return;
      }
    } else {
      userMessageId = insertedMessage.id;
      console.log(`💾 Mensaje principal guardado con ID: ${userMessageId}`);
      
      // ✅ Actualizar last_message_at para que la conversación aparezca primero en la lista
      const { error: updateConvError } = await supabaseAdmin
        .from('conversations_new')
        .update({ 
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', convId);
      
      if (updateConvError) {
        console.error(`⚠️ Error actualizando last_message_at: ${updateConvError.message}`);
      } else {
        console.log(`✅ Conversación ${convId} actualizada: last_message_at = NOW()`);
      }
    }
  } catch (error) {
    // Manejar errores de duplicado en caso de race condition
    if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('unique')) {
      console.log(`⚠️ Mensaje duplicado detectado (catch), verificando...`);
      
      // Verificar si el mensaje ya existe usando Supabase API
      const { data: duplicateCheck, error: checkError } = await supabaseAdmin
        .from('messages_new')
        .select('id')
        .eq('conversation_id', convId)
        .eq('last_msg_id', msg.key.id)
        .limit(1);
      
      if (checkError) {
        console.error(`❌ Error verificando duplicado: ${checkError.message}`);
        return { success: true, aiReply: null, duplicate: true };
      }
      
      if (duplicateCheck && duplicateCheck.length > 0) {
        console.log(`✅ Mensaje duplicado confirmado, usando mensaje existente: ${duplicateCheck[0].id}`);
        userMessageId = duplicateCheck[0].id;
      } else {
        console.error(`❌ Error de duplicado pero mensaje no encontrado: ${error.message}`);
        return { success: true, aiReply: null, duplicate: true };
      }
    } else {
      console.error('❌ Error general insertando mensaje principal:', error);
      return;
    }
  }

  // Procesar y guardar contenido de media extraído
  const extractedTexts = [];
  let imageUrlFromProcess = null; // URL de imagen obtenida del procesamiento
  
  // Si no se pasaron medios explícitamente, detectar y procesar medios del mensaje
  if (!media || media.length === 0) {
    console.log('🔍 Detectando medios en el mensaje...');
    
    // hasAudio, hasImage, hasDocument, hasSticker ya están definidos arriba
    if (hasAudio || hasImage || hasDocument || hasSticker) {
      console.log(`📎 Medios detectados - Audio: ${!!hasAudio}, Imagen: ${!!hasImage}, Documento: ${!!hasDocument}, Sticker: ${!!hasSticker}`);
      
      // Procesar medios automáticamente (pasar userMessageId para guardar URLs de imágenes)
      const processedMedia = await processMedia(msg, userId, conversationId, convId, null, timestamp, userMessageId);
      
      // Agregar el contenido extraído al array y guardar URL de imagen si está disponible
      if (processedMedia && processedMedia.length > 0) {
        for (const mediaItem of processedMedia) {
          if (mediaItem.extractedText && mediaItem.extractedText.length > 10) {
            console.log(`📝 Contenido extraído de ${mediaItem.type}:`, mediaItem.extractedText.substring(0, 100) + '...');
            extractedTexts.push(mediaItem.extractedText);
          }
          // Guardar URL de imagen si está disponible
          if (mediaItem.type === 'image' && mediaItem.url) {
            imageUrlFromProcess = mediaItem.url;
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

  // Guardar el texto extraído en media_content para uso interno de la IA
  // PERO NO actualizar text_content del mensaje (para que no se muestre en el frontend)
  if (extractedTexts.length > 0 && userMessageId) {
    // Limpiar el contenido extraído (remover marcadores de final)
    let cleanedExtractedText = extractedTexts[0];
    if (cleanedExtractedText.includes('Final del audio')) {
      cleanedExtractedText = cleanedExtractedText
        .replace(/\nFinal del audio.*$/s, '')
        .replace(/^.*?(?=\w)/s, '')
        .trim();
    } else if (cleanedExtractedText.includes('Final de la imagen')) {
      cleanedExtractedText = cleanedExtractedText
        .replace(/\nFinal de la imagen.*$/s, '')
        .replace(/\nQuiero que seas conciso.*$/s, '')
        .trim();
    } else if (cleanedExtractedText.includes('Final del PDF')) {
      cleanedExtractedText = cleanedExtractedText
        .replace(/\nFinal del PDF.*$/s, '')
        .replace(/\nQuiero que seas conciso.*$/s, '')
        .trim();
    } else if (cleanedExtractedText.includes('Final del documento Word')) {
      cleanedExtractedText = cleanedExtractedText
        .replace(/\nFinal del documento Word.*$/s, '')
        .replace(/\nQuiero que seas conciso.*$/s, '')
        .trim();
    } else if (cleanedExtractedText.includes('Final del sticker')) {
      // Para stickers, mantener el contenido extraído pero limpiar los marcadores
      cleanedExtractedText = cleanedExtractedText
        .replace(/\nFinal del sticker.*$/s, '')
        .replace(/\nQuiero que analices este sticker.*$/s, '')
        .trim();
    }
    
    // Guardar el texto extraído en media_content (solo para uso interno de la IA)
    // NO actualizar text_content para que el frontend solo muestre la imagen
    const { error: updateError } = await supabaseAdmin
      .from('messages_new')
      .update({ 
        media_content: cleanedExtractedText, // Texto extraído solo para IA
        // text_content se mantiene como está (solo texto del usuario, sin OCR)
      })
      .eq('id', userMessageId);
    
    if (updateError) {
      console.error(`❌ Error guardando texto extraído en media_content: ${updateError.message}`);
    } else {
      console.log(`✅ Texto extraído guardado en media_content (solo para IA, no visible en frontend)`);
    }
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
  
  // Determinar si hay media para el evento
  const hasMediaForEvent = hasAudio || hasImage || hasDocument || hasSticker;
  
  // Para mensajes con media, NO incluir texto extraído del OCR en el evento
  // Solo incluir texto del usuario (si lo hay), sin el texto extraído
  let messageBody = textContent || null;
  if (hasMediaForEvent && messageBody) {
    // Si el texto contiene marcadores de OCR, no incluirlo
    if (messageBody.includes('[Contenido de imagen') ||
        messageBody.includes('[Audio transcrito') ||
        messageBody.includes('[Contenido de PDF') ||
        messageBody.includes('[Contenido de documento Word') ||
        messageBody.includes('Final de la imagen') ||
        messageBody.includes('Final del audio') ||
        messageBody.includes('Final del PDF') ||
        messageBody.includes('Final del documento Word') ||
        messageBody.includes('Quiero que seas conciso')) {
      messageBody = null; // No enviar texto del OCR al frontend
    }
  }
  
  // Obtener URL de la imagen si existe (para mensajes con media)
  // Primero intentar usar la URL del procesamiento, luego consultar la BD
  let mediaUrl = imageUrlFromProcess || null;
  let mediaFilename = null;
  let mediaSize = null;
  if (hasMediaForEvent && userMessageId) {
    // Si no tenemos URL del procesamiento, consultar la BD
    if (!mediaUrl) {
      try {
        const { data: msgData } = await supabaseAdmin
          .from('messages_new')
          .select('media_url, media_filename, media_size')
          .eq('id', userMessageId)
          .single();
        
        if (msgData) {
          mediaUrl = msgData.media_url;
          mediaFilename = msgData.media_filename;
          mediaSize = msgData.media_size;
        }
      } catch (error) {
        console.log(`⚠️ Error obteniendo URL de media para evento: ${error.message}`);
      }
    } else {
      // Si tenemos URL del procesamiento, obtener el filename y size de la BD
      try {
        const { data: msgData } = await supabaseAdmin
          .from('messages_new')
          .select('media_filename, media_size')
          .eq('id', userMessageId)
          .single();
        
        if (msgData) {
          mediaFilename = msgData.media_filename;
          mediaSize = msgData.media_size;
        }
      } catch (error) {
        // No crítico, continuar sin filename/size
      }
    }
  }
  
  // Preparar array de media para el evento
  let mediaArray = [];
  if (hasMediaForEvent) {
    if (hasImage) {
      mediaArray = [{
        type: 'image',
        url: mediaUrl || null,
        filename: mediaFilename || null,
        mimeType: 'image/jpeg',
        shouldShowBorder: false, // ✅ Flag para indicar que no debe mostrar bordes
        hideContainer: true // ✅ Flag para indicar que el contenedor debe ser invisible/transparente
      }];
    } else if (hasSticker) {
      // Determinar MIME type del sticker basado en el filename
      let stickerMimeType = 'image/webp'; // Por defecto WebP
      if (mediaFilename) {
        const filenameLower = mediaFilename.toLowerCase();
        if (filenameLower.endsWith('.png')) {
          stickerMimeType = 'image/png';
        } else if (filenameLower.endsWith('.webp')) {
          stickerMimeType = 'image/webp';
        }
      }
      
      mediaArray = [{
        type: 'sticker', // ✅ Tipo específico para stickers
        url: mediaUrl || null,
        filename: mediaFilename || null,
        mimeType: stickerMimeType,
        hasTransparentBackground: true // ✅ Indicar que tiene fondo transparente
      }];
    } else if (hasAudio) {
      mediaArray = [{
        type: 'audio',
        url: mediaUrl || null,
        filename: mediaFilename || null,
        mimeType: 'audio/ogg',
        size: mediaSize || null, // ✅ Tamaño del archivo en bytes
        simplePlayer: true // ✅ Flag para indicar que debe usar reproductor simple (sin animaciones complejas)
      }];
    } else if (hasDocument) {
      mediaArray = [{
        type: 'document',
        url: mediaUrl || null,
        filename: mediaFilename || null,
        mimeType: 'application/pdf'
      }];
    }
  }
  
  emitToUser(userId, 'new-message', {
    conversationId: convId,
    externalId: conversationId, // JID de WhatsApp
    from: senderType,
    sender_type: senderType,
    message: messageBody, // Solo texto del usuario, SIN texto extraído del OCR
    body: messageBody,
    text_content: messageBody, // NO incluir texto extraído del OCR
    timestamp: Date.now(),
    created_at: new Date().toISOString(),
    whatsapp_created_at: timestamp instanceof Date ? timestamp.toISOString() : (timestamp || new Date().toISOString()),
    isAI: senderType === 'ia',
    isSticker: hasSticker || false, // Indicar si es sticker
    hasTransparentBackground: hasSticker || false, // ✅ Indicar fondo transparente para stickers
    media: mediaArray, // Incluir URL del media si está disponible
    message_type: hasSticker ? 'sticker' : (hasMediaForEvent ? 'media' : 'text'), // ✅ Tipo específico para stickers
    // NO incluir media_content (texto extraído del OCR) en el evento
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

  let ai_global_active = true; // ✅ ACTIVADO POR DEFECTO
  let default_personality_id = 1; // ✅ Personalidad por defecto

  if (settingsError) {
    if (settingsError.code !== 'PGRST116') {
      console.error('Error al obtener configuración del usuario:', settingsError);
      // No lanzar error, usar valores por defecto
      console.log('🔧 Error obteniendo configuración, usando valores por defecto (IA activa)');
    } else {
    // Si no hay configuración, usar valores por defecto
      console.log('🔧 No hay configuración de usuario, usando valores por defecto (IA activa)');
    }
  } else {
    ai_global_active = settingsData.ai_global_active !== false; // Si es null/undefined, usar true
    default_personality_id = settingsData.default_personality_id || 1;
  }

  // ✅ SIEMPRE intentar responder si hay una personalidad disponible
  // Solo no responder si explícitamente está desactivado en ambos lugares
  if (!ai_active && !ai_global_active) {
    console.log('🚫 IA explícitamente desactivada en conversación y globalmente, no se generará respuesta.');
    return { success: true, aiReply: null };
  }

  // Obtener personalidad
  let personalityData = null;
  if (ai_active && personality_id) {
    const { data: personalityFromAI, error: personalityError } = await supabaseAdmin
      .from('personalities')
      .select('*')
      .eq('id', personality_id)
      .single();

    if (personalityError) {
      if (personalityError.code !== 'PGRST116') {
        console.error('Error al obtener personalidad específica:', personalityError);
        // Continuar para intentar con la personalidad global
      } else {
        // No hay personalidad específica, usar la global
      }
    } else {
      personalityData = personalityFromAI;
    }
  }
  
  // Si no hay personalidad específica o no está activa la IA en la conversación, usar la global
  if (!personalityData && default_personality_id) {
    const { data: personalityFromGlobal, error: personalityError } = await supabaseAdmin
      .from('personalities')
      .select('*')
      .eq('id', default_personality_id)
      .single();

    if (personalityError) {
      if (personalityError.code !== 'PGRST116') {
        console.error('Error al obtener personalidad global:', personalityError);
      }
    } else {
      personalityData = personalityFromGlobal;
    }
  }

  // ✅ Si aún no hay personalidad, intentar obtener la personalidad ID 1 como último recurso
  if (!personalityData) {
    console.log('⚠️ No se encontró personalidad configurada, intentando con ID 1...');
    const { data: fallbackPersonality, error: fallbackError } = await supabaseAdmin
      .from('personalities')
      .select('*')
      .eq('id', 1)
      .single();
    
    if (!fallbackError && fallbackPersonality) {
      personalityData = fallbackPersonality;
      console.log('✅ Usando personalidad de respaldo (ID 1)');
    } else {
      console.log('❌ No se encontró ninguna personalidad disponible para la IA.');
    return { success: true, aiReply: null };
    }
  }

  console.log(`🤖 Usando personalidad: ${personalityData.nombre} (ID: ${personalityData.id})`);

  // Obtener historial completo (incluyendo mensajes del sistema con contenido extraído)
  // Aumentar límite a 50 para mejor contexto de conversación
  const history = await getConversationHistory(convId, userId, 50);
  console.log(`📚 Historial obtenido: ${history.length} mensajes`);

  // Determinar mensaje final para IA
  let finalMessage = textContent;
  const hasExtractedContent = extractedTexts.length > 0;

  // Si hay contenido extraído, obtener el texto extraído desde media_content (no text_content)
  if (hasExtractedContent) {
    // Obtener el mensaje con media_content (texto extraído del OCR, solo para IA)
    const { data: updatedMsg, error: msgError } = await supabaseAdmin
      .from('messages_new')
      .select('text_content, media_content')
      .eq('id', userMessageId)
      .single();
    
    if (!msgError && updatedMsg) {
      // Usar media_content (texto extraído) si existe, sino text_content (texto del usuario)
      const extractedText = updatedMsg.media_content || '';
      const userText = updatedMsg.text_content || '';
      
      // Combinar: texto del usuario + texto extraído del OCR (solo para IA)
      if (extractedText && extractedText.trim().length > 0) {
        if (userText && userText.trim().length > 0) {
          finalMessage = `${userText}\n\n${extractedText}`;
        } else {
          finalMessage = extractedText;
        }
        console.log(`📋 Usando texto extraído (media_content) para IA: ${extractedText.substring(0, 100)}...`);
      } else {
        finalMessage = userText;
        console.log(`📋 Usando solo texto del usuario para IA: ${userText.substring(0, 100)}...`);
      }
    }
  }

  // Generar respuesta usando el mismo sistema que personalidades
  try {
    console.log('🧠 Generando respuesta de IA...');
    
    // Convertir historial al formato que espera OpenAI
    // El historial ya viene procesado desde getConversationHistory con content que incluye media_content o text_content
    const historyForAI = history.map(h => ({
      role: h.role || (h.sender_type === 'user' ? 'user' : 
            h.sender_type === 'system' ? 'system' : 'assistant'),
      content: h.content || h.text_content || h.media_content || ''
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

    // Procesar respuesta - puede ser string o objeto con archivos
    let botText = '';
    let filesToSend = [];
    
    if (typeof botReply === 'object' && botReply.hasFiles) {
      botText = botReply.text;
      filesToSend = botReply.files || [];
      console.log(`📎 Respuesta incluye ${filesToSend.length} archivos para enviar`);
    } else {
      botText = botReply;
    }

    if (botText && botText.trim().length > 0) {
      // Detectar si la respuesta incluye enlaces
      const urlRegex = /https?:\/\/[^\s]+/g;
      const linksInReply = botText.match(urlRegex);
      if (linksInReply && linksInReply.length > 0) {
        console.log(`🔗 Respuesta incluye ${linksInReply.length} enlace(s):`, linksInReply);
      }
      
      console.log(`✅ Respuesta generada: ${botText.substring(0, 100)}...`);
      
      // Procesar agendamiento automático si la IA confirma uno
      try {
        const { processAppointmentConfirmation } = await import('../services/appointmentProcessor.js');
        // Obtener el nombre del contacto desde la conversación
        const contactName = conv?.contact_name || null;
        const appointmentResult = await processAppointmentConfirmation(
          botText,
          userId,
          conversationId.split('@')[0], // Extraer teléfono del JID
          contactName, // Usar el nombre del contacto de WhatsApp
          historyForAI // Usar el historial formateado para la IA
        );
        
        if (appointmentResult && appointmentResult.success) {
          console.log(`✅ Agendamiento automático ejecutado: ${appointmentResult.appointment.appointmentId}`);
          
          // Enviar mensaje de confirmación detallado por WhatsApp
          try {
            const appointment = appointmentResult.appointment || {};
            const appointmentDate = appointment.start ? new Date(appointment.start) : null;
            
            // Construir mensaje de confirmación detallado
            let confirmationMsg = `\n\n✅ *CITA CONFIRMADA*\n\n`;
            
            if (appointmentDate) {
              const dateStr = appointmentDate.toLocaleDateString('es-ES', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              });
              const timeStr = appointmentDate.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
              });
              
              confirmationMsg += `📅 *Fecha:* ${dateStr}\n`;
              confirmationMsg += `⏰ *Hora:* ${timeStr}\n`;
            }
            
            if (appointmentResult.clientName) {
              confirmationMsg += `👤 *Cliente:* ${appointmentResult.clientName}\n`;
            }
            
            if (appointment.location) {
              confirmationMsg += `📍 *Ubicación:* ${appointment.location}\n`;
            }
            
            if (appointment.description && appointment.description.trim().length > 0) {
              // Limpiar descripción si contiene información técnica
              let cleanDescription = appointment.description;
              if (cleanDescription.includes('Teléfono:')) {
                cleanDescription = cleanDescription.split('Teléfono:')[0].trim();
              }
              if (cleanDescription.includes('Notas:')) {
                cleanDescription = cleanDescription.split('Notas:')[0].trim();
              }
              if (cleanDescription.length > 0) {
                confirmationMsg += `\n📝 *Detalles:*\n${cleanDescription}\n`;
              }
            }
            
            if (appointment.notes && appointment.notes.trim().length > 0 && 
                !appointment.notes.includes('Agendado automáticamente')) {
              confirmationMsg += `\n📌 *Notas:*\n${appointment.notes}\n`;
            }
            
            confirmationMsg += `\n✅ Tu cita ha sido guardada en el calendario y recibirás un recordatorio.`;
            
            // Enviar mensaje de confirmación
            await sock.sendMessage(conversationId, { text: confirmationMsg });
            console.log(`✅ Mensaje de confirmación enviado a ${conversationId}`);
          } catch (confirmError) {
            console.warn('⚠️ Error enviando confirmación adicional:', confirmError.message);
            console.warn('   Stack:', confirmError.stack);
          }
        }
      } catch (appointmentError) {
        console.warn('⚠️ Error procesando agendamiento automático:', appointmentError.message);
        // No fallar la respuesta principal si el agendamiento falla
      }
      
      try {
        // Verificar que la sesión sigue activa antes de enviar
        if (!sock || !sock.user) {
          console.log('⚠️ Sesión de WhatsApp no activa, no se puede enviar respuesta');
          return { success: true, aiReply: null };
        }

        // Enviar respuesta a WhatsApp con timeout
        const sendPromise = sock.sendMessage(conversationId, { text: botText });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout sending message')), 30000)
        );
        
        const msgInfo = await Promise.race([sendPromise, timeoutPromise]);

        // Guardar mensaje de IA en BD usando Supabase API para consistencia
        let insertedAIMessage = null;
        
        // Verificar que msgInfo y msgInfo.key existan
        if (!msgInfo) {
          console.error(`❌ [saveIncomingMessage] msgInfo no está disponible después de enviar mensaje`);
        } else if (!msgInfo.key) {
          console.error(`❌ [saveIncomingMessage] msgInfo.key no está disponible después de enviar mensaje`);
          console.error(`   - msgInfo completo: ${JSON.stringify(msgInfo)}`);
        } else if (!msgInfo.key.id) {
          console.error(`❌ [saveIncomingMessage] msgInfo.key.id no está disponible después de enviar mensaje`);
          console.error(`   - msgInfo.key: ${JSON.stringify(msgInfo.key)}`);
        }
        
        if (msgInfo?.key?.id) {
          console.log(`💾 [saveIncomingMessage] Guardando mensaje de IA: conversation_id=${convId}, sender_type=ia, text_content="${botText.substring(0, 50)}...", last_msg_id=${msgInfo.key.id}`);
          
          try {
            const { data: aiMessageData, error: aiInsertError } = await supabaseAdmin
              .from('messages_new')
              .insert({
                conversation_id: convId,
                sender_type: 'ia',
                message_type: 'text',
                text_content: botText,
                created_at: new Date().toISOString(),
                user_id: userId,
                whatsapp_created_at: (timestamp instanceof Date ? timestamp.toISOString() : (typeof timestamp === 'string' ? timestamp : new Date().toISOString())),
                last_msg_id: msgInfo.key.id,
                tenant: 'whatsapp'
              })
              .select('id')
              .single();

            if (aiInsertError) {
              console.error(`❌ [saveIncomingMessage] Error guardando mensaje de IA: ${aiInsertError.message}`);
              console.error(`   - Código de error: ${aiInsertError.code}`);
              console.error(`   - Detalles: ${JSON.stringify(aiInsertError)}`);
              
              // Si es un error de duplicado, verificar si ya existe
              if (aiInsertError.code === '23505' || aiInsertError.message.includes('duplicate') || aiInsertError.message.includes('unique')) {
                console.log(`⚠️ Mensaje de IA duplicado detectado, verificando...`);
                const { data: existingAIMsg } = await supabaseAdmin
                  .from('messages_new')
                  .select('id')
                  .eq('conversation_id', convId)
                  .eq('last_msg_id', msgInfo.key.id)
                  .eq('sender_type', 'ia')
                  .limit(1);
                
                if (existingAIMsg && existingAIMsg.length > 0) {
                  console.log(`✅ Mensaje de IA ya existe en BD (ID: ${existingAIMsg[0].id})`);
                  insertedAIMessage = existingAIMsg[0];
                } else {
                  console.error(`❌ Error inesperado al verificar duplicado de mensaje de IA`);
                }
              }
            } else {
              insertedAIMessage = aiMessageData;
              console.log(`✅ [saveIncomingMessage] Mensaje de IA guardado correctamente con ID: ${insertedAIMessage?.id}`);
            }
          } catch (insertError) {
            console.error(`❌ [saveIncomingMessage] Excepción al guardar mensaje de IA:`, insertError);
            console.error(`   - Stack: ${insertError.stack}`);
          }
        } else {
          console.error(`❌ [saveIncomingMessage] No se pudo guardar mensaje de IA: msgInfo.key.id no está disponible`);
          console.error(`   - msgInfo disponible: ${!!msgInfo}`);
          console.error(`   - msgInfo.key disponible: ${!!msgInfo?.key}`);
          console.error(`   - msgInfo.key.id disponible: ${!!msgInfo?.key?.id}`);
        }

        // Emitir eventos
        emitToUser(userId, 'chats-updated');
        emitToUser(userId, 'new-message', {
          id: insertedAIMessage?.id || null, // ID del mensaje insertado en BD
          conversationId: convId,
          externalId: conversationId, // JID de WhatsApp
          from: 'IA',
          sender_type: 'ia', // CRÍTICO: Indica que es un mensaje enviado por IA
          message: botText,
          body: botText,
          text_content: botText,
          timestamp: Date.now(),
          created_at: new Date().toISOString(),
          whatsapp_created_at: timestamp || new Date().toISOString(),
          isAI: true,
          isSticker: false,
          media: [],
          message_type: 'text',
          last_msg_id: msgInfo?.key?.id || null
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
        
        // Enviar archivos adjuntos si existen
        if (filesToSend.length > 0) {
          console.log(`📎 Enviando ${filesToSend.length} archivos adjuntos...`);
          for (const file of filesToSend) {
            try {
              if (file.url) {
                // Descargar el archivo y enviarlo
                const response = await fetch(file.url);
                if (response.ok) {
                  const buffer = await response.buffer();
                  const mimeType = file.type === 'PDF' ? 'application/pdf' : 
                                   file.type === 'Imagen' ? 'image/jpeg' : 
                                   file.type === 'Video' ? 'video/mp4' : 'application/octet-stream';
                  
                  if (file.type === 'Imagen') {
                    await sock.sendMessage(conversationId, { 
                      image: buffer, 
                      caption: file.filename 
                    });
                  } else {
                    await sock.sendMessage(conversationId, { 
                      document: buffer, 
                      mimetype: mimeType, 
                      fileName: file.filename 
                    });
                  }
                  console.log(`✅ Archivo enviado: ${file.filename}`);
                } else {
                  console.error(`❌ Error descargando archivo ${file.filename}: ${response.status}`);
                }
              }
            } catch (fileError) {
              console.error(`❌ Error enviando archivo ${file.filename}:`, fileError.message);
            }
          }
        }
        
        // 🎯 AUTO-CREACIÓN DE LEAD (después de procesar IA)
        await autoCreateLead(userId, conversationId, textContent, conv);
        
        return { success: true, aiReply: botText, files: filesToSend };
        
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
async function processMedia(msg, userId, conversationId, convId, personalityData, timestamp, userMessageId = null) {
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
    { field: 'documentMessage', type: 'document', downloadType: 'document' },
    { field: 'stickerMessage', type: 'sticker', downloadType: 'sticker' }
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
            // 1. Subir audio a Supabase Storage
            console.log('☁️ Subiendo audio a Supabase Storage...');
            let audioUrl = null;
            const audioFilename = mediaContent.fileName || `audio-${Date.now()}.ogg`;
            
            try {
              const { uploadToSupabaseStorage } = await import('../utils/fileUtils.js');
              const uploadResult = await uploadToSupabaseStorage(
                buffer,
                audioFilename,
                mediaContent.mimetype || 'audio/ogg',
                userId,
                'whatsapp' // Especificar bucket 'whatsapp' para audio de WhatsApp
              );
              audioUrl = uploadResult.publicUrl;
              console.log(`✅ Audio subido a Supabase Storage (bucket: whatsapp): ${audioUrl}`);
            } catch (uploadError) {
              console.error('❌ Error subiendo audio a Supabase Storage:', uploadError);
              // Continuar sin URL, pero registrar el error
            }
            
            // 2. Transcribir audio con OpenAI Whisper
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
            
            // 3. Guardar URL del audio en el mensaje
            if (audioUrl && userMessageId) {
              const { error: mediaUpdateError } = await supabaseAdmin
                .from('messages_new')
                .update({
                  media_url: audioUrl,
                  media_type: 'audio',
                  media_filename: audioFilename,
                  media_size: buffer.length
                })
                .eq('id', userMessageId);
              
              if (mediaUpdateError) {
                console.error(`❌ Error guardando URL de audio en mensaje: ${mediaUpdateError.message}`);
              } else {
                console.log(`✅ URL de audio guardada en mensaje: ${audioUrl}`);
              }
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
            // 1. Subir imagen a Supabase Storage
            console.log('☁️ Subiendo imagen a Supabase Storage...');
            let imageUrl = null;
            const imageFilename = mediaContent.fileName || `image-${Date.now()}.jpg`;
            
            try {
              // Subir imagen al bucket 'whatsapp' específicamente
              const { uploadToSupabaseStorage } = await import('../utils/fileUtils.js');
              const uploadResult = await uploadToSupabaseStorage(
                buffer,
                imageFilename,
                mediaContent.mimetype || 'image/jpeg',
                userId,
                'whatsapp' // Especificar bucket 'whatsapp' para imágenes de WhatsApp
              );
              imageUrl = uploadResult.publicUrl;
              console.log(`✅ Imagen subida a Supabase Storage (bucket: whatsapp): ${imageUrl}`);
            } catch (uploadError) {
              console.error('❌ Error subiendo imagen a Supabase Storage:', uploadError);
              // Continuar sin URL, pero registrar el error
            }
            
            // 2. Analizar imagen con Google Vision para extraer texto
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
            
            // 3. Guardar URL de la imagen en el mensaje
            if (imageUrl && userMessageId) {
              const { error: mediaUpdateError } = await supabaseAdmin
                .from('messages_new')
                .update({
                  media_url: imageUrl,
                  media_type: 'image',
                  media_filename: imageFilename,
                  media_size: buffer.length
                })
                .eq('id', userMessageId);
              
              if (mediaUpdateError) {
                console.error(`❌ Error guardando URL de imagen en mensaje: ${mediaUpdateError.message}`);
              } else {
                console.log(`✅ URL de imagen guardada en mensaje: ${imageUrl}`);
              }
            }
          } catch (error) {
            console.error('❌ Error procesando imagen:', error);
            extractedText = `Imagen procesada pero no se pudo extraer texto: ${error.message}`;
          }
          break;

        case 'document':
          // 1. Subir documento a Supabase Storage
          console.log('☁️ Subiendo documento a Supabase Storage...');
          let documentUrl = null;
          const documentFilename = mediaContent.fileName || `document-${Date.now()}.pdf`;
          
          try {
            const { uploadToSupabaseStorage } = await import('../utils/fileUtils.js');
            const uploadResult = await uploadToSupabaseStorage(
              buffer,
              documentFilename,
              mediaContent.mimetype || 'application/pdf',
              userId,
              'whatsapp' // Especificar bucket 'whatsapp' para documentos de WhatsApp
            );
            documentUrl = uploadResult.publicUrl;
            console.log(`✅ Documento subido a Supabase Storage (bucket: whatsapp): ${documentUrl}`);
          } catch (uploadError) {
            console.error('❌ Error subiendo documento a Supabase Storage:', uploadError);
            // Continuar sin URL, pero registrar el error
          }
          
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
          
          // 2. Guardar URL del documento en el mensaje
          if (documentUrl && userMessageId) {
            const { error: mediaUpdateError } = await supabaseAdmin
              .from('messages_new')
              .update({
                media_url: documentUrl,
                media_type: 'document',
                media_filename: documentFilename,
                media_size: buffer.length
              })
              .eq('id', userMessageId);
            
            if (mediaUpdateError) {
              console.error(`❌ Error guardando URL de documento en mensaje: ${mediaUpdateError.message}`);
            } else {
              console.log(`✅ URL de documento guardada en mensaje: ${documentUrl}`);
            }
          }
          break;

        case 'sticker':
          try {
            // 1. Subir sticker a Supabase Storage (preservando formato original con alpha)
            console.log('☁️ Subiendo sticker a Supabase Storage (preservando transparencia y canal alpha)...');
            console.log(`📊 Buffer size: ${buffer.length} bytes`);
            console.log(`📋 MIME type original de WhatsApp: ${mediaContent.mimetype || 'no especificado'}`);
            
            let stickerUrl = null;
            
            // ✅ Detectar formato real del buffer (WebP o PNG con alpha)
            // Verificar los primeros bytes del buffer para determinar el formato real
            let detectedMimeType = 'image/webp'; // Por defecto WebP (formato más común en WhatsApp)
            let fileExtension = 'webp';
            
            // Verificar magic bytes del buffer para detectar formato real
            if (buffer.length >= 8) {
              // PNG: 89 50 4E 47 0D 0A 1A 0A
              if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                detectedMimeType = 'image/png';
                fileExtension = 'png';
                console.log(`🔍 Formato detectado: PNG (con canal alpha)`);
              }
              // WebP: RIFF....WEBP
              else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
                       buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
                detectedMimeType = 'image/webp';
                fileExtension = 'webp';
                console.log(`🔍 Formato detectado: WebP (con canal alpha)`);
              }
            }
            
            // Usar el MIME type detectado del buffer, o el de WhatsApp si está disponible
            const finalMimeType = mediaContent.mimetype || detectedMimeType;
            const finalExtension = mediaContent.fileName?.toLowerCase().endsWith('.png') ? 'png' : 
                                   (mediaContent.fileName?.toLowerCase().endsWith('.webp') ? 'webp' : fileExtension);
            
            const stickerFilename = mediaContent.fileName || `sticker-${Date.now()}.${finalExtension}`;
            
            console.log(`📁 Filename: ${stickerFilename}`);
            console.log(`🎨 MIME type final: ${finalMimeType} (con canal alpha preservado)`);
            
            // ✅ Procesar sticker para eliminar halo blanco/contorno blanco usando .trim()
            let processedBuffer = buffer;
            try {
              console.log(`🧹 Procesando sticker para eliminar halo blanco usando .trim()...`);
              
              // Intentar importar sharp (puede no estar instalado)
              let sharp;
              try {
                sharp = (await import('sharp')).default;
              } catch (importError) {
                console.warn('⚠️ Sharp no está disponible. Instala sharp con: npm install sharp');
                console.warn('⚠️ Usando buffer original sin procesamiento de halo blanco');
                throw new Error('Sharp no disponible');
              }
              
              // Usar el formato original detectado para preservar mejor el alpha
              const outputFormat = finalExtension === 'png' ? 'png' : 'webp';
              
              // Procesar con .trim() - recorta bordes del mismo color que la esquina superior izquierda
              // Esto automáticamente elimina halos blancos y preserva el canal alpha
              if (outputFormat === 'png') {
                processedBuffer = await sharp(buffer)
                  .trim() // Recorta bordes del mismo color que la esquina superior izquierda
                  .png() // Asegura PNG para transparencia
                  .toBuffer();
              } else {
                processedBuffer = await sharp(buffer)
                  .trim() // Recorta bordes del mismo color que la esquina superior izquierda
                  .webp({ lossless: true }) // WebP lossless preserva el canal alpha
                  .toBuffer();
              }
              
              console.log(`✅ Sticker procesado - Tamaño original: ${(buffer.length / 1024).toFixed(2)} KB, Procesado: ${(processedBuffer.length / 1024).toFixed(2)} KB`);
              console.log(`✅ Halo blanco eliminado con .trim() - Canal alpha preservado`);
              
            } catch (processError) {
              console.error('❌ Error procesando sticker para eliminar halo blanco:', processError);
              console.log('⚠️ Usando buffer original sin procesamiento');
              // Continuar con el buffer original si falla el procesamiento
              processedBuffer = buffer;
            }
            
            try {
              const { uploadToSupabaseStorage } = await import('../utils/fileUtils.js');
              // ✅ Subir buffer procesado (sin halo blanco) con canal alpha preservado
              const uploadResult = await uploadToSupabaseStorage(
                processedBuffer, // ✅ Buffer procesado sin halo blanco
                stickerFilename,
                finalMimeType, // ✅ MIME type correcto (image/webp o image/png con alpha)
                userId,
                'whatsapp' // Especificar bucket 'whatsapp' para stickers de WhatsApp
              );
              stickerUrl = uploadResult.publicUrl;
              console.log(`✅ Sticker subido a Supabase Storage (bucket: whatsapp): ${stickerUrl}`);
              console.log(`✅ Formato: ${finalMimeType} - Halo blanco eliminado - Fondo 100% transparente`);
            } catch (uploadError) {
              console.error('❌ Error subiendo sticker a Supabase Storage:', uploadError);
              // Continuar sin URL, pero registrar el error
            }
            
            // 2. Analizar sticker con Google Vision para extraer texto/contenido (similar a imágenes)
            console.log('🖼️ Analizando sticker con Google Vision para extraer contenido...');
            try {
              const { analyzeImageBufferWithVision } = await import('../services/googleVisionService.js');
              const stickerPromise = analyzeImageBufferWithVision(buffer);
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout procesando sticker')), 20000)
              );
              extractedText = await Promise.race([stickerPromise, timeoutPromise]);
              
              if (!extractedText || extractedText.trim().length === 0) {
                extractedText = 'Sticker recibido (sin texto visible)';
                console.log(`✅ Sticker procesado pero no se encontró texto visible`);
              } else {
                console.log(`✅ Contenido extraído del sticker (${extractedText.length} caracteres):`, extractedText.substring(0, 100) + '...');
              }
            } catch (visionError) {
              console.error('❌ Error analizando sticker con Google Vision:', visionError);
              extractedText = 'Sticker recibido pero no se pudo analizar el contenido';
            }
            
            console.log(`✅ Sticker procesado: ${(buffer.length / 1024).toFixed(2)} KB`);
            
            // 3. Guardar URL del sticker en el mensaje
            if (stickerUrl && userMessageId) {
              const { error: mediaUpdateError } = await supabaseAdmin
                .from('messages_new')
                .update({
                  media_url: stickerUrl,
                  media_type: 'sticker',
                  media_filename: stickerFilename,
                  media_size: buffer.length
                })
                .eq('id', userMessageId);
              
              if (mediaUpdateError) {
                console.error(`❌ Error guardando URL de sticker en mensaje: ${mediaUpdateError.message}`);
              } else {
                console.log(`✅ URL de sticker guardada en mensaje: ${stickerUrl}`);
              }
            }
          } catch (error) {
            console.error('❌ Error procesando sticker:', error);
            extractedText = `Sticker procesado pero no se pudo guardar: ${error.message}`;
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
      } else if (type === 'sticker') {
        // Agregar sufijo solo si se extrajo contenido del sticker
        if (extractedText && extractedText !== 'Sticker recibido' && !extractedText.includes('Sticker recibido')) {
          extractedText += "\nFinal del sticker";
        }
      }

      // Agregar instrucción para análisis
      if (type === 'sticker') {
        // Para stickers, pedir análisis del contenido visual
        if (extractedText && extractedText !== 'Sticker recibido' && !extractedText.includes('Sticker recibido')) {
          extractedText += "\nQuiero que analices este sticker y respondas basándote en su contenido visual";
        }
      } else {
        extractedText += "\nQuiero que seas conciso y hagas un análisis con la información que contiene este archivo";
      }

      // Agregar al array de medios procesados (incluir URL si está disponible)
      processedMedia.push({
        type,
        mimeType: mediaContent.mimetype,
        extractedText,
        filename: mediaContent.fileName || `${type}-${Date.now()}`,
        size: buffer.length,
        url: type === 'image' ? (imageUrl || null) : null // Incluir URL de imagen si está disponible
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
    content: h.text_content || h.media_content || ''
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

    // Verificar si la sesión está realmente conectada usando la función centralizada
    const isConnected = isSessionConnected(users_id);
    
    // Obtener el socket de la sesión (puede ser null si no hay sesión)
    const sock = isConnected ? sessions.get(users_id) : null;

    let phoneNumber = '';
    if (sock && sock.user && sock.user.id) {
      const waUserId = sock.user.id || '';
      const prephone = waUserId.split('@')[0];
      phoneNumber = prephone.split(':')[0];
    }

    console.log(`🔍 Debug getConversations: userId=${users_id}, connected=${isConnected}, phoneNumber=${phoneNumber || '(no session)'}`);

    // Usar DISTINCT ON para evitar chats duplicados con el mismo external_id
    // Priorizar conversaciones con wa_user_id y luego las más recientes
    // Usar una subconsulta para asegurar que solo se devuelva una conversación por external_id
    // NOTA: Si no hay phoneNumber (sesión desconectada), usamos string vacío para evitar fallos
    const phoneParam = phoneNumber || '';
    const { rows: convs } = await pool.query(`
      WITH ranked_conversations AS (
        SELECT 
          c.external_id,
          c.contact_name,
          c.contact_photo_url,
          c.ai_active,
          c.personality_id,
          p.nombre AS personality_name,
          (p.category = 'global') AS is_global_personality,
          c.no_ac_ai,
          COALESCE(m_last.whatsapp_created_at, c.started_at) AS last_message_date,
          -- Limpiar el texto del último mensaje para no mostrar contenido OCR
          CASE
            WHEN m_last.message_type IN ('media', 'sticker') THEN
              CASE
                WHEN m_last.media_type = 'image' THEN '📷 Imagen'
                WHEN m_last.media_type = 'audio' THEN '🎵 Audio'
                WHEN m_last.media_type = 'video' THEN '🎥 Video'
                WHEN m_last.media_type = 'document' THEN '📄 Documento'
                WHEN m_last.media_type = 'sticker' THEN '🏷️ Sticker'
                WHEN m_last.text_content LIKE '%[Contenido de imagen%' OR
                     m_last.text_content LIKE '%[Audio transcrito%' OR
                     m_last.text_content LIKE '%[Contenido de PDF%' OR
                     m_last.text_content LIKE '%[Contenido de documento Word%' OR
                     m_last.text_content LIKE '%Final de la imagen%' OR
                     m_last.text_content LIKE '%Final del audio%' OR
                     m_last.text_content LIKE '%Final del PDF%' OR
                     m_last.text_content LIKE '%Quiero que seas conciso%'
                THEN '📎 Archivo adjunto'
                ELSE COALESCE(m_last.text_content, '📎 Archivo adjunto')
              END
            ELSE m_last.text_content
          END AS last_message_text,
          COALESCE(unread.unread_count, 0) AS unread_count,
          c.last_read_at,
          c.id AS conversation_id,
          -- Prioridad: 0 = wa_user_id coincidente, 1 = NULL, 2 = otros
          (CASE 
            WHEN c.wa_user_id = $2 THEN 0 
            WHEN c.wa_user_id IS NULL THEN 1 
            ELSE 2 
          END) AS priority,
          -- Ordenar por fecha de último mensaje (más reciente primero)
          ROW_NUMBER() OVER (
            PARTITION BY c.external_id 
            ORDER BY 
              (CASE 
                WHEN c.wa_user_id = $2 THEN 0 
                WHEN c.wa_user_id IS NULL THEN 1 
                ELSE 2 
              END) ASC,
              COALESCE(m_last.whatsapp_created_at, c.started_at) DESC NULLS LAST,
              c.id DESC
          ) AS rn
        FROM conversations_new c
        LEFT JOIN personalities p ON c.personality_id = p.id
        LEFT JOIN LATERAL (
          SELECT text_content, whatsapp_created_at, message_type, media_type
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
        WHERE c.user_id = $1 
          AND c.external_id IS NOT NULL
      )
      SELECT 
        external_id AS id,
        contact_name AS name,
        contact_photo_url AS photo,
        ai_active AS "aiActive",
        personality_id AS "personalityId",
        personality_name AS "personalityName",
        is_global_personality AS "isGlobalPersonality",
        no_ac_ai,
        EXTRACT(EPOCH FROM last_message_date)::BIGINT AS "updatedAt",
        last_message_text AS "lastMessage",
        unread_count::INT AS "unreadCount",
        last_read_at
      FROM ranked_conversations
      WHERE rn = 1
      ORDER BY 
        last_message_date DESC NULLS LAST,
        external_id;
    `, [users_id, phoneParam]);

    console.log(`✅ Debug getConversations: Encontradas ${convs.length} conversaciones para ${phoneNumber}`);

    // ✅ Filtro adicional para eliminar duplicados por external_id (por si acaso)
    const uniqueConvsMap = new Map();
    for (const conv of convs) {
      const externalId = conv.id; // external_id se mapea a 'id'
      if (!uniqueConvsMap.has(externalId)) {
        uniqueConvsMap.set(externalId, conv);
      } else {
        // Si ya existe, mantener el que tiene wa_user_id o el más reciente
        const existing = uniqueConvsMap.get(externalId);
        const existingDate = existing.updatedAt || 0;
        const newDate = conv.updatedAt || 0;
        if (newDate > existingDate) {
          uniqueConvsMap.set(externalId, conv);
        }
      }
    }
    const uniqueConvs = Array.from(uniqueConvsMap.values());
    console.log(`✅ Debug getConversations: Después de filtro de duplicados: ${uniqueConvs.length} conversaciones únicas`);

    // Enriquecer conversaciones con nombres reales desde WhatsApp si el nombre es solo un número
    // Solo intentar si hay sesión activa con socket
    const enrichedConvs = await Promise.all(
      uniqueConvs.map(async (conv) => {
        // Si el nombre es solo un número (sin letras), intentar obtener el nombre real desde WhatsApp
        const nameIsNumber = /^\d+$/.test(conv.name?.trim() || '');
        if (nameIsNumber && sock && isConnected) {
          try {
            const contactData = await sock.store?.contacts?.get(conv.id);
            if (contactData && (contactData.notify || contactData.name)) {
              const realName = contactData.notify || contactData.name;
              if (realName && realName.trim() !== '' && !/^\d+$/.test(realName.trim())) {
                console.log(`🔄 Actualizando nombre de ${conv.name} a ${realName} para ${conv.id}`);
                // Actualizar en la base de datos
                await pool.query(`
                  UPDATE conversations_new
                  SET contact_name = $1, updated_at = NOW()
                  WHERE external_id = $2 AND user_id = $3
                `, [realName, conv.id, users_id]);
                conv.name = realName;
              }
            }
          } catch (nameError) {
            // Silenciar errores, mantener el nombre actual
            console.log(`⚠️ No se pudo obtener nombre real para ${conv.id}:`, nameError.message);
          }
        }
        return conv;
      })
    );

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
      needsQr: !isConnected, // ✅ Indicar si se necesita QR basado en estado real de conexión
      connected: isConnected, // ✅ Estado de conexión explícito
      conversations: enrichedConvs,
      globalSettings: {
        aiGlobalActive: settings.ai_global_active ?? true, // ✅ Por defecto ACTIVADA
        globalPersonalityId: settings.default_personality_id || null
      }
    })

  } catch (error) {
    console.error('getConversations error:', error)
    return res.status(500).json({ 
      success: false, 
      needsQr: true, // ✅ En caso de error, asumir que se necesita QR
      message: 'Error al obtener conversaciones',
      conversations: [], // ✅ Asegurar que no se retornen conversaciones en caso de error
      error: error.message
    })
  }
}

export const markConversationRead = async (req, res) => {
  try {
    const user_id = getUserIdFromToken(req); // Obtén el ID del usuario desde el token
    
    if (!user_id) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }
    
    const { conversationId } = req.body; // Obtén el conversationId desde el cuerpo de la solicitud

    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Se requiere conversationId' });
    }

    console.log(`📖 [markConversationRead] Marcando conversación como leída: conversationId=${conversationId}, userId=${user_id}`);

    // Determinar si conversationId es un ID numérico o un external_id (JID)
    const isNumericId = /^\d+$/.test(String(conversationId));
    
    let rows;
    if (isNumericId) {
      // Si es numérico, buscar por ID
      console.log(`🔍 [markConversationRead] Buscando conversación por ID: ${conversationId}`);
      const result = await pool.query(`
        SELECT id, external_id, last_msg_time
        FROM conversations_new
        WHERE id = $1 
          AND user_id = $2
        LIMIT 1
      `, [conversationId, user_id]);
      rows = result.rows;
    } else {
      // Si no es numérico, buscar por external_id (JID)
      console.log(`🔍 [markConversationRead] Buscando conversación por external_id: ${conversationId}`);
      const result = await pool.query(`
        SELECT id, external_id, last_msg_time
        FROM conversations_new
        WHERE external_id = $1 
          AND user_id = $2
        LIMIT 1
      `, [conversationId, user_id]);
      rows = result.rows;
    }

    // Verifica si encontramos la conversación en la base de datos
    if (rows.length === 0) {
      console.log(`⚠️ [markConversationRead] Conversación no encontrada: conversationId=${conversationId}, userId=${user_id}`);
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }

    const convId = rows[0].id;
    const external_id = rows[0].external_id;
    const lastMsgTime = rows[0].last_msg_time; // Tiempo del último mensaje registrado en la base de datos

    console.log(`✅ [markConversationRead] Conversación encontrada: id=${convId}, external_id=${external_id}`);

    // Actualiza la base de datos para establecer la fecha de lectura usando el ID
    await pool.query(`
      UPDATE conversations_new
      SET last_read_at = NOW()
      WHERE id = $1 
        AND user_id = $2
    `, [convId, user_id]);

    console.log(`✅ [markConversationRead] Conversación marcada como leída exitosamente`);

    return res.json({ 
      success: true, 
      message: 'Conversación marcada como leída',
      conversationId: convId,
      externalId: external_id
    });

  } catch (error) {
    console.error('❌ [markConversationRead] Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al marcar conversación como leída',
      error: error.message
    });
  }

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

  // Obtener conversation_id usando Supabase API
  const { data: convData, error: convError } = await supabaseAdmin
    .from('conversations_new')
    .select('id')
    .eq('external_id', conversationId)
    .eq('user_id', userId)
    .single();

  if (convError || !convData) {
    throw new Error('Conversación no encontrada');
  }

  const convId = convData.id;
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
    
    // Guardar mensaje usando Supabase API directamente
    console.log(`💾 [sendMessage] Guardando mensaje enviado: conversation_id=${convId}, sender_type=${senderType}, text_content="${textContent}", last_msg_id=${sentId}`);
    
    const { data: insertedMessage, error: insertError } = await supabaseAdmin
      .from('messages_new')
      .insert({
        conversation_id: convId,
        sender_type: senderType,
        message_type: attachments.length ? 'media' : 'text',
        text_content: textContent,
        created_at: new Date().toISOString(),
        user_id: userId,
        whatsapp_created_at: new Date().toISOString(),
        last_msg_id: sentId,
        tenant: 'whatsapp'
      })
      .select('id')
      .single();

    if (insertError) {
      console.error(`❌ [sendMessage] Error guardando mensaje: ${insertError.message}`);
      throw new Error(`Error guardando mensaje: ${insertError.message}`);
    }
    
    console.log(`✅ [sendMessage] Mensaje guardado con ID: ${insertedMessage.id}`);

    // Actualizar conversación usando Supabase API
    const { error: updateError } = await supabaseAdmin
      .from('conversations_new')
      .update({
        updated_at: new Date().toISOString(),
        last_msg_id: sentId,
        last_msg_time: new Date().toISOString()
      })
      .eq('external_id', conversationId)
      .eq('user_id', userId);

    if (updateError) {
      console.error(`❌ [sendMessage] Error actualizando conversación: ${updateError.message}`);
    } else {
      console.log(`✅ [sendMessage] Conversación actualizada`);
    }

    // Emitir evento new-message para que el frontend actualice la UI
    // IMPORTANTE: Incluir todos los datos necesarios para que el frontend pueda mostrar y persistir el mensaje
    const { emitToUser } = await import('../services/whatsappService.js');
    
    const messageData = {
      id: insertedMessage?.id || null,
      conversationId: convId,
      externalId: conversationId, // JID de WhatsApp para identificar la conversación
      from: 'you',
      sender_type: senderType, // 'you' o 'ia' - CRÍTICO para que el frontend sepa que es un mensaje enviado
      message: textContent,
      body: textContent, // Alias para compatibilidad
      text_content: textContent, // Nombre de columna de BD
      timestamp: Date.now(),
      created_at: new Date().toISOString(),
      whatsapp_created_at: new Date().toISOString(),
      isAI: senderType === 'ia',
      isSticker: false,
      media: attachments || [],
      message_type: attachments.length ? 'media' : 'text',
      last_msg_id: sentId
    };
    
    console.log(`📡 [sendMessage] Emitiendo evento new-message con datos completos:`, JSON.stringify(messageData).substring(0, 200));
    emitToUser(userId, 'new-message', messageData);
    
    emitToUser(userId, 'chats-updated');

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
        id: null, // Se puede obtener del INSERT si es necesario
        conversationId: convId,
        externalId: jid, // JID de WhatsApp
        from: 'you',
        sender_type: senderType, // 'you' o 'ia' - CRÍTICO para que el frontend sepa que es un mensaje enviado
        message: textContent,
        body: textContent,
        text_content: textContent,
        timestamp: Date.now(),
        created_at: new Date().toISOString(),
        whatsapp_created_at: new Date().toISOString(),
        isAI: senderType === 'ia',
        isSticker: false,
        media: attachments || [],
        message_type: attachments.length ? 'media' : 'text',
        last_msg_id: msgInfo?.key?.id || null
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
        content: h.text_content || h.media_content || ''
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

    // Buscar la conversación interna - soportar tanto external_id (JID) como ID numérico
    const isNumericId = /^\d+$/.test(String(conversationId));
    let convRes;
    
    if (isNumericId) {
      // Buscar por ID numérico interno
      convRes = await pool.query(`
        SELECT id FROM conversations_new
        WHERE id = $1
          AND user_id = $2
        LIMIT 1
      `, [conversationId, users_id]);
    } else {
      // Buscar por external_id (JID de WhatsApp)
      convRes = await pool.query(`
        SELECT id FROM conversations_new
        WHERE external_id = $1
          AND user_id = $2
        LIMIT 1
      `, [conversationId, users_id]);
    }

    if (!convRes.rows.length) {
      console.log(`⚠️ [getMessages] Conversación no encontrada: conversationId=${conversationId}, userId=${users_id}, isNumericId=${isNumericId}`);
      return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
    }

    const convId = convRes.rows[0].id;

    // Traer todos los mensajes existentes ordenados correctamente
    // IMPORTANTE: Incluir COALESCE para manejar mensajes sin whatsapp_created_at
    // IMPORTANTE: Para mensajes con media, NO devolver el texto extraído del OCR en body
    const { rows } = await pool.query(`
      SELECT id,
             sender_type,
             message_type,
             -- Si es mensaje con media o sticker, devolver null o texto del usuario (sin OCR)
             -- Si contiene "[Contenido de imagen", "[Audio transcrito", "[Contenido de PDF", etc., limpiarlo
             CASE 
               WHEN message_type = 'media' OR message_type = 'sticker' THEN 
                 CASE 
                   WHEN text_content IS NULL OR text_content = '' THEN NULL
                   WHEN text_content LIKE '%[Contenido de imagen%' OR 
                        text_content LIKE '%[Audio transcrito%' OR 
                        text_content LIKE '%[Contenido de PDF%' OR
                        text_content LIKE '%[Contenido de documento Word%' OR
                        text_content LIKE '%Final de la imagen%' OR
                        text_content LIKE '%Final del audio%' OR
                        text_content LIKE '%Final del PDF%' OR
                        text_content LIKE '%Final del documento Word%' OR
                        text_content LIKE '%Quiero que seas conciso%'
                   THEN NULL  -- No devolver texto del OCR para mensajes con media
                   ELSE text_content  -- Devolver solo si es texto del usuario (sin OCR)
                 END
               ELSE text_content  -- Para mensajes de texto normal, devolver todo
             END AS body,
             COALESCE(
               EXTRACT(EPOCH FROM whatsapp_created_at)::BIGINT,
               EXTRACT(EPOCH FROM created_at)::BIGINT
             ) AS timestamp,
             created_at,
             whatsapp_created_at,
             media_type,
             media_url,
             media_content,  -- Incluir media_content pero NO se usará en body
             media_filename,
             media_size
      FROM messages_new
      WHERE conversation_id = $1
        AND user_id = $2
      ORDER BY COALESCE(whatsapp_created_at, created_at) ASC
    `, [convId, users_id]);

    // Limpiar mensajes: remover body si contiene texto del OCR para mensajes con media
    // Y agregar información de media (isSticker, media array) para el frontend
    const cleanedRows = rows.map(row => {
      let cleanedRow = { ...row };
      
      // ✅ Normalizar dirección del mensaje para el frontend
      // 'user' = mensaje del contacto (incoming/izquierda)
      // 'ia' = respuesta automática de la IA (outgoing/derecha)
      // 'you' = mensaje enviado manualmente por el dueño (outgoing/derecha)
      // 'system' = mensaje del sistema (centro)
      if (row.sender_type === 'user') {
        cleanedRow.direction = 'incoming';
      } else if (row.sender_type === 'ia' || row.sender_type === 'you') {
        cleanedRow.direction = 'outgoing';
      } else if (row.sender_type === 'system') {
        cleanedRow.direction = 'system';
      } else {
        cleanedRow.direction = 'outgoing'; // fallback
      }
      
      // Si es mensaje con media o sticker y el body contiene texto del OCR, limpiarlo
      if ((row.message_type === 'media' || row.message_type === 'sticker') && row.body) {
        const bodyText = row.body;
        // Verificar si contiene marcadores de texto extraído del OCR
        if (bodyText.includes('[Contenido de imagen') ||
            bodyText.includes('[Audio transcrito') ||
            bodyText.includes('[Contenido de PDF') ||
            bodyText.includes('[Contenido de documento Word') ||
            bodyText.includes('Final de la imagen') ||
            bodyText.includes('Final del audio') ||
            bodyText.includes('Final del PDF') ||
            bodyText.includes('Final del documento Word') ||
            bodyText.includes('Quiero que seas conciso')) {
          cleanedRow.body = null;
        }
      }
      
      // ✅ CASO 1: Mensajes con media Y media_type definido (media procesada correctamente)
      if ((row.message_type === 'media' || row.message_type === 'sticker') && row.media_type) {
        const isSticker = row.media_type === 'sticker' || row.message_type === 'sticker';
        cleanedRow.isSticker = isSticker;
        cleanedRow.hasTransparentBackground = isSticker;
        
        const mediaArray = [];
        if (row.media_url) {
          if (isSticker) {
            let stickerMimeType = 'image/webp';
            if (row.media_filename) {
              if (row.media_filename.toLowerCase().endsWith('.png')) {
                stickerMimeType = 'image/png';
              } else if (row.media_filename.toLowerCase().endsWith('.webp')) {
                stickerMimeType = 'image/webp';
              }
            }
            mediaArray.push({
              type: 'sticker',
              url: row.media_url,
              filename: row.media_filename || null,
              mimeType: stickerMimeType,
              hasTransparentBackground: true
            });
          } else if (row.media_type === 'image') {
            mediaArray.push({
              type: 'image',
              url: row.media_url,
              filename: row.media_filename || null,
              mimeType: 'image/jpeg',
              shouldShowBorder: false,
              hideContainer: true
            });
          } else if (row.media_type === 'audio') {
            mediaArray.push({
              type: 'audio',
              url: row.media_url,
              filename: row.media_filename || null,
              mimeType: 'audio/ogg',
              size: row.media_size || null,
              simplePlayer: true
            });
          } else if (row.media_type === 'video') {
            mediaArray.push({
              type: 'video',
              url: row.media_url,
              filename: row.media_filename || null,
              mimeType: row.media_filename?.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'video/mp4',
              size: row.media_size || null
            });
          } else if (row.media_type === 'document') {
            mediaArray.push({
              type: 'document',
              url: row.media_url,
              filename: row.media_filename || null,
              mimeType: 'application/pdf'
            });
          }
        }
        cleanedRow.media = mediaArray;
        
      // ✅ CASO 2: Mensajes con message_type='media' PERO sin media_type/media_url
      // (media que falló al procesarse - tiene info en media_content)
      } else if (row.message_type === 'media' || row.message_type === 'sticker') {
        cleanedRow.isSticker = false;
        cleanedRow.media = [];
        
        // Si no hay body y hay media_content, usar media_content como texto informativo
        if (!cleanedRow.body && row.media_content) {
          const mc = row.media_content;
          // Generar un texto amigable basado en el contenido de media_content
          if (mc.startsWith('image') || mc.includes('imagen')) {
            cleanedRow.body = '📷 Imagen (no se pudo procesar)';
            cleanedRow.mediaFailed = true;
          } else if (mc.startsWith('Audio') || mc.includes('audio')) {
            cleanedRow.body = '🎵 Audio (no se pudo procesar)';
            cleanedRow.mediaFailed = true;
          } else if (mc.includes('video')) {
            cleanedRow.body = '🎥 Video (no se pudo procesar)';
            cleanedRow.mediaFailed = true;
          } else if (mc.includes('document') || mc.includes('documento') || mc.includes('PDF')) {
            cleanedRow.body = '📄 Documento (no se pudo procesar)';
            cleanedRow.mediaFailed = true;
          } else {
            cleanedRow.body = '📎 Archivo adjunto (no disponible)';
            cleanedRow.mediaFailed = true;
          }
        } else if (!cleanedRow.body) {
          // Si tampoco hay media_content, poner un placeholder
          cleanedRow.body = '📎 Archivo adjunto';
          cleanedRow.mediaFailed = true;
        }
      } else {
        // Para mensajes de texto normal
        cleanedRow.isSticker = false;
        cleanedRow.media = [];
      }
      
      // ✅ Limpiar campos internos que el frontend no necesita
      delete cleanedRow.media_content;
      delete cleanedRow.media_type;
      delete cleanedRow.media_url;
      delete cleanedRow.media_filename;
      delete cleanedRow.media_size;
      
      return cleanedRow;
    });

    // Responder con los mensajes obtenidos
    console.log(`📨 [getMessages] Devolviendo ${cleanedRows.length} mensajes para conversación ${conversationId} (convId: ${convId})`);
    const sentCount = cleanedRows.filter(m => m.sender_type === 'you' || m.sender_type === 'ia').length;
    const receivedCount = cleanedRows.filter(m => m.sender_type === 'user').length;
    const mediaCount = cleanedRows.filter(m => m.message_type === 'media').length;
    const failedMediaCount = cleanedRows.filter(m => m.mediaFailed).length;
    console.log(`   - Mensajes enviados (you+ia): ${sentCount}`);
    console.log(`   - Mensajes recibidos (user): ${receivedCount}`);
    console.log(`   - Mensajes con media: ${mediaCount} (${failedMediaCount} fallidos)`);
    console.log(`   - Tipos de sender_type encontrados: ${[...new Set(cleanedRows.map(m => m.sender_type))].join(', ')}`);
    
    res.json({ success: true, data: cleanedRows });
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

/**
 * Reaccionar a un mensaje de WhatsApp
 * @param {string} userId - ID del usuario
 * @param {number} messageId - ID del mensaje en la BD (messages_new.id)
 * @param {string} emoji - Emoji de la reacción (ej: "👍", "❤️", "" para quitar)
 * @returns {Promise<Object>} Resultado de la operación
 */
export async function reactToMessage(userId, messageId, emoji) {
  // Verificar rate limiting
  checkRateLimit(userId);
  
  const sock = sessions.get(userId);
  
  if (!sock) {
    throw new Error('No hay sesión activa de WhatsApp. Por favor, escanea el código QR.');
  }
  
  if (!sock.user) {
    throw new Error('Sesión de WhatsApp no completamente inicializada. Intenta de nuevo en unos segundos.');
  }

  try {
    // 1. Obtener información del mensaje desde la BD
    const { data: messageData, error: messageError } = await supabaseAdmin
      .from('messages_new')
      .select('last_msg_id, sender_type, conversation_id, text_content')
      .eq('id', messageId)
      .eq('user_id', userId)
      .single();

    if (messageError || !messageData) {
      throw new Error('Mensaje no encontrado');
    }

    if (!messageData.last_msg_id) {
      throw new Error('El mensaje no tiene un ID de WhatsApp válido');
    }

    // 2. Obtener el JID de la conversación
    const { data: conversationData, error: convError } = await supabaseAdmin
      .from('conversations_new')
      .select('external_id')
      .eq('id', messageData.conversation_id)
      .eq('user_id', userId)
      .single();

    if (convError || !conversationData) {
      throw new Error('Conversación no encontrada');
    }

    const jid = conversationData.external_id;
    
    // 3. Determinar si el mensaje fue enviado por nosotros
    const fromMe = messageData.sender_type === 'you' || messageData.sender_type === 'ia';

    // 4. Enviar la reacción usando Baileys
    console.log(`😊 Enviando reacción "${emoji || '(quitar)'}" al mensaje ${messageData.last_msg_id} en ${jid}`);
    
    await sock.sendMessage(jid, {
      react: {
        text: emoji || '', // String vacío para quitar reacción
        key: {
          remoteJid: jid,
          id: messageData.last_msg_id,
          fromMe: fromMe
        }
      }
    });

    console.log(`✅ Reacción "${emoji || '(quitada)'}" enviada exitosamente`);

    // 5. Emitir evento para actualizar el frontend
    emitToUser(userId, 'message-reaction', {
      messageId: messageId,
      conversationId: messageData.conversation_id,
      emoji: emoji || null, // null si se quitó la reacción
      removed: !emoji || emoji === ''
    });

    return {
      success: true,
      messageId: messageId,
      conversationId: messageData.conversation_id,
      emoji: emoji || null,
      removed: !emoji || emoji === ''
    };

  } catch (error) {
    console.error(`❌ Error enviando reacción:`, error);
    throw new Error(`Error enviando reacción: ${error.message}`);
  }
}

/**
 * Controlador HTTP para reaccionar a mensajes
 */
export const reactToMessageController = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    const { messageId, emoji } = req.body;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere messageId'
      });
    }

    // emoji es opcional (si no se envía o es "", se quita la reacción)
    const result = await reactToMessage(userId, messageId, emoji || '');

    return res.json({
      success: true,
      message: emoji ? 'Reacción enviada exitosamente' : 'Reacción eliminada exitosamente',
      data: result
    });

  } catch (err) {
    console.error('Error en reactToMessageController:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Error al enviar reacción'
    });
  }
};

// Export default
export default {
  getQrCode,
  getContactById,
  getContacts,
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
  testWordDocument,
  reactToMessage,
  reactToMessageController
}