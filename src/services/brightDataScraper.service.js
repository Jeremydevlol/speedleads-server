/**
 * Bright Data Scraper Service — Extracción de datos sin sesión IG.
 *
 * Usa IPs residenciales de Bright Data. NO requiere login ni sesión de Instagram.
 * La sesión Private API solo se usa para: enviar DMs, comentar, dar likes, responder.
 *
 * Datasets: Profiles, Posts, Reels, Comments
 */

import axios from 'axios';

const BD_TOKEN = process.env.BD_SCRAPER_TOKEN || '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const DATASETS = {
  profiles: process.env.BD_DATASET_PROFILES || 'gd_l1vikfch901nx3by4',
  posts: process.env.BD_DATASET_POSTS || 'gd_lk5ns7kz21pck8jpis',
  reels: process.env.BD_DATASET_REELS || 'gd_lyclm20il4r5helnj',
  comments: process.env.BD_DATASET_COMMENTS || 'gd_ltppn085pokosxh13',
  followers: process.env.BD_DATASET_FOLLOWERS || '', // Opcional: crea scraper en Bright Data CP
};

const BASE_URL = 'https://api.brightdata.com/datasets/v3/scrape';
const TIMEOUT = 120000;

function buildPayload(urls) {
  const arr = Array.isArray(urls) ? urls : [urls];
  return arr.map((u) => (typeof u === 'string' ? { url: u } : u));
}

function parseResponse(data) {
  if (typeof data === 'string') {
    return data
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  return Array.isArray(data) ? data : [data];
}

async function callScraper(datasetId, payload) {
  const url = `${BASE_URL}?dataset_id=${datasetId}&notify=false&include_errors=true`;
  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${BD_TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout: TIMEOUT,
  });
  return parseResponse(response.data);
}

/**
 * Scrapear perfiles de Instagram.
 * @param {string[]} urls - Ej: ['https://www.instagram.com/username/', ...]
 */
export async function scrapeProfiles(urls) {
  const payload = buildPayload(urls);
  return callScraper(DATASETS.profiles, payload);
}

/**
 * Scrapear posts de Instagram.
 * @param {string[]} urls - Ej: ['https://www.instagram.com/p/xxx/', ...]
 */
export async function scrapePosts(urls) {
  const payload = buildPayload(urls);
  return callScraper(DATASETS.posts, payload);
}

/**
 * Scrapear reels de Instagram.
 * @param {string[]} urls - Ej: ['https://www.instagram.com/reel/xxx/', ...]
 */
export async function scrapeReels(urls) {
  const payload = buildPayload(urls);
  return callScraper(DATASETS.reels, payload);
}

/**
 * Scrapear comentarios de posts/reels.
 * @param {string[]} urls - Ej: ['https://www.instagram.com/.../p/xxx/', 'https://.../reel/xxx/']
 */
export async function scrapeComments(urls) {
  const payload = buildPayload(urls);
  return callScraper(DATASETS.comments, payload);
}

/**
 * Obtener perfil + posts recientes de un usuario.
 * @param {string} username - Username sin @
 */
export async function scrapeProfileByUsername(username) {
  const url = `https://www.instagram.com/${username}/`;
  const results = await scrapeProfiles([url]);
  return results[0] || null;
}

/**
 * Obtener perfil + posts de varios usuarios.
 */
export async function scrapeProfilesByUsernames(usernames) {
  const urls = usernames.map((u) => `https://www.instagram.com/${u}/`);
  return scrapeProfiles(urls);
}

/**
 * Scrapear seguidores de un perfil (SIN login IG).
 * Requiere BD_DATASET_FOLLOWERS configurado (crea el scraper en Bright Data Control Panel).
 * @param {string} profileUrl - Ej: https://www.instagram.com/username/
 * @returns {Promise<Array>} Lista de followers con account, id, followers, etc.
 */
export async function scrapeFollowers(profileUrl) {
  if (!DATASETS.followers) {
    throw new Error('BD_DATASET_FOLLOWERS no configurado. Crea un Instagram Followers scraper en Bright Data y añade el dataset_id a .env');
  }
  const payload = buildPayload([{ url: profileUrl }]);
  return callScraper(DATASETS.followers, payload);
}

/**
 * Obtener comentarios de un post/reel.
 * Extrae comentarios y agrupa en formato plano.
 */
export async function scrapeCommentsFromUrls(urls) {
  const raw = await scrapeComments(urls);
  const allComments = [];
  for (const item of raw) {
    if (item?.comments && Array.isArray(item.comments)) {
      allComments.push(...item.comments);
    } else if (item?.comment_user || item?.comment_user_url || item?.owner_username || item?.text || item?.text_content) {
      allComments.push(item);
    }
  }
  return allComments.length ? allComments : raw;
}
