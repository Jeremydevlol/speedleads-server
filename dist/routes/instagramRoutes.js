import express from 'express';
import { validateJwt } from '../config/jwt.js';
import {
    igChallengeStatus,
    igForceLogout,
    igGetMessages,
    igLogin,
    igLogout,
    igReplyWithAI,
    igResolveChallenge,
    igSend,
    igStatus,
    igSyncInbox
} from '../controllers/instagramController.js';
import instagramBotService from '../services/instagramBotService.js';

const router = express.Router();

// Endpoint de diagnóstico (sin autenticación) - DEBE ir ANTES del middleware
router.get('/diagnostic', (req, res) => {
  res.json({
    success: true,
    message: 'Instagram endpoints funcionando',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: [
      'GET /api/instagram/diagnostic',
      'POST /api/instagram/login',
      'POST /api/instagram/logout',
      'POST /api/instagram/force-logout (para errores 500)',
      'GET /api/instagram/status',
      'GET /api/instagram/dms',
      'GET /api/instagram/comments',
      'POST /api/instagram/comments/from-post'
    ]
  });
});

// Todas las demás rutas requieren autenticación
router.use(validateJwt);

/**
 * @route   POST /api/instagram/login
 * @desc    Login a Instagram con usuario/contraseña
 * @access  Private
 */
router.post('/login', igLogin);

/**
 * @route   POST /api/instagram/logout
 * @desc    Cerrar sesión de Instagram
 * @access  Private
 */
router.post('/logout', igLogout);

/**
 * @route   POST /api/instagram/force-logout
 * @desc    Forzar cierre de sesión y limpiar TODO el estado
 *          Usar cuando hay errores 500 o sesiones corruptas
 * @access  Private
 */
router.post('/force-logout', igForceLogout);

/**
 * @route   POST /api/instagram/send
 * @desc    Enviar DM a un usuario de Instagram
 * @access  Private
 */
router.post('/send', igSend);

/**
 * @route   GET /api/instagram/sync-inbox
 * @desc    Sincronizar bandeja de entrada y obtener mensajes
 * @access  Private
 */
router.get('/sync-inbox', igSyncInbox);

/**
 * @route   POST /api/instagram/reply-ai
 * @desc    Responder a un mensaje con IA
 * @access  Private
 */
router.post('/reply-ai', igReplyWithAI);

/**
 * @route   GET /api/instagram/status
 * @desc    Verificar estado de la sesión de Instagram
 * @access  Private
 */
router.get('/status', igStatus);

/**
 * @route   GET /api/instagram/messages
 * @desc    Obtener historial de mensajes de Instagram
 * @access  Private
 */
router.get('/messages', igGetMessages);

/**
 * @route   POST /api/instagram/resolve-challenge
 * @desc    Resolver challenge de Instagram con código de verificación
 * @access  Private
 */
router.post('/resolve-challenge', igResolveChallenge);

/**
 * @route   GET /api/instagram/challenge-status
 * @desc    Obtener estado del challenge pendiente
 * @access  Private
 */
router.get('/challenge-status', igChallengeStatus);

/**
 * @route   POST /api/instagram/bot/activate
 * @desc    Activar bot de Instagram para el usuario autenticado
 * @access  Private
 */
