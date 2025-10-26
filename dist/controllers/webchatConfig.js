// controllers/webchatController.js

import pool from '../config/db.js';
import { testPersonalityContextPublic } from './personalityController.js';

let webChatConfigPersonaEspe = null;
export { webChatConfigPersonaEspe };

// 15 minutos en milisegundos
const IDLE_TIMEOUT = 15 * 60 * 1000;

/**
 * GET /api/webchat-config/:projectId
 */
export async function getWebchatConfig(req, res) {
  const projectId = req.params.projectId;
  if (!projectId) {
    return res.status(400).json({ error: 'Missing projectId parameter' });
  }
  try {
    const result = await pool.query(
      `SELECT *
         FROM configuracion_chat
        WHERE projectid = $1
        LIMIT 1`,
      [projectId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webchat configuration not found for this project' });
    }
    webChatConfigPersonaEspe = result.rows[0];
    console.log(webChatConfigPersonaEspe);
    return res.json(webChatConfigPersonaEspe);
  } catch (err) {
    console.error('Error fetching webchat config:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/chat-response
 */
export async function postChatResponse(req, res) {
  const { projectId, message, chatSessionId } = req.body;

  // 1) Validar parámetros
  if (!projectId || !message || !chatSessionId) {
    return res.status(400).json({ error: 'Missing projectId, message or chatSessionId' });
  }

  try {
    const now = new Date();
    let currentSessionId = null;

    // 2) Intentar recuperar una sesión activa por chat_session_id
    const selectRes = await pool.query(
      `SELECT session_id
         FROM webchat_sessions
        WHERE project_id      = $1
          AND chat_session_id = $2
          AND status         = 'active'
        LIMIT 1`,
      [projectId, chatSessionId]
    );
    if (selectRes.rows.length > 0) {
      currentSessionId = selectRes.rows[0].session_id;
    }

    // 3) Si existe, actualizamos sus mensajes; si no, creamos una nueva sesión
    if (currentSessionId) {
      // Ya hay sesión activa: acumulamos el mensaje
      await pool.query(
        `UPDATE webchat_sessions
            SET messages   = messages::jsonb || $1::jsonb,
                updated_at = $2
          WHERE session_id = $3`,
        [ JSON.stringify([{ author: 'tu', message }]), now, currentSessionId ]
      );
    } else {
      // No hay sesión activa: creamos una nueva
      const initialMsgs = [{ author: 'tu', message }];
      const insertRes = await pool.query(
        `INSERT INTO webchat_sessions
           (project_id, start_time, messages, status, updated_at,
            user_id, bot_name, avatar_img, chat_session_id)
         VALUES ($1, $2, $3, 'active', $2, $4, $5, $6, $7)
       RETURNING session_id`,
        [
          projectId,
          now,
          JSON.stringify(initialMsgs),
          webChatConfigPersonaEspe.user_id,
          webChatConfigPersonaEspe.bot_name,
          webChatConfigPersonaEspe.avatar_url,
          chatSessionId
        ]
      );
      if (!insertRes.rows.length) {
        console.error('Error: no se pudo crear la nueva sesión');
        return res.status(500).json({ error: 'No se pudo crear la sesión correctamente' });
      }
      currentSessionId = insertRes.rows[0].session_id;
    }

    // 4) Inyectar configuración de personalidad
    const config = webChatConfigPersonaEspe;
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found for this project' });
    }
    req.body.config        = config;
    req.body.personalityId = config.personality_id;
    req.body.sessionId     = currentSessionId;

    // 5) Interceptar la respuesta del bot y guardarla
    const originalJson = res.json.bind(res);
    res.json = async (data) => {
      const botText = data?.response ?? data?.message;
      if (botText) {
        await pool.query(
          `UPDATE webchat_sessions
             SET messages     = messages::jsonb || $1::jsonb,
                 updated_at   = NOW(),
                 last_message = $2
           WHERE session_id = $3`,
          [
            JSON.stringify([{ author: 'bot', message: botText }]),
            botText,
            currentSessionId
          ]
        );
      }
      return originalJson({ ...data, sessionId: currentSessionId, chatSessionId });
    };

    // 6) Delegar la lógica de conversación/personality
    return await testPersonalityContextPublic(req, res);

  } catch (err) {
    console.error('Error handling chat response:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}