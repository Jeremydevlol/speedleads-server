import { processVideoUrls, isVideoUrl, getVideoUrlInfo } from '../utils/personalityVideoUrlHandler.js';
import { checkYtDlpAvailability } from '../utils/videoUrlProcessor.js';

/**
 * Extensión del sendInstruction para manejar URLs de video
 * Esta función extiende la funcionalidad existente para soportar YouTube, Instagram Reels y TikTok
 */
export async function sendInstructionWithVideoUrls(req, res, originalSendInstruction) {
  try {
    const { media } = req.body;
    
    // Verificar si hay URLs de video en los medios
    const hasVideoUrls = Array.isArray(media) && media.some(m => 
      m.url && !m.data && isVideoUrl(m.url)
    );

    if (hasVideoUrls) {
      // Verificar que yt-dlp esté disponible
      const ytDlpAvailable = await checkYtDlpAvailability();
      if (!ytDlpAvailable) {
        return res.status(503).json({
          success: false,
          message: 'Servicio de descarga de videos no disponible. Contacta al administrador.',
          error: 'yt-dlp no está instalado'
        });
      }

      console.log('🎬 Detectadas URLs de video, procesando con funcionalidad extendida...');
      
      // Separar medios normales de URLs de video
      const normalMedia = [];
      const videoUrls = [];
      
      media.forEach((m, index) => {
        if (m.url && !m.data && isVideoUrl(m.url)) {
          const videoInfo = getVideoUrlInfo(m.url);
          videoUrls.push({ ...m, index, videoInfo });
        } else {
          normalMedia.push(m);
        }
      });

      // Validar URLs de video antes de procesar
      const invalidUrls = videoUrls.filter(v => !v.videoInfo.isValid);
      if (invalidUrls.length > 0) {
        return res.status(400).json({
          success: false,
          message: `URLs de video no válidas detectadas: ${invalidUrls.map(u => u.url).join(', ')}`,
          supportedPlatforms: ['YouTube', 'Instagram Reels', 'TikTok']
        });
      }

      // Log de URLs detectadas
      videoUrls.forEach(v => {
        console.log(`🎯 URL de ${v.videoInfo.platform} detectada: ${v.url}`);
      });

      // Modificar el request para procesar solo medios normales primero
      const modifiedReq = {
        ...req,
        body: {
          ...req.body,
          media: normalMedia
        }
      };

      // Llamar a la función original con medios normales
      return await originalSendInstruction(modifiedReq, res, videoUrls);
    }

    // Si no hay URLs de video, usar la función original sin modificaciones
    return await originalSendInstruction(req, res);

  } catch (error) {
    console.error('❌ Error en sendInstructionWithVideoUrls:', error);
    return res.status(500).json({
      success: false,
      message: 'Error procesando instrucción con videos',
      error: error.message
    });
  }
}

/**
 * Middleware para validar URLs de video antes del procesamiento
 */
export function validateVideoUrlsMiddleware(req, res, next) {
  const { media } = req.body;
  
  if (!Array.isArray(media)) {
    return next();
  }

  const videoUrls = media.filter(m => m.url && !m.data);
  const validationResults = [];
  
  for (const m of videoUrls) {
    const videoInfo = getVideoUrlInfo(m.url);
    if (videoInfo.isValid) {
      validationResults.push({
        url: m.url,
        platform: videoInfo.platform,
        valid: true
      });
    } else if (m.url.includes('youtube.com') || m.url.includes('youtu.be') || 
               m.url.includes('instagram.com') || m.url.includes('tiktok.com')) {
      // Es una URL de plataforma soportada pero formato inválido
      validationResults.push({
        url: m.url,
        platform: 'unknown',
        valid: false,
        error: 'Formato de URL no válido para la plataforma detectada'
      });
    }
  }

  // Agregar información de validación al request
  req.videoUrlValidation = validationResults;
  
  next();
}

/**
 * Endpoint para validar URLs de video sin procesarlas
 */
export async function validateVideoUrl(req, res) {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL requerida'
      });
    }

    const videoInfo = getVideoUrlInfo(url);
    
    if (videoInfo.isValid) {
      // Verificar disponibilidad del servicio
      const ytDlpAvailable = await checkYtDlpAvailability();
      
      return res.json({
        success: true,
        valid: true,
        platform: videoInfo.platform,
        videoId: videoInfo.videoId,
        serviceAvailable: ytDlpAvailable,
        message: ytDlpAvailable 
          ? `URL de ${videoInfo.platform} válida y lista para procesar`
          : `URL de ${videoInfo.platform} válida pero servicio no disponible`
      });
    } else {
      return res.json({
        success: true,
        valid: false,
        message: 'URL no es de una plataforma soportada',
        supportedPlatforms: ['YouTube', 'Instagram Reels', 'TikTok'],
        examples: [
          'https://www.youtube.com/watch?v=VIDEO_ID',
          'https://youtu.be/VIDEO_ID',
          'https://www.instagram.com/reel/REEL_ID/',
          'https://www.tiktok.com/@user/video/VIDEO_ID'
        ]
      });
    }

  } catch (error) {
    console.error('❌ Error validando URL de video:', error);
    return res.status(500).json({
      success: false,
      message: 'Error validando URL de video',
      error: error.message
    });
  }
}

/**
 * Endpoint para obtener información de una URL de video sin descargarla
 */
export async function getVideoInfo(req, res) {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL requerida'
      });
    }

    const videoInfo = getVideoUrlInfo(url);
    
    return res.json({
      success: true,
      videoInfo,
      serviceStatus: await checkYtDlpAvailability()
    });

  } catch (error) {
    console.error('❌ Error obteniendo info de video:', error);
    return res.status(500).json({
      success: false,
      message: 'Error obteniendo información del video',
      error: error.message
    });
  }
}

/**
 * Función helper para procesar URLs de video después de crear la instrucción
 */
export async function processVideoUrlsAfterInstruction(instructionId, videoUrls, userId, personalityCheck) {
  if (!videoUrls || videoUrls.length === 0) {
    return [];
  }

  console.log(`🎬 Procesando ${videoUrls.length} URLs de video para instrucción ${instructionId}`);
  
  try {
    // Convertir videoUrls al formato esperado por processVideoUrls
    const mediaArray = videoUrls.map(v => ({
      url: v.url,
      filename: `${v.videoInfo.platform}_video_${v.videoInfo.videoId || Date.now()}`,
      type: 'video_url',
      platform: v.videoInfo.platform
    }));

    const processedVideos = await processVideoUrls(mediaArray, instructionId, userId, personalityCheck);
    
    console.log(`✅ Procesadas ${processedVideos.length} URLs de video exitosamente`);
    
    return processedVideos;
    
  } catch (error) {
    console.error('❌ Error procesando URLs de video:', error);
    throw error;
  }
}
