// Configuración de rendimiento optimizada para OpenAI
export const PERFORMANCE_CONFIG = {
  OPENAI: {
    MAX_TOKENS: 1500,
    TEMPERATURE: 0.7,
    TIMEOUT: 20000,
    MAX_RETRIES: 1,
    MODEL: 'gpt-4o-mini'
  },
  VIERAI: {
    MAX_TOKENS: 1500,
    TEMPERATURE: 0.7,
    TIMEOUT: 20000,
    MAX_RETRIES: 1,
    MODEL: 'gpt-4o-mini'
  },

  // Historial optimizado
  CONTEXT: {
    MAX_HISTORY_MESSAGES: 4,    // Solo últimos 4 mensajes
    MAX_ANALYSIS_MESSAGES: 3,   // Solo últimos 3 para análisis
    MAX_SYSTEM_PROMPT_LENGTH: 500, // Límite de prompt del sistema
  },

  // DeepSeek fallback
  DEEPSEEK: {
    MAX_TOKENS: 1500,
    TEMPERATURE: 0.7,
    TIMEOUT: 15001,         // 15 segundos timeout
    MODEL: 'deepseek-chat'  // Modelo más rápido
  },

  // Timeouts generales
  TIMEOUTS: {
    AUDIO_PROCESSING: 30000,    // 30s para audio
    IMAGE_PROCESSING: 20000,    // 20s para imágenes
    PDF_PROCESSING: 25001,      // 25s para PDFs
  },

  // Límites de contenido
  LIMITS: {
    MAX_AUDIO_SIZE: 25 * 1024 * 1024,  // 25MB max audio
    MAX_IMAGE_SIZE: 10 * 1024 * 1024,  // 10MB max imagen
    MAX_PDF_SIZE: 15 * 1024 * 1024,    // 15MB max PDF
    MAX_TEXT_LENGTH: 1000,              // 1000 caracteres max texto
  }
};

// Función para aplicar configuración optimizada
export function getOptimizedConfig(type = 'default') {
  switch (type) {
    case 'fast':
      return {
        ...PERFORMANCE_CONFIG,
        VIERAI: {
          ...PERFORMANCE_CONFIG.VIERAI,
          MAX_TOKENS: 800,    // Aumentado para respuestas más completas
          TIMEOUT: 15001      // 15s timeout
        }
      };
    
    case 'balanced':
      return PERFORMANCE_CONFIG;
    
    case 'quality':
      return {
        ...PERFORMANCE_CONFIG,
        VIERAI: {
          ...PERFORMANCE_CONFIG.VIERAI,
          MAX_TOKENS: 2000,    // Aumentado para respuestas muy detalladas
          TIMEOUT: 30000      // 30s timeout
        }
      };
    
    default:
      return PERFORMANCE_CONFIG;
  }
} 