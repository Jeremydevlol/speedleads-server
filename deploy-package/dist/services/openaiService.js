import OpenAI from 'openai';
import { fetchPersonalityInstructions } from '../controllers/personalityController.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 25001,
  maxRetries: 1,
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

// Función para procesar comandos de envío de archivos en la respuesta de la IA
// Detecta [[ENVIAR_ARCHIVO:ID]] y los reemplaza con el formato adecuado
function processFileCommands(response, availableFiles = []) {
  if (!response || !availableFiles || availableFiles.length === 0) {
    return { text: response, files: [] };
  }

  const filesToSend = [];
  let processedText = response;

  // Buscar todos los comandos [[ENVIAR_ARCHIVO:ID]]
  const fileCommandRegex = /\[\[ENVIAR_ARCHIVO:(\d+)\]\]/g;
  let match;

  while ((match = fileCommandRegex.exec(response)) !== null) {
    const fileId = parseInt(match[1]);
    const file = availableFiles.find(f => f.id === fileId);
    
    if (file) {
      filesToSend.push({
        id: file.id,
        filename: file.filename,
        type: file.type,
        url: file.url
      });
      // Reemplazar el comando con un texto más amigable
      processedText = processedText.replace(
        match[0], 
        `📎 [Archivo adjunto: ${file.filename}]`
      );
      console.log(`📎 Archivo programado para envío: ${file.filename} (ID: ${fileId})`);
    } else {
      // Si no se encuentra el archivo, remover el comando
      processedText = processedText.replace(match[0], '');
      console.warn(`⚠️ Archivo no encontrado para ID: ${fileId}`);
    }
  }

  return { 
    text: processedText.trim(), 
    files: filesToSend 
  };
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

        // Detectar si el contexto de la conversación sugiere agendamiento
        // Solo obtener disponibilidades si el usuario explícitamente las solicita o confirma agendamiento
        let availabilityContext = '';
        let shouldShowAvailabilities = false;
        
        // Detectar si el usuario quiere agendar una cita
        const userWantsToSchedule = userMessage.toLowerCase().includes('agendar') ||
                                    userMessage.toLowerCase().includes('cita') ||
                                    userMessage.toLowerCase().includes('reunión') ||
                                    userMessage.toLowerCase().includes('quedar') ||
                                    userMessage.toLowerCase().includes('verme') ||
                                    userMessage.toLowerCase().includes('nos vemos') ||
                                    userMessage.toLowerCase().includes('cuándo podemos') ||
                                    userMessage.toLowerCase().includes('cuando podemos');
        
        // Detectar si el usuario está pidiendo ver disponibilidades o confirmando agendamiento
        const userWantsToSeeSlots = userMessage.toLowerCase().includes('disponibilidad') ||
                                    userMessage.toLowerCase().includes('horarios') ||
                                    userMessage.toLowerCase().includes('cuando disponible') ||
                                    userMessage.toLowerCase().includes('muéstrame') ||
                                    userMessage.toLowerCase().includes('qué fechas') ||
                                    userMessage.toLowerCase().includes('qué días') ||
                                    userMessage.toLowerCase().includes('opciones') ||
                                    userMessage.toLowerCase().includes('dame horas') ||
                                    (userMessage.toLowerCase().includes('sí') && history.some(h => 
                                      (h.content || h.text_content || '').toLowerCase().includes('agendar') ||
                                      (h.content || h.text_content || '').toLowerCase().includes('cita')
                                    )) ||
                                    userWantsToSchedule; // Si quiere agendar, también mostrar disponibilidades
        
        // Detectar si el usuario está confirmando una fecha/hora específica para agendar
        const userConfirmingAppointment = userMessage.toLowerCase().includes('sí, agendar') ||
                                          userMessage.toLowerCase().includes('confirmo') ||
                                          userMessage.toLowerCase().includes('perfecto') ||
                                          userMessage.toLowerCase().includes('esa fecha') ||
                                          userMessage.toLowerCase().includes('ese día') ||
                                          userMessage.toLowerCase().includes('esa hora') ||
                                          (userMessage.match(/\d{1,2}[:\/]\d{1,2}/) && history.some(h => 
                                            (h.content || h.text_content || '').toLowerCase().includes('disponibilidad')
                                          ));
        
        if (userWantsToSeeSlots && userId) {
            shouldShowAvailabilities = true;
            try {
                const { getFormattedAvailabilities } = await import('../../src/services/availabilityService.js');
                availabilityContext = await getFormattedAvailabilities(userId, 30);
                console.log('📅 Disponibilidades obtenidas - usuario las solicitó');
            } catch (availError) {
                console.warn('⚠️ Error obteniendo disponibilidades:', availError.message);
                availabilityContext = 'No hay disponibilidades disponibles en este momento.';
            }
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
        // Construir el historial de mensajes para el contexto (OPTIMIZADO PARA CONTEXTO COMPLETO)
        // Usar hasta 50 mensajes para mantener contexto completo de toda la conversación
        const initialHistory = history.slice(-50).map(msg => {
            // Determinar el role correcto
            let role = msg.role;
            if (!role) {
                if (msg.sender_type === 'user') {
                    role = 'user';
                } else if (msg.sender_type === 'system') {
                    role = 'system';
                } else {
                    role = 'assistant'; // 'ia', 'you', etc. se mapean a assistant
                }
            }
            
            // Obtener el contenido (priorizar content, luego text_content, luego media_content)
            const content = msg.content || msg.text_content || msg.media_content || '';
            
            return {
                role: role,
                content: content,
                // Campos adicionales para análisis interno (no se envían a OpenAI)
                _timestamp: msg.timestamp || msg.whatsapp_created_at || msg.created_at,
                _position: msg.position || 0,
                _isRecent: msg.isRecent || false,
                _sender_type: msg.sender_type || (role === 'user' ? 'user' : role === 'system' ? 'system' : 'ia')
            };
        });

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

        // Filtrar mensajes vacíos y preparar historial para OpenAI (solo role y content)
        const messageHistory = initialHistory
            .filter(msg => msg.content && msg.content.trim().length > 0) // Filtrar mensajes vacíos
            .map(msg => ({
                role: msg.role,
                content: msg.content
            }));

        // Analizar el contexto de la conversación usando el historial completo
        const conversationContext = analyzeConversationContext(initialHistory, userMessage);
        const currentTopic = conversationContext.currentTopic;
        const hasGreeted = conversationContext.hasGreeted;

        console.log(`🧠 Historial optimizado: ${messageHistory.length} mensajes válidos (${recentMultimediaContent.length} con multimedia)`);
        console.log(`📊 Contexto de conversación: tema="${currentTopic}", continuidad="${conversationContext.conversationContinuity}"`);
        
        // Log detallado para verificar que TODOS los mensajes se lean correctamente
        console.log(`📖 VERIFICANDO LECTURA COMPLETA DE MENSAJES (últimos 5):`);
        messageHistory.slice(-5).forEach((msg, index) => {
            console.log(`   ${messageHistory.length - 5 + index + 1}. [${msg.role}] ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
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
            userMessage.startsWith('Imagen:') ||
            mediaType === 'image' ||
            hasSystemMessages;
        
        // Construir contexto específico mejorado para multimedia (MEJORADO PARA MANTENER CONTEXTO)
        let mediaPrompt = '';
        
        if (isMediaMessage) {
            // Detectar si hay imagen en el historial (no solo en userMessage)
            const historyHasImage = history.some(msg => 
                (msg.content?.includes('Imagen:') || msg.text_content?.includes('Imagen:'))
            );
            const hasImageContext = userMessage.includes('[Contenido de imagen:') || 
                                   userMessage.includes('Final de la imagen') || 
                                   userMessage.includes('Imagen:') ||
                                   userMessage.startsWith('Imagen:') ||
                                   userMessage.toLowerCase().includes('analiza la imagen') ||
                                   userMessage.toLowerCase().includes('analiza esta imagen') ||
                                   userMessage.toLowerCase().includes('qué ves') ||
                                   userMessage.toLowerCase().includes('que ves') ||
                                   mediaType === 'image' ||
                                   historyHasImage;
            
            // Detectar el tipo específico de media
            if (userMessage.includes('Audio recibido pero') || userMessage.includes('Audio procesado pero')) {
                mediaPrompt = `\n\n🎵 AUDIO NO TRANSCRITO: El usuario envió un audio pero no se pudo procesar correctamente. Reconoce que recibiste el audio, explica brevemente por qué no se pudo procesar (sin detalles técnicos), y pregunta si puede escribir el mensaje o enviar el audio de otra forma.`;
            } else if (userMessage.includes('[Audio transcrito:') || userMessage.includes('Final del audio')) {
                // Audio transcrito exitosamente
                mediaPrompt = `\n\n🎵 AUDIO TRANSCRITO: El usuario envió un audio que fue transcrito exitosamente. El contenido transcrito está incluido en el mensaje. Responde directamente sobre el contenido del audio como si el usuario te hubiera escrito ese texto. NO menciones que es un audio - simplemente responde al contenido.`;
            } else if (hasImageContext) {
                // Imagen procesada - RESPUESTA CONTEXTUAL Y SIMPLE
                mediaPrompt = `\n\n🖼️ IMAGEN RECIBIDA: Tienes la descripción de la imagen en el historial.

🧠 CONTEXTO IMPORTANTE:
- USA EL CONTEXTO DE LA CONVERSACIÓN para responder de forma relevante
- Si la conversación es sobre un tema específico (ventas, consultas, etc.), responde en ese contexto
- SIGUE LAS INSTRUCCIONES DE TU PERSONALIDAD al responder sobre la imagen
- Si tu personalidad vende productos, puedes relacionar la imagen con tus productos
- Si tu personalidad es de atención al cliente, responde profesionalmente

⚠️ REGLAS ESTRICTAS PARA RESPONDER:
1. NUNCA hagas listas numeradas (1, 2, 3) ni con viñetas/guiones
2. NUNCA uses términos técnicos como "composición", "encuadre", "cromatismo"
3. NUNCA hagas análisis extensos - sé BREVE y DIRECTO (2-4 frases máximo)
4. Responde de forma NATURAL como si fueras un amigo/profesional comentando
5. INTEGRA la respuesta con el contexto de la conversación

EJEMPLOS DE RESPUESTAS SEGÚN CONTEXTO:
- Vendedor de coches + imagen de coche: "¡Excelente elección! Ese McLaren es una bestia. Tengo uno similar disponible, ¿te interesa?"
- Atención general + imagen de persona: "¡Qué bien se ve! El rojo le queda genial 😊"
- Consulta + imagen de producto: "Entendido, ese es el modelo que buscas. Dame un momento para ver disponibilidad."

RESPONDE SIEMPRE EN EL CONTEXTO DE LA CONVERSACIÓN Y TU ROL.`;
            } else if (userMessage.includes('[Contenido de PDF:') || userMessage.includes('Final del PDF')) {
                // PDF procesado
                mediaPrompt = `\n\n📄 PDF ANALIZADO: El usuario envió un documento PDF que fue procesado exitosamente. El contenido extraído del PDF está incluido en el mensaje. Responde de forma conversacional sobre el contenido, sin hacer listas técnicas.`;
            } else if (userMessage.includes('[Contenido de documento Word:') || userMessage.includes('Final del documento Word')) {
                // Documento Word procesado
                mediaPrompt = `\n\n📝 DOCUMENTO WORD ANALIZADO: El usuario envió un documento Word (.docx) que fue procesado exitosamente. El contenido extraído del documento está incluido en el mensaje. Responde de forma conversacional sobre el contenido.`;
            } else if (userMessage.includes('[Contenido multimedia:')) {
                // Multimedia genérico
                mediaPrompt = `\n\n📎 MULTIMEDIA PROCESADO: El usuario envió contenido multimedia. Responde de forma natural y conversacional, no técnica.`;
            } else if (hasExtractedContent) {
                mediaPrompt = `\n\n📎 CONTENIDO MULTIMEDIA: Tienes acceso al contenido extraído de archivos en los mensajes anteriores. Úsalo para responder de forma CONVERSACIONAL, como si conocieras el contenido de un vistazo. NO hagas análisis técnicos ni listas.`;
            } else {
                mediaPrompt = `\n\n📎 MULTIMEDIA: El usuario envió archivos. Responde de forma conversacional y natural sobre el contenido.`;
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

        // Construir el prompt del sistema OPTIMIZADO (MEJORADO PARA CONTEXTO COMPLETO Y PERSONALIDAD)
        const roleDescription = personalityData.posicion 
            ? `${personalityData.posicion}${personalityData.empresa ? ` en ${personalityData.empresa}` : ''}`
            : personalityData.empresa 
                ? `parte del equipo de ${personalityData.empresa}`
                : '';
        
        // Detectar si hay enlaces disponibles en las instrucciones
        const hasLinks = personalityData.instrucciones && personalityData.instrucciones.includes('🔗 ENLACES DISPONIBLES');
        
        const systemPrompt = `🎭 TU IDENTIDAD Y ROL:
Eres ${personalityData.nombre}${roleDescription ? `, ${roleDescription}` : ''}. 
${personalityData.sitio_web ? `Puedes referir a los usuarios a ${personalityData.sitio_web} para más información.` : ''}

🎯 TU PERSONALIDAD (SIGUE ESTO ESTRICTAMENTE):
${personalityData.instrucciones}

📖 CONTEXTO DE TU ROL:
${personalityData.context || 'Actúa según tu categoría: ' + personalityData.category}

${hasLinks ? `🔗 INSTRUCCIONES SOBRE ENLACES (MUY IMPORTANTE):
- Cuando el usuario pregunte sobre algo relacionado con el sitio web, productos, servicios, o cualquier tema mencionado en los enlaces disponibles
- SIEMPRE incluye el enlace correspondiente en tu respuesta - NO olvides incluirlo
- Formatea los enlaces de manera clara: puedes usar [Texto descriptivo](URL) o simplemente la URL completa
- Si el usuario pregunta "dónde puedo ver X", "más información sobre Y", "link de Z", etc., incluye el enlace relevante
- Si hay múltiples enlaces relevantes, incluye todos los que sean útiles
- Los enlaces están disponibles en las instrucciones anteriores - úsalos cuando sean relevantes
- Ejemplo de respuesta con enlace: "Puedes encontrar más información sobre [nombre del tema] aquí: https://ejemplo.com/pagina"` : ''}

📅 SISTEMA DE AGENDAMIENTO INTELIGENTE (MUY IMPORTANTE):

INSTRUCCIONES PARA AGENDAMIENTO NATURAL Y CONTEXTUAL:

1. DETECCIÓN CONTEXTUAL:
   - Analiza el contexto de la conversación para determinar si es apropiado sugerir agendar una cita
   - NO sugieras agendar inmediatamente - espera a que sea natural en la conversación
   - Si el usuario menciona necesidad de reunirse, consultar, ver algo en persona, etc., entonces es apropiado sugerir

2. FLUJO NATURAL DE AGENDAMIENTO:
   a) Cuando sea apropiado, pregunta NATURALMENTE si quiere agendar:
      Ejemplo: "¿Te gustaría agendar una cita para [propósito de la conversación]?"
   
   b) Si el usuario dice SÍ o confirma, ANTES de mostrar disponibilidades, pregunta:
      "¿A nombre de quién será la cita?" o "¿Para quién es la cita?"
      ESPERA la respuesta del usuario con el nombre antes de mostrar disponibilidades.
   
   c) Una vez que tengas el nombre, entonces muestra las disponibilidades:
      ${shouldShowAvailabilities && availabilityContext ? `\n\nDISPONIBILIDADES ACTUALES:\n${availabilityContext}\n\nIMPORTANTE: Muestra estas disponibilidades de forma clara y organizada.` : 'Las disponibilidades se obtendrán cuando el usuario confirme que quiere agendar y proporcione el nombre.'}
   
   d) Cuando el usuario elija una fecha/hora específica, confirma el agendamiento mencionando el nombre:
      "¡Perfecto! He agendado la cita para [nombre] el [fecha] a las [hora]. Te enviaré una confirmación en breve."

3. REGLAS IMPORTANTES:
   - NO muestres disponibilidades hasta que el usuario confirme que quiere agendar
   - Mantén el tono natural y conversacional
   - Si el usuario no confirma agendar, continúa la conversación normalmente
   - Solo cuando el usuario elija una fecha específica, confirma el agendamiento
   - Usa el ID del evento (event_id) cuando menciones una disponibilidad específica

4. FORMATO DE CONFIRMACIÓN:
   Cuando el usuario confirme una fecha, responde:
   "¡Perfecto! He agendado tu cita para [fecha completa] a las [hora]. [Detalles adicionales si aplica]. Te enviaré una confirmación en breve con todos los detalles."

${shouldShowAvailabilities && availabilityContext ? `\n\n⚠️ ATENCIÓN: El usuario ha solicitado ver disponibilidades. Muestra las siguientes opciones de forma clara:\n\n${availabilityContext}\n\nCuando el usuario elija una opción (por número, fecha, o ID), confirma el agendamiento mencionando que se guardará en el calendario.` : ''}

5. PROCESAMIENTO DE CONFIRMACIÓN:
   - Cuando el usuario elija una disponibilidad (por número, fecha, o mencionando la opción), debes:
     a) Confirmar la elección
     b) Mencionar que se agendará y guardará
     c) Indicar que recibirá una confirmación
   - NO necesitas hacer nada técnico - solo confirma de forma natural
   - El sistema procesará el agendamiento automáticamente en segundo plano

