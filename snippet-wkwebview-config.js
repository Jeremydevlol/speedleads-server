
// CONFIGURACIÓN PARA WKWebView (Apps Híbridas iOS)
// Agregar en tu configuración de WKWebView

// Swift/Objective-C
let config = WKWebViewConfiguration()
config.allowsInlineMediaPlayback = true
config.mediaTypesRequiringUserActionForPlayback = []

// JavaScript en la WebView
window.addEventListener('DOMContentLoaded', () => {
  // Verificar que estamos en WKWebView
  const isWKWebView = window.webkit && window.webkit.messageHandlers;
  
  if (isWKWebView) {
    console.log('📱 WKWebView detectado - Aplicando optimizaciones');
    
    // Configuración específica para WKWebView
    document.querySelectorAll('video').forEach(video => {
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.muted = true;
      
      // Intentar autoplay inmediatamente en WKWebView
      video.play().catch(() => {
        console.log('⚠️ Autoplay bloqueado en WKWebView');
      });
    });
  }
});
