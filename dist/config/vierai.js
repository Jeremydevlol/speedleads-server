/**
 * OpenAI Configuration (alias para compatibilidad)
 * Usa el cliente estándar de OpenAI.
 * @module config/vierai
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30000,
    maxRetries: 2,
});

/** Modelos OpenAI estándar */
/** @deprecated Use OpenAIModels - alias para compatibilidad */
export const VierAIModels = {
    CHAT: 'gpt-4o',
    CHAT_MINI: 'gpt-4o-mini',
    VISION: 'gpt-4o',
    AUDIO: 'whisper-1',
    TURBO: 'gpt-3.5-turbo',
};

export const OpenAIModels = {
    CHAT: 'gpt-4o',
    CHAT_MINI: 'gpt-4o-mini',
    VISION: 'gpt-4o',
    AUDIO: 'whisper-1',
    TURBO: 'gpt-3.5-turbo',
};

/** Endpoints (compatibilidad) */
export const OpenAIEndpoints = {
    CHAT: '/v1/chat/completions',
    AUDIO: '/v1/audio/transcriptions',
    VISION: '/v1/chat/completions',
};

export async function checkOpenAIService() {
    try {
        if (!process.env.OPENAI_API_KEY) {
            console.warn('⚠️ OPENAI_API_KEY no configurada');
            return false;
        }
        console.log('✅ Servicio OpenAI configurado correctamente');
        return true;
    } catch (error) {
        console.error('❌ Error verificando servicio OpenAI:', error);
        return false;
    }
}

checkOpenAIService();

/** @deprecated Use checkOpenAIService */
export const checkVierAIService = checkOpenAIService;

export default openaiClient;
