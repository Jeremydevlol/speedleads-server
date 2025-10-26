import pino from 'pino';
import pool, { supabaseAdmin } from '../config/db.js';
import { getOrCreateIGSession, removeIGSession } from '../services/instagramService.js';
import { generateBotResponse } from '../services/openaiService.js';

const P = pino({ name: 'instagram-controller', level: 'info' });

/**
 * Login a Instagram
 * POST /api/instagram/login
 * Body: { username, password, proxy? }
 */
export async function igLogin(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const { username, password, proxy } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username y password son requeridos' 
      });
    }

    P.info(`Login request para usuario ${userId}, Instagram: ${username}`);

    const igService = await getOrCreateIGSession(userId);
    const result = await igService.login({ username, password, proxy });

    // Guardar credenciales en base de datos (encriptadas en producción)
    await pool.query(`
      INSERT INTO instagram_accounts (user_id, ig_username, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET ig_username = $2, updated_at = NOW()
    `, [userId, username]);

    res.json({ 
      success: true, 
      message: 'Login exitoso',
      restored: result.restored,
      username: username
    });
  } catch (error) {
    P.error(`Error en igLogin: ${error.message}`);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * Logout de Instagram
 * POST /api/instagram/logout
 */
export async function igLogout(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const igService = await getOrCreateIGSession(userId);
    await igService.logout();
    removeIGSession(userId);

    res.json({ success: true, message: 'Logout exitoso' });
  } catch (error) {
    P.error(`Error en igLogout: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * Enviar DM a un usuario
 * POST /api/instagram/send
 * Body: { username, text }
 */
export async function igSend(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const { username, text } = req.body;

    if (!username || !text) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username y text son requeridos' 
      });
    }

    const igService = await getOrCreateIGSession(userId);
    
    if (!igService.logged) {
      return res.status(400).json({ 
        success: false, 
        error: 'No hay sesión activa. Haz login primero.' 
      });
    }

    const result = await igService.sendText({ username, text });

    // Guardar mensaje en BD
    await saveInstagramMessage({
      userId,
      recipientUsername: username,
      text,
      senderType: 'you',
      threadId: null
    });

    res.json({ success: true, result });
  } catch (error) {
    P.error(`Error en igSend: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * Sincronizar inbox (obtener mensajes)
 * GET /api/instagram/sync-inbox
 */
export async function igSyncInbox(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const igService = await getOrCreateIGSession(userId);
    
    if (!igService.logged) {
      return res.status(400).json({ 
        success: false, 
        error: 'No hay sesión activa. Haz login primero.' 
      });
    }

    const threads = await igService.fetchInboxOnce();

    res.json({ 
      success: true, 
      threads,
      count: threads.length 
    });
  } catch (error) {
    P.error(`Error en igSyncInbox: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * Responder con IA a un mensaje
 * POST /api/instagram/reply-ai
 * Body: { thread_id, text, personality_id? }
 */
export async function igReplyWithAI(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const { thread_id, text, personality_id } = req.body;

    if (!thread_id || !text) {
      return res.status(400).json({ 
        success: false, 
        error: 'thread_id y text son requeridos' 
      });
    }

    const igService = await getOrCreateIGSession(userId);
    
    if (!igService.logged) {
      return res.status(400).json({ 
        success: false, 
        error: 'No hay sesión activa. Haz login primero.' 
      });
    }

    // Obtener personalidad
    let personalityData = null;
    if (personality_id) {
      const { data, error } = await supabaseAdmin
        .from('personalities')
        .select('*')
        .eq('id', personality_id)
        .single();

      if (!error && data) {
        personalityData = data;
      }
    }

    // Si no hay personalidad específica, usar la por defecto
    if (!personalityData) {
      const { data: settings } = await supabaseAdmin
        .from('user_settings')
        .select('default_personality_id')
        .eq('users_id', userId)
        .single();

      if (settings?.default_personality_id) {
        const { data } = await supabaseAdmin
          .from('personalities')
          .select('*')
          .eq('id', settings.default_personality_id)
          .single();

        if (data) personalityData = data;
      }
    }

    // Función de IA adaptada
    const aiFunction = async (userMessage) => {
      return await generateBotResponse({
        personality: personalityData,
        userMessage,
        userId,
        history: [], // TODO: Implementar historial de conversación
        mediaType: null,
        mediaContent: null
      });
    };

    const reply = await igService.handleIncomingWithAI({
      threadId: thread_id,
      text,
      aiFunction
    });

    // Guardar mensaje del usuario y respuesta en BD
    await saveInstagramMessage({
      userId,
      recipientUsername: null,
      text,
      senderType: 'user',
      threadId: thread_id
    });

    if (reply) {
      await saveInstagramMessage({
        userId,
        recipientUsername: null,
        text: reply,
        senderType: 'ia',
        threadId: thread_id
      });
    }

    res.json({ 
      success: true, 
      reply,
      personality: personalityData?.nombre || 'default'
    });
  } catch (error) {
    P.error(`Error en igReplyWithAI: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * Verificar estado de la sesión
 * GET /api/instagram/status
 */
export async function igStatus(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const igService = await getOrCreateIGSession(userId);
    const status = await igService.checkStatus();

    res.json({ success: true, status });
  } catch (error) {
    P.error(`Error en igStatus: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * Obtener historial de mensajes de Instagram
 * GET /api/instagram/messages
 */
export async function igGetMessages(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const { thread_id, limit = 50 } = req.query;

    let query = `
      SELECT * FROM instagram_messages
      WHERE user_id = $1
    `;
    const params = [userId];

    if (thread_id) {
      query += ` AND thread_id = $2`;
      params.push(thread_id);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);

    res.json({ 
      success: true, 
      messages: rows,
      count: rows.length 
    });
  } catch (error) {
    P.error(`Error en igGetMessages: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * Resolver challenge de Instagram
 * POST /api/instagram/resolve-challenge
 * Body: { code, choice? }
 */
export async function igResolveChallenge(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const { code, choice } = req.body;

    if (!code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Código de verificación requerido' 
      });
    }

    P.info(`Resolviendo challenge para usuario ${userId} con código: ${code}`);

    const igService = await getOrCreateIGSession(userId);
    
    // Verificar que hay un challenge pendiente
    const pendingChallenge = igService.getPendingChallenge();
    if (!pendingChallenge) {
      return res.status(400).json({ 
        success: false, 
        error: 'No hay challenge pendiente' 
      });
    }

    const result = await igService.resolveChallenge({ code, choice });

    res.json({ 
      success: true, 
      message: result.message,
      connected: true
    });
  } catch (error) {
    P.error(`Error en igResolveChallenge: ${error.message}`);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * Obtener estado del challenge pendiente
 * GET /api/instagram/challenge-status
 */
export async function igChallengeStatus(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const igService = await getOrCreateIGSession(userId);
    const pendingChallenge = igService.getPendingChallenge();

    res.json({ 
      success: true, 
      hasChallenge: !!pendingChallenge,
      challenge: pendingChallenge
    });
  } catch (error) {
    P.error(`Error en igChallengeStatus: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * Helper: Guardar mensaje de Instagram en BD
 */
async function saveInstagramMessage({ userId, recipientUsername, text, senderType, threadId }) {
  try {
    await pool.query(`
      INSERT INTO instagram_messages 
      (user_id, recipient_username, text_content, sender_type, thread_id, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [userId, recipientUsername, text, senderType, threadId]);

    P.info(`✅ Mensaje de Instagram guardado en BD`);
  } catch (error) {
    P.error(`❌ Error guardando mensaje en BD: ${error.message}`);
    // No lanzar error para no interrumpir el flujo
  }
}
