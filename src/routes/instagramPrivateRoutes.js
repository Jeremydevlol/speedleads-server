/**
 * Rutas de Instagram Private API — SpeedLeads
 * 
 * Login: Meta OAuth (Graph API)  
 * Envío de mensajes: Private API (instagram-private-api)
 * 
 * Endpoints:
 * - POST /login        → Login con user/pass (Private API)
 * - POST /2fa          → Completar 2FA
 * - GET  /status       → Estado de la sesión
 * - POST /logout       → Cerrar sesión
 * - POST /send-dm      → Enviar DM individual
 * - POST /bulk-send    → Envío masivo de DMs
 * - GET  /followers/:username → Obtener seguidores
 * - POST /likes-from-post     → Obtener likes de un post
 * - GET  /search       → Buscar usuarios
 * - GET  /user/:username → Info de usuario
 */

import express from 'express';
import { validateJwt } from '../config/jwt.js';
import {
    generateCommentAndDMForProfile,
} from '../services/aiProspector.service.js';
import {
    scrapeProfileByUsername,
    scrapeProfiles,
} from '../services/brightDataScraper.service.js';
import {
    scrapeFollowersFromBrightDataToDb,
    scrapeFollowersToDb,
    scrapeFollowersUsingSession,
    scrapeLeadsFromCommenters,
} from '../services/instagramFollowersScraper.service.js';
import {
    privateApiBulkSend,
    privateApiCommentOnPost,
    privateApiComplete2FA,
    privateApiGetFirstMediaFromUser,
    privateApiGetFollowers,
    privateApiGetFollowersFromApi,
    privateApiGetInbox,
    privateApiGetLikesFromPost,
    privateApiGetStatus,
    privateApiGetThreadMessages,
    privateApiGetUserInfo,
    privateApiLikePost,
    privateApiLogin,
    privateApiLogout,
    privateApiReplyToThread,
    privateApiSearchUsers,
    privateApiSendDM,
} from '../services/instagramPrivateApi.service.js';
import { generatePersonalizedLeadMessage } from '../services/aiReply.service.js';
import { startAutoReply, stopAutoReply, getAutoReplyStatus } from '../services/instagramAutoReply.service.js';

const router = express.Router();

function getUserId(req) {
  return req.user?.userId || req.user?.id || req.user?.sub;
}

/**
 * POST /login — Login con usuario/contraseña (Private API)
 */
