// Script para solucionar problemas de Service Worker
// Este script debe ejecutarse en el frontend para limpiar la caché

console.log('🔧 Iniciando limpieza de Service Worker...');

// Función para limpiar la caché del Service Worker
async function clearServiceWorkerCache() {
  try {
    // Verificar si el Service Worker está registrado
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      
      console.log(`📊 Encontrados ${registrations.length} Service Workers registrados`);
      
      // Desregistrar todos los Service Workers
      for (let registration of registrations) {
        console.log('🗑️ Desregistrando Service Worker:', registration.scope);
        await registration.unregister();
      }
      
      console.log('✅ Todos los Service Workers han sido desregistrados');
    }
    
    // Limpiar todas las cachés
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      console.log(`📦 Encontradas ${cacheNames.length} cachés`);
      
      for (let cacheName of cacheNames) {
        console.log('🗑️ Eliminando caché:', cacheName);
        await caches.delete(cacheName);
      }
      
      console.log('✅ Todas las cachés han sido eliminadas');
    }
    
    // Limpiar localStorage y sessionStorage
    console.log('🧹 Limpiando almacenamiento local...');
    localStorage.clear();
    sessionStorage.clear();
    
    console.log('✅ Limpieza completada. Recarga la página.');
    
    // Recargar la página
    window.location.reload();
    
  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
  }
}

// Función para verificar el estado del almacenamiento
function checkStorageQuota() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    navigator.storage.estimate().then(estimate => {
      console.log('📊 Estado del almacenamiento:');
      console.log(`- Usado: ${(estimate.usage / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Disponible: ${(estimate.quota / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Porcentaje usado: ${((estimate.usage / estimate.quota) * 100).toFixed(2)}%`);
    });
  }
}

// Ejecutar limpieza automáticamente
if (typeof window !== 'undefined') {
  console.log('🚀 Ejecutando limpieza automática...');
  clearServiceWorkerCache();
  checkStorageQuota();
}

// Exportar funciones para uso manual
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { clearServiceWorkerCache, checkStorageQuota };
}
