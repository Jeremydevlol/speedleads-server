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

    const systemPrompt = `Eres un asistente experto en convertir transcripciones de videos en instrucciones claras y estructuradas.

Tu tarea es tomar la transcripción de un video y convertirla en instrucciones útiles, información organizada, o indicaciones claras que una IA pueda usar para aprender.

REGLAS:
1. Mantén TODA la información de la transcripción original
2. Organiza el contenido en secciones claras
3. Convierte declaraciones en instrucciones o información estructurada
4. Usa formato claro con viñetas, numeración o secciones
5. No inventes información que no esté en la transcripción
6. Si hay consejos, conviértelos en instrucciones directas
7. Si hay información, organízala por temas
8. Si hay narraciones, extrae los puntos clave como datos

FORMATO DE SALIDA:
- Usa encabezados claros (##, ###)
- Organiza en secciones lógicas
- Convierte en instrucciones accionables cuando sea posible
- Mantén el contexto y significado original`;

    const userPrompt = `Convierte esta transcripción de video de ${platform} en instrucciones estructuradas:

METADATOS DEL VIDEO:
- Título: ${metadata.title || 'Sin título'}
- Canal/Usuario: ${metadata.uploader || metadata.channel || 'Desconocido'}
- Plataforma: ${platform}
- Duración: ${metadata.duration ? `${Math.floor(metadata.duration / 60)}:${String(metadata.duration % 60).padStart(2, '0')}` : 'N/A'}

TRANSCRIPCIÓN ORIGINAL:
"${transcription}"

Convierte esto en instrucciones claras y estructuradas manteniendo toda la información:`;

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
