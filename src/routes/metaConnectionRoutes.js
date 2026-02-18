/**
 * Estado y configuración de la conexión Meta (JWT).
 * Incluye listado de conversaciones y mensajes para el canal Instagram.
 */
import express from 'express';
import { validateJwt } from '../config/jwt.js';
import { getConnectionByTenantId, updateAutoReply } from '../db/metaConnectionsRepo.js';
import { getConversationsByTenantId, getRecentMessages } from '../db/metaRepo.js';

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

/** GET /api/meta/conversations — Lista conversaciones Instagram del tenant (para que salgan los mensajes en la app). */
router.get('/conversations', validateJwt, async (req, res) => {
  const tenantId = req.user?.userId || req.user?.sub;
  if (!tenantId) return res.status(401).json({ error: 'User not found in token' });
  try {
    const conversations = await getConversationsByTenantId(tenantId);
    return res.json({ conversations });
  } catch (e) {
    console.error('[metaConnection] GET /conversations error:', e.message);
    return res.status(500).json({ error: 'Failed to get conversations' });
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
