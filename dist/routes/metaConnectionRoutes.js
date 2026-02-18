/**
 * Rutas de estado y configuración de la conexión Meta (JWT).
 */
import express from 'express';
import { validateJwt } from '../config/jwt.js';
import {
  getConnectionByTenantId,
  updateAutoReply
} from '../db/metaConnectionsRepo.js';

const router = express.Router();

/**
 * GET /api/meta/connection
 * Devuelve { connected, ig_business_id?, auto_reply_enabled?, status? } para el tenant del JWT.
 */
router.get('/connection', validateJwt, async (req, res) => {
  const tenantId = req.user?.userId || req.user?.sub;
  if (!tenantId) {
    return res.status(401).json({ error: 'User not found in token' });
  }
  try {
    const conn = await getConnectionByTenantId(tenantId);
    if (!conn) {
      return res.json({
        connected: false
      });
    }
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

/**
 * POST /api/meta/connection/auto-reply
 * Body: { enabled: boolean }. Actualiza auto_reply_enabled para el tenant.
 */
router.post('/connection/auto-reply', validateJwt, async (req, res) => {
  const tenantId = req.user?.userId || req.user?.sub;
  if (!tenantId) {
    return res.status(401).json({ error: 'User not found in token' });
  }
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
    if (e.message && e.message.includes('No meta connection')) {
      return res.status(404).json({ error: 'No Meta connection for this user' });
    }
    console.error('[metaConnection] POST auto-reply error:', e.message);
    return res.status(500).json({ error: 'Failed to update auto-reply' });
  }
});

export default router;
