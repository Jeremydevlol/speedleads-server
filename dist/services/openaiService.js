import OpenAI from 'openai';
import { fetchPersonalityInstructions } from '../controllers/personalityController.js';

// Initialize OpenAI client with optimized settings
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 25001, // 25 segundos timeout
  maxRetries: 1,  // Solo 1 reintento para mayor velocidad
});

// Validar variables de entorno críticas al inicializar
const validateEnvironment = () => {
  const requiredVars = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY
  };

  const missingVars = Object.entries(requiredVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    console.error('🚨 Variables de entorno faltantes para OpenAI Service:', missingVars);
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ No se puede funcionar en producción sin estas variables');
    }
    return false;
  }
  
  console.log('✅ Variables de entorno de OpenAI validadas correctamente');
  return true;
};

// Validar al cargar el módulo
const envValid = validateEnvironment();

// Función auxiliar para crear una "pausa".
// timeMs debe estar en milisegundos.
function delay(timeMs) {
  return new Promise(resolve => setTimeout(resolve, timeMs));
}

export async function generateBotResponse({ personality, userMessage, userId, history = [], mediaType = null, mediaContent = null }) {
    try {
        // Verificar variables de entorno antes de procesar
        if (!envValid) {
            console.error('❌ Variables de entorno no válidas para OpenAI Service');
            console.error('   - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'PRESENTE' : 'FALTANTE');
            console.error('   - DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY ? 'PRESENTE' : 'FALTANTE');
            return generateSimpleFallbackResponse(userMessage, personality);
        }

        if (!personality || !userMessage) {
            console.error('❌ Parámetros requeridos faltantes:', { 
                personality: !!personality, 
                personalityId: personality?.id,
                userMessage: !!userMessage,
                userMessageLength: userMessage?.length
            });
            return 'Lo siento, no pude procesar tu mensaje. ¿Podrías intentarlo de nuevo?';
        }

        // Obtener las instrucciones específicas de la personalidad
        if (process.env.NODE_ENV !== 'production') console.log(`🔍 Obteniendo instrucciones para personalidad ${personality.id} del usuario ${userId}`);
        
        let personalityData;
        try {
            personalityData = await fetchPersonalityInstructions(personality.id, userId);
            console.log('✅ Instrucciones de personalidad obtenidas:', {
                id: personalityData?.id,
                nombre: personalityData?.nombre,
                instruccionesLength: personalityData?.instrucciones?.length || 0,
                instruccionesPreview: personalityData?.instrucciones?.substring(0, 100) + '...'
            });
        } catch (fetchError) {
            console.error('❌ Error al obtener instrucciones de personalidad:', fetchError);
            console.error('   - PersonalityId:', personality.id);
            console.error('   - UserId:', userId);
            console.error('   - Stack:', fetchError.stack);
            
            // Usar datos básicos de la personalidad como fallback
            personalityData = {
                id: personality.id,
                nombre: personality.nombre || 'Asistente',
                empresa: personality.empresa || '',
                instrucciones: personality.instrucciones || 'Soy un asistente útil y amigable.',
                saludo: personality.saludo || '',
                category: personality.category || 'formal'
            };
            console.log('⚠️ Usando datos básicos de personalidad como fallback');
        }

        // Verificar que tenemos instrucciones válidas
        if (!personalityData || !personalityData.instrucciones) {
            console.error('❌ No se pudieron obtener instrucciones válidas para la personalidad');
            console.error('   - PersonalityData:', personalityData);
            return 'Lo siento, hay un problema con la configuración de mi personalidad. ¿Puedes contactar al administrador?';
        }

        // Analizar el contexto de la conversación (OPTIMIZADO - usar contexto completo)
        const conversationContext = analyzeConversationContext(history.slice(-20), userMessage); // Últimos 20 mensajes para contexto completo
        const currentTopic = conversationContext.currentTopic;
        const hasGreeted = conversationContext.hasGreeted;

        // Construir el historial de mensajes para el contexto (OPTIMIZADO PARA CONTEXTO COMPLETO)
        // Usar hasta 50 mensajes para mantener contexto completo de toda la conversación
        const initialHistory = history.slice(-50).map(msg => ({  
            role: msg.role || 'assistant', // Usar role directamente, fallback a assistant
            content: msg.content || msg.text_content || '', // Leer tanto content como text_content
            // Agregar contexto temporal para mejor memoria
            timestamp: msg.timestamp || msg.whatsapp_created_at || msg.created_at,
            position: msg.position || 0,
            isRecent: msg.isRecent || false,
            // Mantener compatibilidad con sender_type para funciones que lo necesiten
            sender_type: msg.sender_type || (msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'ia')
        }));

        // Analizar el historial completo para encontrar contenido multimedia relevante
        const recentMultimediaContent = initialHistory
            .filter(msg => msg.content && (
                msg.content.includes('[Contenido de imagen:') ||
                msg.content.includes('[Audio transcrito:') ||
                msg.content.includes('[Contenido de PDF:') ||
                msg.content.includes('[Contenido de documento Word:') ||
                msg.content.includes('[Contenido multimedia:')
            ))
            .slice(-8); // Últimos 8 mensajes con multimedia para mejor contexto

        // Ajustar el historial según si hay multimedia y contexto
        // Usar hasta 50 mensajes para mantener contexto completo
        const historyLimit = recentMultimediaContent.length > 0 ? 50 : 50;
        const messageHistory = initialHistory.slice(-historyLimit);

        console.log(`🧠 Historial optimizado: ${messageHistory.length} mensajes (${recentMultimediaContent.length} con multimedia)`);
        
        // Log detallado para verificar que TODOS los mensajes se lean correctamente
        console.log(`📖 VERIFICANDO LECTURA COMPLETA DE MENSAJES:`);
        messageHistory.forEach((msg, index) => {
            console.log(`   ${index + 1}. [${msg.role}] ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
        });

        // Detectar si hay contenido multimedia en el historial
        const hasSystemMessages = history.some(msg => msg.role === 'system' || msg.sender_type === 'system');
        const hasExtractedContent = history.some(msg => 
            (msg.role === 'system' || msg.sender_type === 'system') && 
            (msg.content?.length > 50 || msg.text_content?.length > 50)
        );

        // Determinar si el mensaje es sobre multimedia
        const isMediaMessage = mediaType || 
            userMessage.includes('Analiza la imagen') ||
            userMessage.includes('Analiza el pdf') || 
            userMessage.includes('Analiza el PDF') ||
            userMessage.includes('Analiza el documento') ||
            userMessage.includes('imagen adjunta') || 
            userMessage.includes('pdf adjunto') ||
            userMessage.includes('documento adjunto') ||
            userMessage.includes('Final de la imagen') ||
            userMessage.includes('Final del PDF') ||
            userMessage.includes('Final del documento Word') ||
            userMessage.includes('Final del audio') ||
            userMessage.includes('Audio recibido pero') ||
            userMessage.includes('Audio procesado pero') ||
            userMessage.includes('[Contenido de imagen:') ||
            userMessage.includes('[Contenido de PDF:') ||
            userMessage.includes('[Contenido de documento Word:') ||
            userMessage.includes('[Audio transcrito:') ||
            userMessage.includes('[Contenido multimedia:') ||
            hasSystemMessages;
        
        // Construir contexto específico mejorado para multimedia (MEJORADO PARA MANTENER CONTEXTO)
        let mediaPrompt = '';
        
        if (isMediaMessage) {
            // Detectar el tipo específico de media
            if (userMessage.includes('Audio recibido pero') || userMessage.includes('Audio procesado pero')) {
                mediaPrompt = `\n\n🎵 AUDIO NO TRANSCRITO: El usuario envió un audio pero no se pudo procesar correctamente. Reconoce que recibiste el audio, explica brevemente por qué no se pudo procesar (sin detalles técnicos), y pregunta si puede escribir el mensaje o enviar el audio de otra forma.`;
            } else if (userMessage.includes('[Audio transcrito:') || userMessage.includes('Final del audio')) {
                // Audio transcrito exitosamente
                mediaPrompt = `\n\n🎵 AUDIO TRANSCRITO: El usuario envió un audio que fue transcrito exitosamente. El contenido transcrito está incluido en el mensaje. Responde directamente sobre el contenido del audio como si el usuario te hubiera escrito ese texto. NO menciones que es un audio - simplemente responde al contenido.`;
            } else if (userMessage.includes('[Contenido de imagen:') || userMessage.includes('Final de la imagen')) {
                // Imagen procesada
                mediaPrompt = `\n\n🖼️ IMAGEN ANALIZADA: El usuario envió una imagen que fue analizada exitosamente. El contenido extraído de la imagen está incluido en el mensaje. Responde específicamente sobre lo que ves en la imagen basándote en el contenido extraído. Puedes hacer análisis, observaciones o responder preguntas sobre la imagen.`;
            } else if (userMessage.includes('[Contenido de PDF:') || userMessage.includes('Final del PDF')) {
                // PDF procesado
                mediaPrompt = `\n\n📄 PDF ANALIZADO: El usuario envió un documento PDF que fue procesado exitosamente. El contenido extraído del PDF está incluido en el mensaje. Responde específicamente sobre el contenido del documento, puedes hacer análisis, resúmenes o responder preguntas sobre el PDF.`;
            } else if (userMessage.includes('[Contenido de documento Word:') || userMessage.includes('Final del documento Word')) {
                // Documento Word procesado
                mediaPrompt = `\n\n📝 DOCUMENTO WORD ANALIZADO: El usuario envió un documento Word (.docx) que fue procesado exitosamente. El contenido extraído del documento está incluido en el mensaje. Responde específicamente sobre el contenido del documento, puedes hacer análisis, resúmenes o responder preguntas sobre el documento Word.`;
            } else if (userMessage.includes('[Contenido multimedia:')) {
                // Multimedia genérico
                mediaPrompt = `\n\n📎 MULTIMEDIA PROCESADO: El usuario envió contenido multimedia que fue procesado exitosamente. El contenido extraído está incluido en el mensaje. Responde específicamente sobre ese contenido.`;
            } else if (hasExtractedContent) {
                mediaPrompt = `\n\n📎 CONTENIDO MULTIMEDIA: Tienes acceso al contenido extraído de archivos (imágenes, PDFs, audios, documentos Word) en los mensajes del sistema del historial. Úsalo para responder específicamente sobre ese contenido. NO digas que no tienes acceso - SÍ tienes el contenido extraído.`;
            } else {
                mediaPrompt = `\n\n📎 MULTIMEDIA: El usuario envió archivos. Analiza el contenido que se te proporciona en el historial.`;
            }
        }
        
        // NUEVO: Agregar contexto de multimedia reciente si existe
        if (recentMultimediaContent.length > 0 && !isMediaMessage) {
            // Si el usuario hace una pregunta que podría relacionarse con multimedia anterior
            const questionKeywords = ['quien', 'que', 'como', 'donde', 'cuando', 'por que', 'dime', 'explica', 'analiza'];
            const hasQuestion = questionKeywords.some(keyword => 
                userMessage.toLowerCase().includes(keyword)
            );
            
            if (hasQuestion) {
                mediaPrompt = `\n\n🔗 CONTEXTO MULTIMEDIA RECIENTE: En los mensajes anteriores se compartió contenido multimedia (imágenes, audios, documentos). Si la pregunta actual se relaciona con ese contenido, úsalo para responder. El contenido está disponible en el historial de la conversación.`;
            }
        }

        // Construir el prompt del sistema OPTIMIZADO (MEJORADO PARA CONTEXTO COMPLETO)
        const systemPrompt = `Eres ${personalityData.nombre}. ${personalityData.empresa ? `Trabajas en ${personalityData.empresa}` : ''}

PERSONALIDAD: ${personalityData.instrucciones}

INSTRUCCIONES CRÍTICAS PARA CONTEXTO COMPLETO:
- ⚠️ DEBES LEER Y ANALIZAR TODOS los mensajes del historial que se te proporcionan
- ⚠️ NO ignores ningún mensaje anterior - cada uno contiene información importante
- ⚠️ Si el usuario pregunta sobre algo mencionado antes, DEBES recordarlo y responder basándote en esa información
- ⚠️ Conecta TODA la conversación anterior con la pregunta actual
- ⚠️ Si hay información en mensajes anteriores (imágenes, audios, documentos), ÚSALA para responder
- ⚠️ NO digas que no tienes acceso a información que está en el historial de la conversación
- ⚠️ Mantén el contexto COMPLETO de toda la conversación

🚫 IMPORTANTE - EVITA REPETICIONES:
- ⚠️ NO repitas exactamente lo que ya dijiste en mensajes anteriores
- ⚠️ NO uses las mismas frases o palabras una y otra vez
- ⚠️ Si ya respondiste algo, avanza la conversación con nueva información o preguntas
- ⚠️ Varía tu vocabulario y forma de expresarte
- ⚠️ Si el usuario hace la misma pregunta, responde de forma diferente o con más detalle
- ⚠️ NO copies texto de tus respuestas anteriores - crea contenido nuevo y relevante

🎤 CAPACIDADES DE AUDIO:
- ✅ SÍ PUEDES enviar mensajes de audio cuando el usuario lo pida o cuando sea apropiado
- ✅ NO digas que no puedes enviar audios - el sistema los enviará automáticamente cuando corresponda
- ✅ Si el usuario pide un audio, responde normalmente (el sistema convertirá tu respuesta a audio)
- ✅ Si el usuario prefiere audios, puedes seguir comunicándote por audio hasta que indique lo contrario
- ⚠️ NO menciones limitaciones técnicas sobre audios - solo responde naturalmente
- ⚠️ Cuando respondas en audio, di cosas NUEVAS y relevantes - NO repitas lo mismo que antes

${hasGreeted ? 'Ya saludaste, no vuelvas a saludar.' : ''}
${mediaPrompt}

Responde en el mismo idioma que el usuario y sigue tu personalidad exactamente.`;

        // Construir el array de mensajes para la API
        const messages = [
            { role: 'system', content: systemPrompt },
            ...messageHistory,
            { role: 'user', content: userMessage }
        ];

        console.log('📤 Enviando a OpenAI:', {
            totalMessages: messages.length,
            systemPromptLength: systemPrompt.length,
            personalityInstructions: personalityData.instrucciones?.length || 0,
            finalUserMessage: userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : ''),
            hasSystemMessages: messages.filter(m => m.role === 'system').length,
            mediaPrompt: mediaPrompt ? mediaPrompt.substring(0, 200) + '...' : 'none',
            recentMultimediaCount: recentMultimediaContent.length,
            historyLength: messageHistory.length
        });

        // Intentar primero con OpenAI (OPTIMIZADO)
        try {
            console.log('🚀 Intentando con OpenAI...');
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini', // Modelo más rápido
                messages,
                temperature: 0.8, // Aumentado para más variación y menos repetición
                max_tokens: 1500, // Aumentado para respuestas completas
                frequency_penalty: 0.6, // Penaliza palabras repetidas (0-2, más alto = menos repetición)
                presence_penalty: 0.3, // Penaliza temas repetidos (0-2, más alto = más variación)
                stream: false
            });

            if (!completion.choices?.[0]?.message?.content) {
                throw new Error('Respuesta de OpenAI inválida');
            }

            console.log('✅ Respuesta exitosa de OpenAI');
            return completion.choices[0].message.content;
        } catch (openaiError) {
            console.error('❌ Error con OpenAI:', {
                message: openaiError.message,
                code: openaiError.code,
                type: openaiError.type,
                status: openaiError.status
            });
            
            // Si falla OpenAI, intentar con DeepSeek (OPTIMIZADO)
            try {
                console.log('🔄 Intentando con DeepSeek como respaldo...');
                
                const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: 'deepseek-chat', // Modelo más rápido
                        messages,
                        temperature: 0.8, // Aumentado para más variación y menos repetición
                        max_tokens: 1500, // Aumentado para respuestas completas
                        frequency_penalty: 0.6, // Penaliza palabras repetidas
                        presence_penalty: 0.3, // Penaliza temas repetidos
                        stream: false
                    }),
                    signal: AbortSignal.timeout(15001) // 15 segundos timeout
                });

                if (!deepseekResponse.ok) {
                    const errorText = await deepseekResponse.text();
                    throw new Error(`Error en DeepSeek: ${deepseekResponse.status} - ${errorText}`);
                }

                const deepseekData = await deepseekResponse.json();
                console.log('✅ Respuesta exitosa de DeepSeek');
                
                return deepseekData.choices[0].message.content || 
                       'Lo siento, no pude generar una respuesta adecuada.';
                
            } catch (deepseekError) {
                console.error('❌ Error con DeepSeek:', {
                    message: deepseekError.message,
                    stack: deepseekError.stack
                });
                
                // Si ambos fallan, generar una respuesta simple
                console.log('⚠️ Usando respuesta de fallback - ambos servicios fallaron');
                return generateSimpleFallbackResponse(userMessage, personalityData);
            }
        }
    } catch (error) {
        console.error('❌ Error general en generateBotResponse:', {
            message: error.message,
            stack: error.stack,
            personalityId: personality?.id,
            userId,
            userMessageLength: userMessage?.length
        });
        return 'Lo siento, hubo un error al procesar tu mensaje. ¿Podrías intentarlo de nuevo?';
    }
}

// OPTIMIZADO - Análisis de contexto MEJORADO para CONTEXTO COMPLETO
function analyzeConversationContext(history, currentMessage) {
    // Usar hasta 20 mensajes para mantener contexto completo
    const recentMessages = history.slice(-20); // Últimos 20 mensajes para contexto completo
    
    // Detectar saludo simple
    const hasGreeted = recentMessages.some(msg => {
        const content = msg.content || '';
        return content.toLowerCase().includes('hola') || 
               content.toLowerCase().includes('buenos') || 
               content.toLowerCase().includes('buenas');
    });

    // Extraer tema principal con análisis mejorado
    const currentTopic = extractEnhancedTopic(recentMessages.concat([{content: currentMessage}]));
    
    // Analizar preguntas previas para mejor contexto
    const previousQuestions = extractPreviousQuestions(recentMessages);
    
    // Analizar contexto de medios para mejor memoria
    const mediaContext = analyzeMediaContext(recentMessages);
    
    // Detectar continuidad de conversación
    const conversationContinuity = analyzeConversationContinuity(recentMessages, currentMessage);

    return {
        currentTopic,
        hasGreeted,
        previousQuestions,
        lastBotMessage: recentMessages[recentMessages.length - 1]?.content || '',
        mediaContext,
        lastMediaType: mediaContext?.type || null,
        conversationContinuity,
        contextStrength: recentMessages.length // Fuerza del contexto basada en cantidad de mensajes
    };
}

// NUEVO - Extracción de tema simplificada
function extractSimpleTopic(messages) {
    const text = messages.map(m => m.content || m.text_content || '').join(' ').toLowerCase();
    
    // Palabras clave simples
    if (text.includes('precio') || text.includes('costo') || text.includes('pagar')) return 'precios';
    if (text.includes('producto') || text.includes('servicio')) return 'productos';
    if (text.includes('ayuda') || text.includes('problema')) return 'soporte';
    
    return null;
}

// MEJORADO - Extracción de tema con análisis avanzado
function extractEnhancedTopic(messages) {
    const text = messages.map(m => m.content || '').join(' ').toLowerCase();
    
    // Palabras clave extendidas para mejor contexto
    if (text.includes('precio') || text.includes('costo') || text.includes('pagar') || text.includes('euros') || text.includes('€')) return 'precios';
    if (text.includes('producto') || text.includes('servicio') || text.includes('coche') || text.includes('auto') || text.includes('vehículo') || text.includes('berlina')) return 'productos';
    if (text.includes('ayuda') || text.includes('problema') || text.includes('soporte') || text.includes('duda')) return 'soporte';
    if (text.includes('información') || text.includes('detalles') || text.includes('características')) return 'información';
    if (text.includes('contacto') || text.includes('llamar') || text.includes('visitar')) return 'contacto';
    if (text.includes('horario') || text.includes('disponibilidad') || text.includes('cuando')) return 'horarios';
    if (text.includes('audi') || text.includes('bmw') || text.includes('ford') || text.includes('mercedes')) return 'marcas_coches';
    if (text.includes('camaro') || text.includes('muscle') || text.includes('deportivo')) return 'coches_deportivos';
    
    return null;
}

// NUEVA - Extraer preguntas previas para mejor contexto
function extractPreviousQuestions(messages) {
    const questions = [];
    const questionKeywords = ['qué', 'quien', 'cómo', 'dónde', 'cuándo', 'por qué', 'cuál', 'dime', 'explica', 'analiza'];
    
    messages.forEach(msg => {
        const content = msg.content || '';
        if (questionKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
            questions.push(content.substring(0, 100));
        }
    });
    
    return questions.slice(-5); // Últimas 5 preguntas para mejor contexto
}

// NUEVA - Analizar contexto de medios para mejor memoria
function analyzeMediaContext(messages) {
    const mediaMessages = messages.filter(msg => {
        const content = msg.content || msg.text_content || '';
        return content.includes('[Contenido de') || content.includes('Final del') || content.includes('Audio transcrito');
    });
    
    if (mediaMessages.length === 0) return null;
    
    const lastMedia = mediaMessages[mediaMessages.length - 1];
    let type = 'multimedia';
    
    if (lastMedia.content.includes('imagen')) type = 'imagen';
    else if (lastMedia.content.includes('PDF')) type = 'pdf';
    else if (lastMedia.content.includes('audio')) type = 'audio';
    else if (lastMedia.content.includes('documento')) type = 'documento';
    
    return {
        type,
        content: lastMedia.content,
        timestamp: lastMedia.timestamp || lastMedia.whatsapp_created_at
    };
}

// NUEVA - Analizar continuidad de conversación
function analyzeConversationContinuity(messages, currentMessage) {
    if (messages.length < 2) return 'nueva';
    
    const lastMessage = messages[messages.length - 1];
    const lastContent = lastMessage.content || lastMessage.text_content || '';
    const currentContent = currentMessage || '';
    
    // Detectar si es continuación del tema anterior
    const commonWords = findCommonWords(lastContent, currentContent);
    const isContinuation = commonWords.length > 0;
    
    return {
        type: isContinuation ? 'continuación' : 'nuevo_tema',
        commonWords,
        strength: commonWords.length
    };
}

// NUEVA - Encontrar palabras comunes entre mensajes
function findCommonWords(text1, text2) {
    const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    return words1.filter(word => words2.includes(word));
}

function generateSimpleFallbackResponse(userMessage, personalityData) {
    const responses = [
        'Disculpa la demora. ¿Podrías repetir tu pregunta?',
        'Tengo algunos problemas técnicos. ¿En qué puedo ayudarte?',
        'Lo siento, no pude procesar tu mensaje correctamente. ¿Puedes intentar de nuevo?'
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
}

function extractTopic(messages) {
  // Implementar lógica para extraer el tema principal de los últimos mensajes
  const topics = new Map();
  
  messages.forEach(msg => {
    const words = msg.content.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 3) { // Ignorar palabras muy cortas
        topics.set(word, (topics.get(word) || 0) + 1);
      }
    });
  });

  // Retornar el tema más frecuente
  let maxCount = 0;
  let mainTopic = null;
  topics.forEach((count, topic) => {
    if (count > maxCount) {
      maxCount = count;
      mainTopic = topic;
    }
  });

  return mainTopic;
}

function processMessageInContext(message, context) {
  let processedMessage = message;

  // Si hay contexto de medio, añadirlo al mensaje
  if (context.mediaContext) {
    processedMessage = `[Contexto anterior: ${context.mediaContext}] ${message}`;
  }

  // Si hay un tema actual, añadirlo al contexto
  if (context.currentTopic) {
    processedMessage = `[Tema actual: ${context.currentTopic}] ${processedMessage}`;
  }

  return processedMessage;
}

function buildContextualHistory(history, context) {
  return history
    .filter((msg, index, self) => 
      index === 0 || 
      (msg.text_content && msg.text_content !== self[index - 1].text_content)
    )
    .slice(-5)
    .map(m => ({
      role: m.sender_type === 'user' ? 'user' : 'assistant',
      content: m.text_content || ''
    }))
    .filter(m => m.content.trim() !== '');
}

function buildSystemPrompt(p, instructions, userId, hasGreeted, currentTopic, previousQuestions) {
  const baseInstr = Array.isArray(p.instrucciones)
    ? p.instrucciones.join('\n')
    : p.instrucciones;
  const compInstr = instructions.length
    ? instructions.join('\n')
    : '';

  const contextInfo = currentTopic 
    ? `\nTema actual de la conversación: ${currentTopic}`
    : '';
  const questionsInfo = previousQuestions.length > 0
    ? `\nPreguntas anteriores:\n${previousQuestions.slice(-3).join('\n')}`
    : '';

  return `
  # Configuración de Personalidad
  Nombre: ${p.nombre}
  Categoría: ${p.category}
  ${p.empresa ? `Empresa: ${p.empresa}` : ''}
  ${p.posicion ? `Posición: ${p.posicion}` : ''}
  ${p.sitio_web ? `Sitio Web: ${p.sitio_web}` : ''}
  ${p.saludo && p.saludo.trim() !== '' ? `Saludo específico: ${p.saludo}` : 'Sin saludo predefinido'}
  
  # Contexto
  ${p.context}
  ${contextInfo}
  ${questionsInfo}
  
  # Instrucciones Base
  ${baseInstr}
  
  # Instrucciones Complementarias
  ${compInstr}
  
  # Directrices Generales
  - ${hasGreeted ? 'Ya se ha saludado al usuario, no uses ningún saludo.' : (p.saludo && p.saludo.trim() !== '' ? 'Usa el saludo específico solo en la primera respuesta o cuando te hagan un saludo.' : 'NO generes saludos automáticos - responde directamente a lo que te pregunten.')}
  - Mantén el estilo propio de la categoría: **${p.category}**.
  - Responde en el mismo idioma que el usuario.
  - Sé claro y directo, pero acorde a tu rol.
  - No menciones que eres una IA.
  - Mantén el contexto de la conversación, incluyendo referencias a mensajes anteriores.
  - Si el usuario envía un medio (imagen, audio, documento), considera el contexto de la conversación al responder.
  - Mantén la coherencia en las respuestas basándote en el tema actual de la conversación.
  - Considera las preguntas anteriores al generar respuestas.
  - Usuario: ${userId}.
  `;
}

/**
 * Transcribe un buffer de audio usando Whisper de OpenAI (OPTIMIZADO v5 - Con retry)
 */
/**
 * Procesa y mejora texto extraído de PDFs usando IA para crear mejores instrucciones
 * @param {string} extractedText - Texto extraído del PDF
 * @param {string} personalityName - Nombre de la personalidad
 * @param {string} personalityCategory - Categoría de la personalidad
 * @returns {Promise<string>} - Instrucciones mejoradas y estructuradas
 */
export async function processInstructionsWithAI(extractedText, personalityName = 'Asistente', personalityCategory = 'formal') {
  const startTime = Date.now();
  const processingId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`🤖 [${processingId}] Iniciando procesamiento IA para ${personalityName} (${personalityCategory})`);
    console.log(`📄 [${processingId}] Texto original: ${extractedText.length} caracteres`);
    console.log(`🔍 [${processingId}] Preview: ${extractedText.substring(0, 150)}...`);
    
    if (!extractedText || extractedText.trim().length < 10) {
      throw new Error('Texto extraído insuficiente para procesar');
    }

    // Verificar variables de entorno
    if (!envValid) {
      console.error('❌ Variables de entorno no válidas para procesamiento IA');
      return extractedText; // Retornar texto original si no hay IA disponible
    }

    // Construir prompt especializado para mejorar instrucciones
    const improvementPrompt = `Eres un experto en crear instrucciones para chatbots de IA. Tu tarea es tomar el texto extraído de un PDF y convertirlo en instrucciones claras, estructuradas y efectivas para un chatbot llamado "${personalityName}" de categoría "${personalityCategory}".

REQUISITOS CRÍTICOS:
- ✅ MANTÉN TODA la información del texto original - NO elimines nada importante
- ✅ ESTRUCTURA el contenido de manera clara y organizada
- ✅ CONVIERTE la información en instrucciones directas y accionables
- ✅ USA un lenguaje claro y profesional
- ✅ ORGANIZA por secciones lógicas si es necesario
- ✅ MANTÉN el contexto y los detalles específicos
- ✅ ADAPTA el tono a la categoría: ${personalityCategory}

CATEGORÍAS DE PERSONALIDAD:
- formal: Lenguaje profesional y respetuoso
- amigable: Tono cercano pero profesional
- familia: Tono cálido y familiar
- negocios: Enfoque empresarial y directo

FORMATO DE SALIDA:
Estructura las instrucciones de manera clara, usando:
- Párrafos bien organizados
- Listas cuando sea apropiado
- Secciones temáticas si el contenido lo requiere
- Instrucciones específicas sobre cómo responder
- Información clave que debe recordar

TEXTO ORIGINAL A PROCESAR:
${extractedText}

INSTRUCCIONES MEJORADAS:`;

    const messages = [
      { role: 'system', content: 'Eres un experto en optimización de instrucciones para chatbots. Tu objetivo es mejorar y estructurar instrucciones manteniendo toda la información original.' },
      { role: 'user', content: improvementPrompt }
    ];

    console.log('🚀 Enviando a OpenAI para procesamiento de instrucciones...');
    
    // Intentar con OpenAI primero
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.3, // Temperatura baja para mayor consistencia
        max_tokens: 2000, // Suficiente para instrucciones detalladas
        stream: false
      });

      if (!completion.choices?.[0]?.message?.content) {
        throw new Error('Respuesta de OpenAI inválida para procesamiento de instrucciones');
      }

      const improvedInstructions = completion.choices[0].message.content.trim();
      const processingTime = Date.now() - startTime;
      const improvementRatio = (improvedInstructions.length / extractedText.length).toFixed(2);
      
      console.log(`✅ [${processingId}] Instrucciones mejoradas con OpenAI:`);
      console.log(`   - Tiempo de procesamiento: ${processingTime}ms`);
      console.log(`   - Caracteres originales: ${extractedText.length}`);
      console.log(`   - Caracteres mejorados: ${improvedInstructions.length}`);
      console.log(`   - Ratio de mejora: ${improvementRatio}x`);
      console.log(`   - Tokens utilizados: ~${Math.ceil((extractedText.length + improvedInstructions.length) / 4)}`);
      
      // Log de calidad
      logProcessingQuality(processingId, {
        originalLength: extractedText.length,
        improvedLength: improvedInstructions.length,
        processingTime,
        provider: 'OpenAI',
        personalityName,
        personalityCategory,
        success: true
      });
      
      return improvedInstructions;
      
    } catch (openaiError) {
      console.error('❌ Error con OpenAI en procesamiento de instrucciones:', openaiError.message);
      
      // Fallback a DeepSeek
      try {
        console.log('🔄 Intentando con DeepSeek para procesamiento de instrucciones...');
        
        const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages,
            temperature: 0.3,
            max_tokens: 2000,
            stream: false
          }),
          signal: AbortSignal.timeout(20000) // 20 segundos timeout
        });

        if (!deepseekResponse.ok) {
          const errorText = await deepseekResponse.text();
          throw new Error(`Error en DeepSeek: ${deepseekResponse.status} - ${errorText}`);
        }

        const deepseekData = await deepseekResponse.json();
        const improvedInstructions = deepseekData.choices[0].message.content?.trim();
        
        if (!improvedInstructions) {
          throw new Error('Respuesta vacía de DeepSeek');
        }
        
        const processingTime = Date.now() - startTime;
        const improvementRatio = (improvedInstructions.length / extractedText.length).toFixed(2);
        
        console.log(`✅ [${processingId}] Instrucciones mejoradas con DeepSeek:`);
        console.log(`   - Tiempo de procesamiento: ${processingTime}ms`);
        console.log(`   - Ratio de mejora: ${improvementRatio}x`);
        
        // Log de calidad
        logProcessingQuality(processingId, {
          originalLength: extractedText.length,
          improvedLength: improvedInstructions.length,
          processingTime,
          provider: 'DeepSeek',
          personalityName,
          personalityCategory,
          success: true
        });
        
        return improvedInstructions;
        
      } catch (deepseekError) {
        console.error('❌ Error con DeepSeek en procesamiento de instrucciones:', deepseekError.message);
        
        // Si ambos fallan, retornar texto original con formato básico
        console.log(`⚠️ [${processingId}] Usando formato básico - ambos servicios IA fallaron`);
        
        const basicInstructions = formatInstructionsBasic(extractedText, personalityName, personalityCategory);
        const processingTime = Date.now() - startTime;
        
        // Log de fallback
        logProcessingQuality(processingId, {
          originalLength: extractedText.length,
          improvedLength: basicInstructions.length,
          processingTime,
          provider: 'Fallback',
          personalityName,
          personalityCategory,
          success: false,
          error: 'Both AI services failed'
        });
        
        return basicInstructions;
      }
    }
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ [${processingId}] Error general en processInstructionsWithAI:`, error.message);
    
    // Log de error
    logProcessingQuality(processingId, {
      originalLength: extractedText.length,
      improvedLength: extractedText.length,
      processingTime,
      provider: 'Error',
      personalityName,
      personalityCategory,
      success: false,
      error: error.message
    });
    
    // En caso de error, retornar el texto original
    return extractedText;
  }
}

/**
 * Registra métricas de calidad del procesamiento IA
 */
function logProcessingQuality(processingId, metrics) {
  const logEntry = {
    id: processingId,
    timestamp: new Date().toISOString(),
    ...metrics,
    improvementRatio: (metrics.improvedLength / metrics.originalLength).toFixed(2),
    efficiency: metrics.processingTime > 0 ? (metrics.improvedLength / metrics.processingTime).toFixed(2) : 0
  };
  
  console.log(`📊 [${processingId}] Métricas de calidad:`, JSON.stringify(logEntry, null, 2));
  
  // Aquí se podría enviar a un sistema de monitoreo como DataDog, New Relic, etc.
  // await sendToMonitoring(logEntry);
}

/**
 * Formato básico de instrucciones cuando la IA no está disponible
 */
function formatInstructionsBasic(text, personalityName, category) {
  const categoryIntro = {
    formal: `Como ${personalityName}, debes mantener un tono profesional y respetuoso.`,
    amigable: `Como ${personalityName}, debes ser cercano y amigable en tus respuestas.`,
    familia: `Como ${personalityName}, debes usar un tono cálido y familiar.`,
    negocios: `Como ${personalityName}, debes enfocarte en aspectos empresariales y ser directo.`
  };

  return `${categoryIntro[category] || categoryIntro.formal}

INSTRUCCIONES BASADAS EN EL DOCUMENTO:

${text}

Recuerda seguir estas instrucciones en todas tus respuestas y mantener la información proporcionada.

NOTA: Estas instrucciones fueron procesadas automáticamente desde un documento PDF.`;
}

/**
 * Reprocesa instrucciones existentes con IA para mejorarlas
 * @param {string} existingInstructions - Instrucciones existentes
 * @param {string} personalityName - Nombre de la personalidad
 * @param {string} personalityCategory - Categoría de la personalidad
 * @returns {Promise<string>} - Instrucciones mejoradas
 */
export async function reprocessExistingInstructions(existingInstructions, personalityName, personalityCategory) {
  console.log(`🔄 Reprocesando instrucciones existentes para ${personalityName}...`);
  
  if (!existingInstructions || existingInstructions.trim().length < 20) {
    throw new Error('Instrucciones existentes insuficientes para reprocesar');
  }
  
  // Usar la misma función pero con un prompt ligeramente diferente
  return await processInstructionsWithAI(existingInstructions, personalityName, personalityCategory);
}

export async function transcribeAudioBuffer(audioBuffer, filename = 'audio.ogg') {
  if (!Buffer.isBuffer(audioBuffer)) {
    throw new Error('Buffer de audio inválido');
  }

  // Verificar tamaño del buffer (límite de 25MB para Whisper)
  if (audioBuffer.length > 25 * 1024 * 1024) {
    throw new Error('El archivo de audio es demasiado grande (máximo 25MB)');
  }

  let retries = 3;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🎵 Intentando transcribir audio (intento ${attempt}/${retries})...`);
      
      const transcription = await openai.audio.transcriptions.create({
        file: new File([audioBuffer], filename),
        model: 'whisper-1',
        response_format: 'text',
        language: 'es' // Especificar idioma para mayor velocidad
      });

      if (!transcription) throw new Error('La respuesta de Whisper está vacía');
      
      console.log(`✅ Audio transcrito exitosamente en intento ${attempt}`);
      return transcription;
      
    } catch (err) {
      lastError = err;
      console.error(`❌ Error en Whisper API (intento ${attempt}):`, {
        message: err.message,
        status: err.status,
        type: err.type,
        code: err.code
      });

      // Si es el último intento, lanzar el error
      if (attempt === retries) {
        break;
      }

      // Esperar antes del siguiente intento (backoff exponencial)
      const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.log(`⏳ Esperando ${waitTime}ms antes del siguiente intento...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // Si llegamos aquí, todos los intentos fallaron
  console.error('❌ Todos los intentos de transcripción fallaron');
  
  // Devolver un error más específico según el tipo de error
  if (lastError?.code === 'insufficient_quota') {
    throw new Error('Cuota de OpenAI agotada. Contacta al administrador.');
  } else if (lastError?.message?.includes('Connection')) {
    throw new Error('Error de conexión con OpenAI. Intenta nuevamente en unos minutos.');
  } else if (lastError?.status === 413) {
    throw new Error('El archivo de audio es demasiado grande.');
  } else {
    throw new Error('No pude procesar el audio después de varios intentos.');
  }
}


