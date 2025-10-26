import axios from 'axios';
import { fetchPersonalityInstructions } from '../controllers/personalityController.js';
import { analyzeImageUrlWithVision } from './googleVisionService.js';
import { getOrCreateIGSession } from './instagramService.js';
import { generateBotResponse, transcribeAudioBuffer } from './openaiService.js';

class InstagramBotService {
  constructor() {
    this.activeBots = new Map(); // Mapa de bots activos por usuario
    this.globalCheckInterval = null;
    this.isGlobalRunning = false;
    
    // Configuración global del bot con medidas anti-detección mejoradas
    this.config = {
      name: 'Asistente Uniclick',
      antiDetection: {
        minDelay: 5000,      // 5 segundos mínimo entre respuestas (más humano)
        maxDelay: 25000,     // 25 segundos máximo entre respuestas (más variado)
        typingDelay: 3000,   // 3 segundos simulando escritura
        readingDelay: 1500,  // 1.5 segundos simulando lectura del mensaje
        humanPatterns: true, // Usar patrones humanos
        randomEmojis: true,  // Emojis aleatorios
        variedResponses: true, // Respuestas variadas
        
        // Límites de actividad para parecer humano
        maxMessagesPerHour: 30,     // Máximo 30 mensajes por hora
        maxMessagesPerDay: 200,     // Máximo 200 mensajes por día
        quietHours: {               // Horas de "descanso" (menos actividad)
          enabled: true,
          start: 1,  // 1 AM
          end: 7     // 7 AM
        },
        
        // Variación de respuestas
        responseVariation: {
          enabled: true,
          skipChance: 0.05,  // 5% de probabilidad de no responder (parecer ocupado)
          delayMultiplier: 1.5 // Multiplicador de delay en horas tranquilas
        }
      }
    };
  }

  // Función para generar delay humano con variación según hora del día
  getHumanDelay() {
    const { minDelay, maxDelay, quietHours, responseVariation } = this.config.antiDetection;
    let delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    
    // Si estamos en horas tranquilas, aumentar el delay
    if (quietHours.enabled) {
      const currentHour = new Date().getHours();
      if (currentHour >= quietHours.start && currentHour < quietHours.end) {
        delay *= responseVariation.delayMultiplier;
        console.log(`🌙 [Anti-detección] Hora tranquila detectada, delay aumentado a ${delay/1000}s`);
      }
    }
    
    return delay;
  }

  // Función para simular lectura del mensaje (más humano)
  async simulateReading(messageLength) {
    const { readingDelay } = this.config.antiDetection;
    // Más largo el mensaje, más tiempo de "lectura"
    const readTime = readingDelay + (messageLength * 10); // 10ms por carácter
    await new Promise(resolve => setTimeout(resolve, Math.min(readTime, 5000))); // Máximo 5s
  }

  // Función para simular escritura humana (varía según longitud de respuesta)
  async simulateTyping(responseLength) {
    const { typingDelay } = this.config.antiDetection;
    // Más larga la respuesta, más tiempo de "escritura"
    const typeTime = typingDelay + (responseLength * 15); // 15ms por carácter
    await new Promise(resolve => setTimeout(resolve, Math.min(typeTime, 8000))); // Máximo 8s
  }

  // Función para verificar si debemos responder (anti-detección)
  shouldRespond(userId) {
    const { responseVariation } = this.config.antiDetection;
    
    // Pequeña probabilidad de "estar ocupado" y no responder
    if (responseVariation.enabled && Math.random() < responseVariation.skipChance) {
      console.log(`🤷 [Anti-detección] Simulando estar ocupado, no responder este mensaje`);
      return false;
    }
    
    return true;
  }

