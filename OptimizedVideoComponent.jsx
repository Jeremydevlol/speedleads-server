
import React, { useCallback, useEffect, useRef, useState } from 'react';

// Hook para detectar Safari iOS y Low Power Mode
const useSafariIOS = () => {
  const [isSafariIOS, setIsSafariIOS] = useState(false);
  const [isLowPowerMode, setIsLowPowerMode] = useState(false);
  
  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isSafari = /Safari/.test(ua);
    setIsSafariIOS(isIOS && isSafari);
    
    // Detectar Low Power Mode (aproximado)
    if (isIOS) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      // En Low Power Mode, el canvas performance se reduce
      const start = performance.now();
      ctx.fillRect(0, 0, 100, 100);
      const time = performance.now() - start;
      setIsLowPowerMode(time > 10); // Threshold aproximado
    }
  }, []);
  
  return { isSafariIOS, isLowPowerMode };
};

// Componente de video optimizado para Safari iOS
const OptimizedVideoComponent = ({ src, className, poster, autoplay = true, ...props }) => {
  const videoRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [needsUserGesture, setNeedsUserGesture] = useState(false);
  const [playAttempted, setPlayAttempted] = useState(false);
  const { isSafariIOS, isLowPowerMode } = useSafariIOS();
  
  // Throttled logging para Safari iOS
  const log = useCallback((message) => {
    if (!isSafariIOS) {
      console.log(message);
    }
  }, [isSafariIOS]);
  
  // Función de autoplay agresivo con fallback por gestos
  const tryPlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video || playAttempted) return;
    
    setPlayAttempted(true);
    
    try {
      // Intento agresivo de autoplay
      await video.play();
      log('✅ Autoplay exitoso');
      setNeedsUserGesture(false);
    } catch (error) {
      log('⚠️ Autoplay bloqueado, esperando gesto del usuario');
      setNeedsUserGesture(true);
      
      // Fallback: esperar primer toque
      const onTap = async (event) => {
        try {
          await video.play();
          log('✅ Play iniciado por gesto del usuario');
          setNeedsUserGesture(false);
        } catch (playError) {
          log('❌ Error en play por gesto:', playError);
        } finally {
          window.removeEventListener('pointerdown', onTap, { capture: true });
          window.removeEventListener('touchstart', onTap, { capture: true });
          window.removeEventListener('click', onTap, { capture: true });
        }
      };
      
      // Múltiples eventos para máxima compatibilidad
      window.addEventListener('pointerdown', onTap, { once: true, capture: true });
      window.addEventListener('touchstart', onTap, { once: true, capture: true });
      window.addEventListener('click', onTap, { once: true, capture: true });
    }
  }, [playAttempted, log]);
  
  // Lazy loading optimizado para Safari iOS
  useEffect(() => {
    if (!videoRef.current) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !shouldLoad) {
          setShouldLoad(true);
          log(`🎬 Loading video: ${src.substring(0, 50)}...`);
          observer.disconnect();
        }
      },
      { 
        threshold: isSafariIOS ? 0.5 : 0.25, // Más restrictivo en Safari iOS
        rootMargin: isSafariIOS ? '25px' : '50px' 
      }
    );
    
    observer.observe(videoRef.current);
    
    return () => observer.disconnect();
  }, [src, shouldLoad, isSafariIOS, log]);
  
  // Gestión de memoria agresiva para Safari iOS
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        video.pause();
        log('🔇 Video pausado (página oculta)');
      }
    };
    
    const handlePageHide = () => {
      video.pause();
      video.src = '';
      video.load();
      log('🧹 Video limpiado (página oculta)');
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      
      // Limpieza agresiva al desmontar
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [log]);
  
  // Autoplay cuando el video esté listo
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad || !autoplay) return;
    
    const handleLoadedMetadata = () => {
      tryPlay();
    };
    
    if (video.readyState >= 1) {
      // Ya tiene metadata
      tryPlay();
    } else {
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    }
  }, [shouldLoad, autoplay, tryPlay]);
  
  // Manejo de carga optimizado
  const handleLoadStart = useCallback(() => {
    log('🎬 Video load start');
  }, [log]);
  
  const handleLoadedData = useCallback(() => {
    setIsLoaded(true);
    log('✅ Video loaded');
  }, [log]);
  
  const handleError = useCallback((error) => {
    console.error('❌ Video error:', error);
  }, []);
  
  return (
    <div ref={videoRef} className={className}>
      {shouldLoad ? (
        <>
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            onLoadStart={handleLoadStart}
            onLoadedData={handleLoadedData}
            onError={handleError}
            // Atributos críticos para Safari iOS
            autoPlay={autoplay}
            muted
            playsInline
            webkit-playsinline="true"
            volume={0}
            // Preload optimizado
            preload={isSafariIOS ? 'metadata' : 'auto'}
            // Optimizaciones adicionales
            disablePictureInPicture
            controlsList="nodownload"
            crossOrigin="anonymous"
            // Props adicionales
            {...props}
          />
          
          {/* Overlay para Low Power Mode o necesidad de gesto */}
          {(needsUserGesture || isLowPowerMode) && (
            <div 
              className="video-gesture-overlay"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                cursor: 'pointer',
                zIndex: 10
              }}
              onClick={tryPlay}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>▶️</div>
                <div>
                  {isLowPowerMode 
                    ? 'Modo de bajo consumo detectado. Toca para reproducir.'
                    : 'Toca para reproducir el video'
                  }
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="video-placeholder" style={{ 
          minHeight: '200px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: '#f0f0f0'
        }}>
          <div className="loading-spinner">🎬 Preparando video...</div>
        </div>
      )}
    </div>
  );
};

export default OptimizedVideoComponent;
export { useSafariIOS };
