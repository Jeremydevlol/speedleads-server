# 🎬 Guía de Integración Frontend - URLs de Video

## 🎯 **Estado Actual**
El backend está **100% funcional** y puede procesar URLs de video automáticamente.

## 📋 **Opciones de Implementación**

### ✅ **OPCIÓN 1: Usar sistema actual (0 cambios)**
Si tu frontend ya permite enviar `media` con URLs, **no necesitas cambiar nada**.

El sistema detectará automáticamente las URLs de video y las procesará.

### 🚀 **OPCIÓN 2: Mejorar UX (recomendado)**

#### **A. Componente de Input de Video**
```jsx
// VideoUrlInput.jsx
import React, { useState } from 'react';

const VideoUrlInput = ({ onVideoAdd, disabled }) => {
  const [url, setUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validation, setValidation] = useState(null);

  const validateVideoUrl = async (videoUrl) => {
    if (!videoUrl.trim()) {
      setValidation(null);
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch('/api/personalities/validate-video-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ url: videoUrl })
      });

      const result = await response.json();
      setValidation(result);
    } catch (error) {
      setValidation({ 
        success: false, 
        valid: false, 
        message: 'Error validando URL' 
      });
    }
    setIsValidating(false);
  };

  const handleUrlChange = (e) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    
    // Validar después de 500ms de pausa
    clearTimeout(window.videoUrlTimeout);
    window.videoUrlTimeout = setTimeout(() => {
      validateVideoUrl(newUrl);
    }, 500);
  };

  const handleAdd = () => {
    if (validation?.valid && url.trim()) {
      onVideoAdd({
        url: url.trim(),
        type: 'video_url',
        platform: validation.platform,
        filename: `${validation.platform}_video_${Date.now()}`
      });
      setUrl('');
      setValidation(null);
    }
  };

  return (
    <div className="video-url-input">
      <div className="input-group">
        <input
          type="url"
          value={url}
          onChange={handleUrlChange}
          placeholder="Pega aquí la URL de YouTube, TikTok o Instagram Reel..."
          disabled={disabled}
          className="video-url-field"
        />
        <button
          onClick={handleAdd}
          disabled={!validation?.valid || disabled}
          className="add-video-btn"
        >
          {isValidating ? '🔍' : '➕'} Agregar Video
        </button>
      </div>

      {/* Indicador de validación */}
      {validation && (
        <div className={`validation-indicator ${validation.valid ? 'valid' : 'invalid'}`}>
          {validation.valid ? (
            <span className="valid-indicator">
              ✅ {validation.platform} válido - {validation.message}
            </span>
          ) : (
            <span className="invalid-indicator">
              ❌ {validation.message}
            </span>
          )}
        </div>
      )}

      {/* Ejemplos de URLs */}
      <div className="url-examples">
        <small>
          <strong>Ejemplos:</strong>
          <br />• YouTube: https://youtu.be/VIDEO_ID
          <br />• TikTok: https://www.tiktok.com/@user/video/ID
          <br />• Instagram: https://www.instagram.com/reel/ID/
        </small>
      </div>
    </div>
  );
};

export default VideoUrlInput;
```

#### **B. Componente de Lista de Videos**
```jsx
// VideoList.jsx
import React from 'react';

const VideoList = ({ videos, onRemove, disabled }) => {
  const getPlatformIcon = (platform) => {
    const icons = {
      youtube: '📺',
      tiktok: '🎵',
      instagram: '📸'
    };
    return icons[platform] || '🎬';
  };

  return (
    <div className="video-list">
      {videos.map((video, index) => (
        <div key={index} className="video-item">
          <div className="video-info">
            <span className="platform-icon">
              {getPlatformIcon(video.platform)}
            </span>
            <div className="video-details">
              <div className="video-url">{video.url}</div>
              <div className="video-meta">
                {video.platform} • Se transcribirá automáticamente
              </div>
            </div>
          </div>
          <button
            onClick={() => onRemove(index)}
            disabled={disabled}
            className="remove-video-btn"
          >
            ❌
          </button>
        </div>
      ))}
    </div>
  );
};

export default VideoList;
```