router.post('/login', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username y password son requeridos' });
    }

    const result = await privateApiLogin(userId, username, password);

    if (result.needs_2fa) {
      return res.json({
        success: false,
        status: '2FA_REQUIRED',
        twoFA_required: true,
        message: 'Instagram requiere código de verificación',
        methods: result.methods
      });
    }

    res.json(result);
  } catch (error) {
    console.error('[IG-PRIVATE] login error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /2fa — Completar login con código 2FA
 */
router.post('/2fa', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código 2FA requerido' });

    const result = await privateApiComplete2FA(userId, code);
    res.json(result);
  } catch (error) {
    console.error('[IG-PRIVATE] 2fa error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /status — Estado de la sesión Private API
 */
router.get('/status', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const status = await privateApiGetStatus(userId);
    
    // Auto-start bot si está logueado
    if (status?.logged) {
      const io = req.app.get('io');
      startAutoReply(userId, io);
    }

    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /logout — Cerrar sesión Private API
 */
router.post('/logout', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await privateApiLogout(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /send-dm — Enviar DM individual vía Private API
 * Body: { recipientUsername, message }
 */
router.post('/send-dm', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { recipientUsername, message } = req.body;
    if (!recipientUsername || !message) {
      return res.status(400).json({ error: 'recipientUsername y message son requeridos' });
    }

    const result = await privateApiSendDM(userId, recipientUsername, message);
    res.json(result);
  } catch (error) {
    console.error('[IG-PRIVATE] send-dm error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /bulk-send — Envío masivo de DMs vía Private API
 * Body: { recipients: [{username, message}], defaultMessage? }
 * 
 * Máximo 500 destinatarios por solicitud.
 * Incluye delays aleatorios y pausas de seguridad para evitar bans.
 */
router.post('/bulk-send', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let { recipients, defaultMessage, personalityId } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        error: 'recipients es requerido (array de {username, message})'
      });
    }

    // Aplicar plantilla base a quienes no tienen message individual
    if (defaultMessage) {
      recipients = recipients.map(r => ({ username: r.username, message: r.message || defaultMessage }));
    }

    // Validar
    const invalid = recipients.filter(r => !r.username || !(r.message || defaultMessage));
    if (invalid.length > 0) {
      return res.status(400).json({
        error: `${invalid.length} destinatario(s) sin username o plantilla/message`
      });
    }

    // Límite de seguridad
    if (recipients.length > 500) {
      return res.status(400).json({
        error: 'Máximo 500 destinatarios por envío masivo'
      });
    }

    console.log(`[IG-PRIVATE] Envío masivo IA: ${recipients.length} destinatarios por userId=${userId}`);

    // SIEMPRE generar versión IA por lead usando la plantilla + personalidad.
    const aiGeneratedRecipients = [];
    const aiFailed = [];
    for (const recipient of recipients) {
      const template = String(recipient.message || defaultMessage || '').trim();
      const generated = await generatePersonalizedLeadMessage({
        tenant_id: String(userId),
        recipient_username: recipient.username,
        template_message: template,
        personality_id: personalityId ? String(personalityId) : null,
      });
      if (!generated.success || !generated.text) {
        aiFailed.push({
          username: recipient.username,
          success: false,
          error: generated.error || 'No se pudo generar mensaje IA',
        });
        continue;
      }
      aiGeneratedRecipients.push({
        username: recipient.username,
        message: generated.text,
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(String(userId)).emit('ig-bulk-send-started', {
        total: recipients.length,
        usernames: recipients.map(r => r.username),
      });
    }
    if (aiGeneratedRecipients.length === 0) {
      if (io) {
        io.to(String(userId)).emit('ig-bulk-send-complete', {
          success: false,
          sent: 0,
          failed: recipients.length,
          total: recipients.length,
          usernames: [],
          error: 'No se pudo generar mensajes con IA para los destinatarios seleccionados.',
        });
      }
      return res.status(500).json({
        success: false,
        sent: 0,
        failed: recipients.length,
        total: recipients.length,
        results: aiFailed.map((r, idx) => ({ ...r, index: idx + 1 })),
        error: 'No se pudo generar mensajes con IA para los destinatarios seleccionados.',
      });
    }

    const sentResult = await privateApiBulkSend(userId, aiGeneratedRecipients, (index, total, itemResult) => {
      const globalIndex = aiFailed.length + index;
      console.log(`[IG-PRIVATE] Progreso: ${globalIndex}/${recipients.length} - ${itemResult.success ? '✅' : '❌'} @${itemResult.recipientUsername || '?'}`);
      if (io) {
        io.to(String(userId)).emit('ig-bulk-send-progress', {
          index: globalIndex,
          total: recipients.length,
          username: itemResult.username || itemResult.recipientUsername,
          success: itemResult.success,
          error: itemResult.error,
        });
      }
    });

    const mergedResults = [
      ...aiFailed.map((r, idx) => ({ username: r.username, success: false, error: r.error, index: idx + 1 })),
      ...sentResult.results.map((r, idx) => ({
        username: r.username,
        success: r.success,
        error: r.error || undefined,
        index: aiFailed.length + idx + 1,
      })),
    ];
    const sent = sentResult.sent;
    const failed = aiFailed.length + sentResult.failed;
    const total = recipients.length;

    if (io) {
      const sentUsernames = mergedResults.filter(r => r.success).map(r => r.username);
      io.to(String(userId)).emit('ig-bulk-send-complete', {
        success: sent > 0,
        sent,
        failed,
        total,
        usernames: sentUsernames,
      });
    }

    res.json({ success: sent > 0, sent, failed, total, results: mergedResults });
  } catch (error) {
    console.error('[IG-PRIVATE] bulk-send error:', error.message);
    const io = req.app?.get?.('io');
    const uid = getUserId(req);
    if (io && uid) {
      io.to(String(uid)).emit('ig-bulk-send-complete', {
        success: false,
        error: error.message,
        sent: 0,
        failed: 0,
        total: 0,
        usernames: [],
      });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /bd-search/:username — Buscar perfil via Bright Data (NO requiere Private API login)
 * Ideal para el panel de agente y scrapers que funcionan sin sesión de Instagram.
 */
router.get('/bd-search/:username', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { username } = req.params;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    console.log(`[IG-BD] Buscando perfil @${username} via Bright Data (sin sesión IG)`);
    const profile = await scrapeProfileByUsername(username.replace(/@/g, '').trim());

    if (!profile) {
      return res.json({ success: false, error: 'Perfil no encontrado', data: [] });
    }

    // Normalizar la respuesta al mismo formato que Private API search
    const normalized = {
      username: profile.username || username,
      full_name: profile.full_name || profile.name || '',
      profile_pic_url: profile.profile_pic_url || profile.profile_image || '',
      follower_count: profile.follower_count || profile.followers || 0,
      following_count: profile.following_count || profile.following || 0,
      is_verified: profile.is_verified || false,
      is_private: profile.is_private || false,
      biography: profile.biography || profile.bio || '',
      posts_count: profile.posts_count || profile.media_count || 0,
    };

    res.json({ success: true, users: [normalized], data: [normalized], total: 1 });
  } catch (error) {
    console.error('[IG-BD] bd-search error:', error.message);
    res.status(500).json({ success: false, error: error.message, data: [] });
  }
});

/**
 * POST /extract-followers/:username — Extraer SEGUIDORES (no comentaristas).
 * Usa sesión IG si está activa, o BD_DATASET_FOLLOWERS, o credenciales.
 */
router.post('/extract-followers/:username', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { username: targetUsername } = req.params;
    const { limit = 100, scraperUsername, scraperPassword, useBrightDataOnly } = req.body || {};
    const limitNum = parseInt(limit) || 100;

    if (process.env.BD_DATASET_FOLLOWERS && (useBrightDataOnly || !scraperUsername)) {
      const result = await scrapeFollowersFromBrightDataToDb(userId, targetUsername, limitNum);
      if (result.success) return res.json(result);
    }
    const sessionResult = await scrapeFollowersUsingSession(userId, targetUsername, limitNum);
    if (sessionResult.success) return res.json(sessionResult);
    if (scraperUsername && scraperPassword) {
      const result = await scrapeFollowersToDb(userId, targetUsername, scraperUsername, scraperPassword, limitNum);
      return res.json(result);
    }
    return res.status(400).json({
      success: false,
      error: sessionResult.error || 'Inicia sesión en Instagram o envía scraperUsername/scraperPassword'
    });
  } catch (error) {
    console.error('[IG-PRIVATE] extract-followers error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /scrape-from-commenters/:username — Extraer leads desde comentaristas (100% Bright Data)
 * Body: { limit?, source?: 'followers' | 'commenters', extractSeguidores?: boolean }
 * Si source='followers' o extractSeguidores=true → extrae SEGUIDORES.
 */
router.post('/scrape-from-commenters/:username', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { username: targetUsername } = req.params;
    const { limit, source, extractSeguidores } = req.body || {};
    const limitNum = parseInt(limit) || 50;

    if (source === 'followers' || extractSeguidores === true) {
      console.log(`[IG-PRIVATE] Extracción de SEGUIDORES de @${targetUsername} (source=followers)`);
      const { scraperUsername, scraperPassword, useBrightDataOnly } = req.body || {};
      if (process.env.BD_DATASET_FOLLOWERS && (useBrightDataOnly || !scraperUsername)) {
        const result = await scrapeFollowersFromBrightDataToDb(userId, targetUsername, limitNum);
        if (result.success) return res.json(result);
      }
      const sessionResult = await scrapeFollowersUsingSession(userId, targetUsername, limitNum);
      if (sessionResult.success && sessionResult.total > 0) return res.json(sessionResult);
      if (sessionResult.success) return res.json(sessionResult);
      if (scraperUsername && scraperPassword) {
        const result = await scrapeFollowersToDb(userId, targetUsername, scraperUsername, scraperPassword, limitNum);
        return res.json(result);
      }
      return res.status(400).json({
        success: false,
        error: sessionResult.error || 'Inicia sesión en Instagram o envía scraperUsername/scraperPassword'
      });
    }

    console.log(`[IG-PRIVATE] Scrapeando leads desde comentarios de @${targetUsername} (Bright Data)`);
    const result = await scrapeLeadsFromCommenters(userId, targetUsername, limitNum);
    res.json(result);
  } catch (error) {
    console.error('[IG-PRIVATE] scrape-from-commenters error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /scrape-followers/:username — Extraer seguidores
 * Sin login: BD_DATASET_FOLLOWERS o sesión IG activa. Con login: credenciales.
 */
router.post('/scrape-followers/:username', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { username: targetUsername } = req.params;
    const { scraperUsername, scraperPassword, limit = 100, useBrightDataOnly } = req.body || {};
    const limitNum = parseInt(limit) || 100;

    if (useBrightDataOnly || (!scraperUsername && !scraperPassword)) {
      if (process.env.BD_DATASET_FOLLOWERS) {
        console.log(`[IG-PRIVATE] Scrapeando seguidores de @${targetUsername} vía Bright Data (sin login)`);
        const result = await scrapeFollowersFromBrightDataToDb(userId, targetUsername, limitNum);
        if (result.success) return res.json(result);
        if (!scraperUsername || !scraperPassword) return res.json(result);
      }
      console.log(`[IG-PRIVATE] Intentando seguidores de @${targetUsername} con sesión IG activa...`);
      const sessionResult = await scrapeFollowersUsingSession(userId, targetUsername, limitNum);
      if (sessionResult.success && sessionResult.total > 0) return res.json(sessionResult);
      if (sessionResult.error && sessionResult.error.includes('Sesión')) {
        return res.status(400).json({
          error: 'Inicia sesión en Instagram primero, o configura BD_DATASET_FOLLOWERS, o envía scraperUsername y scraperPassword'
        });
      }
      if (!scraperUsername || !scraperPassword) {
        return res.status(400).json({
          error: 'scraperUsername y scraperPassword son requeridos, o configura BD_DATASET_FOLLOWERS, o inicia sesión en Instagram'
        });
      }
    }

    console.log(`[IG-PRIVATE] Iniciando scraper (Private API) de @${targetUsername} para userId=${userId}`);
    const result = await scrapeFollowersToDb(
      userId,
      targetUsername,
      scraperUsername,
      scraperPassword,
      limitNum
    );
    res.json(result);
  } catch (error) {
    console.error('[IG-PRIVATE] scrape-followers error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /followers/:username — Obtener seguidores desde BD (scrapeados previamente)
 * Ya NO usa Private API para extraer. Lee de ig_scraped_followers.
 */
router.get('/followers/:username', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { username } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const result = await privateApiGetFollowers(userId, username, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /like-post — Dar like a un post/reel (sesión solo acciones)
 */
router.post('/like-post', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { postUrl } = req.body;
    if (!postUrl) return res.status(400).json({ error: 'postUrl es requerido' });

    const result = await privateApiLikePost(userId, postUrl);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /comment-on-post — Comentar en un post/reel (sesión solo acciones)
 */
router.post('/comment-on-post', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { postUrl, text } = req.body;
    if (!postUrl || !text) return res.status(400).json({ error: 'postUrl y text son requeridos' });

    const result = await privateApiCommentOnPost(userId, postUrl, text);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /likes-from-post — Obtener likes de un post (Private API)
 */
router.post('/likes-from-post', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { postUrl, limit = 50 } = req.body;
    if (!postUrl) return res.status(400).json({ error: 'postUrl es requerido' });

    const result = await privateApiGetLikesFromPost(userId, postUrl, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /search — Buscar usuarios (Private API)
 */
router.get('/search', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { q, limit = 10 } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter (q) is required' });

    const result = await privateApiSearchUsers(userId, q, parseInt(limit));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /user/:username — Info de usuario (Private API)
 */
router.get('/user/:username', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await privateApiGetUserInfo(userId, req.params.username);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /inbox — Obtener conversaciones (bandeja de entrada)
 */
router.get('/inbox', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const limit = parseInt(req.query.limit || '20');
    const result = await privateApiGetInbox(userId, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /thread/:threadId/messages — Obtener mensajes de un thread
 */
router.get('/thread/:threadId/messages', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const limit = parseInt(req.query.limit || '30');
    const result = await privateApiGetThreadMessages(userId, req.params.threadId, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /thread/:threadId/reply — Responder a un thread
 */
router.post('/thread/:threadId/reply', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { text, message } = req.body;
    const messageText = text || message;
    if (!messageText) return res.status(400).json({ error: 'text is required' });

    const result = await privateApiReplyToThread(userId, req.params.threadId, messageText);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PROSPECTOR: Bright Data + AI + Like + Comment + DM (flujo real)
// ═══════════════════════════════════════════════════════════

const activeCampaigns = new Map();

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function getFirstMedia(profile) {
  return profile?.posts?.[0] || profile?.reels?.[0] || null;
}

function getMediaUrl(media) {
  if (!media) return null;
  if (media.url) return media.url;
  if (media.shortcode) {
    const type = media.is_reel || media.media_type === 'reel' ? 'reel' : 'p';
    return `https://www.instagram.com/${type}/${media.shortcode}/`;
  }
  return null;
}

/**
 * POST /prospector/run — Flujo completo: scrape target + AI + like + comment + DM a seguidores
 * Body: { targetUsername, limit?, igUsername?, igPassword? }
 * 
 * Bright Data: scrape perfil + enriquecer seguidores (sin sesión IG)
 * OpenAI: generar comentario y DM personalizado
 * Sesión IG: like, comentar, enviar DM
 */
router.post('/prospector/run', validateJwt, async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { targetUsername, limit = 3, igUsername, igPassword } = req.body;
  if (!targetUsername) return res.status(400).json({ error: 'targetUsername es requerido' });

  if (activeCampaigns.has(userId)) {
    return res.status(409).json({ error: 'Ya hay una campaña activa para este usuario' });
  }

  const campaignId = `campaign-${Date.now()}`;
  const log = [];
  const push = (msg) => { log.push(msg); console.log(`[PROSPECTOR] ${msg}`); };

  activeCampaigns.set(userId, { id: campaignId, target: targetUsername, startedAt: new Date(), log });

  res.json({ success: true, campaignId, message: `Campaña iniciada para @${targetUsername}` });

  // Run async (don't block response)
  (async () => {
    try {
      // 1. Analizar perfil objetivo
      push(`Analizando perfil de @${targetUsername}...`);
      let targetProfile = null;
      for (let a = 1; a <= 3; a++) {
        targetProfile = await scrapeProfileByUsername(targetUsername);
        if (targetProfile && !targetProfile.error) break;
        if (a < 3) await delay(3000);
      }
      if (!targetProfile || targetProfile.error) {
        push(`ERROR: No se pudo obtener perfil de @${targetUsername}`);
        activeCampaigns.delete(userId);
        return;
      }
      push(`Perfil obtenido: @${targetProfile.username || targetProfile.account} (${targetProfile.followers} seguidores)`);

      // 2. Login IG session (use provided creds or check existing session)
      const status = await privateApiGetStatus(userId);
      if (!status?.logged) {
        if (!igUsername || !igPassword) {
          push('ERROR: No hay sesión activa y no se proporcionaron credenciales IG');
          activeCampaigns.delete(userId);
          return;
        }
        push('Iniciando sesión IG...');
        const login = await privateApiLogin(userId, igUsername, igPassword);
        if (!login.success) {
          push(`ERROR: Login fallido: ${login.error}`);
          activeCampaigns.delete(userId);
          return;
        }
        push('Sesión IG activa');
      } else {
        push('Sesión IG existente reutilizada');
      }

      // 3. Get media from target (BD or session fallback)
      let targetProfileForAi = targetProfile;
      let targetMedia = getFirstMedia(targetProfile);
      if (!targetMedia) {
        const sessionMedia = await privateApiGetFirstMediaFromUser(userId, targetUsername);
        if (sessionMedia) {
          targetMedia = sessionMedia;
          targetProfileForAi = { ...targetProfile, posts: [{ caption: sessionMedia.caption, url: sessionMedia.url, likes: sessionMedia.likes }] };
          push(`Media de @${targetUsername} obtenida por sesión: ${sessionMedia.url}`);
        }
      }

      // 4. AI: Generate comment + DM for target
      const aiTarget = await generateCommentAndDMForProfile(targetProfileForAi);
      const targetPostUrl = getMediaUrl(targetMedia);

      // 5. Like + comment + DM to target
      if (targetPostUrl && aiTarget.comment) {
        const likeRes = await privateApiLikePost(userId, targetPostUrl);
        push(likeRes.success ? `Like en post de @${targetUsername}` : `Like falló: ${likeRes.error}`);
        await delay(3000);
        const commentRes = await privateApiCommentOnPost(userId, targetPostUrl, aiTarget.comment);
        push(commentRes.success ? `Comentario en post de @${targetUsername}` : `Comentario falló: ${commentRes.error}`);
        await delay(3000);
      }

      const dmTarget = await privateApiSendDM(userId, targetUsername, aiTarget.dm || 'Hola! Me encantó tu perfil');
      push(dmTarget.success ? `DM enviado a @${targetUsername}` : `DM a @${targetUsername} falló: ${dmTarget.error}`);

      // 6. Get followers and process them
      let sentCount = 0;
      let offset = 0;
      const tried = new Set();
      const results = [];

      push(`Procesando ${limit} seguidores de @${targetUsername}...`);

      while (sentCount < limit) {
        const followersRes = await privateApiGetFollowersFromApi(userId, targetUsername, 15, offset);
        if (!followersRes.success || !followersRes.usernames?.length) {
          push('No hay más seguidores disponibles');
          break;
        }
        const batch = followersRes.usernames.filter(u => !tried.has(u));
        if (!batch.length) break;
        offset += followersRes.usernames.length;

        // Enrich with Bright Data
        let profiles;
        try {
          const urls = batch.map(u => `https://www.instagram.com/${u}/`);
          const raw = await scrapeProfiles(urls);
          profiles = (Array.isArray(raw) ? raw : [raw]).filter(p => p && (p.username || p.account) && !p.error);
        } catch (e) {
          profiles = batch.map(u => ({ username: u }));
        }

        for (const p of profiles) {
          if (sentCount >= limit) break;
          const uname = p.username || p.account;
          if (tried.has(uname)) continue;
          tried.add(uname);

          // Get media (BD or session)
          let lastMedia = getFirstMedia(p);
          let profileForAi = p;
          if (!lastMedia) {
            const sessionMedia = await privateApiGetFirstMediaFromUser(userId, uname);
            if (sessionMedia) {
              lastMedia = sessionMedia;
              profileForAi = { ...p, posts: [{ caption: sessionMedia.caption, url: sessionMedia.url, likes: sessionMedia.likes }] };
            }
          }

          const ai = await generateCommentAndDMForProfile(profileForAi);
          const postUrl = getMediaUrl(lastMedia);

          // Like + Comment
          if (postUrl && ai.comment) {
            const lr = await privateApiLikePost(userId, postUrl);
            if (lr.success) push(`Like en post de @${uname}`);
            await delay(4000);
            const cr = await privateApiCommentOnPost(userId, postUrl, ai.comment);
            if (cr.success) push(`Comentario en post de @${uname}`);
            await delay(4000);
          }

          // DM
          const dm = await privateApiSendDM(userId, uname, ai.dm || 'Hola! Me encantó tu perfil');
          if (dm.success) {
            sentCount++;
            results.push({ username: uname, postUrl: postUrl || null, liked: !!postUrl, commented: !!postUrl });
            push(`[${sentCount}/${limit}] DM enviado a @${uname}`);
          } else {
            const is403 = (dm.error || '').includes('403');
            push(`@${uname} - ${is403 ? '403, buscando otro' : dm.error}`);
          }
          await delay(12000);
        }
      }

      push(`Campaña finalizada: ${sentCount}/${limit} DMs enviados`);
      activeCampaigns.set(userId, { ...activeCampaigns.get(userId), completedAt: new Date(), results, log, sent: sentCount });
    } catch (err) {
      push(`ERROR: ${err.message}`);
    }
  })();
});

/**
 * GET /prospector/status — Estado de la campaña activa
 */
router.get('/prospector/status', validateJwt, (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const campaign = activeCampaigns.get(userId);
  if (!campaign) return res.json({ success: true, active: false });
  res.json({
    success: true,
    active: !campaign.completedAt,
    campaignId: campaign.id,
    target: campaign.target,
    startedAt: campaign.startedAt,
    completedAt: campaign.completedAt || null,
    sent: campaign.sent || 0,
    results: campaign.results || [],
    log: campaign.log || [],
  });
});

/**
 * POST /prospector/stop — Detener campaña
 */
router.post('/prospector/stop', validateJwt, (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (activeCampaigns.has(userId)) {
    activeCampaigns.delete(userId);
    return res.json({ success: true, message: 'Campaña detenida' });
  }
  res.json({ success: false, message: 'No hay campaña activa' });
});

/**
 * POST /bulk-send-followers — Enviar DMs personalizados con IA a seguidores de un target
 * Body: { target_username, message, limit?, delay? }
 */
router.post('/bulk-send-followers', validateJwt, async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { target_username, message, limit = 50 } = req.body;
  if (!target_username || !message) {
    return res.status(400).json({ error: 'target_username y message son requeridos' });
  }

  try {
    const followersRes = await privateApiGetFollowersFromApi(userId, target_username, Math.min(limit, 200), 0);
    if (!followersRes.success || !followersRes.usernames?.length) {
      return res.json({ success: false, error: 'No se pudieron obtener seguidores', sent_count: 0 });
    }

    const recipients = followersRes.usernames.map(u => ({ username: u, message }));
    const result = await privateApiBulkSend(userId, recipients);

    res.json({
      success: true,
      sent_count: result.sent,
      failed_count: result.failed,
      total_followers: followersRes.usernames.length,
      results: result.results,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /agent/interact — Alias para prospector/run (compatibilidad con frontend)
 */
router.post('/agent/interact', validateJwt, async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { targetUsername, limit = 10 } = req.body;
  if (!targetUsername) return res.status(400).json({ error: 'targetUsername es requerido' });

  if (activeCampaigns.has(userId)) {
    return res.status(409).json({ error: 'Ya hay una campaña activa' });
  }

  const campaignId = `agent-${Date.now()}`;
  activeCampaigns.set(userId, { id: campaignId, target: targetUsername, startedAt: new Date(), log: [] });

  res.json({ success: true, campaignId, message: `Campaña IA iniciada para @${targetUsername}` });

  // Delegate to the same prospector logic
  (async () => {
    const push = (msg) => {
      const c = activeCampaigns.get(userId);
      if (c) c.log.push(msg);
      console.log(`[AGENT] ${msg}`);
    };

    try {
      push(`Analizando @${targetUsername}...`);
      let targetProfile = await scrapeProfileByUsername(targetUsername);
      if (!targetProfile || targetProfile.error) {
        push('ERROR: No se pudo obtener perfil');
        activeCampaigns.delete(userId);
        return;
      }
      push(`Perfil OK: ${targetProfile.followers} seguidores`);

      const status = await privateApiGetStatus(userId);
      if (!status?.logged) {
        push('ERROR: Sesión IG no activa. Inicia sesión primero.');
        activeCampaigns.delete(userId);
        return;
      }

      let targetProfileForAi = targetProfile;
      let targetMedia = getFirstMedia(targetProfile);
      if (!targetMedia) {
        const sm = await privateApiGetFirstMediaFromUser(userId, targetUsername);
        if (sm) {
          targetMedia = sm;
          targetProfileForAi = { ...targetProfile, posts: [{ caption: sm.caption, url: sm.url }] };
        }
      }

      const aiT = await generateCommentAndDMForProfile(targetProfileForAi);
      const tUrl = getMediaUrl(targetMedia);

      if (tUrl && aiT.comment) {
        await privateApiLikePost(userId, tUrl);
        push(`Like en @${targetUsername}`);
        await delay(3000);
        await privateApiCommentOnPost(userId, tUrl, aiT.comment);
        push(`Comentario en @${targetUsername}`);
        await delay(3000);
      }
      await privateApiSendDM(userId, targetUsername, aiT.dm || 'Hola!');
      push(`DM a @${targetUsername}`);

      let sentCount = 0;
      let offset = 0;
      const tried = new Set();
      const results = [];
      const maxTarget = Math.min(limit, 20);

      while (sentCount < maxTarget) {
        const fr = await privateApiGetFollowersFromApi(userId, targetUsername, 15, offset);
        if (!fr.success || !fr.usernames?.length) break;
        const batch = fr.usernames.filter(u => !tried.has(u));
        if (!batch.length) break;
        offset += fr.usernames.length;

        let profiles;
        try {
          const urls = batch.map(u => `https://www.instagram.com/${u}/`);
          const raw = await scrapeProfiles(urls);
          profiles = (Array.isArray(raw) ? raw : [raw]).filter(p => p && !p.error);
        } catch { profiles = batch.map(u => ({ username: u })); }

        for (const p of profiles) {
          if (sentCount >= maxTarget) break;
          const uname = p.username || p.account;
          if (tried.has(uname)) continue;
          tried.add(uname);

          let lastMedia = getFirstMedia(p);
          let pForAi = p;
          if (!lastMedia) {
            const sm = await privateApiGetFirstMediaFromUser(userId, uname);
            if (sm) { lastMedia = sm; pForAi = { ...p, posts: [{ caption: sm.caption, url: sm.url }] }; }
          }

          const ai = await generateCommentAndDMForProfile(pForAi);
          const postUrl = getMediaUrl(lastMedia);

          if (postUrl && ai.comment) {
            await privateApiLikePost(userId, postUrl);
            await delay(4000);
            await privateApiCommentOnPost(userId, postUrl, ai.comment);
            await delay(4000);
          }

          const dm = await privateApiSendDM(userId, uname, ai.dm || 'Hola!');
          if (dm.success) {
            sentCount++;
            results.push({ username: uname, postUrl });
            push(`[${sentCount}/${maxTarget}] DM a @${uname}`);
          } else {
            push(`@${uname} falló: ${dm.error}`);
          }
          await delay(12000);
        }
      }

      push(`Finalizado: ${sentCount}/${maxTarget} DMs`);
      const c = activeCampaigns.get(userId);
      if (c) { c.completedAt = new Date(); c.results = results; c.sent = sentCount; }
    } catch (err) {
      push(`ERROR: ${err.message}`);
    }
  })();
});

router.get('/agent/status', validateJwt, (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const campaign = activeCampaigns.get(userId);
  if (!campaign) return res.json({ success: true, active: false });
  res.json({
    success: true,
    active: !campaign.completedAt,
    campaignId: campaign.id,
    target: campaign.target,
    sent: campaign.sent || 0,
    log: campaign.log || [],
    results: campaign.results || [],
    completedAt: campaign.completedAt || null,
  });
});

// ═══════════════════════════════════════════════════════════
// OMNI-RESPONDER (Inbound Bot 24/7)
// ═══════════════════════════════════════════════════════════

import { spawn } from 'child_process';
import path from 'path';

let activeOmniProcess = null;

router.post('/agent/omni/start', validateJwt, (req, res) => {
  if (activeOmniProcess) {
    return res.status(400).json({ error: 'El Auto-Respondedor OmniCanal ya está activo.' });
  }

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const scriptPath = path.resolve(process.cwd(), 'scripts', '5-omni-responder.js');
  activeOmniProcess = spawn('node', [scriptPath, userId]);

  activeOmniProcess.stdout.on('data', (d) => console.log(`[OMNI] ${d}`));
  activeOmniProcess.stderr.on('data', (d) => console.error(`[OMNI ERR] ${d}`));
  activeOmniProcess.on('close', () => { activeOmniProcess = null; });

  res.json({ success: true, message: 'Omni-Responder activado 24/7.' });
});

router.post('/agent/omni/stop', validateJwt, (req, res) => {
  if (activeOmniProcess) {
    activeOmniProcess.kill();
    activeOmniProcess = null;
    return res.json({ success: true, message: 'Omni-Responder detenido.' });
  }
  res.json({ success: false, message: 'El Omni-Responder no estaba activo.' });
});

// ═══════════════════════════════════════════════════════════
// AUTO-REPLY: Respuesta automática a DMs con IA
// ═══════════════════════════════════════════════════════════

/**
 * POST /auto-reply/start — Iniciar auto-respuesta a DMs
 */
router.post('/auto-reply/start', validateJwt, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Verificar que haya sesión IG activa
    const status = await privateApiGetStatus(userId);
    if (!status?.logged) {
      return res.status(400).json({
        success: false,
        error: 'Debes iniciar sesión en Instagram primero'
      });
    }

    const io = req.app.get('io');
    const result = startAutoReply(userId, io);
    res.json(result);
  } catch (error) {
    console.error('[IG-PRIVATE] auto-reply/start error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /auto-reply/stop — Detener auto-respuesta
 */
router.post('/auto-reply/stop', validateJwt, (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = stopAutoReply(userId);
    res.json(result);
  } catch (error) {
    console.error('[IG-PRIVATE] auto-reply/stop error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /auto-reply/status — Estado del auto-reply
 */
router.get('/auto-reply/status', validateJwt, (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const status = getAutoReplyStatus(userId);
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('[IG-PRIVATE] auto-reply/status error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
