/**
 * Estado y configuración de la conexión Meta (JWT).
 * Incluye listado de conversaciones y mensajes para el canal Instagram.
 */
import express from 'express';
import { validateJwt } from '../config/jwt.js';
import { getConnectionByTenantId, updateAutoReply } from '../db/metaConnectionsRepo.js';
import { getConversationsByTenantId, getRecentMessages } from '../db/metaRepo.js';
import { getInstagramUserProfile } from '../services/metaSend.service.js';

const router = express.Router();

router.get('/connection', validateJwt, async (req, res) => {
  const tenantId = req.user?.userId || req.user?.sub;
  if (!tenantId) return res.status(401).json({ error: 'User not found in token' });
  try {
    const conn = await getConnectionByTenantId(tenantId);
    if (!conn) return res.json({ connected: false });
    return res.json({
      connected: true,
      ig_business_id: conn.ig_business_id,
      auto_reply_enabled: conn.auto_reply_enabled === true,
      status: conn.status ?? conn.estado ?? 'active'
    });
  } catch (e) {
    console.error('[metaConnection] GET /connection error:', e.message);
    return res.status(500).json({ error: 'Failed to get connection' });
  }
});

router.post('/connection/auto-reply', validateJwt, async (req, res) => {
  const tenantId = req.user?.userId || req.user?.sub;
  if (!tenantId) return res.status(401).json({ error: 'User not found in token' });
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Body must include { enabled: boolean }' });
  }
  try {
    const updated = await updateAutoReply(tenantId, enabled);
    return res.json({
      connected: true,
      ig_business_id: updated.ig_business_id,
      auto_reply_enabled: updated.auto_reply_enabled,
      status: updated.status ?? updated.estado ?? 'active'
    });
  } catch (e) {
    if (e.message?.includes('No meta connection')) {
      return res.status(404).json({ error: 'No Meta connection for this user' });
    }
    console.error('[metaConnection] POST auto-reply error:', e.message);
    return res.status(500).json({ error: 'Failed to update auto-reply' });
  }
});

/** GET /api/meta/conversations — Lista conversaciones Instagram del tenant (incluye nombre e imagen real del contacto si la API lo permite). */
router.get('/conversations', validateJwt, async (req, res) => {
  const tenantId = req.user?.userId || req.user?.sub;
  if (!tenantId) return res.status(401).json({ error: 'User not found in token' });
  try {
    const conn = await getConnectionByTenantId(tenantId);
    const conversations = await getConversationsByTenantId(tenantId);
    const maxEnrich = 25;
    const toEnrich = conversations.slice(0, maxEnrich);
    const withProfile = conn?.access_token
      ? await Promise.all(
          toEnrich.map(async (c) => {
            const profile = await getInstagramUserProfile(conn.access_token, c.sender_id);
            return {
              ...c,
              sender_name: profile?.name ?? null,
              sender_username: profile?.username ?? null,
              sender_profile_pic: profile?.profile_pic ?? null
            };
          })
        )
      : toEnrich.map((c) => ({ ...c, sender_name: null, sender_username: null, sender_profile_pic: null }));
    const rest = conversations.slice(maxEnrich).map((c) => ({ ...c, sender_name: null, sender_username: null, sender_profile_pic: null }));
    const out = [...withProfile, ...rest];
    const withPic = out.filter((c) => c.sender_profile_pic).length;
    if (out.length && (withPic === 0 || process.env.NODE_ENV !== 'production')) {
      console.log('[metaConnection] GET /conversations:', out.length, 'conversations,', withPic, 'with profile_pic, token:', !!conn?.access_token);
    }
    return res.json({ conversations: out });
  } catch (e) {
    console.error('[metaConnection] GET /conversations error:', e.message);
    return res.status(500).json({ error: 'Failed to get conversations' });
  }
});

/** GET /api/meta/conversations/:senderId/profile — Nombre e imagen real del contacto (para el frontend). */
router.get('/conversations/:senderId/profile', validateJwt, async (req, res) => {
  const tenantId = req.user?.userId || req.user?.sub;
  const { senderId } = req.params;
  if (!tenantId) return res.status(401).json({ error: 'User not found in token' });
  if (!senderId) return res.status(400).json({ error: 'senderId required' });
  try {
    const conn = await getConnectionByTenantId(tenantId);
    if (!conn?.access_token) return res.status(404).json({ error: 'No Meta connection' });
    const profile = await getInstagramUserProfile(conn.access_token, senderId);
    if (!profile) return res.json({ name: null, username: null, profile_pic: null });
    return res.json(profile);
  } catch (e) {
    console.error('[metaConnection] GET profile error:', e.message);
    return res.status(500).json({ error: 'Failed to get profile' });
  }
});

/** GET /api/meta/conversations/:senderId/messages — Mensajes de una conversación (senderId = Instagram user ID). */
router.get('/conversations/:senderId/messages', validateJwt, async (req, res) => {
  const tenantId = req.user?.userId || req.user?.sub;
  const { senderId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  if (!tenantId) return res.status(401).json({ error: 'User not found in token' });
  if (!senderId) return res.status(400).json({ error: 'senderId required' });
  try {
    const conn = await getConnectionByTenantId(tenantId);
    if (!conn) return res.status(404).json({ error: 'No Meta connection' });
    const messages = await getRecentMessages({
      tenant_id: tenantId,
      ig_business_id: conn.ig_business_id,
      sender_id: senderId,
      limit
    });
    return res.json({ messages });
  } catch (e) {
    console.error('[metaConnection] GET messages error:', e.message);
    return res.status(500).json({ error: 'Failed to get messages' });
  }
});

export default router;
