import axios from 'axios';
import { analyzeImageUrlWithVision } from './googleVisionService.js';
import { getOrCreateIGSession } from './instagramService.js';
import { generateBotResponse, transcribeAudioBuffer } from './openaiService.js';

// Función auxiliar para cargar personalidad directamente desde DB (evita dependencia circular)
async function loadPersonalityData(personalityId, userId) {
  try {
    const { supabaseAdmin } = await import('../config/db.js');
    
    const { data: personalityData, error: personalityError } = await supabaseAdmin
      .from('personalities')
      .select('*')
      .eq('id', personalityId)
      .eq('users_id', userId)
      .single();
    
    if (personalityError || !personalityData) {
      throw new Error(`Personalidad no encontrada: ${personalityError?.message || 'No data'}`);
    }
    
    // Obtener instrucciones adicionales
    const { data: additionalInstructions } = await supabaseAdmin
      .from('personality_instructions')
      .select('instruccion')
      .eq('personality_id', personalityId)
      .eq('users_id', userId)
      .order('created_at', { ascending: true });
    
    // Combinar instrucciones
    let combinedInstructions = personalityData.instrucciones || '';
    if (additionalInstructions && additionalInstructions.length > 0) {
      const additionalText = additionalInstructions.map(instr => instr.instruccion).join('\n');
      combinedInstructions = `${combinedInstructions}\n\n${additionalText}`;
    }
    
    return {
      id: personalityData.id,
      nombre: personalityData.nombre,
      empresa: personalityData.empresa,
      sitio_web: personalityData.sitio_web,
      posicion: personalityData.posicion,
      category: personalityData.category,
      instrucciones: combinedInstructions,
      saludo: personalityData.saludo,
      time_response: personalityData.time_response,
      avatar_url: personalityData.avatar_url
    };
  } catch (error) {
    console.error(`❌ Error cargando personalidad: ${error.message}`);
    throw error;
  }
}

class InstagramBotService {
  constructor() {
    this.activeBots = new Map(); // Mapa de bots activos por usuario
    this.globalCheckInterval = null;
    this.commentsCheckInterval = null;
    this.isGlobalRunning = false;
    
    // Configuración global del bot - RESPUESTA RÁPIDA (máximo 5 segundos)
    this.config = {
      name: 'Asistente Uniclick',
      antiDetection: {
        minDelay: 500,       // 0.5 segundos mínimo entre respuestas (respuesta rápida)
        maxDelay: 5000,      // 5 segundos máximo entre respuestas (como solicitado)
        typingDelay: 500,    // 0.5 segundos simulando escritura (más rápido)
        readingDelay: 300,   // 0.3 segundos simulando lectura del mensaje (más rápido)
        humanPatterns: true, // Usar patrones humanos
        randomEmojis: true,  // Emojis aleatorios
        variedResponses: true, // Respuestas variadas
        
        // Límites de actividad (mantenidos para no sobrecargar)
        maxMessagesPerHour: 200,    // Máximo 200 mensajes por hora (aumentado)
        maxMessagesPerDay: 1000,    // Máximo 1000 mensajes por día (aumentado)
        quietHours: {               // Horas de "descanso" (desactivadas para respuesta rápida)
          enabled: false,   // DESACTIVADO para responder siempre rápido
          start: 1,
          end: 7
        },
        
        // Variación de respuestas
        responseVariation: {
          enabled: false,   // DESACTIVADO para que SIEMPRE responda
          skipChance: 0,    // 0% de probabilidad de no responder (siempre responde)
          delayMultiplier: 1.0 // Sin multiplicador
        }
      }
    };
  }

  // Función para generar delay rápido (máximo 5 segundos como solicitado)
  getHumanDelay() {
    const { minDelay, maxDelay } = this.config.antiDetection;
    // Delay aleatorio entre minDelay y maxDelay (0.5s - 5s)
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    return delay;
  }

  // Función para simular lectura del mensaje (rápida)
  async simulateReading(messageLength) {
    const { readingDelay } = this.config.antiDetection;
    // Lectura rápida: tiempo base + pequeño incremento por carácter
    const readTime = readingDelay + (messageLength * 2); // 2ms por carácter (más rápido)
    await new Promise(resolve => setTimeout(resolve, Math.min(readTime, 2000))); // Máximo 2s
  }

  // Función para simular escritura (rápida)
  async simulateTyping(responseLength) {
    const { typingDelay } = this.config.antiDetection;
    // Escritura rápida: tiempo base + pequeño incremento por carácter
    const typeTime = typingDelay + (responseLength * 3); // 3ms por carácter (más rápido)
    await new Promise(resolve => setTimeout(resolve, Math.min(typeTime, 3000))); // Máximo 3s
  }

  // Función para verificar si debemos responder (SIEMPRE responder)
  shouldRespond(userId) {
    // SIEMPRE responder (configuración para respuesta rápida)
    return true;
  }

  // Función para verificar si es seguro responder (límites de actividad)
  isSafeToRespond(userId) {
    const botData = this.activeBots.get(userId);
    if (!botData) return false;
    
    const now = Date.now();
    const timeSinceLastResponse = now - botData.lastResponseTime;
    const minDelay = this.config.antiDetection.minDelay;
    
    // Verificar delay mínimo (permitir respuesta rápida)
    // Solo verificar si han pasado menos de 0.3 segundos (para evitar spam extremo)
    if (timeSinceLastResponse < 300) {
      return false;
    }
    
    // Verificar límites de mensajes por hora
    const oneHourAgo = now - (60 * 60 * 1000);
    const messagesLastHour = botData.messageTimestamps?.filter(t => t > oneHourAgo).length || 0;
    
    if (messagesLastHour >= this.config.antiDetection.maxMessagesPerHour) {
      console.log(`⚠️ [Anti-detección] Límite de mensajes por hora alcanzado (${messagesLastHour}/${this.config.antiDetection.maxMessagesPerHour})`);
      return false;
    }
    
    // Verificar límites de mensajes por día
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const messagesLastDay = botData.messageTimestamps?.filter(t => t > oneDayAgo).length || 0;
    
    if (messagesLastDay >= this.config.antiDetection.maxMessagesPerDay) {
      console.log(`⚠️ [Anti-detección] Límite de mensajes por día alcanzado (${messagesLastDay}/${this.config.antiDetection.maxMessagesPerDay})`);
      return false;
    }
    
    return true;
  }

  // Función para registrar un mensaje enviado (para límites de actividad)
  recordMessageSent(userId) {
    const botData = this.activeBots.get(userId);
    if (!botData) return;
    
    if (!botData.messageTimestamps) {
      botData.messageTimestamps = [];
    }
    
    botData.messageTimestamps.push(Date.now());
    botData.lastResponseTime = Date.now();
    
    // Limpiar timestamps antiguos (más de 24 horas)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    botData.messageTimestamps = botData.messageTimestamps.filter(t => t > oneDayAgo);
  }

