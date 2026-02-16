import fetch from 'node-fetch';
import pool from '../config/db.js';
import { getUserIdFromToken } from './authController.js';

// Guardar configuración de Telegram para un usuario autenticado
export const saveTelegramConfig = async (req, res) => {
  try {
    const { telegramUsername, telegramToken, telegramFirstName, telegramLastName, telegramLanguageCode, telegramLastMessage } = req.body;

    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Usuario no autenticado" });
    }

    // Verificamos si el token ya existe en la base de datos
    const { rows: existingRows } = await pool.query(
      `SELECT token FROM telegram WHERE user_id = $1`,
      [userId]
    );

    // Si el token ya está registrado, lo actualizamos con los nuevos datos
    if (existingRows.length > 0) {
      const { rows, error } = await pool.query(
        `UPDATE telegram
         SET username = $2, token = $3, first_name = $4, last_name = $5, language_code = $6, last_message = $7, updated_at = NOW()
         WHERE user_id = $1
         RETURNING *`,
        [userId, telegramUsername, telegramToken, telegramFirstName, telegramLastName, telegramLanguageCode, telegramLastMessage]
      );
      
      if (error) {
        throw new Error(error.message);
      }

      return res.status(200).json({ success: true, data: rows[0] });
    }

    // Si el token no está registrado, insertamos uno nuevo
    const { rows, error } = await pool.query(
      `INSERT INTO telegram (user_id, username, token, first_name, last_name, language_code, last_message, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [userId, telegramUsername, telegramToken, telegramFirstName, telegramLastName, telegramLanguageCode, telegramLastMessage]
    );

    if (error) {
      throw new Error(error.message);
    }

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error al guardar la configuración de Telegram:", error);
    return res.status(500).json({ success: false, message: "Error al guardar la configuración de Telegram" });
  }
};

// Configurar el webhook de Telegram con la URL proporcionada
export const setTelegramWebhook = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }

    // Obtener el token del bot de Telegram desde la base de datos
    const { rows } = await pool.query(
      `SELECT token FROM telegram WHERE user_id = $1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Bot de Telegram no encontrado' });
    }

    const telegramBotToken = rows[0].token;

    // Definir la URL del webhook según el entorno
    const isProduction = process.env.NODE_ENV === 'production';
    const webhookUrl = isProduction
      ? `(process.env.BACKEND_URL || 'https://speedleads-server.onrender.com') + '/api/telegram/webhook'`
      : `http://localhost:5001/api/telegram/webhook`;  // Cambiar según tu entorno

    // Configurar el webhook
    const url = `https://api.telegram.org/bot${telegramBotToken}/setWebhook?url=${webhookUrl}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.ok) {
      return res.status(200).json({
        success: true,
        message: 'Webhook configurado correctamente',
        webhookUrl: webhookUrl,  // Devuelve la URL configurada
      });
    } else {
      return res.status(500).json({ success: false, message: 'Error al configurar el webhook', error: data.description });
    }
  } catch (error) {
    console.error('Error al configurar el webhook:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

// Función para obtener los mensajes de Telegram usando `getUpdates`
export const saveTelegramMessages = async (req, res) => {
  try {
    console.log('Ruta /save_messages llamada');  // Log para verificar si se accede a la ruta

    const { telegramToken } = req.body;  // Obtener el token del bot desde el frontend

    if (!telegramToken) {
      return res.status(400).json({ success: false, message: 'Token del bot de Telegram es requerido' });
    }

    // URL para obtener las actualizaciones (mensajes nuevos)
    const url = `https://api.telegram.org/bot${telegramToken}/getUpdates`;

    // Hacemos una solicitud GET a Telegram API para obtener los mensajes
    const response = await fetch(url);
    const data = await response.json();

    if (data.ok && data.result.length > 0) {
      const userId = req.userId; // Asumiendo que tienes el userId desde el JWT (autenticación)

      for (let message of data.result) {
        const { text, chat, from, date } = message.message;

        // Excluir comandos como /start, /help, etc.
        if (text && text.startsWith('/')) {
          console.log(`Comando excluido: ${text}`);
          continue; // Si es un comando, no lo guardamos
        }

        // Insertar el mensaje en la base de datos
        const { rows, error } = await pool.query(
          `INSERT INTO telegram_messages (user_id, telegram_chat_id, message_text, sender_name, date_received)
           VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5)) RETURNING *`,
          [userId, chat.id, text, from.username, date]
        );

        if (error) {
          throw new Error(error.message);
        }

        console.log(`Mensaje guardado: ${text}`);
      }

      return res.status(200).json({ success: true, message: 'Mensajes guardados correctamente' });
    } else {
      return res.status(500).json({ success: false, message: 'Error al obtener mensajes de Telegram' });
    }
  } catch (error) {
    console.error('Error al guardar mensajes de Telegram:', error);
    return res.status(500).json({ success: false, message: 'Error al guardar mensajes de Telegram' });
  }
};

// Función para eliminar el webhook (si se desea usar getUpdates)
export const deleteTelegramWebhook = async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }

    // Obtener el token del bot de Telegram desde la base de datos
    const { rows } = await pool.query(
      `SELECT token FROM telegram WHERE user_id = $1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Bot de Telegram no encontrado' });
    }

    const telegramBotToken = rows[0].token;

    // Eliminar el webhook de Telegram
    const url = `https://api.telegram.org/bot${telegramBotToken}/deleteWebhook`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.ok) {
      return res.status(200).json({ success: true, message: 'Webhook eliminado correctamente' });
    } else {
      return res.status(500).json({ success: false, message: 'Error al eliminar el webhook', error: data.description });
    }
  } catch (error) {
    console.error('Error al eliminar el webhook:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};
