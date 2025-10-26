/**
 * Detector automático de URLs de video en el frontend
 * Extrae URLs del texto y las mueve al array media
 */

// Función para detectar URLs de video en texto
function detectVideoUrls(text) {
  if (!text || typeof text !== 'string') return { cleanText: text || '', videoUrls: [] };

  const videoUrlPatterns = [
    // YouTube
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/g,
    // TikTok
    /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[^\/]+\/video\/(\d+)/g,
    // Instagram Reels
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reel\/([a-zA-Z0-9_-]+)/g
  ];

  const foundUrls = [];
  let cleanText = text;

  // Buscar todas las URLs de video
  videoUrlPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const fullUrl = match[0];
      
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

// Función para mostrar feedback al usuario
function showVideoDetectionFeedback(detectedVideos) {
  if (detectedVideos.length === 0) return;

  const platforms = detectedVideos.map(v => v.platform).join(', ');
  const message = `🎬 Detectados ${detectedVideos.length} video(s) de ${platforms}. Se procesarán automáticamente.`;
  
  // Mostrar notificación (ajusta según tu sistema de notificaciones)
  console.log(message);
  
  // Si tienes un sistema de toast/notificaciones:
  // showToast(message, 'info');
  
  return message;
}

// Ejemplo de uso en tu componente React
function ExampleUsage() {
  const [instruction, setInstruction] = useState('');
  const [media, setMedia] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Procesar instrucción para extraer URLs
    const processed = processInstructionWithUrls(instruction, media);
    
    // Mostrar feedback si se detectaron videos
    if (processed.detectedVideos.length > 0) {
      showVideoDetectionFeedback(processed.detectedVideos);
    }

    // Enviar al backend
    const response = await fetch('/api/personalities/instructions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        personalityId: 'your-personality-id',
        instruction: processed.instruction,
        media: processed.media
      })
    });

    const result = await response.json();
    console.log('Result:', result);
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Escribe tu instrucción aquí. Puedes pegar URLs de YouTube, TikTok o Instagram directamente."
      />
      <button type="submit">Enviar</button>
    </form>
  );
}

// Exportar funciones para usar en tu proyecto
export {
  detectVideoUrls,
  processInstructionWithUrls,
  showVideoDetectionFeedback
};

// Para testing - puedes probar estas funciones
console.log('=== TESTING URL DETECTION ===');

const testText = "este es la info del canal https://youtu.be/T_KNzWdzsok y también este TikTok https://www.tiktok.com/@user/video/123456";
const result = detectVideoUrls(testText);

console.log('Texto original:', testText);
console.log('Texto limpio:', result.cleanText);
console.log('URLs detectadas:', result.videoUrls);
console.log('Número de videos:', result.videoUrls.length);
