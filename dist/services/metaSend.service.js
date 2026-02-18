/**
 * Envío de mensajes a Instagram via Meta Graph API.
 */
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/**
 * Envía un mensaje de texto al usuario de Instagram.
 * @param {string} accessToken - Page/Instagram access token
 * @param {string} recipientId - sender.id (PSID del usuario)
 * @param {string} text - Texto a enviar
 * @returns {Promise<{ success: boolean, error?: string, errorPayload?: object }>}
 */
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
