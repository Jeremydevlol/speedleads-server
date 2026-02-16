/**
 * Wrapper que re-exporta openaiService (compatibilidad con imports de vieraiService).
 * @module services/vieraiService
 */

export {
    generateBotResponse,
    processInstructionsWithAI,
    reprocessExistingInstructions,
    transcribeAudioBuffer
} from './openaiService.js';

/** Información del servicio (OpenAI) - alias para compatibilidad */
export const VierAIInfo = {
    name: 'OpenAI',
    version: '1.0.0',
    description: 'Servicio OpenAI estándar',
    capabilities: [
        'Chat y conversación natural',
        'Procesamiento de instrucciones',
        'Transcripción de audio',
        'Análisis de imágenes',
        'OCR y procesamiento de documentos',
        'Análisis contextual'
    ],
    models: {
        chat: 'gpt-4o',
        chatMini: 'gpt-4o-mini',
        vision: 'gpt-4o',
        audio: 'whisper-1',
        turbo: 'gpt-3.5-turbo'
    }
};

export function getVierAIInfo() {
    return VierAIInfo;
}
