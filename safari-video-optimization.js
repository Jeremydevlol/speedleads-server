
// Safari iOS Video Optimization
// Agregar esto al inicio de tu aplicación React

// Detectar Safari iOS
const isSafariIOS = () => {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream && /Safari/.test(ua);
};

// Optimizaciones específicas para video logging
if (isSafariIOS()) {
  console.log('🍎 Safari iOS detectado - Aplicando optimizaciones de video...');
  
  // 1. Deshabilitar logs verbosos del sistema de video
  const originalLog = console.log;
  console.log = (...args) => {
    const message = args[0];
    
    // Filtrar logs específicos que causan spam
    const spamPatterns = [
      '🔍 generateBusinessSpecificContent called with:',
      '📥 Native preload started',
      '🌐 Downloading from network:',
      '💾 Video saved to IndexedDB:',
      '💾 Video saved to Cache API:',
      '✅ Native preload complete:',
      '🎯 Using cached blob URL for video:',
      '🎯 Video already in memory cache:',
      '⏳ Video already loading, returning original:',
      '🪟 Updating video window:',
      '🎬 TikTok preload:',
      '🎬 TikTok-style preload:',
      '📦 TikTok-style: Preloading',
      '🔮 Preloaded immediate next section:',
      '🎬 Universal Cache Stats'
    ];
    
    // Solo mostrar si NO es un patrón de spam
    const isSpam = spamPatterns.some(pattern => 
      typeof message === 'string' && message.includes(pattern)
    );
    
    if (!isSpam) {
      originalLog(...args);
    }
  };
  
  // 2. Throttle para funciones de video que se llaman repetitivamente
  window.throttleVideoFunctions = (func, delay = 1000) => {
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
  
  // 3. Optimizar configuración de video cache
  window.safariVideoConfig = {
    maxConcurrentDownloads: 2, // Máximo 2 descargas simultáneas
    preloadDistance: 1, // Solo precargar 1 video adelante
    cacheLimit: 3, // Máximo 3 videos en cache
    throttleDelay: 1000, // 1 segundo entre llamadas
    disableVerboseLogs: true
  };
  
  // 4. Interceptar y optimizar llamadas a generateBusinessSpecificContent
  if (window.generateBusinessSpecificContent) {
    const original = window.generateBusinessSpecificContent;
    window.generateBusinessSpecificContent = window.throttleVideoFunctions(original, 500);
  }
  
  // 5. Optimizar IntersectionObserver para videos
  const originalObserver = window.IntersectionObserver;
  window.IntersectionObserver = class extends originalObserver {
    constructor(callback, options = {}) {
      // Reducir frecuencia de observación en Safari iOS
      const optimizedOptions = {
        ...options,
        rootMargin: options.rootMargin || '50px',
        threshold: options.threshold || 0.25
      };
      
      const throttledCallback = window.throttleVideoFunctions(callback, 200);
      super(throttledCallback, optimizedOptions);
    }
  };
  
  console.log('✅ Optimizaciones de video aplicadas para Safari iOS');
}

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isSafariIOS };
}