⚠️ INSTRUCCIONES CRÍTICAS PARA CONTEXTO COMPLETO:
- DEBES LEER Y ANALIZAR TODOS los mensajes del historial que se te proporcionan
- NO ignores ningún mensaje anterior - cada uno contiene información importante
- Si el usuario pregunta sobre algo mencionado antes, DEBES recordarlo y responder basándote en esa información
- Conecta TODA la conversación anterior con la pregunta actual
- Si hay información en mensajes anteriores (imágenes, audios, documentos), ÚSALA para responder
- NO digas que no tienes acceso a información que está en el historial de la conversación
- Mantén el contexto COMPLETO de toda la conversación

🚫 REGLAS ABSOLUTAS:
- NUNCA uses saludos automáticos - responde directamente
- NO menciones que eres una IA - ERES ${personalityData.nombre}
- MANTÉN tu personalidad y tono en TODAS las respuestas
- Responde en el mismo idioma que el usuario
- NO uses formato Markdown (como **, __, -, #, etc.) - responde con texto plano
- Usa saltos de línea y espacios para estructurar tus respuestas de forma legible
- Para listas, usa números (1. 2. 3.) o guiones simples sin asteriscos
${hasGreeted ? '- Ya saludaste, no vuelvas a saludar' : ''}
${mediaPrompt}

💡 RECUERDA: Cada respuesta debe reflejar tu personalidad ${personalityData.category} y seguir tus instrucciones al pie de la letra.`;

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
                model: 'gpt-4o',
                messages,
                temperature: 0.7,
                max_tokens: 1500, // GPT-5.2 usa max_tokens
                stream: false
            });

            if (!completion.choices?.[0]?.message?.content) {
                throw new Error('Respuesta de OpenAI inválida');
            }

            console.log('✅ Respuesta exitosa de OpenAI');
            const rawResponse = completion.choices[0].message.content;
            
            // Procesar comandos de envío de archivos
            const { text, files } = processFileCommands(rawResponse, personalityData?.availableFiles || []);
            
            if (files.length > 0) {
              console.log(`📎 Archivos a enviar: ${files.length}`);
              // Retornar objeto con texto y archivos si hay archivos
              return { text, files, hasFiles: true };
            }
            
            return text;
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
                        temperature: 0.7,
                        max_tokens: 1500, // Aumentado para respuestas completas
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
                
                const rawResponse = deepseekData.choices[0].message.content || 
                       'Lo siento, no pude generar una respuesta adecuada.';
                
                // Procesar comandos de envío de archivos
                const { text, files } = processFileCommands(rawResponse, personalityData?.availableFiles || []);
                
                if (files.length > 0) {
                  console.log(`📎 Archivos a enviar: ${files.length}`);
                  return { text, files, hasFiles: true };
                }
                
                return text;
                
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
    // Usar hasta 50 mensajes para mantener contexto completo (igual que el historial principal)
    const recentMessages = history.slice(-50); // Últimos 50 mensajes para contexto completo
    
    // FORZAR hasGreeted=true para que la IA NUNCA use saludos automáticos
    // La IA debe responder SIEMPRE directamente a las preguntas sin saludos
    const hasGreeted = true;

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

  // Directrices específicas por categoría para mejor adaptación
  const categoryGuidelines = {
    formal: `
    📋 ESTILO FORMAL:
    - Usa lenguaje profesional y respetuoso en todo momento
    - Estructura tus respuestas de forma clara y organizada
    - Evita contracciones (usa "usted" en lugar de "tú" si es apropiado)
    - Mantén un tono serio pero accesible
    - Usa oraciones completas y bien estructuradas
    - Evita emojis, jerga o expresiones coloquiales
    - Sé preciso y detallado en tus explicaciones
    
    📌 EJEMPLO DE TONO FORMAL:
    "Entiendo su consulta. Le proporciono la información solicitada de manera detallada. 
    En primer lugar, es importante considerar que... Por otro lado, también debe tener en 
    cuenta... ¿Necesita alguna aclaración adicional sobre este tema?"`,
    
    amigable: `
    😊 ESTILO AMIGABLE:
    - Usa un tono cercano, cálido y conversacional
    - Puedes usar emojis ocasionalmente para dar personalidad (pero sin exceso)
    - Usa lenguaje coloquial y natural, como hablaría un amigo
    - Sé empático y muestra interés genuino
    - Puedes usar contracciones y expresiones informales
    - Mantén un equilibrio entre ser amigable y ser útil
    - Haz preguntas de seguimiento cuando sea apropiado
    
    📌 EJEMPLO DE TONO AMIGABLE:
    "Claro, te explico 😊 Mira, lo que pasa es que... Es bastante sencillo en realidad.
    Si tienes alguna duda más, no dudes en preguntar. ¿Te quedó claro o quieres que 
    te lo explique de otra forma?"`,
    
    familia: `
    ❤️ ESTILO FAMILIAR:
    - Usa un tono cariñoso y cercano, como hablarías con un familiar
    - Puedes usar apodos cariñosos si es apropiado al contexto
    - Muestra calidez y afecto en tus respuestas
    - Sé comprensivo y empático
    - Usa lenguaje informal y natural
    - Puedes compartir anécdotas o referencias personales si encajan
    - Mantén un tono protector y de apoyo
    
    📌 EJEMPLO DE TONO FAMILIAR:
    "Ay, déjame ayudarte con eso ❤️ Mira, lo que tienes que hacer es... No te preocupes,
    es más fácil de lo que parece. Ya verás que todo sale bien. ¿Cómo te va con todo lo demás?"`,
    
    negocios: `
    💼 ESTILO NEGOCIOS:
    - Usa un tono profesional pero accesible
    - Enfócate en soluciones prácticas y resultados
    - Sé directo y eficiente en tus respuestas
    - Usa terminología empresarial cuando sea apropiado
    - Mantén un equilibrio entre profesionalismo y cercanía
    - Enfatiza el valor y los beneficios
    - Sé proactivo en ofrecer información relevante
    
    📌 EJEMPLO DE TONO NEGOCIOS:
    "Perfecto, te comento sobre esto. La solución más eficiente sería... Esto te permitirá
    optimizar tus resultados y ahorrar tiempo. Si necesitas más detalles sobre nuestros
    servicios, estoy aquí para ayudarte. ¿Qué te parece esta propuesta?"`
  };

  const categoryGuide = categoryGuidelines[p.category.toLowerCase()] || categoryGuidelines.formal;

  // Construir identidad completa
  const identityInfo = [];
  if (p.nombre) identityInfo.push(`Tu nombre es: ${p.nombre}`);
  if (p.empresa) identityInfo.push(`Trabajas en/para: ${p.empresa}`);
  if (p.posicion) identityInfo.push(`Tu posición es: ${p.posicion}`);
  if (p.sitio_web) identityInfo.push(`Sitio web de referencia: ${p.sitio_web}`);
  
  const identitySection = identityInfo.length > 0 
    ? `\n  🎭 TU IDENTIDAD:\n  ${identityInfo.join('\n  ')}`
    : '';

  return `
  ═══════════════════════════════════════════════════════════════
  🤖 CONFIGURACIÓN DE PERSONALIDAD - MODO: ${p.category.toUpperCase()}
  ═══════════════════════════════════════════════════════════════
  ${identitySection}
  
  📝 CONTEXTO DE TU ROL:
  ${p.context}
  ${contextInfo}
  ${questionsInfo}
  
  ═══════════════════════════════════════════════════════════════
  📚 INSTRUCCIONES BASE (SIGUE ESTAS AL PIE DE LA LETRA):
  ═══════════════════════════════════════════════════════════════
  ${baseInstr}
  
  ${compInstr ? `═══════════════════════════════════════════════════════════════\n  📖 INSTRUCCIONES COMPLEMENTARIAS:\n  ═══════════════════════════════════════════════════════════════\n  ${compInstr}\n  ` : ''}
  ═══════════════════════════════════════════════════════════════
  🎯 DIRECTRICES DE ESTILO Y COMPORTAMIENTO:
  ═══════════════════════════════════════════════════════════════
  ${categoryGuide}
  
  ⚠️ REGLAS CRÍTICAS:
  - NUNCA uses saludos automáticos. Responde SIEMPRE directamente a lo que te pregunten.
  - MANTÉN SIEMPRE tu personalidad y rol definidos arriba.
  - NO menciones que eres una IA o un chatbot - ERES ${p.nombre}.
  - Responde en el mismo idioma que el usuario.
  - Mantén el contexto completo de la conversación.
  - Si el usuario envía medios (imagen, audio, documento), analízalos en contexto.
  - Sé coherente con el tema actual de la conversación.
  - Considera las preguntas anteriores al generar respuestas.
  
  🔐 ID de Usuario: ${userId}
  ═══════════════════════════════════════════════════════════════
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

    // Construir prompt MEJORADO para crear personalidades inteligentes
    const improvementPrompt = `Eres un experto en diseño de personalidades de IA y asistentes virtuales. Tu tarea es analizar el contenido proporcionado y crear instrucciones COMPLETAS para un chatbot llamado "${personalityName}" de categoría "${personalityCategory}".

