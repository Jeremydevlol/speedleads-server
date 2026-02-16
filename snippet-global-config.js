
// CONFIGURACIÓN GLOBAL PARA SAFARI iOS
// Agregar al inicio de tu App.tsx o index.js

// 1) Importar optimizaciones
import './safari-video-optimization.js';

// 2) Configuración global
useEffect(() => {
  // Detectar Safari iOS
  const isSafariIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  if (isSafariIOS) {
    console.log('🍎 Safari iOS detectado - Optimizaciones aplicadas');
    
    // Configurar límites globales
    window.safariVideoConfig = {
      maxConcurrentVideos: 1,      // Solo 1 video activo
      maxCacheSize: 50 * 1024 * 1024, // 50MB máximo
      preloadDistance: 1,          // Solo precargar 1 video
      throttleDelay: 1000         // 1 segundo entre operaciones
    };
    
    // Limpiar memoria cada 2 minutos
    setInterval(() => {
      if (window.gc) window.gc(); // Force garbage collection si está disponible
      
      // Pausar videos no visibles
      document.querySelectorAll('video').forEach(video => {
        const rect = video.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        
        if (!isVisible && !video.paused) {
          video.pause();
          console.log('🔇 Video pausado (no visible)');
        }
      });
    }, 120000); // 2 minutos
  }
}, []);
