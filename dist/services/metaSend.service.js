/**
 * Envío de mensajes a Instagram via Meta Graph API.
 * Perfil de usuario vía Instagram User Profile API (graph.instagram.com).
 */
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v24.0';
const BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const INSTAGRAM_GRAPH_URL = `https://graph.instagram.com/${META_GRAPH_VERSION}`;

const IG_MAX_CHARS = 1000;

function splitMessage(text, maxLen = IG_MAX_CHARS) {
  const str = String(text);
  if (str.length <= maxLen) return [str];

  const chunks = [];
  let remaining = str;

  while (remaining.length > maxLen) {
    let cut = -1;
    const slice = remaining.slice(0, maxLen);

    // Prioridad: doble salto de línea (párrafo)
    const paraIdx = slice.lastIndexOf('\n\n');
    if (paraIdx > maxLen * 0.3) { cut = paraIdx + 2; }

    // Salto de línea simple
    if (cut === -1) {
      const nlIdx = slice.lastIndexOf('\n');
      if (nlIdx > maxLen * 0.3) cut = nlIdx + 1;
    }

    // Punto seguido de espacio (fin de oración)
    if (cut === -1) {
      const dotIdx = slice.lastIndexOf('. ');
      if (dotIdx > maxLen * 0.3) cut = dotIdx + 2;
    }

    // Espacio cualquiera
    if (cut === -1) {
      const spIdx = slice.lastIndexOf(' ');
      if (spIdx > maxLen * 0.3) cut = spIdx + 1;
    }

    // Sin punto de corte natural: corte duro
    if (cut === -1) cut = maxLen;

    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

export async function sendInstagramMessage(accessToken, recipientId, text) {
  if (!accessToken || !recipientId || text == null) {
    return { success: false, error: 'Missing accessToken, recipientId or text' };
  }

  const chunks = splitMessage(text);
  const url = `${BASE_URL}/me/messages`;

  for (let i = 0; i < chunks.length; i++) {
    const body = {
      recipient: { id: String(recipientId) },
      message: { text: chunks[i] },
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

      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      console.error('[metaSend] send error:', err.message);
      return { success: false, error: err.message };
    }
  }

  if (chunks.length > 1) {
    console.log(`[metaSend] Mensaje dividido en ${chunks.length} partes para ${recipientId}`);
  }
  return { success: true };
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