  // Función para verificar si es seguro responder (límites de actividad)
  isSafeToRespond(userId) {
    const botData = this.activeBots.get(userId);
    if (!botData) return false;
    
    const now = Date.now();
    const timeSinceLastResponse = now - botData.lastResponseTime;
    const minDelay = this.config.antiDetection.minDelay;
    
    // Verificar delay mínimo
    if (timeSinceLastResponse < minDelay) {
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
  async generateAIResponse(userId, userMessage, history = [], mediaType = null, mediaContent = null) {
    try {
      const botData = this.activeBots.get(userId);
      if (!botData) return 'Gracias por tu mensaje. ¿En qué puedo ayudarte?';
      
      console.log(`🧠 [Instagram Bot] Generando respuesta con IA para usuario ${userId}...`);
      
      // Detectar si hay contenido multimedia
      if (mediaType) {
        console.log(`📎 [Instagram Bot] Mensaje con medio detectado: ${mediaType}`);
      }
      
      // Usar el sistema de IA existente con soporte de medios
      if (botData.personalityData) {
        const response = await generateBotResponse({
          personality: botData.personalityData,
          userMessage: userMessage,
          userId: userId,
          history: history,
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
      
      const status = await igService.checkStatus();
      
      if (!status.connected) {
        console.log(`⏳ [Instagram Bot] No hay sesión activa para ${userId}, iniciando login...`);
        const loginResult = await igService.login({
          username: credentials.username,
          password: credentials.password
        });
        
        if (!loginResult.success) {
          console.log(`❌ [Instagram Bot] Error en login para ${userId}:`, loginResult.message);
          return false;
        }
        
        console.log(`✅ [Instagram Bot] Login exitoso para ${userId}`);
      } else {
        console.log(`✅ [Instagram Bot] Sesión ya activa para ${userId}`);
        console.log(`   Username: ${status.username}`);
      }
      
      // Cargar datos de personalidad
      let personalityData;
      try {
        console.log(`🧠 [Instagram Bot] Cargando personalidad para ${userId}...`);
        personalityData = await fetchPersonalityInstructions(personalityId, userId);
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
        lastResponseTime: 0,
        isRunning: true,
        credentials: credentials
      };
      
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
      
      // Obtener inbox de DMs
      const threads = await botData.igService.fetchInbox();
      
      if (threads.length === 0) {
        console.log(`📭 [Instagram Bot] No hay conversaciones en inbox para ${userId}`);
      } else {
        console.log(`📥 [Instagram Bot] ${threads.length} conversaciones encontradas para ${userId}`);
        
        // Procesar cada conversación
        for (const thread of threads) {
          if (thread.last_message && thread.last_message.user_id !== botData.igService.igUserId) {
            const sender = thread.users?.find(u => u.pk === thread.last_message.user_id);
            const senderUsername = sender?.username || 'Usuario';
            
            const messageId = `${thread.thread_id}_${thread.last_message.id}_${thread.last_message.user_id}`;
            
            // Verificar si debemos responder (anti-detección)
            if (!botData.processedMessages.has(messageId) && this.isSafeToRespond(userId) && this.shouldRespond(userId)) {
              console.log(`\n💬 [Instagram Bot] Nuevo mensaje para ${userId}:`);
              console.log(`   De: @${senderUsername}`);
              
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
              const history = botData.conversationHistory?.get(thread.thread_id) || [];
              
              // Agregar mensaje del usuario al historial (con contenido procesado)
              history.push({
                role: 'user',
                content: processedMessage,
                timestamp: Date.now(),
                mediaType: mediaType
              });
              
              // Generar respuesta con IA (con soporte de medios)
              const aiResponse = await this.generateAIResponse(userId, processedMessage, history, mediaType, mediaContent);
              
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
                
                // Guardar historial actualizado
                if (!botData.conversationHistory) {
                  botData.conversationHistory = new Map();
                }
                botData.conversationHistory.set(thread.thread_id, history.slice(-50)); // Mantener últimos 50 mensajes
                
                // Marcar mensaje como procesado y registrar envío
                botData.processedMessages.add(messageId);
                this.recordMessageSent(userId);
                
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
      
    } catch (error) {
      console.log(`❌ [Instagram Bot] Error verificando mensajes para ${userId}:`, error.message);
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
      
      // Iniciar verificación global si no está corriendo
      if (!this.isGlobalRunning) {
        await this.startGlobalMonitoring();
      }
      
      console.log(`✅ [Instagram Bot] Bot activado para ${userId}`);
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
        personalityData = await fetchPersonalityInstructions(personalityId, userId);
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
      return;
    }
    
    console.log('🚀 [Instagram Bot] Iniciando monitoreo global...');
    this.isGlobalRunning = true;
    
    // Verificación inicial
    for (const [userId, botData] of this.activeBots) {
      if (botData.isRunning) {
        await this.checkForNewMessages(userId);
      }
    }
    
    // Configurar verificación periódica
    this.globalCheckInterval = setInterval(async () => {
      if (this.isGlobalRunning) {
        for (const [userId, botData] of this.activeBots) {
          if (botData.isRunning) {
            await this.checkForNewMessages(userId);
          }
        }
      }
    }, 45000); // 45 segundos
    
    console.log('✅ [Instagram Bot] Monitoreo global iniciado');
  }

  // Detener monitoreo global
  async stopGlobalMonitoring() {
    console.log('🛑 [Instagram Bot] Deteniendo monitoreo global...');
    this.isGlobalRunning = false;
    
    if (this.globalCheckInterval) {
      clearInterval(this.globalCheckInterval);
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