// controllers/configuracionChatController.js

import pool from '../config/db.js';
import { getUserIdFromToken } from './authController.js';

/**
 * Crear o actualizar la configuración de chat para el usuario.
 * Recibe en req.body.configData los campos necesarios.
 */
export async function crearConfiguracion(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    console.log('📦 Body recibido:', req.body);

    // Extrae configData del body:
    const {
      bot_name,
      bot_description,
      theme_color,
      welcome_message,
      personality_id,
      model,
      avatar_url,
      placeholder,
      chat_layout,
      message_style,
      offlineMessage,
      greatensMessage,
      feedbackButton,
      uploadFiles,
      writingMark,
      script,
      projectId
    } = req.body.configData;

    // Verificar si ya existe una configuración para este userId:
    const existingConfig = await pool.query(
      'SELECT id FROM configuracion_chat WHERE user_id = $1',
      [userId]
    );

    if (existingConfig.rows.length > 0) {
      // Si ya existe, hacemos UPDATE
      const { rows } = await pool.query(
        `UPDATE configuracion_chat
           SET
             bot_name        = $2,
             bot_description = $3,
             theme_color     = $4,
             welcome_message = $5,
             personality_id  = $6,
             model           = $7,
             avatar_url      = $8,
             placeholder     = $9,
             chat_layout     = $10,
             message_style   = $11,
             offline_message = $12,
             thanks_message  = $13,  -- "greatensMessage"
             feedback_buttons= $14,  -- "feedbackButton"
             file_upload     = $15,  -- "uploadFiles"
             typing_indicator= $16,  -- "writingMark"
             script          = $17,
             projectId       = $18
         WHERE user_id        = $1
         RETURNING *`,
        [
          userId,
          bot_name,
          bot_description,
          theme_color,
          welcome_message,
          personality_id,
          model,
          avatar_url,
          placeholder,
          chat_layout,
          message_style,
          offlineMessage,
          greatensMessage,
          feedbackButton,
          uploadFiles,
          writingMark,
          script,
          projectId
        ]
      );

      return res.status(200).json({
        success: true,
        message: 'Configuración actualizada correctamente',
        config: rows[0],
      });

    } else {
      // Si no existe, INSERT
      const { rows } = await pool.query(
        `INSERT INTO configuracion_chat (
           user_id, bot_name, bot_description, theme_color,
           welcome_message, personality_id, model, avatar_url,
           placeholder, chat_layout, message_style, offline_message,
           thanks_message, feedback_buttons, file_upload,
           typing_indicator, script, projectId
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7, $8,
           $9, $10, $11, $12,
           $13, $14, $15,
           $16, $17, $18
         )
         RETURNING *`,
        [
          userId,
          bot_name,
          bot_description,
          theme_color,
          welcome_message,
          personality_id,
          model,
          avatar_url,
          placeholder,
          chat_layout,
          message_style,
          offlineMessage,
          greatensMessage,
          feedbackButton,
          uploadFiles,
          writingMark,
          script,
          projectId
        ]
      );

      return res.status(200).json({
        success: true,
        message: 'Configuración creada correctamente',
        config: rows[0],
      });
    }

  } catch (error) {
    console.error('❌ Error al crear/actualizar configuración:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al crear o actualizar la configuración',
      error: error.message,
    });
  }
}

/**
 * Obtener configuración de chat para el usuario autenticado.
 */
export async function obtenerConfiguracionPorUsuario(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    const { rows } = await pool.query(
      `SELECT *
         FROM configuracion_chat
        WHERE user_id = $1
        LIMIT 1`,
      [userId]
    );

    console.log('📋 Consulta configuracion_chat:', rows);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró configuración para este usuario'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Configuración obtenida correctamente',
      config: rows[0],
    });

  } catch (error) {
    console.error('❌ Error al obtener configuración:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
    });
  }
}
