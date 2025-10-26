/**
 * Parche para integrar URLs de video en el controlador de personality existente
 * Este archivo modifica la función sendInstruction para soportar YouTube, Instagram Reels y TikTok
 */

import { processVideoUrlsAfterInstruction } from '../controllers/personalityControllerExtended.js';
import { isVideoUrl, getVideoUrlInfo } from '../utils/personalityVideoUrlHandler.js';
import { checkYtDlpAvailability } from '../utils/videoUrlProcessor.js';

/**
 * Función que extiende sendInstruction para manejar URLs de video
 * Se debe llamar al final de la función sendInstruction original
 */
export async function handleVideoUrlsInInstruction(req, res, instructionId, userId, personalityCheck) {
  const { media } = req.body;
  
  if (!Array.isArray(media) || media.length === 0) {
    return { success: true, processedVideos: [] };
  }

  // Detectar URLs de video
  const videoUrls = [];
  media.forEach((m, index) => {
    if (m.url && !m.data && isVideoUrl(m.url)) {
      const videoInfo = getVideoUrlInfo(m.url);
      if (videoInfo.isValid) {
        videoUrls.push({ ...m, index, videoInfo });
      }
    }
  });

  if (videoUrls.length === 0) {
    return { success: true, processedVideos: [] };
  }

  console.log(`🎬 Detectadas ${videoUrls.length} URLs de video para procesar`);

  // Verificar disponibilidad del servicio
  const ytDlpAvailable = await checkYtDlpAvailability();
  if (!ytDlpAvailable) {
    console.warn('⚠️ yt-dlp no disponible, saltando procesamiento de URLs de video');
    return { 
      success: false, 
      error: 'Servicio de descarga de videos no disponible',
      processedVideos: [] 
    };
  }

  try {
    // Procesar URLs de video
    const processedVideos = await processVideoUrlsAfterInstruction(
      instructionId, 
      videoUrls, 
      userId, 
      personalityCheck
    );

    console.log(`✅ URLs de video procesadas exitosamente: ${processedVideos.length}`);
    
    return { 
      success: true, 
      processedVideos,
      videoCount: processedVideos.length 
    };

  } catch (error) {
    console.error('❌ Error procesando URLs de video:', error);
    return { 
      success: false, 
      error: error.message,
      processedVideos: [] 
    };
  }
}

/**
 * Función para validar URLs de video antes del procesamiento
 */
export function validateVideoUrlsInMedia(media) {
  if (!Array.isArray(media)) {
    return { valid: true, videoUrls: [] };
  }

  const videoUrls = [];
  const invalidUrls = [];

  media.forEach((m, index) => {
    if (m.url && !m.data) {
      const videoInfo = getVideoUrlInfo(m.url);
      if (videoInfo.isValid) {
        videoUrls.push({ ...m, index, videoInfo });
      } else if (m.url.includes('youtube.com') || m.url.includes('youtu.be') || 
                 m.url.includes('instagram.com') || m.url.includes('tiktok.com')) {
        invalidUrls.push({ url: m.url, index });
      }
    }
  });

  return {
    valid: invalidUrls.length === 0,
    videoUrls,
    invalidUrls,
    hasVideoUrls: videoUrls.length > 0
  };
}

/**
 * Función para actualizar la respuesta con información de videos procesados
 */
export function enhanceResponseWithVideoInfo(originalResponse, videoResult) {
  if (!videoResult || !videoResult.processedVideos) {
    return originalResponse;
  }

  return {
    ...originalResponse,
    videoProcessing: {
      success: videoResult.success,
      processedCount: videoResult.processedVideos.length,
      videos: videoResult.processedVideos.map(v => ({
        platform: v.platform,
        originalUrl: v.originalUrl,
        filename: v.filename,
        title: v.metadata?.title,
        duration: v.metadata?.duration
      }))
    }
  };
}
