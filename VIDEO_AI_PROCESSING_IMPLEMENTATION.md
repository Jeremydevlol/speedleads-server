# Implementación de Procesamiento de Videos con IA

## 📋 Cambios Necesarios en el Backend

### 1. **Modificaciones en `fileUtils.js`**

#### Agregar parámetro `useAI` a la función `processMediaArray`:

```javascript
export async function processMediaArray(
  mediaArray,
  conversationId,
  messageId,
  mediaType,
  userId,
  personalityData = null,
  userContext = null,
  useAI = false  // 👈 NUEVO PARÁMETRO
) {
  if (!Array.isArray(mediaArray)) return [];
  
  const processedResults = [];  // 👈 NUEVO: Array para retornar resultados
  
  // ... resto del código ...
```

#### Agregar procesamiento con IA para videos:

```javascript
// Después de extraer el texto del video (línea ~533)
// Variables para almacenar transcripción y análisis IA
let videoTranscription = null;
let aiAnalysis = null;

// Si es video y useAI está activo, procesar con IA
if (isVideo && useAI && extractedText && extractedText.length > 10) {
  console.log(`🤖 Procesando video con IA...`);
  videoTranscription = extractedText; // Guardar transcripción original
  
  try {
    // Procesar con IA según la categoría de personalidad
    const category = personalityData?.category || 'formal';
    const personalityName = personalityData?.nombre || 'Asistente';
    
    aiAnalysis = await processInstructionsWithAI(
      videoTranscription,
      category,
      personalityName,
      'Analiza esta transcripción de video y extrae las instrucciones o información clave de manera clara y concisa'
    );
    
    // Usar el análisis IA como texto extraído principal
    extractedText = aiAnalysis;
    console.log(`✅ Video procesado con IA (${aiAnalysis.length} caracteres)`);
  } catch (aiError) {
    console.error('❌ Error procesando video con IA:', aiError);
    // Fallback: usar transcripción resumida
    extractedText = summarizeText(videoTranscription);
  }
} else {
  // Resumir si el texto es demasiado largo (comportamiento original)
  extractedText = summarizeText(extractedText);
}
```

#### Guardar campos adicionales en la base de datos:

```javascript
// Preparar datos para insertar incluyendo nuevos campos
const mediaData = {
  users_id: userId,
  media_type: mediaType,
  message_id: mediaType === "chat" ? messageId : null,
  personality_instruction_id: mediaType === "instruction" ? messageId : null,
  image_url: fileUrl,
  filename: m.filename || `file.${ext}`,
  mime_type: finalMime || m.mimeType || m.type,
  extracted_text: extractedText,
  created_at: new Date().toISOString()
};

// Agregar campos adicionales si es video procesado con IA
if (isVideo && useAI && videoTranscription && aiAnalysis) {
  mediaData.video_transcription = videoTranscription;
  mediaData.ai_analysis = aiAnalysis;
  mediaData.processed_with_ai = true;
}

const { data, error } = await supabaseAdmin
  .from('media')
  .insert(mediaData)
  .select();
```

#### Retornar resultados procesados:

```javascript
// Agregar resultado procesado al array de retorno
if (data && data[0]) {
  processedResults.push({
    id: data[0].id,
    filename: m.filename || `file.${ext}`,
    type: isVideo ? 'video' : (isPdf ? 'pdf' : (isImage ? 'image' : (isAudio ? 'audio' : 'unknown'))),
    url: fileUrl,
    extractedText: extractedText,
    videoTranscription: videoTranscription,
    aiAnalysis: aiAnalysis,
    processedWithAI: useAI && (videoTranscription || aiAnalysis)
  });
}

// Al final de la función
return processedResults;
```

### 2. **Modificaciones en `personalityController.js`**

#### Endpoint `sendInstruction`:

