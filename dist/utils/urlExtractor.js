import { detectVideoUrl } from './videoUrlProcessor.js';

/**
 * Extrae URLs de video del texto de instrucción y las separa
 * @param {string} instructionText - Texto de la instrucción
 * @returns {object} - {cleanText, videoUrls}
 */
export function extractVideoUrlsFromText(instructionText) {
  if (!instructionText || typeof instructionText !== 'string') {
    return { cleanText: instructionText || '', videoUrls: [] };
  }

  // Patrones para detectar URLs
  const urlPattern = /https?:\/\/[^\s]+/g;
  const foundUrls = instructionText.match(urlPattern) || [];
  
  const videoUrls = [];
  let cleanText = instructionText;

  foundUrls.forEach(url => {
    // Limpiar la URL (quitar caracteres finales como puntos, comas)
    const cleanUrl = url.replace(/[.,;!?]+$/, '');
    
    const videoInfo = detectVideoUrl(cleanUrl);
    if (videoInfo.isValid) {
      videoUrls.push({
        url: cleanUrl,
        type: 'video_url',
        platform: videoInfo.platform,
        videoId: videoInfo.videoId,
        filename: `${videoInfo.platform}_${videoInfo.videoId || Date.now()}`
      });
      
      // Remover la URL del texto
      cleanText = cleanText.replace(url, '').trim();
    }
  });

  // Limpiar espacios extra
  cleanText = cleanText.replace(/\s+/g, ' ').trim();
  
  return {
    cleanText,
    videoUrls
  };
}

/**
 * Procesa un texto de instrucción y extrae URLs de video automáticamente
 * @param {string} instructionText - Texto original
 * @param {Array} existingMedia - Media ya existente
 * @returns {object} - {processedInstruction, combinedMedia}
 */
export function processInstructionWithUrls(instructionText, existingMedia = []) {
  const { cleanText, videoUrls } = extractVideoUrlsFromText(instructionText);
  
  // Combinar URLs extraídas con media existente
  const combinedMedia = [...existingMedia, ...videoUrls];
  
  // Si se encontraron URLs, mejorar el texto de instrucción
  let processedInstruction = cleanText;
  if (videoUrls.length > 0) {
    if (processedInstruction.trim().length === 0) {
      processedInstruction = `Analiza y aprende del contenido de ${videoUrls.length === 1 ? 'este video' : 'estos videos'}.`;
    } else {
      processedInstruction += ` (Incluye análisis de ${videoUrls.length} video${videoUrls.length > 1 ? 's' : ''} adjunto${videoUrls.length > 1 ? 's' : ''})`;
    }
  }
  
  return {
    processedInstruction,
    combinedMedia,
    extractedVideoCount: videoUrls.length
  };
}
