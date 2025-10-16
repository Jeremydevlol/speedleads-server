import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Procesa una transcripción cruda y la convierte en instrucciones estructuradas
 * @param {string} transcription - Transcripción cruda del video
 * @param {object} metadata - Metadatos del video (título, canal, etc.)
 * @param {string} platform - Plataforma del video (youtube, tiktok, instagram)
 * @returns {Promise<string>} - Instrucciones estructuradas
 */
export async function processTranscriptionToInstructions(transcription, metadata = {}, platform = '') {
  try {
    if (!transcription || transcription.trim().length === 0) {
      return 'No hay contenido de audio para procesar en instrucciones.';
    }

    console.log('🤖 Procesando transcripción con IA...');
    console.log(`📝 Texto original: ${transcription.length} caracteres`);

    const systemPrompt = `Eres un experto en análisis de contenido de videos que crea resúmenes naturales y conversacionales.

Tu tarea es analizar la transcripción de un video y crear un resumen natural que explique de qué trata realmente el video, como si fueras una persona describiendo el contenido a un amigo.

ESTILO DE ANÁLISIS:
- Escribe de forma natural y conversacional
- Explica de qué trata realmente el video
- Usa un lenguaje cercano y directo
- Enfócate en el contenido principal y el mensaje
- Menciona detalles importantes o curiosos
- Evita listas formales o estructuras rígidas

EJEMPLOS DE BUEN ESTILO:
❌ MAL: "El video contiene instrucciones sobre gaming con los siguientes puntos..."
✅ BIEN: "Este video trata sobre Lolito que va a hacer un directo de 24 horas jugando Minecraft sin parar, donde va a comer, dormir y hacer todo en stream."

❌ MAL: "### Instrucciones para el contenido: 1. El usuario menciona..."
✅ BIEN: "En este video, el youtuber está anunciando que va a borrar el video en 24 horas y quiere que la gente vaya a ver un video sorpresa que tiene en el segundo link de la descripción."

REGLAS:
1. Mantén toda la información importante de la transcripción
2. Escribe como si fueras una persona explicando el video
3. No uses formatos de listas o instrucciones formales
4. Enfócate en QUÉ pasa en el video y POR QUÉ es interesante
5. Menciona detalles específicos que hacen único el contenido
6. Usa un tono natural y directo`;

    const userPrompt = `Analiza este video de ${platform} y explícame de qué trata de forma natural y conversacional:

INFORMACIÓN DEL VIDEO:
- Título: ${metadata.title || 'Sin título'}
- Canal/Usuario: ${metadata.uploader || metadata.channel || 'Desconocido'}
- Plataforma: ${platform}
- Duración: ${metadata.duration ? `${Math.floor(metadata.duration / 60)}:${String(metadata.duration % 60).padStart(2, '0')}` : 'N/A'}

LO QUE DICE EN EL VIDEO:
"${transcription}"

Explícame de qué trata este video de forma natural, como si me estuvieras contando qué pasa en él:`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    if (!completion.choices[0]?.message?.content) {
      throw new Error('No se recibió respuesta válida de OpenAI');
    }

    const processedInstructions = completion.choices[0].message.content.trim();
    
    console.log('✅ Transcripción procesada exitosamente');
    console.log(`📋 Instrucciones generadas: ${processedInstructions.length} caracteres`);

    return processedInstructions;

  } catch (error) {
    console.error('❌ Error procesando transcripción con IA:', error.message);
    
    // Fallback: devolver transcripción original con formato básico
    const fallbackInstructions = formatTranscriptionBasic(transcription, metadata, platform);
    console.log('⚠️ Usando formato básico como fallback');
    
    return fallbackInstructions;
  }
}

/**
 * Formato básico de fallback cuando la IA no está disponible
 * @param {string} transcription - Transcripción original
 * @param {object} metadata - Metadatos del video
 * @param {string} platform - Plataforma
 * @returns {string} - Instrucciones con formato básico
 */
function formatTranscriptionBasic(transcription, metadata = {}, platform = '') {
  return `## Información del Video de ${platform.charAt(0).toUpperCase() + platform.slice(1)}

### Metadatos
- **Título:** ${metadata.title || 'Sin título'}
- **Canal/Usuario:** ${metadata.uploader || metadata.channel || 'Desconocido'}
- **Plataforma:** ${platform}
- **Duración:** ${metadata.duration ? `${Math.floor(metadata.duration / 60)}:${String(metadata.duration % 60).padStart(2, '0')}` : 'N/A'}

### Contenido Transcrito
${transcription}

### Instrucciones de Uso
- Utiliza esta información como referencia del contenido del video
- El contenido proviene de una transcripción automática
- Mantén el contexto original al referenciar esta información`;
}

