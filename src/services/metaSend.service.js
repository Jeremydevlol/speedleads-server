/**
 * Envío de mensajes a Instagram via Meta Graph API.
 * Perfil de usuario vía Instagram User Profile API (graph.instagram.com).
 */
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const INSTAGRAM_GRAPH_URL = `https://graph.instagram.com/${META_GRAPH_VERSION}`;

export async function sendInstagramMessage(accessToken, recipientId, text) {
  if (!accessToken || !recipientId || text == null) {
    return { success: false, error: 'Missing accessToken, recipientId or text' };
  }
  const url = `${BASE_URL}/me/messages`;
  const body = {
    recipient: { id: String(recipientId) },
    message: { text: String(text) },
    messaging_type: 'RESPONSE'
  };
  try {
    const res = await fetch(`${url}?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[metaSend] Graph API error:', res.status, data);
      return {
        success: false,
        error: data.error?.message || res.statusText,
        errorPayload: data.error ? { ...data.error } : undefined
      };
    }
    if (data.error) {
      console.error('[metaSend] Graph API error payload:', data.error);
      return {
        success: false,
        error: data.error.message,
        errorPayload: { ...data.error }
      };
    }
    return { success: true };
  } catch (err) {
    console.error('[metaSend] send error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Obtiene nombre e imagen del usuario de Instagram (para mostrar en el frontend).
 * Requiere instagram_business_manage_messages + instagram_business_basic.
 * Prueba graph.instagram.com y, si falla, graph.facebook.com (Page token a veces solo funciona con este).
 */
export async function getInstagramUserProfile(accessToken, senderId) {
  if (!accessToken || !senderId) return null;
  const fields = 'name,username,profile_pic';
  const qs = `fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;
  const urls = [
    `${INSTAGRAM_GRAPH_URL}/${String(senderId)}?${qs}`,
    `${BASE_URL}/${String(senderId)}?${qs}`
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error?.code !== 190) {
          console.warn('[metaSend] profile API', res.status, url.includes('instagram.com') ? 'graph.instagram.com' : 'graph.facebook.com', data.error?.message || data.error?.code);
        }
        continue;
      }
      if (data.error) continue;
      const out = {
        name: data.name ?? null,
        username: data.username ?? null,
        profile_pic: data.profile_pic ?? null
      };
      if (process.env.NODE_ENV !== 'production') {
        console.log('[metaSend] profile ok for', senderId, 'pic:', !!out.profile_pic, 'name:', out.name || out.username);
      }
      return out;
    } catch (err) {
      console.warn('[metaSend] getInstagramUserProfile try failed:', err.message);
    }
  }
  return null;
}
