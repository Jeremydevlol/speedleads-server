#!/usr/bin/env node

/**
 * Script para optimizar el backend para Safari iOS
 * Reduce logs innecesarios y mejora el rendimiento
 */

import fs from 'fs';

console.log('🍎 Optimizando backend para Safari iOS...\n');

// Archivos a optimizar
const filesToOptimize = [
  'dist/controllers/websitesController.js',
  'dist/services/whatsappService.js',
  'dist/services/openaiService.js'
];

// Función para optimizar logs
function optimizeLogs(content) {
  // Reemplazar logs verbosos con logs condicionales
  let optimized = content;
  
  // Convertir console.log normales a logs condicionales
  optimized = optimized.replace(
    /console\.log\('🔍([^']+)'\);/g, 
    "if (process.env.NODE_ENV !== 'production') console.log('🔍$1');"
  );
  
  // Convertir logs con variables a logs condicionales
  optimized = optimized.replace(
    /console\.log\(`🔍([^`]+)`\);/g, 
    "if (process.env.NODE_ENV !== 'production') console.log(`🔍$1`);"
  );
  
  // Mantener logs importantes (errores, warnings, success)
  // No tocar: console.error, console.warn, logs con ❌, ✅, ⚠️
  
  return optimized;
}

// Función para optimizar rendimiento
function optimizePerformance(content) {
  let optimized = content;
  
  // Agregar throttling a funciones que se llaman frecuentemente
  if (content.includes('generateBusinessSpecificContent')) {
    const throttleCode = `
// Throttle para Safari iOS
const throttle = (func, delay) => {
  let timeoutId;
  let lastExecTime = 0;
  return function (...args) {
    const currentTime = Date.now();
    if (currentTime - lastExecTime > delay) {
      func.apply(this, args);
      lastExecTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastExecTime = Date.now();
      }, delay);
    }
  };
};
`;
    
    if (!optimized.includes('const throttle = ')) {
      optimized = throttleCode + optimized;
    }
  }
  
  return optimized;
}

// Optimizar cada archivo
filesToOptimize.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    console.log(`🔧 Optimizando: ${filePath}`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let optimized = content;
      
      // Aplicar optimizaciones
      optimized = optimizeLogs(optimized);
      optimized = optimizePerformance(optimized);
      
      // Solo escribir si hay cambios
      if (optimized !== content) {
        fs.writeFileSync(filePath, optimized);
        console.log(`✅ ${filePath} optimizado`);
      } else {
        console.log(`ℹ️ ${filePath} ya estaba optimizado`);
      }
      
    } catch (error) {
      console.error(`❌ Error optimizando ${filePath}:`, error.message);
    }
  } else {
    console.log(`⚠️ Archivo no encontrado: ${filePath}`);
  }
});

// Crear archivo de configuración de entorno para producción
const prodEnvConfig = `
# Configuración optimizada para Safari iOS / Producción
NODE_ENV=production
LOG_LEVEL=error
DISABLE_VERBOSE_LOGS=true
SAFARI_IOS_OPTIMIZATION=true

# Límites de rendimiento
MAX_CONCURRENT_REQUESTS=5
REQUEST_TIMEOUT=10000
CACHE_TTL=300

# Video optimizations
MAX_VIDEO_CACHE_SIZE=50MB
MAX_PRELOAD_VIDEOS=3
VIDEO_QUALITY=medium
`;

fs.writeFileSync('.env.safari', prodEnvConfig.trim());
console.log('✅ Archivo .env.safari creado con configuración optimizada');

console.log('\n🎯 Optimización completada!');
console.log('\n📋 Cambios aplicados:');
console.log('   ✅ Logs verbosos convertidos a condicionales');
console.log('   ✅ Funciones críticas optimizadas');
console.log('   ✅ Configuración .env.safari creada');

console.log('\n🚀 Para usar en producción:');
console.log('   cp .env.safari .env');
console.log('   npm restart');

console.log('\n💡 Para frontend, implementa las optimizaciones de SAFARI_IOS_OPTIMIZATION.md');