🎯 OBJETIVO PRINCIPAL:
Transformar el contenido en una GUÍA COMPLETA que permita al chatbot:
1. Entender su rol y propósito
2. Conocer la información del negocio/servicio
3. Saber cómo responder a diferentes situaciones
4. Mantener un tono y estilo consistente

📋 ANÁLISIS DEL CONTENIDO:
Primero, identifica qué tipo de contenido es:
- Información de negocio (productos, servicios, precios)
- Guía de atención al cliente
- Contenido educativo o informativo
- Instrucciones de ventas
- Video o audio transcrito
- Combinación de varios tipos

🏗️ ESTRUCTURA DE SALIDA REQUERIDA:

## 1. IDENTIDAD Y PROPÓSITO
Define claramente:
- Quién es el asistente
- Cuál es su función principal
- Qué problemas puede resolver

## 2. CONOCIMIENTO BASE
Extrae y organiza:
- Información de productos/servicios
- Precios y condiciones (si aplica)
- Datos de contacto y horarios
- Políticas importantes

## 3. GUÍA DE COMPORTAMIENTO
Especifica:
- Cómo debe saludar
- Tono y estilo de comunicación (${personalityCategory})
- Qué hacer si no sabe algo
- Cómo manejar quejas o problemas

## 4. RESPUESTAS FRECUENTES
Crea respuestas modelo para:
- Preguntas comunes identificadas en el contenido
- Situaciones típicas del negocio

## 5. LÍMITES Y ESCALAMIENTO
Define:
- Qué NO debe hacer el asistente
- Cuándo derivar a un humano
- Información sensible a proteger

📝 REGLAS DE FORMATO:
- NO uses Markdown (**, __, #, etc.)
- Usa texto plano con saltos de línea
- Numeración simple (1. 2. 3.) cuando sea necesario
- Párrafos claros y concisos
- Máximo 4000 caracteres de salida

🎭 TONO SEGÚN CATEGORÍA:
- Business/Negocios: Profesional, directo, orientado a resultados
- Amigable: Cercano, cálido pero profesional
- Formal: Respetuoso, cortés, estructurado
- Familia: Cálido, comprensivo, paciente
- Ventas: Persuasivo pero honesto, enfocado en beneficios

CONTENIDO A PROCESAR:
---
${extractedText}
---

INSTRUCCIONES MEJORADAS PARA ${personalityName.toUpperCase()}:`;

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