/**
 * Procesa múltiples transcripciones y las combina en instrucciones coherentes
 * @param {Array} transcriptions - Array de objetos con transcripción y metadatos
 * @returns {Promise<string>} - Instrucciones combinadas
 */
export async function processBatchTranscriptions(transcriptions) {
  try {
    if (!transcriptions || transcriptions.length === 0) {
      return 'No hay transcripciones para procesar.';
    }

    console.log(`🤖 Procesando ${transcriptions.length} transcripciones en lote...`);

    if (transcriptions.length === 1) {
      // Si solo hay una, usar el procesamiento individual
      return await processTranscriptionToInstructions(
        transcriptions[0].transcription,
        transcriptions[0].metadata,
        transcriptions[0].platform
      );
    }

    // Para múltiples transcripciones, crear un prompt combinado
    const systemPrompt = `Eres un asistente experto en organizar múltiples transcripciones de videos en un conjunto coherente de instrucciones.

Tu tarea es tomar varias transcripciones de diferentes videos y organizarlas en instrucciones estructuradas y coherentes.

REGLAS:
1. Mantén TODA la información de todas las transcripciones
2. Organiza por temas o videos cuando sea apropiado
3. Elimina redundancias pero mantén información única
4. Crea secciones claras para cada video o tema
5. Convierte en instrucciones accionables cuando sea posible
6. Numera o identifica claramente cada fuente`;

    let combinedPrompt = 'Organiza estas transcripciones de videos en instrucciones estructuradas:\n\n';
    
    transcriptions.forEach((item, index) => {
      combinedPrompt += `### VIDEO ${index + 1} (${item.platform})\n`;
      combinedPrompt += `**Título:** ${item.metadata?.title || 'Sin título'}\n`;
      combinedPrompt += `**Usuario:** ${item.metadata?.uploader || 'Desconocido'}\n`;
      combinedPrompt += `**Transcripción:** "${item.transcription}"\n\n`;
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: combinedPrompt }
      ],
      temperature: 0.3,
      max_tokens: 3000
    });

    const processedInstructions = completion.choices[0]?.message?.content?.trim();
    
    if (!processedInstructions) {
      throw new Error('No se recibió respuesta válida para procesamiento en lote');
    }

    console.log('✅ Transcripciones en lote procesadas exitosamente');
    return processedInstructions;

  } catch (error) {
    console.error('❌ Error procesando transcripciones en lote:', error.message);
    
    // Fallback: procesar individualmente y combinar
    let combinedInstructions = '## Instrucciones de Múltiples Videos\n\n';
    
    for (let i = 0; i < transcriptions.length; i++) {
      const item = transcriptions[i];
      combinedInstructions += `### Video ${i + 1} - ${item.platform}\n`;
      combinedInstructions += formatTranscriptionBasic(item.transcription, item.metadata, item.platform);
      combinedInstructions += '\n\n';
    }
    
    return combinedInstructions;
  }
}

/**
 * Valida y limpia una transcripción antes del procesamiento
 * @param {string} transcription - Transcripción a validar
 * @returns {object} - {isValid, cleanedTranscription, issues}
 */
export function validateTranscription(transcription) {
  const issues = [];
  
  if (!transcription || typeof transcription !== 'string') {
    return {
      isValid: false,
      cleanedTranscription: '',
      issues: ['Transcripción no válida o vacía']
    };
  }

  let cleaned = transcription.trim();
  
  // Verificar longitud mínima
  if (cleaned.length < 10) {
    issues.push('Transcripción muy corta (menos de 10 caracteres)');
  }
  
  // Verificar si parece ser solo ruido o errores
  const noisePatterns = [
    /^[\s\.\,\!\?\-]*$/,  // Solo puntuación y espacios
    /^(uh|um|eh|ah|mm)+$/i,  // Solo muletillas
    /^\[.*\]$/  // Solo texto entre corchetes (errores de transcripción)
  ];
  
  const seemsLikeNoise = noisePatterns.some(pattern => pattern.test(cleaned));
  if (seemsLikeNoise) {
    issues.push('La transcripción parece contener solo ruido o errores');
  }
  
  // Limpiar caracteres problemáticos
  cleaned = cleaned
    .replace(/\s+/g, ' ')  // Múltiples espacios a uno solo
    .replace(/[^\w\s\.\,\!\?\;\:\-\(\)\[\]]/g, '')  // Caracteres especiales problemáticos
    .trim();
  
  return {
    isValid: issues.length === 0,
    cleanedTranscription: cleaned,
    issues
  };
}
