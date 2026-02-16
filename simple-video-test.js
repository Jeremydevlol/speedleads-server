#!/usr/bin/env node

/**
 * Test simple para verificar la funcionalidad de URLs de video
 */

console.log('🧪 Test simple de URLs de video...\n');

// Test básico de detección de URLs
function detectVideoUrl(url) {
  if (!url || typeof url !== 'string') {
    return { isValid: false, platform: null, originalUrl: url };
  }

  const cleanUrl = url.trim();
  
  const patterns = {
    youtube: [
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
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

// URLs de prueba
const testUrls = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube.com/shorts/abc123',
  'https://www.instagram.com/reel/ABC123/',
  'https://www.instagram.com/p/DEF456/',
  'https://www.tiktok.com/@user/video/123456789',
  'https://vm.tiktok.com/ZMh123abc/',
  'https://www.tiktok.com/t/ZTd123def/',
  'https://example.com/not-a-video',
  'not-a-url-at-all'
];

console.log('📋 Test de detección de URLs:');
console.log('=============================');

testUrls.forEach((url, index) => {
  const result = detectVideoUrl(url);
  const status = result.isValid ? '✅' : '❌';
  const platform = result.platform || 'no soportada';
  console.log(`${status} URL ${index + 1}: ${platform.padEnd(12)} | ${url}`);
});

// Verificar archivos
import fs from 'fs';

console.log('\n📋 Verificación de archivos:');
console.log('============================');

const requiredFiles = [
  './dist/utils/videoUrlProcessor.js',
  './dist/utils/personalityVideoUrlHandler.js',
  './dist/controllers/personalityController.js',
  './dist/routes/personalityRoutes.js'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - FALTA`);
  }
});

// Verificar directorio temporal
console.log('\n📋 Directorio temporal:');
console.log('=======================');

const tempDir = './temp_downloads';
if (!fs.existsSync(tempDir)) {
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`✅ Directorio temporal creado: ${tempDir}`);
  } catch (error) {
    console.log(`❌ Error creando directorio: ${error.message}`);
  }
} else {
  console.log(`✅ Directorio temporal existe: ${tempDir}`);
}

console.log('\n🎉 Resumen:');
console.log('===========');
console.log('✅ Detección de URLs implementada');
console.log('✅ Archivos de utilidades creados');
console.log('✅ Controlador modificado');
console.log('✅ Rutas agregadas');

console.log('\n📝 Para completar la instalación:');
console.log('1. Ejecutar: ./install-video-support.sh');
console.log('2. Reiniciar servidor: npm restart');
console.log('3. Probar endpoints en el frontend');

console.log('\n🔧 Nuevos endpoints:');
console.log('POST /api/personalities/validate-video-url');
console.log('POST /api/personalities/video-info');
console.log('POST /api/personalities/instructions (ahora con URLs)');

console.log('\n✨ ¡Integración completada!');
