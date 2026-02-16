import fs from 'fs';
import { supabaseAdmin } from '../config/db.js';
import { uploadToSupabaseStorage } from './fileUtils.js';
import { cleanupTempFiles, detectVideoUrl, downloadVideoFromUrl } from './videoUrlProcessor.js';

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
        
        // Subir a Supabase Storage
        console.log(`☁️ Subiendo video a Supabase Storage...`);
        const uploadResult = await uploadToSupabaseStorage(
          videoBuffer,
          downloadResult.filename,
          downloadResult.mimeType,
          userId
        );

        // Crear entrada en la tabla media
        const mediaEntry = {
          users_id: userId,
          personality_instruction_id: instructionId,
          media_type: 'video',
          filename: downloadResult.filename,
          mime_type: downloadResult.mimeType,
          image_url: uploadResult.publicUrl,
          file_size: downloadResult.size,
          extracted_text: generateVideoDescription(downloadResult, urlItem.videoInfo),
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
        
        // Personalizar mensaje para YouTube y detener procesamiento
        if (urlItem.videoInfo.platform === 'youtube') {
          throw new Error('Actualmente los videos de YouTube no están disponibles. Prueba con un video de TikTok o Instagram.');
        }
        // Para otras plataformas, solo registrar el error y continuar
        let userErrorMessage = error.message;
        // Agregar entrada de error para tracking
        const errorEntry = {
          users_id: userId,
          personality_instruction_id: instructionId,
          media_type: 'video_url_error',
          filename: `error_${urlItem.videoInfo.platform}_${Date.now()}`,
          mime_type: 'text/plain',
          extracted_text: `Error procesando video de ${urlItem.videoInfo.platform}: ${userErrorMessage}`,
          metadata: JSON.stringify({
            platform: urlItem.videoInfo.platform,
            originalUrl: urlItem.url,
            error: userErrorMessage,
            timestamp: new Date().toISOString()
          }),
          created_at: new Date().toISOString()
        };

        try {
          await supabaseAdmin.from('media').insert(errorEntry);
        } catch (dbError) {
          console.error('❌ Error guardando error en BD:', dbError);
        }

        // Continuar con el siguiente video solo si no es YouTube
        console.log(`⏭️ Continuando con el siguiente video...`);
      }
    }
  }

  // Limpiar archivos temporales antiguos
  cleanupTempFiles();

  return processedMedia;
}

/**
 * Genera una descripción textual del video para análisis de IA
 * @param {object} downloadResult - Resultado de la descarga
 * @param {object} videoInfo - Información de la URL del video
 * @returns {string} - Descripción textual
 */
function generateVideoDescription(downloadResult, videoInfo) {
  const metadata = downloadResult.metadata;
  
  let description = `Video de ${videoInfo.platform}:\n`;
  description += `Título: ${metadata.title}\n`;
  
  if (metadata.description) {
    description += `Descripción: ${metadata.description}\n`;
  }
  
  if (metadata.uploader) {
    description += `Canal/Usuario: ${metadata.uploader}\n`;
  }
  
  if (metadata.duration) {
    const minutes = Math.floor(metadata.duration / 60);
    const seconds = metadata.duration % 60;
    description += `Duración: ${minutes}:${seconds.toString().padStart(2, '0')}\n`;
  }
  
  if (metadata.viewCount) {
    description += `Visualizaciones: ${metadata.viewCount.toLocaleString()}\n`;
  }
  
  if (metadata.uploadDate) {
    description += `Fecha de subida: ${metadata.uploadDate}\n`;
  }
  
  description += `URL original: ${videoInfo.originalUrl}\n`;
  description += `Plataforma: ${videoInfo.platform}\n`;
  
  return description;
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