#### **C. Integración en el Formulario Principal**
```jsx
// PersonalityInstructionForm.jsx (modificado)
import React, { useState } from 'react';
import VideoUrlInput from './VideoUrlInput';
import VideoList from './VideoList';

const PersonalityInstructionForm = ({ personalityId }) => {
  const [instruction, setInstruction] = useState('');
  const [videos, setVideos] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVideoAdd = (video) => {
    setVideos(prev => [...prev, video]);
  };

  const handleVideoRemove = (index) => {
    setVideos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/personalities/instructions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          personalityId,
          instruction,
          media: videos // URLs de video se procesan automáticamente
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Mostrar éxito
        alert('Instrucción agregada exitosamente!');
        if (result.videoProcessing?.processedCount > 0) {
          alert(`${result.videoProcessing.processedCount} videos procesados y transcritos automáticamente!`);
        }
        
        // Limpiar formulario
        setInstruction('');
        setVideos([]);
      } else {
        alert('Error: ' + result.message);
      }
    } catch (error) {
      alert('Error enviando instrucción: ' + error.message);
    }

    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="instruction-form">
      <div className="form-group">
        <label>Instrucción de Texto:</label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Escribe tu instrucción aquí..."
          disabled={isSubmitting}
        />
      </div>

      <div className="form-group">
        <label>Videos (YouTube, TikTok, Instagram):</label>
        <VideoUrlInput 
          onVideoAdd={handleVideoAdd}
          disabled={isSubmitting}
        />
        {videos.length > 0 && (
          <VideoList
            videos={videos}
            onRemove={handleVideoRemove}
            disabled={isSubmitting}
          />
        )}
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting || (!instruction.trim() && videos.length === 0)}
        className="submit-btn"
      >
        {isSubmitting ? '🔄 Procesando...' : '✅ Agregar Instrucción'}
      </button>

      {videos.length > 0 && (
        <div className="processing-info">
          <small>
            ℹ️ Los videos se descargarán y transcribirán automáticamente.
            El contenido hablado se convertirá en instrucciones estructuradas.
          </small>
        </div>
      )}
    </form>
  );
};

export default PersonalityInstructionForm;
```

#### **D. CSS para los componentes**
```css
/* VideoComponents.css */
.video-url-input {
  margin-bottom: 1rem;
}

.input-group {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.video-url-field {
  flex: 1;
  padding: 0.75rem;
  border: 2px solid #e1e5e9;
  border-radius: 8px;
  font-size: 0.9rem;
}

.video-url-field:focus {
  outline: none;
  border-color: #007bff;
}

.add-video-btn {
  padding: 0.75rem 1rem;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}

.add-video-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.validation-indicator {
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.validation-indicator.valid {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.validation-indicator.invalid {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.url-examples {
  font-size: 0.8rem;
  color: #666;
  margin-top: 0.5rem;
}

.video-list {
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  margin-top: 1rem;
}

.video-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid #e1e5e9;
}

.video-item:last-child {
  border-bottom: none;
}

.video-info {
  display: flex;
  align-items: center;
  flex: 1;
}

.platform-icon {
  font-size: 1.5rem;
  margin-right: 0.75rem;
}

.video-details {
  flex: 1;
}

.video-url {
  font-weight: 500;
  color: #333;
  word-break: break-all;
}

.video-meta {
  font-size: 0.8rem;
  color: #666;
  margin-top: 0.25rem;
}

.remove-video-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0.25rem;
}

.processing-info {
  background: #e3f2fd;
  padding: 0.75rem;
  border-radius: 4px;
  margin-top: 1rem;
}
```

## 🎯 **Resumen de cambios necesarios:**

### ✅ **Mínimo (funciona ya):**
- **0 cambios** - El sistema funciona si puedes enviar URLs en `media`

### 🚀 **Recomendado (mejor UX):**
1. **Agregar componente** `VideoUrlInput` 
2. **Validación en tiempo real** de URLs
3. **Indicadores visuales** de plataforma
4. **Feedback de procesamiento** 

### 📱 **El usuario podrá:**
- ✅ Pegar URLs de YouTube/TikTok/Instagram
- ✅ Ver validación en tiempo real
- ✅ Saber qué plataforma detectó
- ✅ Ver progreso de transcripción
- ✅ Recibir confirmación de procesamiento

¿Quieres que implemente alguno de estos componentes específicos? 🤔
