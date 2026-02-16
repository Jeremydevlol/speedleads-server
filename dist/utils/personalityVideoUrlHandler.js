import { exec } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { supabaseAdmin } from '../config/db.js';
import { transcribeAudioBuffer } from '../services/openaiService.js';
import { uploadToSupabaseStorage } from './fileUtils.js';
import { processTranscriptionToInstructions, validateTranscription } from './transcriptionProcessor.js';
import { cleanupTempFiles, detectVideoUrl, downloadVideoFromUrl } from './videoUrlProcessor.js';

const execAsync = promisify(exec);

// Obtener la ruta de ffmpeg (preferir ffmpeg-static)
const FFMPEG_PATH = ffmpegStatic || 'ffmpeg';
console.log('🎬 FFmpeg path:', FFMPEG_PATH);

/**
 * Procesa URLs de video en las instrucciones de personalidad
 * @param {Array} media - Array de medios que puede incluir URLs
 * @param {string} instructionId - ID de la instrucción
 * @param {string} userId - ID del usuario
 * @param {object} personalityCheck - Datos de la personalidad
 * @returns {Promise<Array>} - Array de medios procesados
 */
export async function processVideoUrls(media, instructionId, userId, personalityCheck) {
  const processedMedia = [];
  const videoUrls = [];
  
  // Separar URLs de video de otros medios
  for (const [index, m] of media.entries()) {
    if (m.url && !m.data) {
      const videoInfo = detectVideoUrl(m.url);
      if (videoInfo.isValid) {
        videoUrls.push({ ...m, index, videoInfo });
        console.log(`🎬 URL de video detectada (${videoInfo.platform}): ${m.url}`);
      } else {
        // No es una URL de video soportada, mantener como está
        processedMedia.push(m);
      }
    } else {
      // Es un archivo directo, mantener como está
      processedMedia.push(m);
    }
  }

  // Procesar URLs de video
  if (videoUrls.length > 0) {
    console.log(`📥 Procesando ${videoUrls.length} URLs de video...`);
    
    for (const urlItem of videoUrls) {
      try {
        console.log(`🔄 Descargando video desde ${urlItem.videoInfo.platform}: ${urlItem.url}`);
        
        // Descargar video
        const downloadResult = await downloadVideoFromUrl(urlItem.url);
        
        if (!downloadResult.success) {
          throw new Error(`Error descargando video: ${downloadResult.error}`);
        }

        // Leer archivo descargado
        const videoBuffer = fs.readFileSync(downloadResult.videoPath);
        
        // Extraer y transcribir audio del video
        console.log(`🎵 Extrayendo audio para transcripción...`);
        let rawTranscription = '';
        let processedInstructions = '';
        
        try {
          rawTranscription = await extractAndTranscribeVideoAudio(downloadResult.videoPath);
          console.log(`✅ Transcripción cruda completada: ${rawTranscription.length} caracteres`);
          
          // Validar transcripción
          const validation = validateTranscription(rawTranscription);
          if (!validation.isValid) {
            console.warn(`⚠️ Problemas en transcripción: ${validation.issues.join(', ')}`);
          }
          
          // Procesar transcripción con IA para convertir en instrucciones
          if (validation.cleanedTranscription && validation.cleanedTranscription.length > 10) {
            console.log(`🤖 Procesando transcripción con IA para generar instrucciones...`);
            
            processedInstructions = await processTranscriptionToInstructions(
              validation.cleanedTranscription,
              downloadResult.metadata,
              urlItem.videoInfo.platform
            );
            
            console.log(`✅ Instrucciones generadas: ${processedInstructions.length} caracteres`);
          } else {
            processedInstructions = `Contenido de ${urlItem.videoInfo.platform} sin transcripción de audio válida.`;
          }
          
        } catch (transcriptionError) {
          console.warn(`⚠️ Error en transcripción: ${transcriptionError.message}`);
          rawTranscription = `[Error de transcripción: ${transcriptionError.message}]`;
          processedInstructions = `Error procesando contenido de ${urlItem.videoInfo.platform}: ${transcriptionError.message}`;
        }
        
        // Intentar subir a Supabase Storage (opcional)
        console.log(`☁️ Intentando subir video a Supabase Storage...`);
        let uploadResult = null;
        try {
          uploadResult = await uploadToSupabaseStorage(
            videoBuffer,
            downloadResult.filename,
            downloadResult.mimeType,
            userId
          );
          console.log(`✅ Video subido exitosamente a Supabase`);
        } catch (uploadError) {
          console.warn(`⚠️ No se pudo subir video a Supabase: ${uploadError.message}`);
          console.log(`📝 Continuando sin subir video - solo guardando transcripción`);
          // Crear resultado mock para continuar
          uploadResult = {
            publicUrl: null,
            path: downloadResult.filename,
            size: downloadResult.size
          };
        }

        // Crear entrada en la tabla media
        const mediaEntry = {
          users_id: userId,
          personality_instruction_id: instructionId,
          media_type: 'video', // Asegurar que no sea null
          filename: downloadResult.filename,
          mime_type: downloadResult.mimeType,
          image_url: uploadResult.publicUrl || `local://${downloadResult.filename}`,
          file_size: downloadResult.size, // Columna agregada
          extracted_text: generateVideoDescription(downloadResult, urlItem.videoInfo, rawTranscription, processedInstructions),
          metadata: JSON.stringify({
            platform: urlItem.videoInfo.platform,
            originalUrl: urlItem.url,
            videoId: urlItem.videoInfo.videoId,
            title: downloadResult.metadata.title,
            description: downloadResult.metadata.description,
            duration: downloadResult.metadata.duration,
            uploader: downloadResult.metadata.uploader,
            uploadDate: downloadResult.metadata.uploadDate,
            viewCount: downloadResult.metadata.viewCount,
            likeCount: downloadResult.metadata.likeCount
          }),
          created_at: new Date().toISOString()
        };

        // Insertar en base de datos
        const { data: insertedMedia, error: insertError } = await supabaseAdmin
          .from('media')
          .insert(mediaEntry)
          .select()
          .single();

        if (insertError) {
          console.error('❌ Error insertando media en BD:', insertError);
          throw insertError;
        }

        console.log(`✅ Video procesado exitosamente: ${downloadResult.filename}`);
        console.log(`📝 Transcripción guardada: ${processedInstructions.length} caracteres`);
        console.log(`🎯 extracted_text guardado: ${mediaEntry.extracted_text.length} caracteres`);

        // Agregar a los medios procesados
        processedMedia.push({
          id: insertedMedia.id,
          url: uploadResult.publicUrl,
          filename: downloadResult.filename,
          mimeType: downloadResult.mimeType,
          type: 'video',
          platform: urlItem.videoInfo.platform,
          originalUrl: urlItem.url,
          metadata: downloadResult.metadata,
          extractedText: mediaEntry.extracted_text
        });

        // Limpiar archivo temporal
        try {
          fs.unlinkSync(downloadResult.videoPath);
          // Limpiar archivos de metadatos si existen
          if (downloadResult.metadata.thumbnail) {
            fs.unlinkSync(downloadResult.metadata.thumbnail);
          }
        } catch (cleanupError) {
          console.warn('⚠️ Error limpiando archivos temporales:', cleanupError.message);
        }

      } catch (error) {
        console.error(`❌ Error procesando URL de video ${urlItem.url}:`, error.message);
        
        // Agregar entrada de error para tracking
        const errorEntry = {
          users_id: userId,
          personality_instruction_id: instructionId,
          media_type: 'video_url_error',
          filename: `error_${urlItem.videoInfo.platform}_${Date.now()}`,
          mime_type: 'text/plain',
          extracted_text: `Error procesando video de ${urlItem.videoInfo.platform}: ${error.message}`,
          metadata: JSON.stringify({
            platform: urlItem.videoInfo.platform,
            originalUrl: urlItem.url,
            error: error.message,
            timestamp: new Date().toISOString()
          }),
          created_at: new Date().toISOString()
        };

        try {
          await supabaseAdmin.from('media').insert(errorEntry);
        } catch (dbError) {
          console.error('❌ Error guardando error en BD:', dbError);
        }

        // Continuar con el siguiente video en lugar de fallar completamente
        console.log(`⏭️ Continuando con el siguiente video...`);
      }
    }
  }

  // Limpiar archivos temporales antiguos
  cleanupTempFiles();

  return processedMedia;
}

