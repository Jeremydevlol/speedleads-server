import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;

const deepseek = axios.create({
  baseURL: 'https://api.deepseek.com',  // Ajusta la URL base de la API de DeepSeek
  headers: {
    'Authorization': `Bearer ${deepSeekApiKey}`,
    'Content-Type': 'application/json',
  },
});

export default deepseek;
