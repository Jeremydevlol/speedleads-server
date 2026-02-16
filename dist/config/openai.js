import OpenAI from 'openai';
import dotenv from 'dotenv'
dotenv.config()

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30000,
    maxRetries: 2,
});

export default openai;