router.post('/bot/activate', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const { username, password, personalityId = 872 } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username y password de Instagram requeridos'
      });
    }

    console.log(`🤖 [API] Activando bot para usuario ${userId}`);
    
    const result = await instagramBotService.activateBotForUser(
      userId,
      { username, password },
      personalityId
    );

    if (result) {
      res.json({
        success: true,
        message: 'Bot de Instagram activado correctamente',
        userId: userId
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'No se pudo activar el bot'
      });
    }
  } catch (error) {
    console.error(`❌ [API] Error activando bot: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/instagram/bot/deactivate
 * @desc    Desactivar bot de Instagram para el usuario autenticado
 * @access  Private
 */
router.post('/bot/deactivate', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    console.log(`🛑 [API] Desactivando bot para usuario ${userId}`);
    
    const result = await instagramBotService.deactivateBotForUser(userId);

    if (result) {
      res.json({
        success: true,
        message: 'Bot de Instagram desactivado correctamente',
        userId: userId
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'No se pudo desactivar el bot'
      });
    }
  } catch (error) {
    console.error(`❌ [API] Error desactivando bot: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/instagram/bot/status
 * @desc    Obtener estado del bot para el usuario autenticado
 * @access  Private
 */
router.get('/bot/status', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const status = instagramBotService.getBotStatusForUser(userId);
    
    res.json({
      success: true,
      status: status,
      userId: userId
    });
  } catch (error) {
    console.error(`❌ [API] Error obteniendo estado del bot: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/instagram/bot/update-personality
 * @desc    Actualizar personalidad del bot activo sin reiniciarlo
 * @access  Private
 */
router.post('/bot/update-personality', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const { personalityId } = req.body;
    
    if (!personalityId) {
      return res.status(400).json({
        success: false,
        error: 'personalityId es requerido'
      });
    }

    console.log(`🔄 [API] Actualizando personalidad del bot para usuario ${userId} a personalidad ${personalityId}`);
    
    const result = await instagramBotService.updateBotPersonality(userId, personalityId);

    if (result) {
      res.json({
        success: true,
        message: 'Personalidad del bot actualizada correctamente',
        personalityId: personalityId
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'No se pudo actualizar la personalidad. Verifica que el bot esté activo.'
      });
    }
  } catch (error) {
    console.error(`❌ [API] Error actualizando personalidad del bot: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/instagram/bot/global-status
 * @desc    Obtener estado global del sistema de bots
 * @access  Private
 */
router.get('/bot/global-status', async (req, res) => {
  try {
    const globalStatus = instagramBotService.getGlobalStatus();
    
    res.json({
      success: true,
      globalStatus: globalStatus
    });
  } catch (error) {
    console.error(`❌ [API] Error obteniendo estado global: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/instagram/dms
 * @desc    Obtener DMs de Instagram para el frontend
 * @access  Private
 */
router.get('/dms', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      console.log('❌ [API] No hay userId en la request');
      return res.status(401).json({ 
        success: false, 
        error: 'No autenticado',
        debug: 'userId no encontrado en req.user'
      });
    }

    console.log(`📥 [API] Obteniendo DMs para usuario ${userId}`);
    
    // Obtener servicio de Instagram del usuario
    const { getOrCreateIGSession } = await import('../services/instagramService.js');
    const igService = await getOrCreateIGSession(userId);
    
    const status = await igService.checkStatus();
    if (!status.connected) {
      console.log(`❌ [API] Usuario ${userId} no tiene sesión activa de Instagram`);
      return res.status(400).json({
        success: false,
        error: 'No hay sesión activa de Instagram',
        debug: 'Usuario necesita hacer login primero en /api/instagram/login'
      });
    }

    // Obtener inbox de DMs
    const threads = await igService.fetchInbox();
    
    // Transformar datos para el frontend
    const dms = threads.map(thread => {
      const sender = thread.users?.find(u => u.pk !== igService.igUserId);
      return {
        id: thread.thread_id,
        sender_name: sender?.full_name || sender?.username || 'Usuario',
        username: sender?.username || 'usuario',
        avatar: sender?.profile_pic_url || '/default-avatar.png',
        last_message: thread.last_message?.text || '',
        timestamp: thread.last_message?.timestamp || Date.now(),
        unread_count: thread.unseen_count || 0
      };
    });

    console.log(`✅ [API] ${dms.length} DMs obtenidos para usuario ${userId}`);
    res.json({
      success: true,
      data: dms,
      count: dms.length
    });

  } catch (error) {
    console.error(`❌ [API] Error obteniendo DMs: ${error.message}`);
    console.error('Stack trace:', error.stack);
    
    // Detectar error 500 de Instagram y sugerir force-logout
    if (error.message && error.message.includes('500')) {
      console.log('🔴 [API] Error 500 detectado - Sesión posiblemente corrupta');
      return res.status(500).json({
        success: false,
        error: 'La sesión de Instagram parece estar corrupta',
        message: 'Instagram está rechazando las solicitudes. Usa "Forzar cierre de sesión" para limpiar y volver a conectar.',
        action: 'force_logout',
        actionLabel: 'Forzar cierre de sesión',
        actionEndpoint: '/api/instagram/force-logout',
        debug: 'Error 500 de Instagram API'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      debug: 'Error interno del servidor'
    });
  }
});

/**
 * @route   GET /api/instagram/comments
 * @desc    Obtener comentarios de Instagram para el frontend
 * @access  Private
 */
router.get('/comments', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    console.log(`💬 [API] Obteniendo comentarios para usuario ${userId}`);
    
    // Obtener servicio de Instagram del usuario
    const { getOrCreateIGSession } = await import('../services/instagramService.js');
    const igService = await getOrCreateIGSession(userId);
    
    const status = await igService.checkStatus();
    if (!status.connected) {
      return res.status(400).json({
        success: false,
        error: 'No hay sesión activa de Instagram'
      });
    }

    // Obtener comentarios reales de Instagram
    const comments = await igService.getRecentComments(20);

    res.json({
      success: true,
      data: comments
    });

  } catch (error) {
    console.error(`❌ [API] Error obteniendo comentarios: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/instagram/comments/from-post
 * @desc    Extraer comentarios de un post ajeno usando la URL del post
 * @access  Private
 */
router.post('/comments/from-post', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const { postUrl, limit = 10000 } = req.body;
    
    if (!postUrl) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere la URL del post (postUrl)'
      });
    }

    console.log(`💬 [API] Extrayendo comentarios de post ajeno para usuario ${userId}`);
    console.log(`   URL: ${postUrl}`);
    console.log(`   Límite: ${limit}`);
    
    // Obtener servicio de Instagram del usuario
    const { getOrCreateIGSession } = await import('../services/instagramService.js');
    const igService = await getOrCreateIGSession(userId);
    
    console.log(`🔍 Estado de sesión: logged=${igService.logged}, username=${igService.username}`);
    
    // Verificar que esté logueado (sin hacer llamada a la API de Instagram)
    if (!igService.logged) {
      return res.status(400).json({
        success: false,
        error: 'No hay sesión activa de Instagram'
      });
    }

    // Extraer comentarios del post usando la URL
    const result = await igService.getCommentsFromPost(postUrl, parseInt(limit));

    if (result.success) {
      console.log(`✅ [API] ${result.extracted_count} comentarios extraídos del post`);
      res.json({
        success: true,
        comments: result.comments,
        post_info: result.post_info,
        extracted_count: result.extracted_count,
        limit_requested: result.limit_requested,
        total_comments: result.total_comments
      });
    } else {
      console.log(`❌ [API] Error extrayendo comentarios: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error,
        comments: [],
        post_info: result.post_info
      });
    }

  } catch (error) {
    console.error(`❌ [API] Error extrayendo comentarios de post ajeno: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      comments: []
    });
  }
});

/**
 * @route   POST /api/instagram/likes/from-post
 * @desc    Extraer usuarios que dieron like a un post/reel
 * @access  Private
 */
router.post('/likes/from-post', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'No autenticado' });
    }

    const { postUrl, limit = 10000 } = req.body;
    
    if (!postUrl) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere la URL del post (postUrl)'
      });
    }

    console.log(`❤️ [API] Extrayendo likes de post para usuario ${userId}`);
    console.log(`   URL: ${postUrl}`);
    console.log(`   Límite: ${limit}`);
    
    // Obtener servicio de Instagram del usuario
    const { getOrCreateIGSession } = await import('../services/instagramService.js');
    const igService = await getOrCreateIGSession(userId);
    
    console.log(`🔍 Estado de sesión: logged=${igService.logged}, username=${igService.username}`);
    
    // Verificar que esté logueado
    if (!igService.logged) {
      return res.status(400).json({
        success: false,
        error: 'No hay sesión activa de Instagram'
      });
    }

    // Extraer likes del post usando la URL
    const result = await igService.getLikesFromPost(postUrl, parseInt(limit));

    if (result.success) {
      console.log(`✅ [API] ${result.extracted_count} likes extraídos (API reporta ${result.total_reported_by_api})`);
      res.json({
        success: true,
        likes: result.likes,
        post_info: result.post_info,
        extracted_count: result.extracted_count,
        total_reported_by_api: result.total_reported_by_api,
        note: result.note
      });
    } else {
      console.log(`❌ [API] Error extrayendo likes: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error,
        likes: [],
        post_info: result.post_info
      });
    }

  } catch (error) {
    console.error(`❌ [API] Error extrayendo likes de post: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      likes: []
    });
  }
});

/**
 * @route   GET /api/instagram/thread/:threadId/messages
 * @desc    Obtener historial completo de mensajes de un thread
 * @access  Private
 */
router.get('/thread/:threadId/messages', async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      console.log('❌ [API] No hay userId en la request');
      return res.status(401).json({ 
        success: false, 
        error: 'No autenticado'
      });
    }

    const { threadId } = req.params;
    const { limit = 50 } = req.query;

    console.log(`📖 [API] Obteniendo historial del thread ${threadId} para usuario ${userId}`);
    
    // Obtener servicio de Instagram del usuario
    const { igGetThreadHistory } = await import('../services/instagramService.js');
    const result = await igGetThreadHistory(threadId, parseInt(limit), userId);

    if (result.success) {
      console.log(`✅ [API] ${result.count} mensajes obtenidos del thread ${threadId}`);
      res.json({
        success: true,
        data: result.messages,
        count: result.count,
        thread_id: result.thread_id
      });
    } else {
      console.log(`❌ [API] Error obteniendo historial: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error(`❌ [API] Error obteniendo historial del thread: ${error.message}`);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
