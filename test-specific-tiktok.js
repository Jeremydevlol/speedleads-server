#!/usr/bin/env node

/**
 * Test específico para la URL de TikTok proporcionada
 */

console.log('🧪 Probando URL específica de TikTok...\n');

// Función de detección (copiada del videoUrlProcessor)
function detectVideoUrl(url) {
  if (!url || typeof url !== 'string') {
    return { isValid: false, platform: null, originalUrl: url };
  }

  const cleanUrl = url.trim();
  
  const patterns = {
    youtube: [
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/
    ],
    instagram: [
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/,
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/stories\/[^\/]+\/([0-9]+)/
    ],
    tiktok: [
      /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[^\/]+\/video\/([0-9]+)/,
      /(?:https?:\/\/)?(?:vm\.tiktok\.com|vt\.tiktok\.com)\/([a-zA-Z0-9]+)/,
      /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/t\/([a-zA-Z0-9]+)/
    ]
  };

  for (const [platform, platformPatterns] of Object.entries(patterns)) {
    for (const pattern of platformPatterns) {
      const match = cleanUrl.match(pattern);
      if (match) {
        return {
          isValid: true,
          platform,
          originalUrl: cleanUrl,
          videoId: match[1],
          normalizedUrl: cleanUrl
        };
      }
    }
  }

  return { isValid: false, platform: null, originalUrl: cleanUrl };
}

// URL de prueba específica
const testUrl = 'https://www.tiktok.com/@ac2ality/video/7558465231140244749?q=ac2ality&t=1759865659452';

console.log('📋 URL a probar:');
console.log('================');
console.log(testUrl);
console.log('');

console.log('📋 Resultado de la detección:');
console.log('=============================');

const result = detectVideoUrl(testUrl);

if (result.isValid) {
  console.log('✅ URL VÁLIDA detectada');
  console.log(`📱 Plataforma: ${result.platform}`);
  console.log(`🆔 Video ID: ${result.videoId}`);
  console.log(`🔗 URL original: ${result.originalUrl}`);
  console.log('');
  console.log('🎉 Esta URL será procesada correctamente por el sistema!');
  console.log('');
  console.log('📝 Lo que pasará cuando se use en una instrucción:');
  console.log('1. Se detectará como TikTok válido');
  console.log('2. Se descargará usando yt-dlp');
  console.log('3. Se subirá a Supabase Storage');
  console.log('4. Se extraerá información (título, descripción, etc.)');
  console.log('5. Se guardará en la base de datos como media');
} else {
  console.log('❌ URL NO VÁLIDA');
  console.log('La URL no coincide con los patrones soportados');
  console.log('');
  console.log('🔍 Análisis detallado:');
  
  // Análisis manual para debug
  const tiktokPatterns = [
    { name: 'Patrón 1', regex: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[^\/]+\/video\/([0-9]+)/ },
    { name: 'Patrón 2', regex: /(?:https?:\/\/)?(?:vm\.tiktok\.com|vt\.tiktok\.com)\/([a-zA-Z0-9]+)/ },
    { name: 'Patrón 3', regex: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/t\/([a-zA-Z0-9]+)/ }
  ];
  
  tiktokPatterns.forEach(pattern => {
    const match = testUrl.match(pattern.regex);
    console.log(`${match ? '✅' : '❌'} ${pattern.name}: ${match ? `Match: ${match[1]}` : 'No match'}`);
  });
}

console.log('');
console.log('🔧 Para usar esta URL en el sistema:');
console.log('1. Hacer POST a /api/personalities/instructions');
console.log('2. Incluir en el array media:');
console.log('   {');
console.log('     "url": "' + testUrl + '",');
console.log('     "type": "video_url",');
console.log('     "filename": "tiktok_ac2ality_video"');
console.log('   }');
console.log('3. El sistema procesará automáticamente el video');