  // Función para procesar imagen (análisis con visión AI)
  async processImage(imageUrl, userMessage = '') {
    try {
      console.log(`📸 [Instagram Bot] Procesando imagen: ${imageUrl}`);
      
      // Analizar imagen con visión AI (Google Vision)
      const analysis = await analyzeImageUrlWithVision(imageUrl);
      
      if (analysis && analysis.trim().length > 0) {
        console.log(`✅ [Instagram Bot] Imagen analizada: ${analysis.substring(0, 100)}...`);
        
        // Construir mensaje con contexto de imagen
        const contextMessage = `[Contenido de imagen: ${analysis}]\n\n${userMessage || 'El usuario envió una imagen.'}`;
        return { success: true, message: contextMessage, mediaType: 'image' };
      }
      
      return { success: false, message: userMessage, mediaType: 'image' };
      
    } catch (error) {
      console.error(`❌ [Instagram Bot] Error procesando imagen:`, error.message);
      return { success: false, message: userMessage, mediaType: 'image' };
    }
  }

  // Función para procesar audio (transcripción con Whisper)
  async processAudio(audioUrl, userMessage = '') {
    try {
      console.log(`🎵 [Instagram Bot] Procesando audio: ${audioUrl}`);
      
      // Descargar audio
      const response = await axios.get(audioUrl, { responseType: 'arraybuffer' });
      const audioBuffer = Buffer.from(response.data);
      
      // Transcribir audio con Whisper
      const transcription = await transcribeAudioBuffer(audioBuffer, 'audio.mp4');
      
      if (transcription && transcription.text && transcription.text.trim().length > 0) {
        console.log(`✅ [Instagram Bot] Audio transcrito: ${transcription.text.substring(0, 100)}...`);
        
        // Construir mensaje con transcripción
        const contextMessage = `[Audio transcrito: ${transcription.text}]\n\n${userMessage || 'El usuario envió un audio.'}`;
        return { success: true, message: contextMessage, mediaType: 'audio' };
      }
      
      return { success: false, message: userMessage || 'El usuario envió un audio pero no se pudo transcribir.', mediaType: 'audio' };
      
    } catch (error) {
      console.error(`❌ [Instagram Bot] Error procesando audio:`, error.message);
      return { success: false, message: userMessage || 'El usuario envió un audio pero no se pudo procesar.', mediaType: 'audio' };
    }
  }

  // Función para procesar video (análisis básico)
  async processVideo(videoUrl, userMessage = '') {
    try {
      console.log(`🎥 [Instagram Bot] Procesando video: ${videoUrl}`);
      
      // Por ahora, solo reconocemos que es un video
      // En el futuro se puede agregar análisis de frames con visión AI
      const contextMessage = `[Contenido multimedia: El usuario envió un video]\n\n${userMessage || 'El usuario envió un video.'}`;
      
      return { success: true, message: contextMessage, mediaType: 'video' };
      
    } catch (error) {
      console.error(`❌ [Instagram Bot] Error procesando video:`, error.message);
      return { success: false, message: userMessage, mediaType: 'video' };
    }
  }