```javascript
export const sendInstruction = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req)
    const { personalityId, instruction, media, useAI = false } = req.body  // 👈 Agregar useAI
    
    // ... validaciones ...
    
    // Procesar archivos normales primero
    let processedMedia = [];
    if (normalMedia.length > 0) {
      processedMedia = await processMediaArray(
        normalMedia, 
        null, 
        instructionId, 
        'instruction', 
        userId, 
        personalityCheck, 
        userContext, 
        useAI  // 👈 Pasar useAI
      )
    }
    
    // ... resto del código ...
    
    // Preparar respuesta con información adicional de procesamiento
    const responseData = {
      success: true,
      instructionId,
      extractedTexts
    };
    
    // Si se procesó media con IA, incluir información adicional
    if (processedMedia && processedMedia.length > 0) {
      responseData.media = processedMedia.map(item => ({
        id: item.id,
        filename: item.filename,
        type: item.type,
        url: item.url,
        extractedText: item.extractedText,
        videoTranscription: item.videoTranscription,
        aiAnalysis: item.aiAnalysis,
        processedWithAI: item.processedWithAI
      }));
    }
    
    return res.json(responseData)
  } catch (err) {
    // ... manejo de errores ...
  }
}
```

#### Endpoint `getPersonalityInstructions`:

```javascript
// Modificar el SELECT para incluir nuevos campos
const { data: mediaData, error: mediaError } = await supabaseAdmin
  .from('media')
  .select('id, media_type, filename, mime_type, image_url, extracted_text, video_transcription, ai_analysis, processed_with_ai, created_at')
  .eq('personality_instruction_id', instruction.id)
  .eq('users_id', userId)
  .order('created_at', { ascending: true });

// En el procesamiento de media, agregar los nuevos campos
const processedMedia = await Promise.all((mediaData || []).map(async mediaItem => {
  // ... código existente ...
  
  return {
    // ... campos existentes ...
    extractedText: mediaItem.extracted_text || undefined,
    // Nuevos campos para videos procesados con IA
    videoTranscription: mediaItem.video_transcription || undefined,
    aiAnalysis: mediaItem.ai_analysis || undefined,
    processedWithAI: mediaItem.processed_with_ai || false,
    // ... resto de campos ...
  };
}));
```

### 3. **Cambios en la Base de Datos (Supabase)**

Ejecutar el siguiente SQL en Supabase:

```sql
-- Agregar nuevas columnas a la tabla media
ALTER TABLE media 
ADD COLUMN IF NOT EXISTS video_transcription TEXT,
ADD COLUMN IF NOT EXISTS ai_analysis TEXT,
ADD COLUMN IF NOT EXISTS processed_with_ai BOOLEAN DEFAULT FALSE;

-- Crear índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_media_processed_with_ai 
ON media(processed_with_ai) 
WHERE processed_with_ai = true;
```

## 📊 Flujo de Procesamiento

1. **Frontend envía**: `POST /api/personalities/instructions` con `useAI: true`
2. **Backend recibe** el video y el parámetro `useAI`
3. **Transcribe el video** usando ffmpeg + OpenAI Whisper
4. **Procesa con IA** la transcripción para generar análisis inteligente
5. **Guarda en BD**:
   - `extracted_text`: Análisis IA (texto principal)
   - `video_transcription`: Transcripción completa
   - `ai_analysis`: Análisis procesado
   - `processed_with_ai`: true
6. **Retorna al frontend** todos los campos para mostrar

## ✅ Resultado Final

El frontend recibirá:

```json
{
  "success": true,
  "instructionId": "xxx",
  "media": [{
    "id": "xxx",
    "filename": "video.mp4",
    "type": "video",
    "url": "https://...",
    "extractedText": "Análisis resumido por IA",
    "videoTranscription": "Transcripción completa del video...",
    "aiAnalysis": "Análisis inteligente procesado...",
    "processedWithAI": true
  }]
}
```

## 🚀 Testing

Para probar la implementación:

```bash
curl -X POST http://localhost:5001/api/personalities/instructions \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "personalityId": "uuid-personalidad",
    "instruction": "Analiza este video",
    "useAI": true,
    "media": [{
      "data": "base64-del-video",
      "mimeType": "video/mp4",
      "filename": "tutorial.mp4",
      "type": "video"
    }]
  }'
```

## 📝 Notas Importantes

- El procesamiento con IA solo se activa si `useAI: true` y el archivo es un video
- Si falla el procesamiento IA, se usa la transcripción resumida como fallback
- Los PDFs también pueden usar `useAI` con el sistema existente
- El límite de 1000 caracteres se aplica al resultado final del análisis IA
