// routes/telegramRoutes.js
import express from 'express';
import { saveTelegramConfig, setTelegramWebhook, saveTelegramMessages } from '../controllers/telegramController.js';

const router = express.Router();

// Ruta para guardar la configuración de Telegram
router.post('/save_config', saveTelegramConfig);

// Ruta para configurar el webhook de Telegram
router.post('/set_webhook', setTelegramWebhook);

// Ruta para guardar los mensajes de Telegram
router.post('/save_messages', saveTelegramMessages);  // Asegúrate de que esta ruta esté correctamente definida

export default router;
