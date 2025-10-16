// conversationService.js
import { supabaseAdmin } from '../config/db.js';

/**
 * Crea una nueva conversación en la base de datos.
 *
 * @param {string} userId - ID del usuario.
 * @param {number} personalityId - ID de la personalidad (opcional).
 * @param {string} externalId - ID externo (opcional).
 * @param {string} contactName - Nombre del contacto.
 * @param {string} contactPhotoUrl - URL de la foto del contacto (opcional).
 * @returns {Object} La conversación creada.
 */
export async function createConversation(userId, personalityId = null, externalId = null, contactName = '', contactPhotoUrl = '') {
  try {
    // Usar Supabase API directamente para evitar problemas con el pool personalizado
    const { data, error } = await supabaseAdmin
      .from('conversations_new')
      .insert({
        user_id: userId,
        personality_id: personalityId,
        external_id: externalId,
        contact_name: contactName,
        contact_photo_url: contactPhotoUrl,
        started_at: new Date().toISOString(),
        ai_active: false,
        wa_user_id: 'test',
        tenant: 'test'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando conversación:', error);
      throw new Error(`Error creando conversación: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error en createConversation:', error);
    throw error;
  }
}

/**
 * Guarda un mensaje dentro de una conversación.
 *
 * @param {string} userId - ID del usuario.
 * @param {number} conversationId - ID de la conversación.
 * @param {string} sender_type - Tipo de remitente ('user' o 'ia').
 * @param {string} content - Contenido del mensaje a guardar.
 * @param {number} elapsed - Tiempo de respuesta en milisegundos (opcional).
 * @returns {number} El ID del mensaje insertado.
 */
export async function saveMessage(userId, conversationId, sender_type, content, elapsed) {
  try {
    // Usar Supabase API directamente para evitar problemas con el pool personalizado
    const { data, error } = await supabaseAdmin
      .from('messages_new')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        sender_type: sender_type,
        message_type: 'text',
        text_content: content,
        created_at: new Date().toISOString(),
        interactions: elapsed || null
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error guardando mensaje:', error);
      throw new Error(`Error guardando mensaje: ${error.message}`);
    }

    return data.id;
  } catch (error) {
    console.error('Error en saveMessage:', error);
    throw error;
  }
}

/**
 * Recupera el historial de mensajes de una conversación con memoria extendida y contexto optimizado.
 * Los mensajes se mapean para ser compatibles con el formato que espera la API (role y content).
 * Optimizado para mantener contexto completo de hasta 50 mensajes con análisis inteligente.
 *
 * @param {number} conversationId - ID de la conversación.
 * @param {string} userId - ID del usuario.
 * @param {number} limit - Límite de mensajes a recuperar (por defecto 50 para contexto completo).
 * @returns {Array} Array de mensajes en el formato { role, content, timestamp, position, isRecent }.
 */
export async function getConversationHistory(conversationId, userId, limit = 50) {
  try {
    console.log(`🧠 OBTENIENDO HISTORIAL COMPLETO para conversación ${conversationId} con límite de ${limit} mensajes`);
    
    // Usar Supabase API directamente para evitar problemas con el pool personalizado
    const { data, error } = await supabaseAdmin
      .from('messages_new')
      .select('sender_type, text_content, created_at, message_type, id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error obteniendo historial:', error);
      throw new Error(`Error obteniendo historial: ${error.message}`);
    }

    const messages = data || [];
    console.log(`✅ Historial obtenido: ${messages.length} mensajes de la conversación ${conversationId}`);

    // Analizar el contexto de la conversación
    const contextAnalysis = analyzeConversationContext(messages);
    console.log(`🧠 Análisis de contexto: ${contextAnalysis.summary}`);

    // Mapear mensajes con información adicional de contexto
    const mappedMessages = messages.map((msg, index) => {
      // Mapear correctamente los roles para OpenAI
      let role;
      if (msg.sender_type === 'user') {
        role = 'user';
      } else if (msg.sender_type === 'system') {
        role = 'system';
      } else {
        role = 'assistant'; // 'ia' y otros tipos se mapean como assistant
      }
      
      // Calcular posición y si es reciente
      const position = index + 1;
      const isRecent = position > (messages.length - 20); // Últimos 20 mensajes son recientes
      
      // Convertir timestamp a formato legible
      const timestamp = msg.created_at ? new Date(msg.created_at).toISOString() : null;
      
      return {
        role: role,
        content: msg.text_content || '',
        sender_type: msg.sender_type, // Mantener el tipo original para debugging
        timestamp: timestamp,
        position: position,
        isRecent: isRecent,
        message_type: msg.message_type || 'text',
        id: msg.id
      };
    });

    // Agregar información de contexto al final
    if (contextAnalysis.hasMultimedia) {
      mappedMessages.push({
        role: 'system',
        content: `[CONTEXTO DE CONVERSACIÓN: ${contextAnalysis.summary}. Esta conversación incluye contenido multimedia analizado.]`,
        sender_type: 'system',
        timestamp: new Date().toISOString(),
        position: mappedMessages.length + 1,
        isRecent: true,
        message_type: 'context',
        id: 'context_' + Date.now()
      });
    }

    console.log(`🧠 Historial mapeado: ${mappedMessages.length} mensajes con contexto completo`);
    console.log(`   📊 Tipos de mensajes: ${contextAnalysis.messageTypes.join(', ')}`);
    console.log(`   🎯 Contexto principal: ${contextAnalysis.mainTopic}`);
    console.log(`   📱 Multimedia: ${contextAnalysis.hasMultimedia ? 'Sí' : 'No'}`);
    console.log(`   🔢 Mensajes recientes: ${contextAnalysis.recentCount}`);

    return mappedMessages;
  } catch (error) {
    console.error('Error en getConversationHistory:', error);
    throw error;
  }
}

/**
 * Analiza el contexto de una conversación para optimizar la memoria y respuestas de la IA.
 * 
 * @param {Array} messages - Array de mensajes de la conversación
 * @returns {Object} Análisis del contexto de la conversación
 */
function analyzeConversationContext(messages) {
  if (!messages || messages.length === 0) {
    return {
      summary: 'Conversación vacía',
      mainTopic: 'Sin tema definido',
      hasMultimedia: false,
      messageTypes: [],
      recentCount: 0,
      contextStrength: 'weak'
    };
  }

  // Contar tipos de mensajes
  const messageTypes = {};
  const recentMessages = messages.slice(-20); // Últimos 20 mensajes
  let hasMultimedia = false;

  messages.forEach(msg => {
    const type = msg.message_type || 'text';
    messageTypes[type] = (messageTypes[type] || 0) + 1;
    
    // Verificar si hay contenido multimedia
    if (type !== 'text' || (msg.text_content && msg.text_content.includes('Contenido de imagen:'))) {
      hasMultimedia = true;
    }
  });

  // Extraer tema principal de los mensajes recientes
  const mainTopic = extractMainTopic(recentMessages);
  
  // Calcular fuerza del contexto
  const contextStrength = calculateContextStrength(messages, recentMessages);

  return {
    summary: `Conversación de ${messages.length} mensajes con tema principal: ${mainTopic}`,
    mainTopic: mainTopic,
    hasMultimedia: hasMultimedia,
    messageTypes: Object.keys(messageTypes),
    recentCount: recentMessages.length,
    contextStrength: contextStrength,
    totalMessages: messages.length,
    multimediaCount: Object.values(messageTypes).reduce((sum, count) => sum + count, 0) - (messageTypes.text || 0)
  };
}

/**
 * Extrae el tema principal de los mensajes recientes.
 * 
 * @param {Array} recentMessages - Últimos mensajes de la conversación
 * @returns {string} Tema principal identificado
 */
function extractMainTopic(recentMessages) {
  if (!recentMessages || recentMessages.length === 0) {
    return 'Sin tema definido';
  }

  // Palabras clave comunes para identificar temas
  const topicKeywords = {
    'coche': ['coche', 'carro', 'auto', 'vehículo', 'ford', 'bmw', 'mercedes', 'km', 'precio'],
    'tecnología': ['tecnología', 'software', 'programación', 'app', 'web', 'desarrollo'],
    'negocios': ['negocio', 'empresa', 'ventas', 'marketing', 'cliente', 'servicio'],
    'educación': ['estudiar', 'curso', 'aprender', 'universidad', 'escuela', 'profesor'],
    'salud': ['médico', 'salud', 'enfermedad', 'tratamiento', 'consulta', 'síntomas']
  };

  // Contar ocurrencias de palabras clave
  const topicScores = {};
  const allText = recentMessages
    .map(msg => (msg.text_content || '').toLowerCase())
    .join(' ');

  Object.entries(topicKeywords).forEach(([topic, keywords]) => {
    topicScores[topic] = keywords.reduce((score, keyword) => {
      const regex = new RegExp(keyword, 'gi');
      const matches = (allText.match(regex) || []).length;
      return score + matches;
    }, 0);
  });

  // Encontrar el tema con mayor puntuación
  const mainTopic = Object.entries(topicScores)
    .sort(([,a], [,b]) => b - a)[0];

  if (mainTopic && mainTopic[1] > 0) {
    return mainTopic[0];
  }

  // Si no hay tema claro, usar palabras más frecuentes
  const words = allText.split(/\s+/).filter(word => word.length > 3);
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });

  const mostFrequent = Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([word]) => word)
    .join(', ');

  return mostFrequent || 'Conversación general';
}

/**
 * Calcula la fuerza del contexto basándose en la coherencia de los mensajes.
 * 
 * @param {Array} allMessages - Todos los mensajes de la conversación
 * @param {Array} recentMessages - Mensajes recientes
 * @returns {string} Fuerza del contexto ('strong', 'medium', 'weak')
 */
function calculateContextStrength(allMessages, recentMessages) {
  if (allMessages.length < 3) {
    return 'weak';
  }

  if (allMessages.length < 10) {
    return 'medium';
  }

  // Verificar coherencia en mensajes recientes
  const userMessages = recentMessages.filter(msg => msg.sender_type === 'user');
  const aiMessages = recentMessages.filter(msg => msg.sender_type === 'ia');
  
  // Si hay buena interacción usuario-IA, el contexto es fuerte
  if (userMessages.length >= 3 && aiMessages.length >= 2) {
    return 'strong';
  }

  return 'medium';
}
