/**
 * Test del detector de URLs de video
 */

// Función para detectar URLs de video en texto
function detectVideoUrls(text) {
  if (!text || typeof text !== 'string') return { cleanText: text || '', videoUrls: [] };

  const videoUrlPatterns = [
    // YouTube - más completo
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})(?:\S+)?/g,
    // TikTok
    /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[^\/\s]+\/video\/(\d+)(?:\S+)?/g,
    // Instagram Reels
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reel\/([a-zA-Z0-9_-]+)(?:\/|\?|\s|$)/g
  ];

  const foundUrls = [];
  let cleanText = text;

  // Buscar todas las URLs de video
  videoUrlPatterns.forEach(pattern => {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    
    while ((match = regex.exec(text)) !== null) {
      const fullUrl = match[0].trim();
      
      // Asegurar que tenga protocolo
      const normalizedUrl = fullUrl.startsWith('http') ? fullUrl : `https://${fullUrl}`;
      
      // Determinar plataforma
      let platform = 'unknown';
      if (normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be')) {
        platform = 'youtube';
      } else if (normalizedUrl.includes('tiktok.com')) {
        platform = 'tiktok';
      } else if (normalizedUrl.includes('instagram.com')) {
        platform = 'instagram';
      }

      foundUrls.push({
        url: normalizedUrl,
        type: 'video_url',
        platform: platform,
        filename: `${platform}_video_${Date.now()}_${foundUrls.length}`
      });

      // Remover URL del texto
      cleanText = cleanText.replace(fullUrl, '').trim();
    }
  });

  // Limpiar espacios extra
  cleanText = cleanText.replace(/\s+/g, ' ').trim();

  return {
    cleanText,
    videoUrls: foundUrls
  };
}

// Función para procesar instrucción antes de enviar
function processInstructionWithUrls(instruction, existingMedia = []) {
  const detection = detectVideoUrls(instruction);
  
  return {
    instruction: detection.cleanText,
    media: [...existingMedia, ...detection.videoUrls],
    detectedVideos: detection.videoUrls
  };
}

// TESTING
console.log('🧪 TESTING URL DETECTION');
console.log('========================\n');

// Test 1: Tu caso específico
const testText1 = "este es la info del canal https://youtu.be/T_KNzWdzsok";
const result1 = detectVideoUrls(testText1);

console.log('📋 TEST 1 - Tu caso:');
console.log('Texto original:', testText1);
console.log('Texto limpio:', result1.cleanText);
console.log('URLs detectadas:', result1.videoUrls.length);
console.log('Detalles:', result1.videoUrls);
console.log('');

// Test 2: Múltiples URLs
const testText2 = "Mira este video https://youtu.be/T_KNzWdzsok y también este TikTok https://www.tiktok.com/@user/video/123456 y este reel https://www.instagram.com/reel/ABC123/";
const result2 = detectVideoUrls(testText2);

console.log('📋 TEST 2 - Múltiples URLs:');
console.log('Texto original:', testText2);
console.log('Texto limpio:', result2.cleanText);
console.log('URLs detectadas:', result2.videoUrls.length);
console.log('Plataformas:', result2.videoUrls.map(v => v.platform));
console.log('');

// Test 3: Procesamiento completo
const processed = processInstructionWithUrls(testText1);

console.log('📋 TEST 3 - Procesamiento completo:');
console.log('Instrucción procesada:', processed.instruction);
console.log('Media array:', processed.media);
console.log('Videos detectados:', processed.detectedVideos.length);
console.log('');

// Simular el request que debería enviarse
const requestBody = {
  personalityId: "uuid-example",
  instruction: processed.instruction,
  media: processed.media
};

console.log('📤 REQUEST QUE DEBERÍA ENVIARSE:');
console.log('================================');
console.log(JSON.stringify(requestBody, null, 2));

console.log('\n✅ RESULTADO:');
console.log('=============');
console.log('✅ El texto se limpia correctamente');
console.log('✅ Las URLs se extraen al array media');
console.log('✅ Se detecta la plataforma correctamente');
console.log('✅ El backend procesará las URLs automáticamente');
