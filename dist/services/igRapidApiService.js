import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = process.env.RAPIDAPI_IG_HOST || 'instagram-scraper-api2.p.rapidapi.com';

function _headers() {
  return {
    'x-rapidapi-key': RAPIDAPI_KEY,
    'x-rapidapi-host': RAPIDAPI_HOST,
  };
}

function _mapFollower(item) {
  return {
    pk: String(item.id || item.pk || ''),
    username: item.username || '',
    full_name: item.full_name || '',
    is_private: !!item.is_private,
    is_verified: !!item.is_verified,
    profile_pic_url: item.profile_pic_url || item.profile_pic_url_hd || null,
  };
}

export async function fetchFollowersViaRapidApi(username, limit = 50) {
  if (!RAPIDAPI_KEY) {
    return { success: false, followers: [], error: 'RAPIDAPI_KEY no configurada. Añádela en .env' };
  }

  const cleanUsername = username.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');
  const allFollowers = [];
  let nextCursor = null;
  let pages = 0;
  const maxPages = Math.ceil(limit / 50);

  try {
    while (allFollowers.length < limit && pages < maxPages) {
      pages++;
      const params = { username_or_id_or_url: cleanUsername };
      if (nextCursor) params.pagination_token = nextCursor;

      const resp = await axios.get(`https://${RAPIDAPI_HOST}/v1/followers`, {
        headers: _headers(),
        params,
        timeout: 60000,
      });

      const body = resp.data;
      const items = body?.data?.items || body?.items || body?.data?.users || body?.users || [];

      if (items.length === 0) break;

      allFollowers.push(...items.map(_mapFollower));

      nextCursor = body?.data?.next_max_id || body?.next_max_id || body?.pagination_token || null;
      if (!nextCursor) break;

      if (allFollowers.length < limit) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const result = allFollowers.slice(0, limit);
    console.log(`[RapidAPI-IG] Fetched ${result.length} followers for @${cleanUsername} (${pages} pages)`);
    return { success: true, followers: result, total: result.length };
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    const status = err.response?.status;
    console.error(`[RapidAPI-IG] Error fetching followers for @${cleanUsername}: ${status} ${msg}`);

    if (status === 403 || status === 401) {
      return { success: false, followers: [], error: 'API key inválida o sin suscripción activa en RapidAPI' };
    }
    if (status === 429) {
      return { success: false, followers: [], error: 'Límite de requests alcanzado en RapidAPI. Espera o sube tu plan.' };
    }
    return { success: false, followers: [], error: `Error de RapidAPI: ${msg}` };
  }
}

export async function fetchUserInfoViaRapidApi(username) {
  if (!RAPIDAPI_KEY) {
    return { success: false, error: 'RAPIDAPI_KEY no configurada' };
  }

  const cleanUsername = username.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');

  try {
    const resp = await axios.get(`https://${RAPIDAPI_HOST}/v1/info`, {
      headers: _headers(),
      params: { username_or_id_or_url: cleanUsername },
      timeout: 30000,
    });

    const d = resp.data?.data || resp.data;
    return {
      success: true,
      user: {
        pk: String(d.id || d.pk || ''),
        username: d.username || cleanUsername,
        full_name: d.full_name || '',
        biography: d.biography || d.bio || '',
        follower_count: d.follower_count || d.followers_count || 0,
        following_count: d.following_count || 0,
        media_count: d.media_count || 0,
        is_private: !!d.is_private,
        is_verified: !!d.is_verified,
        profile_pic_url: d.profile_pic_url_hd || d.profile_pic_url || '',
      },
    };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error(`[RapidAPI-IG] Error fetching user info for @${cleanUsername}: ${msg}`);
    return { success: false, error: msg };
  }
}

export function isRapidApiConfigured() {
  return !!RAPIDAPI_KEY;
}