/**
 * Extrae audio de un video y lo transcribe usando OpenAI Whisper
 * @param {string} videoPath - Ruta al archivo de video
 * @returns {Promise<string>} - Transcripción del audio
 */
async function extractAndTranscribeVideoAudio(videoPath) {
  const audioPath = videoPath.replace(/\.[^/.]+$/, '.wav');
  
  try {
    // Extraer audio usando ffmpeg (con ffmpeg-static)
    console.log(`🎵 Extrayendo audio de ${path.basename(videoPath)}...`);
    const ffmpegCommand = `"${FFMPEG_PATH}" -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`;
    
    await execAsync(ffmpegCommand);
    console.log(`✅ Audio extraído: ${path.basename(audioPath)}`);
    
    // Leer el archivo de audio
    const audioBuffer = fs.readFileSync(audioPath);
    
    // Transcribir usando OpenAI Whisper
    console.log(`🎤 Transcribiendo audio...`);
    const transcription = await transcribeAudioBuffer(audioBuffer, path.basename(audioPath));
    
    // Limpiar archivo de audio temporal
    try {
      fs.unlinkSync(audioPath);
    } catch (cleanupError) {
      console.warn(`⚠️ Error limpiando archivo de audio: ${cleanupError.message}`);
    }
    
    return transcription || '[Sin transcripción disponible]';
    
  } catch (error) {
    console.error(`❌ Error en extracción/transcripción de audio: ${error.message}`);
    
    // Limpiar archivo de audio si existe
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    } catch (cleanupError) {
      // Ignorar errores de limpieza
    }
    
    throw new Error(`Error procesando audio: ${error.message}`);
  }
}

