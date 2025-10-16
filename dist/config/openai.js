import OpenAI from 'openai';
import dotenv from 'dotenv'
dotenv.config()

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30000, // 30 segundos timeout
    maxRetries: 2,  // Solo 2 reintentos para evitar demoras
});

export default openai;
//# sourceMappingURL=openai.js.map