  // Función para generar respuesta con IA (con soporte de medios como WhatsApp)
  // SIEMPRE usa la personalidad del bot activo
  async generateAIResponse(userId, userMessage, history = [], mediaType = null, mediaContent = null, additionalContext = null) {
    try {
      const botData = this.activeBots.get(userId);
      if (!botData || !botData.isRunning) {
        console.error(`❌ [Instagram Bot] No hay bot activo para ${userId}`);
        return 'Gracias por tu mensaje. ¿En qué puedo ayudarte?';
      }
      
      if (!botData.personalityData) {
        console.error(`❌ [Instagram Bot] No hay personalidad configurada para el bot de ${userId}`);
        return 'Gracias por tu mensaje. ¿En qué puedo ayudarte?';
      }
      
      console.log(`🧠 [Instagram Bot] Generando respuesta con IA para usuario ${userId}...`);
      console.log(`🎭 [Instagram Bot] PERSONALIDAD ACTIVA: "${botData.personalityData.nombre}" (ID: ${botData.personalityData.id})`);
      
      // Detectar si hay contenido multimedia
      if (mediaType) {
        console.log(`📎 [Instagram Bot] Mensaje con medio detectado: ${mediaType}`);
      }
      
      // Si hay contexto adicional (ej: información del post), agregarlo al historial
      let enhancedHistory = [...history];
      if (additionalContext && additionalContext.postContext) {
        const postCtx = additionalContext.postContext;
        // Agregar un mensaje de sistema con el contexto del post
        enhancedHistory.unshift({
          role: 'system',
          content: `Contexto de la publicación: ${postCtx.caption || 'Sin caption'}. Likes: ${postCtx.likeCount}, Comentarios: ${postCtx.commentCount}`,
          timestamp: Date.now()
        });
      }
      
      // Usar el sistema de IA existente con soporte de medios
      if (botData.personalityData) {
        const response = await generateBotResponse({
          personality: botData.personalityData,
          userMessage: userMessage,
          userId: userId,
          history: enhancedHistory,
          mediaType: mediaType,      // Tipo de medio: 'image', 'audio', 'video', etc.
          mediaContent: mediaContent  // Contenido del medio (URL, buffer, transcripción, etc.)
        });
        
        if (response && response.trim().length > 0) {
          console.log(`✅ [Instagram Bot] Respuesta IA generada para ${userId}: "${response.substring(0, 100)}..."`);
          return response;
        }
      }

      // Fallback a respuesta simple
      const fallbackResponses = [
        'Gracias por tu mensaje. ¿En qué puedo ayudarte?',
        'Hola! ¿Cómo puedo asistirte hoy?',
        'Me alegra tu mensaje. ¿Qué necesitas saber?',
        '¡Hola! ¿En qué puedo ayudarte?',
        'Perfecto. ¿Hay algo específico que te interese?'
      ];
      
      return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];

    } catch (error) {
      console.error(`❌ [Instagram Bot] Error generando respuesta IA para ${userId}:`, error.message);
      
      // Respuestas de fallback
      const fallbackResponses = [
        'Gracias por tu mensaje. ¿En qué puedo ayudarte?',
        'Hola! ¿Cómo puedo asistirte hoy?',
        'Me alegra tu mensaje. ¿Qué necesitas saber?',
        '¡Hola! ¿En qué puedo ayudarte?',
        'Perfecto. ¿Hay algo específico que te interese?'
      ];
      
      return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }
  }

  // Inicializar bot para un usuario específico
  async initializeBotForUser(userId, credentials, personalityId = 872) {
    try {
      console.log(`🔐 [Instagram Bot] Inicializando bot para usuario ${userId}...`);
      
      if (!credentials.username || !credentials.password) {
        throw new Error('Credenciales de Instagram requeridas');
      }

      const igService = await getOrCreateIGSession(userId);
      
          // Verificar estado de la sesión
          let status = null;
          try {
            console.log(`🔍 [Instagram Bot] Verificando estado de sesión para ${userId}...`);
            status = await igService.checkStatus();
            console.log(`🔍 [Instagram Bot] Resultado de checkStatus:`, {
              connected: status?.connected,
              username: status?.username,
              igUserId: status?.igUserId
            });
          } catch (checkError) {
            console.log(`⚠️ [Instagram Bot] Error verificando estado: ${checkError.message}`);
            console.error(`   Stack:`, checkError.stack);
            status = { connected: false, username: null };
          }
          
          // Si checkStatus falla o no está conectado, verificar directamente con logged
          if ((!status || !status.connected) && !igService.logged) {
            console.log(`⏳ [Instagram Bot] No hay sesión activa válida para ${userId}`);
            console.log(`   Estado de igService:`, {
              logged: igService.logged,
              username: igService.username,
              igUserId: igService.igUserId
            });
            console.log(`   La sesión puede estar expirada. Necesitas hacer login desde el frontend primero.`);
            console.log(`   Para activar el bot automáticamente, primero haz login exitoso desde el frontend.`);
            return false;
          } else {
            // Si igService.logged es true, usar esa información
            if (igService.logged) {
              console.log(`✅ [Instagram Bot] Sesión activa detectada (logged: true) para ${userId}`);
              console.log(`   Username: ${igService.username || status?.username || 'N/A'}`);
              if (status && status.username && !igService.username) {
                igService.username = status.username;
              }
            } else {
              console.log(`✅ [Instagram Bot] Sesión activa y válida para ${userId}`);
              console.log(`   Username: ${status.username}`);
              // Actualizar el username en el servicio si no está establecido
              if (!igService.username && status.username) {
                igService.username = status.username;
              }
              if (!igService.logged) {
                igService.logged = true;
              }
            }
          }
      
      // Cargar datos de personalidad directamente desde DB (evita dependencia circular)
      let personalityData;
      try {
        console.log(`🧠 [Instagram Bot] Cargando personalidad para ${userId}...`);
        personalityData = await loadPersonalityData(personalityId, userId);
        console.log(`✅ [Instagram Bot] Personalidad cargada para ${userId}: ${personalityData.nombre}`);
      } catch (personalityError) {
        console.error(`❌ [Instagram Bot] Error cargando personalidad para ${userId}:`, personalityError.message);
        console.log(`⚠️  [Instagram Bot] Usando personalidad por defecto para ${userId}`);
        personalityData = {
          id: personalityId,
          nombre: 'Asistente Uniclick',
          empresa: 'Uniclick',
          instrucciones: 'Eres un asistente amigable y profesional de Uniclick. Ayuda a los usuarios con sus consultas de manera clara y útil.',
          saludo: '¡Hola! Soy el asistente de Uniclick. ¿En qué puedo ayudarte?',
          category: 'amigable'
        };
      }
      
      // Crear datos del bot para este usuario
      const botData = {
        userId: userId,
        igService: igService,
        personalityData: personalityData,
        processedMessages: new Set(),
        processedComments: new Set(),
        lastResponseTime: 0,
        isRunning: true,
        credentials: credentials,
        conversationHistory: new Map(), // Inicializar historial de conversación
        commentHistory: new Map() // Inicializar historial de comentarios
      };
      
      // Intentar cargar historial desde la sesión si existe
      if (igService.conversationHistory && igService.conversationHistory.size > 0) {
        console.log(`📚 [Instagram Bot] Cargando ${igService.conversationHistory.size} conversaciones desde sesión`);
        botData.conversationHistory = igService.conversationHistory;
      }
      
      // Cargar mensajes procesados desde la sesión si existe (para evitar duplicados)
      if (igService.processedMessages && igService.processedMessages.size > 0) {
        console.log(`✅ [Instagram Bot] Cargando ${igService.processedMessages.size} mensajes procesados desde sesión`);
        botData.processedMessages = new Set([...botData.processedMessages, ...igService.processedMessages]);
      }
      
      // Cargar comentarios procesados desde la sesión si existe
      if (igService.processedComments && igService.processedComments.size > 0) {
        console.log(`✅ [Instagram Bot] Cargando ${igService.processedComments.size} comentarios procesados desde sesión`);
        if (!botData.processedComments) {
          botData.processedComments = new Set();
        }
        botData.processedComments = new Set([...botData.processedComments, ...igService.processedComments]);
      }
      
      this.activeBots.set(userId, botData);
      
      console.log(`✅ [Instagram Bot] Bot inicializado correctamente para ${userId}`);
      return true;
      
    } catch (error) {
      console.error(`❌ [Instagram Bot] Error inicializando bot para ${userId}:`, error.message);
      return false;
    }
  }

  // Verificar nuevos mensajes para un usuario específico
  async checkForNewMessages(userId) {
    try {
      const botData = this.activeBots.get(userId);
      if (!botData || !botData.isRunning) {
        return;
      }

      console.log(`🔍 [Instagram Bot] Verificando nuevos mensajes para ${userId}...`);
      console.log(`   Personalidad activa: ${botData.personalityData?.nombre} (ID: ${botData.personalityData?.id})`);
      
      // Verificar que el servicio de Instagram esté logueado
      if (!botData.igService.logged) {
        console.error(`❌ [Instagram Bot] El servicio de Instagram no está logueado para ${userId}`);
        return;
      }
      
      console.log(`✅ [Instagram Bot] Servicio de Instagram está logueado como: ${botData.igService.username}`);
      
      // Obtener inbox de DMs
      let threads = [];
      try {
        threads = await botData.igService.fetchInbox();
        console.log(`📥 [Instagram Bot] fetchInbox() completado, ${threads.length} threads obtenidos`);
      } catch (inboxError) {
        console.error(`❌ [Instagram Bot] Error obteniendo inbox: ${inboxError.message}`);
        console.error(inboxError);
        
        // Detectar si la sesión expiró o hay problemas con Instagram
        const errorMsg = inboxError.message || '';
        const errorStatus = inboxError.response?.status || inboxError.status || 0;
        
        // Detectar errores específicos de Instagram
        const isSessionExpired = errorStatus === 403 || 
                                  errorStatus === 401 || 
                                  errorMsg.includes('login_required') ||
                                  errorMsg.includes('Forbidden');
        
        const isRateLimit = errorStatus === 429 || 
                            errorMsg.includes('rate') || 
                            errorMsg.includes('spam') ||
                            errorMsg.includes('too many');
        
        const isServerError = errorStatus === 500 || errorStatus === 502 || errorStatus === 503;
        
        // Emitir alerta específica según el tipo de error
        try {
          const { emitToUserIG } = await import('./instagramService.js');
          
          if (isSessionExpired) {
            console.error(`🚨 [Instagram Bot] SESIÓN EXPIRADA para usuario ${userId}`);
            emitToUserIG(userId, 'instagram:alert', {
              type: 'session_expired',
              severity: 'error',
              message: 'Sesión de Instagram expirada',
              description: 'Tu sesión de Instagram ha expirado o fue cerrada. Por favor, haz login nuevamente desde el panel de Instagram.',
              action_required: true,
              timestamp: Date.now()
            });
            
            // Marcar sesión como desconectada
            botData.igService.logged = false;
          } else if (isRateLimit) {
            console.error(`🚨 [Instagram Bot] RATE LIMIT alcanzado para usuario ${userId}`);
            emitToUserIG(userId, 'instagram:alert', {
              type: 'rate_limit',
              severity: 'warning',
              message: 'Rate limit de Instagram alcanzado',
              description: 'Instagram está limitando tus acciones. Espera 1-2 horas antes de continuar.',
              action_required: true,
              wait_time: '1-2 horas',
              timestamp: Date.now()
            });
          } else if (isServerError) {
            console.error(`🚨 [Instagram Bot] Error de servidor de Instagram (${errorStatus})`);
            emitToUserIG(userId, 'instagram:alert', {
              type: 'instagram_server_error',
              severity: 'warning',
              message: 'Instagram temporalmente no disponible',
              description: `Instagram está devolviendo error ${errorStatus}. Esto puede ser temporal. El bot intentará de nuevo automáticamente.`,
              error_status: errorStatus,
              timestamp: Date.now()
            });
          } else {
            // Error genérico
            emitToUserIG(userId, 'instagram:alert', {
              type: 'unknown_error',
              severity: 'error',
              message: 'Error obteniendo mensajes',
              description: `Error: ${errorMsg}`,
              timestamp: Date.now()
            });
          }
        } catch (alertError) {
          console.error(`⚠️ [Instagram Bot] Error emitiendo alerta: ${alertError.message}`);
        }
        
        return;
      }
      
      if (threads.length === 0) {
        console.log(`📭 [Instagram Bot] No hay conversaciones en inbox para ${userId}`);
      } else {
        console.log(`📥 [Instagram Bot] ${threads.length} conversaciones encontradas para ${userId}`);
        
        // Procesar cada conversación
        for (const thread of threads) {
          if (thread.last_message && thread.last_message.user_id !== botData.igService.igUserId) {
            const sender = thread.users?.find(u => u.pk === thread.last_message.user_id);
            const senderUsername = sender?.username || 'Usuario';
            const senderPk = sender?.pk;
            const isSenderPrivate = sender?.is_private || false;
            
            // Crear ID único más robusto para evitar duplicados
            // Usar thread_id, message_id, user_id y timestamp para máxima unicidad
            const messageTimestamp = thread.last_message.timestamp || thread.last_message.timestamp_us || Date.now() * 1000;
            const messageId = `${thread.thread_id}_${thread.last_message.id}_${thread.last_message.user_id}_${messageTimestamp}`;
            
            // También crear un ID alternativo usando el texto del mensaje (para detectar mensajes idénticos)
            const messageTextForId = (thread.last_message.text || '').substring(0, 50).trim().replace(/\s+/g, ' '); // Primeros 50 caracteres normalizados
            const alternativeMessageId = `${thread.thread_id}_${senderUsername}_${messageTextForId}_${thread.last_message.user_id}`;
            
            // Verificar si ya procesamos este mensaje (por ID o por contenido)
            const alreadyProcessed = botData.processedMessages.has(messageId) || 
                                   botData.processedMessages.has(alternativeMessageId);
            
            if (alreadyProcessed) {
              // Log solo cuando es necesario para debugging
              if (thread.last_message.id) {
                console.log(`⏭️  [Instagram Bot] Mensaje ya procesado, omitiendo: ${messageId.substring(0, 80)}...`);
              }
              continue; // Omitir este mensaje, ya fue procesado
            }
            
            // Alerta: Detectar si el remitente tiene cuenta privada
            if (isSenderPrivate) {
              console.log(`🔒 [Instagram Bot] Alerta: Cuenta privada detectada: @${senderUsername}`);
              // Importar la función de emisión de alertas
              try {
                const { emitToUserIG } = await import('./instagramService.js');
                emitToUserIG(userId, 'instagram:alert', {
                  type: 'private_account_message',
                  severity: 'info',
                  message: `Mensaje recibido de cuenta privada: @${senderUsername}`,
                  description: 'Has recibido un mensaje de una cuenta privada. Puede que sea un mensaje importante de un usuario que te sigue.',
                  username: senderUsername,
                  pk: senderPk,
                  is_private: true,
                  timestamp: Date.now()
                });
              } catch (alertError) {
                console.log(`⚠️ [Instagram Bot] Error emitiendo alerta: ${alertError.message}`);
              }
            }
            
            // Verificar si debemos responder (anti-detección)
            if (this.isSafeToRespond(userId) && this.shouldRespond(userId)) {
              console.log(`\n💬 [Instagram Bot] Nuevo mensaje para ${userId}:`);
              console.log(`   De: @${senderUsername}${isSenderPrivate ? ' (🔒 Cuenta privada)' : ''}`);
              
              let messageText = thread.last_message.text || '';
              console.log(`   Texto: "${messageText}"`);
              
              // DEBUG: Ver estructura completa del mensaje
              console.log(`🔍 [DEBUG] Estructura del mensaje:`, JSON.stringify(thread.last_message, null, 2));
              
              // Detectar tipo de medio en el mensaje
              let mediaType = null;
              let mediaContent = null;
              let processedMessage = messageText;
              
              // Instagram puede enviar diferentes tipos de medios
              if (thread.last_message.media) {
                const media = thread.last_message.media;
                console.log(`🔍 [DEBUG] Media detectado:`, JSON.stringify(media, null, 2));
                
                if (media.media_type === 1) {
                  // Imagen
                  mediaType = 'image';
                  mediaContent = media.image_versions2?.candidates?.[0]?.url || null;
                  console.log(`📸 [Instagram Bot] Imagen detectada: ${mediaContent}`);
                  
                  // Procesar imagen con visión AI
                  const imageResult = await this.processImage(mediaContent, messageText);
                  if (imageResult.success) {
                    processedMessage = imageResult.message;
                  }
                  
                } else if (media.media_type === 2) {
                  // Video
                  mediaType = 'video';
                  mediaContent = media.video_versions?.[0]?.url || null;
                  console.log(`🎥 [Instagram Bot] Video detectado: ${mediaContent}`);
                  
                  // Procesar video
                  const videoResult = await this.processVideo(mediaContent, messageText);
                  if (videoResult.success) {
                    processedMessage = videoResult.message;
                  }
                  
                } else if (media.media_type === 3) {
                  // Audio
                  mediaType = 'audio';
                  mediaContent = media.audio?.audio_src || null;
                  console.log(`🎵 [Instagram Bot] Audio detectado: ${mediaContent}`);
                  
                  // Procesar audio con transcripción
                  const audioResult = await this.processAudio(mediaContent, messageText);
                  if (audioResult.success) {
                    processedMessage = audioResult.message;
                  }
                }
              }
              
              // Instagram también puede enviar mensajes de voz como "voice_media"
              if (thread.last_message.voice_media) {
                console.log(`🎤 [Instagram Bot] Mensaje de voz detectado!`);
                console.log(`🔍 [DEBUG] Voice media:`, JSON.stringify(thread.last_message.voice_media, null, 2));
                
                mediaType = 'audio';
                const voiceMedia = thread.last_message.voice_media;
                mediaContent = voiceMedia.media?.audio?.audio_src || null;
                
                if (mediaContent) {
                  console.log(`🎵 [Instagram Bot] URL de audio de voz: ${mediaContent}`);
                  
                  // Procesar audio de voz con transcripción
                  const audioResult = await this.processAudio(mediaContent, messageText);
                  if (audioResult.success) {
                    processedMessage = audioResult.message;
                  }
                } else {
                  console.log(`⚠️ [Instagram Bot] No se pudo extraer URL del mensaje de voz`);
                }
              }
              
              // También verificar si el item_type es "voice_media"
              if (thread.last_message.item_type === 'voice_media') {
                console.log(`🎤 [Instagram Bot] item_type es voice_media!`);
                console.log(`🔍 [DEBUG] Mensaje completo:`, JSON.stringify(thread.last_message, null, 2));
              }
              
              // Simular lectura del mensaje (más humano)
              console.log('👀 [Instagram Bot] Simulando lectura del mensaje...');
              await this.simulateReading(processedMessage.length);
              
              // Obtener historial de la conversación para contexto
              // Intentar primero por thread_id, luego por username
              let history = botData.conversationHistory?.get(thread.thread_id) || [];
              
              // Si no hay historial por thread_id, buscar por username del remitente
              if (history.length === 0 && senderUsername) {
                // Buscar en el bot data
                const historyByUsername = botData.conversationHistory?.get(senderUsername);
                if (historyByUsername && historyByUsername.length > 0) {
                  history = historyByUsername;
                  console.log(`📚 [Instagram Bot] Historial encontrado por username (${senderUsername}) con ${history.length} mensajes previos`);
                  // Migrar el historial al thread_id para futuras referencias
                  botData.conversationHistory.set(thread.thread_id, history);
                } else {
                  // También buscar en la sesión de Instagram
                  try {
                    if (botData.igService && botData.igService.conversationHistory) {
                      const sessionHistory = botData.igService.conversationHistory.get(senderUsername);
                      if (sessionHistory && sessionHistory.length > 0) {
                        history = sessionHistory;
                        console.log(`📚 [Instagram Bot] Historial encontrado en sesión por username (${senderUsername}) con ${history.length} mensajes previos`);
                        // Migrar al bot
                        botData.conversationHistory.set(thread.thread_id, history);
                      }
                    }
                  } catch (sessionError) {
                    console.log(`⚠️ [Instagram Bot] Error buscando historial en sesión: ${sessionError.message}`);
                  }
                }
              }
              
              // Si hay historial, mostrar información
              if (history.length > 0) {
                const initialMsg = history.find(m => m.isInitialMessage);
                if (initialMsg) {
                  console.log(`📖 [Instagram Bot] Continuando conversación iniciada con mensaje: "${initialMsg.content.substring(0, 50)}..."`);
                }
                console.log(`📚 [Instagram Bot] Contexto disponible: ${history.length} mensajes previos en la conversación`);
              }
              
              // Agregar mensaje del usuario al historial (con contenido procesado)
              history.push({
                role: 'user',
                content: processedMessage,
                timestamp: Date.now(),
                mediaType: mediaType,
                username: senderUsername
              });
              
              // Obtener información del thread para contexto adicional
              const threadContext = {
                threadId: thread.thread_id,
                isGroup: thread.thread_type === 'group',
                users: thread.users?.map(u => ({ username: u.username, fullName: u.full_name })) || []
              };
              
              // Si es un audio, responder con audio usando ElevenLabs
              if (mediaType === 'audio' && mediaContent) {
                console.log(`🎤 [Instagram Bot] Audio detectado, respondiendo con audio usando ElevenLabs`);
                
                try {
                  // Usar la función handleIncomingAudioWithAI que transcribe, genera respuesta y envía como audio
                  const audioResult = await botData.igService.handleIncomingAudioWithAI({
                    threadId: thread.thread_id,
                    audioUrl: mediaContent,
                    transcribeFunction: transcribeAudioBuffer,
                    aiFunction: async (transcription) => {
                      // Generar respuesta usando la personalidad
                      const aiResponse = await this.generateAIResponse(userId, transcription, history, 'audio', mediaContent, { threadContext });
                      return aiResponse;
                    }
                  });
                  
                  if (audioResult && audioResult.respuesta) {
                    console.log(`✅ [Instagram Bot] Respuesta de audio enviada exitosamente para ${userId}`);
                    const aiResponse = audioResult.respuesta;
                    
                    // Agregar respuesta del bot al historial
                    history.push({
                      role: 'assistant',
                      content: aiResponse,
                      timestamp: Date.now(),
                      mediaType: 'audio'
                    });
                    
                    // Guardar historial actualizado
                    if (!botData.conversationHistory) {
                      botData.conversationHistory = new Map();
                    }
                    const savedHistory = history.slice(-50);
                    botData.conversationHistory.set(thread.thread_id, savedHistory);
                    if (senderUsername) {
                      botData.conversationHistory.set(senderUsername, savedHistory);
                    }
                    
                    // Marcar mensaje como procesado
                    botData.processedMessages.add(messageId);
                    if (alternativeMessageId) {
                      botData.processedMessages.add(alternativeMessageId);
                    }
                    
                    // Guardar en la sesión
                    if (botData.igService && botData.igService.processedMessages) {
                      botData.igService.processedMessages.add(messageId);
                      if (alternativeMessageId) {
                        botData.igService.processedMessages.add(alternativeMessageId);
                      }
                    }
                    
                    // Guardar inmediatamente en archivo
                    if (botData.igService && typeof botData.igService.saveSession === 'function') {
                      await botData.igService.saveSession();
                    }
                    
                    this.recordMessageSent(userId);
                    console.log(`✅ [Instagram Bot] Mensaje de audio marcado como procesado: ${messageId.substring(0, 80)}...`);
                    
                    // Saltar al final del procesamiento (no continuar con flujo de texto)
                    console.log('   ' + '─'.repeat(50));
                    const delay = this.getHumanDelay();
                    console.log(`⏳ [Instagram Bot] Esperando ${delay/1000}s (comportamiento humano)...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Salir de este mensaje y continuar con el siguiente
                  } else {
                    throw new Error('No se pudo generar respuesta de audio');
                  }
                } catch (audioError) {
                  console.log(`❌ [Instagram Bot] Error procesando audio, fallback a texto: ${audioError.message}`);
                  console.log(`   Stack trace: ${audioError.stack}`);
                  // Fallback: procesar como texto normal (continúa con el flujo normal más abajo)
                  // Cambiar mediaType a null para que se procese como texto normal
                  mediaType = null;
                  mediaContent = null;
                }
              }
              
              // Flujo normal para texto/imágenes/videos (o fallback de audio)
              if (mediaType !== 'audio' || !mediaContent) {
                // Flujo normal para texto/imágenes/videos
                // Generar respuesta con IA usando la personalidad del bot activo
                // La personalidad ya está cargada en botData.personalityData
                console.log(`🧠 [Instagram Bot] Generando respuesta con personalidad "${botData.personalityData?.nombre || 'desconocida'}" (ID: ${botData.personalityData?.id || 'N/A'})`);
                
                const aiResponse = await this.generateAIResponse(userId, processedMessage, history, mediaType, mediaContent, { threadContext });
                
                console.log(`   Respuesta IA: "${aiResponse.substring(0, 100)}..."`);
                
                // Simular escritura humana (según longitud de respuesta)
                console.log('⌨️  [Instagram Bot] Simulando escritura...');
                await this.simulateTyping(aiResponse.length);
                
                console.log('📤 [Instagram Bot] Enviando respuesta...');
                try {
                  await botData.igService.replyText({
                    threadId: thread.thread_id,
                    text: aiResponse
                  });
                  
                  console.log(`✅ [Instagram Bot] Respuesta enviada exitosamente para ${userId}`);
                
                // Agregar respuesta del bot al historial
                history.push({
                  role: 'assistant',
                  content: aiResponse,
                  timestamp: Date.now()
                });
                
                // Guardar historial actualizado tanto por thread_id como por username (para continuidad)
                if (!botData.conversationHistory) {
                  botData.conversationHistory = new Map();
                }
                const savedHistory = history.slice(-50); // Mantener últimos 50 mensajes
                botData.conversationHistory.set(thread.thread_id, savedHistory);
                if (senderUsername) {
                  botData.conversationHistory.set(senderUsername, savedHistory);
                }
                console.log(`💾 [Instagram Bot] Historial actualizado: ${savedHistory.length} mensajes guardados`);
                
                // Marcar mensaje como procesado (ambos IDs para máxima protección)
                botData.processedMessages.add(messageId);
                if (alternativeMessageId) {
                  botData.processedMessages.add(alternativeMessageId);
                }
                
                // También guardar en la sesión de Instagram para persistencia
                if (botData.igService && !botData.igService.processedMessages) {
                  botData.igService.processedMessages = new Set();
                }
                if (botData.igService && botData.igService.processedMessages) {
                  botData.igService.processedMessages.add(messageId);
                  if (alternativeMessageId) {
                    botData.igService.processedMessages.add(alternativeMessageId);
                  }
                }
                
                // Guardar inmediatamente en archivo para persistencia
                if (botData.igService && typeof botData.igService.saveSession === 'function') {
                  await botData.igService.saveSession();
                }
                
                this.recordMessageSent(userId);
                console.log(`✅ [Instagram Bot] Mensaje marcado como procesado: ${messageId.substring(0, 80)}...`);
                
              } catch (replyError) {
                console.log(`❌ [Instagram Bot] Error enviando respuesta para ${userId}: ${replyError.message}`);
              }
              
              console.log('   ' + '─'.repeat(50));
              
              // Delay humano entre respuestas
              const delay = this.getHumanDelay();
              console.log(`⏳ [Instagram Bot] Esperando ${delay/1000}s (comportamiento humano)...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }
        }
      }
      
    } catch (error) {
      console.log(`❌ [Instagram Bot] Error verificando mensajes para ${userId}:`, error.message);
    }
  }

  // Verificar nuevos comentarios en posts del usuario
  async checkForNewComments(userId) {
    try {
      const botData = this.activeBots.get(userId);
      if (!botData || !botData.isRunning) {
        return;
      }

      console.log(`🔍 [Instagram Bot] Verificando nuevos comentarios para ${userId}...`);
      console.log(`   Personalidad activa: ${botData.personalityData?.nombre} (ID: ${botData.personalityData?.id})`);
      
      try {
        // Obtener posts recientes del usuario
        const user = await botData.igService.ig.account.currentUser();
        const userId_ig = user.pk;
        const userFeed = botData.igService.ig.feed.user(userId_ig);
        const posts = await userFeed.items();

        console.log(`📸 [Instagram Bot] ${posts.length} posts encontrados para verificar comentarios`);

        // Procesar los primeros 5 posts más recientes
        for (const post of posts.slice(0, 5)) {
          try {
            const commentsFeed = botData.igService.ig.feed.mediaComments(post.id);
            const comments = await commentsFeed.items();

            console.log(`💬 [Instagram Bot] Post ${post.id}: ${comments.length} comentarios encontrados`);
            
            // Log de comentarios ya procesados para debugging
            if (botData.processedComments && botData.processedComments.size > 0) {
              const processedForThisPost = Array.from(botData.processedComments).filter(id => id.startsWith(post.id));
              if (processedForThisPost.length > 0) {
                console.log(`   📋 ${processedForThisPost.length} comentarios ya procesados anteriormente para este post`);
              }
            }

            // Procesar cada comentario
            for (const comment of comments) {
              // Verificar que no sea nuestro propio comentario
              if (comment.user.pk === userId_ig) {
                continue;
              }

              // Asegurar que processedComments existe
              if (!botData.processedComments) {
                botData.processedComments = new Set();
              }
              
              // También verificar en la sesión de Instagram
              if (botData.igService && !botData.igService.processedComments) {
                botData.igService.processedComments = new Set();
              }

              // Crear ID único más robusto para el comentario
              // Usar post_id, comment_pk, user_pk y timestamp si está disponible
              const commentTimestamp = comment.created_at || comment.created_at_utc || comment.timestamp || Date.now();
              const commentId = `${post.id}_${comment.pk}_${comment.user.pk}_${commentTimestamp}`;
              
              // También crear un ID alternativo usando el texto del comentario (para detectar comentarios idénticos)
              const commentTextForId = (comment.text || '').substring(0, 50).trim().replace(/\s+/g, ' ');
              const alternativeCommentId = `${post.id}_${comment.user.username}_${commentTextForId}_${comment.user.pk}`;
              
              // Verificar si ya procesamos este comentario (por ID o por contenido)
              const alreadyProcessed = botData.processedComments.has(commentId) || 
                                     botData.processedComments.has(alternativeCommentId) ||
                                     (botData.igService?.processedComments?.has(commentId)) ||
                                     (botData.igService?.processedComments?.has(alternativeCommentId));

              if (alreadyProcessed) {
                // Log para debugging
                console.log(`⏭️  [Instagram Bot] Comentario ya procesado, omitiendo: ${comment.user.username} en post ${post.id.substring(0, 30)}...`);
                continue; // Omitir este comentario, ya fue procesado
              }

              // Verificar si debemos responder (anti-detección)
              if (this.isSafeToRespond(userId) && this.shouldRespond(userId)) {
                console.log(`\n💬 [Instagram Bot] Nuevo comentario en post ${post.id}:`);
                console.log(`   De: @${comment.user.username}`);
                console.log(`   Texto: "${comment.text}"`);

                // Simular lectura del comentario
                console.log('👀 [Instagram Bot] Simulando lectura del comentario...');
                await this.simulateReading(comment.text.length);

                // Obtener historial de comentarios para contexto
                const commentHistory = botData.commentHistory?.get(post.id) || [];

                // Obtener información del post para contexto
                const postCaption = post.caption?.text || '';
                const postContext = {
                  postId: post.id,
                  caption: postCaption,
                  likeCount: post.like_count || 0,
                  commentCount: post.comment_count || 0,
                  mediaType: post.media_type || 1, // 1=photo, 2=video, 8=carousel
                  takenAt: post.taken_at || Date.now() / 1000
                };

                // Construir mensaje con contexto completo
                const userMessageWithContext = `Comentario en mi publicación:

PUBLICACIÓN:
${postCaption ? `📝 Caption: "${postCaption}"` : '📸 Publicación sin texto'}
📊 Likes: ${postContext.likeCount} | Comentarios: ${postContext.commentCount}

COMENTARIO:
@${comment.user.username}: "${comment.text}"

Responde de manera apropiada considerando el contexto de la publicación y mi personalidad.`;

                // Agregar comentario al historial con contexto
                commentHistory.push({
                  role: 'user',
                  content: comment.text,
                  username: comment.user.username,
                  timestamp: Date.now(),
                  postContext: postContext
                });

                // Generar respuesta con IA incluyendo contexto del post
                const aiResponse = await this.generateAIResponse(
                  userId,
                  userMessageWithContext,
                  commentHistory,
                  null,
                  null,
                  { postContext: postContext } // Pasar contexto adicional del post
                );

                console.log(`   Respuesta IA: "${aiResponse.substring(0, 100)}..."`);

                // Simular escritura
                console.log('⌨️  [Instagram Bot] Simulando escritura...');
                await this.simulateTyping(aiResponse.length);

                console.log('📤 [Instagram Bot] Enviando DM a quien comentó...');
                try {
                  // Enviar DM a la persona que comentó
                  const sendResult = await botData.igService.sendMessage(comment.user.username, aiResponse);

                  if (sendResult.success) {
                    console.log(`✅ [Instagram Bot] DM enviado a @${comment.user.username} por su comentario en post ${post.id}`);

                    // Agregar respuesta al historial
                    commentHistory.push({
                      role: 'assistant',
                      content: aiResponse,
                      timestamp: Date.now()
                    });

                    // Guardar historial
                    if (!botData.commentHistory) {
                      botData.commentHistory = new Map();
                    }
                    botData.commentHistory.set(post.id, commentHistory.slice(-20)); // Mantener últimos 20 comentarios

                    // Marcar comentario como procesado (ambos IDs para máxima protección)
                    botData.processedComments.add(commentId);
                    if (alternativeCommentId) {
                      botData.processedComments.add(alternativeCommentId);
                    }
                    
                    // También guardar en la sesión de Instagram para persistencia
                    if (!botData.igService.processedComments) {
                      botData.igService.processedComments = new Set();
                    }
                    botData.igService.processedComments.add(commentId);
                    if (alternativeCommentId) {
                      botData.igService.processedComments.add(alternativeCommentId);
                    }
                    
                    // Guardar inmediatamente en archivo para persistencia
                    if (botData.igService && typeof botData.igService.saveSession === 'function') {
                      await botData.igService.saveSession();
                    }
                    
                    this.recordMessageSent(userId);
                    console.log(`✅ [Instagram Bot] Comentario marcado como procesado: ${commentId}`);
                    console.log(`   Usuario: @${comment.user.username} | Post: ${post.id.substring(0, 30)}...`);
                  } else {
                    console.log(`❌ [Instagram Bot] Error enviando DM: ${sendResult.error}`);
                  }

                } catch (replyError) {
                  console.log(`❌ [Instagram Bot] Error enviando DM a @${comment.user.username}: ${replyError.message}`);
                  console.log(`   Stack: ${replyError.stack}`);
                }

                console.log('   ' + '─'.repeat(50));

                // Delay humano entre respuestas
                const delay = this.getHumanDelay();
                console.log(`⏳ [Instagram Bot] Esperando ${delay/1000}s (comportamiento humano)...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }

            // Delay entre posts
            await new Promise(resolve => setTimeout(resolve, 3000));

          } catch (postError) {
            console.log(`⚠️ [Instagram Bot] Error procesando post ${post.id}: ${postError.message}`);
          }
        }

      } catch (error) {
        console.log(`❌ [Instagram Bot] Error obteniendo comentarios: ${error.message}`);
        
        // Detectar si la sesión expiró también para comentarios
        const errorMsg = error.message || '';
        const errorStatus = error.response?.status || error.status || 0;
        
        const isSessionExpired = errorStatus === 403 || 
                                  errorStatus === 401 || 
                                  errorMsg.includes('login_required') ||
                                  errorMsg.includes('Forbidden');
        
        const isRateLimit = errorStatus === 429 || 
                            errorMsg.includes('rate') || 
                            errorMsg.includes('spam') ||
                            errorMsg.includes('too many');
        
        if (isSessionExpired) {
          console.error(`🚨 [Instagram Bot] SESIÓN EXPIRADA (comentarios) para usuario ${userId}`);
          try {
            const { emitToUserIG } = await import('./instagramService.js');
            emitToUserIG(userId, 'instagram:alert', {
              type: 'session_expired',
              severity: 'error',
              message: 'Sesión de Instagram expirada',
              description: 'Tu sesión de Instagram ha expirado o fue cerrada. Por favor, haz login nuevamente.',
              action_required: true,
              timestamp: Date.now()
            });
            botData.igService.logged = false;
          } catch (alertError) {
            console.error(`⚠️ [Instagram Bot] Error emitiendo alerta: ${alertError.message}`);
          }
        } else if (isRateLimit) {
          console.error(`🚨 [Instagram Bot] RATE LIMIT alcanzado (comentarios) para usuario ${userId}`);
          try {
            const { emitToUserIG } = await import('./instagramService.js');
            emitToUserIG(userId, 'instagram:alert', {
              type: 'rate_limit',
              severity: 'warning',
              message: 'Rate limit de Instagram alcanzado',
              description: 'Instagram está limitando tus acciones. Espera 1-2 horas antes de continuar.',
              action_required: true,
              wait_time: '1-2 horas',
              timestamp: Date.now()
            });
          } catch (alertError) {
            console.error(`⚠️ [Instagram Bot] Error emitiendo alerta: ${alertError.message}`);
          }
        }
      }

    } catch (error) {
      console.log(`❌ [Instagram Bot] Error verificando comentarios para ${userId}:`, error.message);
    }
  }

  // Activar bot para un usuario
  async activateBotForUser(userId, credentials, personalityId = 872) {
    try {
      console.log(`🚀 [Instagram Bot] Activando bot para usuario ${userId}...`);
      
      const initialized = await this.initializeBotForUser(userId, credentials, personalityId);
      if (!initialized) {
        console.log(`❌ [Instagram Bot] No se pudo inicializar el bot para ${userId}`);
        return false;
      }
      
      // Obtener el botData recién inicializado
      const botData = this.activeBots.get(userId);
      
      // SIEMPRE iniciar monitoreo global si hay bots activos
      if (this.activeBots.size > 0) {
        if (!this.isGlobalRunning) {
          console.log(`🚀 [Instagram Bot] Iniciando monitoreo global para ${this.activeBots.size} bot(s) activo(s)...`);
          await this.startGlobalMonitoring();
        } else {
          console.log(`ℹ️ [Instagram Bot] Monitoreo global ya está corriendo (${this.activeBots.size} bot(s) activo(s))`);
        }
      }
      
      console.log(`✅ [Instagram Bot] Bot activado para ${userId}`);
      console.log(`📊 [Instagram Bot] Total de bots activos: ${this.activeBots.size}`);
      if (botData && botData.personalityData) {
        console.log(`🎭 [Instagram Bot] Personalidad: "${botData.personalityData.nombre}" (ID: ${botData.personalityData.id})`);
      } else {
        console.log(`⚠️ [Instagram Bot] Bot activado pero sin personalidad configurada`);
      }
      
      return true;
      
    } catch (error) {
      console.error(`❌ [Instagram Bot] Error activando bot para ${userId}:`, error.message);
      return false;
    }
  }

  // Desactivar bot para un usuario
  async deactivateBotForUser(userId) {
    try {
      console.log(`🛑 [Instagram Bot] Desactivando bot para usuario ${userId}...`);
      
      const botData = this.activeBots.get(userId);
      if (botData) {
        botData.isRunning = false;
        this.activeBots.delete(userId);
        console.log(`✅ [Instagram Bot] Bot desactivado para ${userId}`);
      }
      
      // Si no hay más bots activos, detener monitoreo global
      if (this.activeBots.size === 0) {
        await this.stopGlobalMonitoring();
      }
      
      return true;
      
    } catch (error) {
      console.error(`❌ [Instagram Bot] Error desactivando bot para ${userId}:`, error.message);
      return false;
    }
  }

  // Actualizar personalidad del bot activo
  async updateBotPersonality(userId, personalityId) {
    try {
      console.log(`🔄 [Instagram Bot] Actualizando personalidad para ${userId}...`);
      
      const botData = this.activeBots.get(userId);
      if (!botData) {
        console.log(`❌ [Instagram Bot] Bot no está activo para ${userId}`);
        console.log(`ℹ️ [Instagram Bot] Bots activos: ${Array.from(this.activeBots.keys()).join(', ')}`);
        return false;
      }
      
      // Cargar nueva personalidad
      let personalityData;
      try {
        console.log(`🧠 [Instagram Bot] Cargando nueva personalidad ${personalityId}...`);
        personalityData = await loadPersonalityData(personalityId, userId);
        console.log(`✅ [Instagram Bot] Nueva personalidad cargada: ${personalityData.nombre}`);
      } catch (personalityError) {
        console.error(`❌ [Instagram Bot] Error cargando personalidad:`, personalityError.message);
        return false;
      }
      
      // Actualizar personalidad en el bot activo
      botData.personalityData = personalityData;
      
      console.log(`✅ [Instagram Bot] Personalidad actualizada para ${userId}: ${personalityData.nombre} (ID: ${personalityId})`);
      return true;
      
    } catch (error) {
      console.error(`❌ [Instagram Bot] Error actualizando personalidad para ${userId}:`, error.message);
      return false;
    }
  }

  // Iniciar monitoreo global
  async startGlobalMonitoring() {
    if (this.isGlobalRunning) {
      console.log('ℹ️ [Instagram Bot] Monitoreo global ya está corriendo');
      return;
    }
    
    if (this.activeBots.size === 0) {
      console.log('⚠️ [Instagram Bot] No hay bots activos, no se puede iniciar monitoreo global');
      return;
    }
    
    console.log('🚀 [Instagram Bot] Iniciando monitoreo global...');
    console.log(`   🤖 Bots activos: ${this.activeBots.size}`);
    console.log('   📥 Verificando DMs automáticamente cada 45 segundos');
    console.log('   💬 Verificando comentarios automáticamente cada 2 minutos');
    this.isGlobalRunning = true;
    
    // Verificación inicial
    for (const [userId, botData] of this.activeBots) {
      if (botData.isRunning) {
        await this.checkForNewMessages(userId);
        await this.checkForNewComments(userId);
      }
    }
    
    // Configurar verificación periódica de DMs
    this.globalCheckInterval = setInterval(async () => {
      if (this.isGlobalRunning) {
        for (const [userId, botData] of this.activeBots) {
          if (botData.isRunning) {
            await this.checkForNewMessages(userId);
          }
        }
      }
    }, 45000); // 45 segundos para DMs
    
    // Configurar verificación periódica de comentarios (más lento, cada 2 minutos)
    this.commentsCheckInterval = setInterval(async () => {
      if (this.isGlobalRunning) {
        for (const [userId, botData] of this.activeBots) {
          if (botData.isRunning) {
            await this.checkForNewComments(userId);
          }
        }
      }
    }, 120000); // 2 minutos para comentarios
    
    console.log('✅ [Instagram Bot] Monitoreo global iniciado');
  }

  // Detener monitoreo global
  async stopGlobalMonitoring() {
    console.log('🛑 [Instagram Bot] Deteniendo monitoreo global...');
    this.isGlobalRunning = false;
    
    if (this.globalCheckInterval) {
      clearInterval(this.globalCheckInterval);
      this.globalCheckInterval = null;
    }
    
    if (this.commentsCheckInterval) {
      clearInterval(this.commentsCheckInterval);
      this.commentsCheckInterval = null;
    }
    
    console.log('✅ [Instagram Bot] Monitoreo global detenido');
  }

  // Obtener estado del bot para un usuario
  getBotStatusForUser(userId) {
    const botData = this.activeBots.get(userId);
    if (!botData) {
      return {
        isActive: false,
        hasService: false,
        hasPersonality: false,
        personalityData: null,
        messagesSent: 0,
        lastActivity: 0
      };
    }
    
    return {
      isActive: botData.isRunning,
      hasService: !!botData.igService,
      hasPersonality: !!botData.personalityData,
      personalityData: botData.personalityData,
      messagesSent: botData.processedMessages.size,
      lastActivity: botData.lastResponseTime || Date.now()
    };
  }

  // Obtener estado global
  getGlobalStatus() {
    return {
      isGlobalRunning: this.isGlobalRunning,
      activeBots: this.activeBots.size,
      botUsers: Array.from(this.activeBots.keys())
    };
  }
}

// Crear instancia singleton
const instagramBotService = new InstagramBotService();

// Exportar funciones específicas
export const activateBotForUser = (userId, credentials, personalityId) => 
  instagramBotService.activateBotForUser(userId, credentials, personalityId);

export const deactivateBotForUser = (userId) => 
  instagramBotService.deactivateBotForUser(userId);

export const startGlobalMonitoring = () => 
  instagramBotService.startGlobalMonitoring();

export const stopGlobalMonitoring = () => 
  instagramBotService.stopGlobalMonitoring();

export default instagramBotService;