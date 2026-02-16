# VierAI - Servicio Propio de Language Model

## Descripción

**VierAI** es nuestro servicio propio de Language Model (LLM) desarrollado internamente. Este servicio proporciona capacidades avanzadas de procesamiento de lenguaje natural, visión por computadora, transcripción de audio y análisis de documentos.

## Características Principales

### 🤖 Modelos de Lenguaje
- **vierai-pro**: Modelo principal con capacidades avanzadas de visión, OCR y razonamiento
- **vierai-mini**: Modelo ligero para tareas rápidas y eficientes
- **vierai-whisper**: Modelo especializado en transcripción de audio
- **vierai-turbo**: Modelo turbo para tareas rápidas (legacy)

### 🎯 Capacidades

1. **Chat y Conversación Natural**
   - Generación de respuestas contextuales
   - Procesamiento de personalidades y estilos
   - Mantenimiento de contexto en conversaciones largas

2. **Procesamiento de Instrucciones**
   - Mejora y estructuración de instrucciones
   - Optimización de personalidades de chatbot
   - Procesamiento de documentos para crear personalidades

3. **Transcripción de Audio**
   - Transcripción de archivos de audio en múltiples formatos
   - Soporte para múltiples idiomas
   - Procesamiento optimizado con retry automático

4. **Análisis de Imágenes**
   - OCR (Reconocimiento Óptico de Caracteres)
   - Análisis visual completo (objetos, marcas, caras, colores)
   - Detección de contenido seguro
   - Análisis de documentos PDF

5. **Análisis Contextual**
   - Análisis de contexto de conversación
   - Detección de temas y continuidad
   - Procesamiento de contenido multimedia

## Arquitectura

### Estructura de Archivos

```
dist/
├── config/
│   └── vierai.js              # Configuración del cliente VierAI
├── services/
│   ├── vieraiService.js       # Wrapper principal del servicio
│   ├── openaiService.js        # Implementación principal (usa VierAI internamente)
│   └── googleVisionService.js  # Servicio de visión usando VierAI
└── controllers/
    └── ...                    # Controladores que usan VierAI
```

### Configuración

El servicio VierAI se configura mediante variables de entorno:

```env
# API Key de VierAI (nuestro servicio propio)
VIERAI_API_KEY=tu_api_key_aqui

# Opcional: URL base personalizada (si tienes tu propia infraestructura)
VIERAI_BASE_URL=https://api.vierai.com

# Compatibilidad: También acepta OPENAI_API_KEY para migración gradual
OPENAI_API_KEY=tu_api_key_aqui
```

## Uso

### Importar el servicio

```javascript
// Opción 1: Usar el servicio principal
import { generateBotResponse } from './services/vieraiService.js';

// Opción 2: Usar directamente (mantiene compatibilidad)
import { generateBotResponse } from './services/openaiService.js';

// Opción 3: Usar el cliente directamente
import vieraiClient from './config/vierai.js';
```

### Ejemplo de uso básico

```javascript
import { generateBotResponse } from './services/vieraiService.js';

const response = await generateBotResponse({
    personality: { id: 1, nombre: 'Asistente' },
    userMessage: 'Hola, ¿cómo estás?',
    userId: 'user123',
    history: []
});

console.log(response);
```

### Transcripción de audio

```javascript
import { transcribeAudioBuffer } from './services/vieraiService.js';

const audioBuffer = fs.readFileSync('audio.ogg');
const transcription = await transcribeAudioBuffer(audioBuffer, 'audio.ogg');
console.log('Transcripción:', transcription);
```

### Análisis de imágenes

```javascript
import { analyzeImageBufferWithVision } from './services/googleVisionService.js';

const imageBuffer = fs.readFileSync('imagen.jpg');
const text = await analyzeImageBufferWithVision(imageBuffer);
console.log('Texto extraído:', text);
```

## Modelos Disponibles

| Modelo | Uso | Características |
|--------|-----|----------------|
| `vierai-pro` | Chat principal, Visión, OCR | Modelo avanzado con capacidades completas |
| `vierai-mini` | Tareas rápidas, procesamiento ligero | Modelo eficiente y rápido |
| `vierai-whisper` | Transcripción de audio | Especializado en audio y voz |
| `vierai-turbo` | Tareas rápidas (legacy) | Modelo turbo para diagnóstico |

## Ventajas de VierAI

1. **Control Total**: Infraestructura propia desarrollada internamente
2. **Optimización**: Optimizado para nuestras necesidades específicas
3. **Personalización**: Modelos y capacidades adaptados a nuestros casos de uso
4. **Rendimiento**: Optimizado para velocidad y eficiencia
5. **Escalabilidad**: Diseñado para crecer con nuestras necesidades

## Desarrollo y Mantenimiento

VierAI es mantenido y desarrollado por nuestro equipo interno. Para más información sobre el desarrollo, mejoras o reportar problemas, contacta al equipo de desarrollo.

## Notas Técnicas

- El servicio utiliza nuestra infraestructura propia de VierAI
- Mantiene compatibilidad con APIs estándar para facilitar la migración
- Incluye retry automático y manejo de errores robusto
- Optimizado para producción con timeouts y límites configurados

## Licencia

VierAI es un servicio propietario desarrollado internamente. Todos los derechos reservados.
