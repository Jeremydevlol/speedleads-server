/**
 * SOLUCIÓN PARA TU FRONTEND
 * Copia estas funciones a tu proyecto React/JavaScript
 */

// 1. Función para detectar URLs de video
function detectVideoUrls(text) {
  if (!text || typeof text !== 'string') return { cleanText: text || '', videoUrls: [] };

  const videoUrlPatterns = [
    // YouTube
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})(?:\S+)?/g,
    // TikTok
    /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[^\/\s]+\/video\/(\d+)(?:\S+)?/g,
    // Instagram Reels
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reel\/([a-zA-Z0-9_-]+)(?:\/|\?|\s|$)/g
  ];

  const foundUrls = [];
  let cleanText = text;

  videoUrlPatterns.forEach(pattern => {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    
    while ((match = regex.exec(text)) !== null) {
      const fullUrl = match[0].trim();
      const normalizedUrl = fullUrl.startsWith('http') ? fullUrl : `https://${fullUrl}`;
      
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

      cleanText = cleanText.replace(fullUrl, '').trim();
    }
  });

  cleanText = cleanText.replace(/\s+/g, ' ').trim();

  return {
    cleanText,
    videoUrls: foundUrls
  };
}

// 2. Función para procesar antes de enviar
function processInstructionWithUrls(instruction, existingMedia = []) {
  const detection = detectVideoUrls(instruction);
  
  return {
    instruction: detection.cleanText,
    media: [...existingMedia, ...detection.videoUrls],
    detectedVideos: detection.videoUrls
  };
}

// 3. MODIFICA TU FUNCIÓN DE ENVÍO ASÍ:
async function sendInstruction(personalityId, instruction, existingMedia = []) {
  // ✅ AGREGAR ESTA LÍNEA - Procesar URLs automáticamente
  const processed = processInstructionWithUrls(instruction, existingMedia);
  
  // ✅ Mostrar feedback al usuario si se detectaron videos
  if (processed.detectedVideos.length > 0) {
    const platforms = processed.detectedVideos.map(v => v.platform).join(', ');
    console.log(`🎬 Detectados ${processed.detectedVideos.length} video(s) de ${platforms}. Se procesarán automáticamente.`);
    
    // Si tienes sistema de notificaciones:
    // showToast(`🎬 Detectados ${processed.detectedVideos.length} video(s). Se transcribirán automáticamente.`, 'info');
  }

  // ✅ USAR LOS DATOS PROCESADOS
  const response = await fetch('/api/personalities/instructions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({
      personalityId: personalityId,
      instruction: processed.instruction, // ✅ Texto limpio
      media: processed.media             // ✅ URLs en media
    })
  });

  const result = await response.json();
  
  // ✅ Mostrar resultado de procesamiento de videos
  if (result.success && result.videoProcessing?.processedCount > 0) {
    console.log(`✅ ${result.videoProcessing.processedCount} videos procesados y transcritos!`);
    
    // Si tienes sistema de notificaciones:
    // showToast(`✅ ${result.videoProcessing.processedCount} videos transcritos automáticamente!`, 'success');
  }

  return result;
}

// 4. EJEMPLO DE USO EN REACT:
/*
const InstructionForm = ({ personalityId }) => {
  const [instruction, setInstruction] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await sendInstruction(personalityId, instruction);
      
      if (result.success) {
        alert('Instrucción agregada exitosamente!');
        setInstruction(''); // Limpiar formulario
      } else {
        alert('Error: ' + result.message);
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }

    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Escribe tu instrucción aquí. Puedes pegar URLs de YouTube, TikTok o Instagram directamente."
        disabled={isSubmitting}
      />
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Procesando...' : 'Enviar Instrucción'}
      </button>
    </form>
  );
};
*/

export { detectVideoUrls, processInstructionWithUrls, sendInstruction };
