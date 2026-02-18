/**
 * Onboarding Meta/Instagram: POST start-link (devuelve URL), GET callback (intercambio + guardar en Supabase).
 * Redirect del callback va a FRONTEND_URL/chats?channel=instagram&connected=1|error=...
 */
import express from 'express';
import { validateJwt } from '../config/jwt.js';
import {
  generateState,
  verifyState,
  exchangeCodeForToken,
  getLongLivedUserToken,
  getIgBusinessIdAndPageToken,
  getOAuthStartUrl
} from '../services/metaOAuth.service.js';
import { upsertConnection } from '../db/metaConnectionsRepo.js';

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function chatsRedirect(params) {
  const q = new URLSearchParams(params);
  return `${FRONTEND_URL}/chats?${q.toString()}`;
}

/** POST /auth/meta/start-link — JWT required. Returns { url }; does NOT redirect. */
router.post('/start-link', validateJwt, (req, res) => {
  const tenantId = req.user?.userId || req.user?.sub;
  if (!tenantId) {
    return res.status(401).json({
      error: 'no_user',
      message: 'No se pudo identificar el usuario desde el JWT',
    });
  }
  try {
    const state = generateState(tenantId);
    const url = getOAuthStartUrl(state);
    return res.status(200).json({ url });
  } catch (e) {
    console.error('[metaAuth] start-link error:', e.message);
    const isMissingConfig = /META_APP_ID|META_REDIRECT_URI|faltan/i.test(e.message);
    return res.status(isMissingConfig ? 503 : 500).json({
      error: 'config',
      message: isMissingConfig ? 'OAuth no configurado: revisa META_APP_ID y META_REDIRECT_URI en el servidor' : 'OAuth config error',
    });
  }
});

// Códigos de error de Meta conocidos → clave amigable para el frontend
const META_ERROR_MAP = {
  1349220: 'meta_login_unavailable', // "Función no disponible" / Facebook actualizando la app
  190: 'token_expired',
  102: 'session_invalid',
};

/** GET /auth/meta/callback — Meta OAuth callback. Validates state, exchanges code, saves connection, redirects to frontend. */
router.get('/callback', async (req, res) => {
  const { code, state, error: fbError, error_code: errorCode, error_message: errorMessage } = req.query;
  const redirectFail = (errorKey, logMsg) => {
    console.error('[metaAuth] callback fail:', logMsg || errorKey);
    const params = { channel: 'instagram', error: errorKey };
    return res.redirect(chatsRedirect(params));
  };
  if (fbError) return redirectFail(fbError === 'access_denied' ? 'access_denied' : fbError, fbError);
  if (errorCode || errorMessage) {
    const friendlyKey = (errorCode && META_ERROR_MAP[Number(errorCode)]) || (errorCode ? `fb_error_${errorCode}` : 'fb_error');
    const rawMsg = (errorMessage && decodeURIComponent(String(errorMessage))) || '';
    const logMsg = (friendlyKey !== 'fb_error' && errorCode)
      ? `${friendlyKey} (Meta ${errorCode})`
      : (rawMsg.length > 100 ? `fb_error_${errorCode || 'unknown'}` : rawMsg || friendlyKey);
    return redirectFail(friendlyKey, logMsg);
  }
  if (!code || !state) return redirectFail('missing_code_or_state', 'missing_code_or_state');

  const parsed = verifyState(state);
  if (!parsed?.tenant_id) return redirectFail('invalid_state', 'invalid_state');
  const tenantId = parsed.tenant_id;

  let accessToken;
  try {
    accessToken = await exchangeCodeForToken(code);
    if (!accessToken) return redirectFail('token_exchange_failed', 'token_exchange_failed');
  } catch (e) {
    console.error('[metaAuth] token exchange:', e.message);
    return redirectFail('token_exchange_failed', 'token_exchange_failed');
  }

  try {
    const longLived = await getLongLivedUserToken(accessToken);
    const igData = await getIgBusinessIdAndPageToken(longLived);
    if (!igData) return redirectFail('no_instagram_business', 'no_instagram_business');
    await upsertConnection({
      tenant_id: tenantId,
      ig_business_id: igData.ig_business_id,
      access_token: igData.page_access_token,
      status: 'active',
      auto_reply_enabled: false
    });
    return res.redirect(chatsRedirect({ channel: 'instagram', connected: '1' }));
  } catch (e) {
    console.error('[metaAuth] callback save:', e.message);
    return redirectFail('save_failed', 'save_failed');
  }
});

export default router;
