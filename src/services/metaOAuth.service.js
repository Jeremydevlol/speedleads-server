/**
 * Meta OAuth: state HMAC, intercambio de code por token, long-lived, descubrimiento de IG Business.
 * State: base64(payload) + "." + hex(hmac); payload = { tenantId, ts } (ts en segundos).
 */
import crypto from 'crypto';

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || '';
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v19.0';
const META_OAUTH_SCOPES = process.env.META_OAUTH_SCOPES || 'pages_show_list,instagram_basic';
const BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

const STATE_SECRET = process.env.META_STATE_SECRET || process.env.META_APP_SECRET || 'dev-secret';
const STATE_TTL_SECONDS = 10 * 60; // 10 minutos

export function generateState(tenantId) {
  const payload = {
    tenantId,
    ts: Math.floor(Date.now() / 1000),
  };
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(json).digest('hex');
  return Buffer.from(json).toString('base64') + '.' + sig;
}

export function verifyState(state) {
  if (!state || typeof state !== 'string' || !STATE_SECRET) return null;
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  try {
    const payloadStr = Buffer.from(parts[0], 'base64').toString('utf8');
    const payload = JSON.parse(payloadStr);
    const expected = crypto.createHmac('sha256', STATE_SECRET).update(payloadStr).digest('hex');
    if (parts[1] !== expected) return null;
    const ts = payload.ts || 0;
    if (Date.now() / 1000 - ts > STATE_TTL_SECONDS) return null;
    const tenantId = payload.tenantId ?? payload.tenant_id;
    return tenantId ? { tenant_id: tenantId } : null;
  } catch {
    return null;
  }
}

export async function exchangeCodeForToken(code) {
  const url = `${BASE}/oauth/access_token?client_id=${encodeURIComponent(META_APP_ID)}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&client_secret=${encodeURIComponent(META_APP_SECRET)}&code=${encodeURIComponent(code)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    const msg = data.error.message || data.error.error_user_msg || 'Token exchange failed';
    console.error('[metaOAuth] exchangeCodeForToken:', msg);
    throw new Error(msg);
  }
  return data.access_token;
}

export async function getLongLivedUserToken(shortLivedToken) {
  const url = `${BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(META_APP_ID)}&client_secret=${encodeURIComponent(META_APP_SECRET)}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    const msg = data.error.message || data.error.error_user_msg || 'Long-lived exchange failed';
    console.error('[metaOAuth] getLongLivedUserToken:', msg);
    return shortLivedToken;
  }
  return data.access_token || shortLivedToken;
}

export async function getIgBusinessIdAndPageToken(userAccessToken) {
  const url = `${BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id}&access_token=${encodeURIComponent(userAccessToken)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    const msg = data.error.message || data.error.error_user_msg || 'Failed to get pages';
    console.error('[metaOAuth] me/accounts:', msg);
    throw new Error(msg);
  }
  const pages = data.data;
  if (!Array.isArray(pages) || pages.length === 0) return null;
  for (const page of pages) {
    const ig = page.instagram_business_account;
    if (ig && ig.id) {
      return {
        ig_business_id: String(ig.id),
        page_access_token: page.access_token || userAccessToken
      };
    }
  }
  return null;
}

export function getOAuthStartUrl(state) {
  if (!META_APP_ID || !META_REDIRECT_URI) {
    throw new Error('META_APP_ID o META_REDIRECT_URI faltan en .env');
  }
  const scope = encodeURIComponent(META_OAUTH_SCOPES);
  const redirect = encodeURIComponent(META_REDIRECT_URI);
  const st = encodeURIComponent(state);
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${redirect}&scope=${scope}&state=${st}`;
}