/**
 * Genera una descripción textual del video para análisis de IA
 * @param {object} downloadResult - Resultado de la descarga
 * @param {object} videoInfo - Información de la URL del video
 * @param {string} rawTranscription - Transcripción cruda del audio (opcional)
 * @param {string} processedInstructions - Instrucciones procesadas por IA (opcional)
 * @returns {string} - Descripción textual
 */
function generateVideoDescription(downloadResult, videoInfo, rawTranscription = '', processedInstructions = '') {
  // Formato profesional: solo el análisis de IA sin metadatos adicionales
  if (processedInstructions && processedInstructions.trim() && !processedInstructions.includes('Error procesando')) {
    return processedInstructions.trim();
  } else {
    // Si no hay análisis de IA, usar transcripción cruda
    if (rawTranscription && rawTranscription.trim() && !rawTranscription.includes('[Error de transcripción')) {
      return rawTranscription.trim();
    } else if (rawTranscription && rawTranscription.includes('[Error de transcripción')) {
      return `⚠️ ${rawTranscription}`;
    } else {
      return '[Sin transcripción de audio disponible]';
    }
  }
}

/**
 * Valida si una URL es de video soportada
 * @param {string} url - URL a validar
 * @returns {boolean} - true si es soportada
 */
export function isVideoUrl(url) {
  const videoInfo = detectVideoUrl(url);
  return videoInfo.isValid;
}

/**
 * Obtiene información de una URL de video sin descargarla
 * @param {string} url - URL del video
 * @returns {object} - Información del video
 */
export function getVideoUrlInfo(url) {
  return detectVideoUrl(url);
}

/**
 * Valida múltiples URLs de video
 * @param {Array} urls - Array de URLs
 * @returns {Array} - Array con información de validación
 */
export function validateVideoUrls(urls) {
  return urls.map(url => ({
    url,
    ...detectVideoUrl(url)
  }));
}
