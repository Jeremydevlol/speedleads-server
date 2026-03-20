/**
 * Instagram Leads Scraper — Bright Data + Private API (mínimo)
 *
 * EXTRACCIÓN: Bright Data (perfiles, posts, reels, comentarios) — sin sesión IG.
 * La sesión Private API solo se usa para obtener lista de seguidores (único dato
 * que Bright Data no provee). El enriquecimiento de perfiles es 100% Bright Data.
 */

import { IgApiClient } from 'instagram-private-api';
import { saveFollowers } from '../db/igScrapedFollowersRepo.js';
import {
  scrapeProfiles,
  scrapeProfileByUsername,
  scrapeCommentsFromUrls,
  scrapeFollowers,
} from './brightDataScraper.service.js';
import { privateApiGetStatus, privateApiGetFollowersFromApi } from './instagramPrivateApi.service.js';

function humanDelay(minMs, maxMs) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, Math.round(ms)));
}

/**
 * Extrae username de un comentario. Bright Data puede devolver comment_user censurado o vacío.
 * Usar comment_user_url para extraer el username real cuando exista.
 */
function extractUsernameFromComment(c) {
  const raw = c.comment_user || c.owner_username;
  // Si comment_user está censurado (contiene *) o vacío, usar comment_user_url
  const url = c.comment_user_url || c.user_url || c.owner_url;
  if (url && typeof url === 'string') {
    const match = url.match(/instagram\.com\/([^/?]+)/);
    if (match) return match[1].trim();
  }
  if (raw && typeof raw === 'string' && !raw.includes('*')) return raw.trim();
  return null;
}

/**
 * Extrae leads desde COMENTARISTAS de los posts de un target.
 * 100% Bright Data — sin sesión IG.
 */
export async function scrapeLeadsFromCommenters(userId, targetUsername, limit = 50) {
  try {
    console.log(`[IG-SCRAPER] Scrapeando perfil de @${targetUsername} con Bright Data...`);
    const profile = await scrapeProfileByUsername(targetUsername);
    if (!profile) {
      return {
        success: false,
        error: 'Perfil no encontrado',
        followers: [],
        total: 0,
        inserted: 0,
      };
    }

    // Soportar posts y reels (algunos perfiles solo tienen reels)
    const mediaItems = [
      ...(profile.posts || []),
      ...(profile.reels || []),
    ].filter(Boolean);

    if (mediaItems.length === 0) {
      return {
        success: false,
        error: 'No se encontraron posts ni reels en el perfil',
        followers: [],
        total: 0,
        inserted: 0,
      };
    }

    const postUrls = mediaItems
      .slice(0, 5)
      .map((p) => {
        if (p.url) return p.url;
        if (!p.shortcode) return null;
        const isReel = p.media_type === 2 || p.product_type === 'clips' || p.is_reel;
        return `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${p.shortcode}/`;
      })
      .filter(Boolean);

    if (postUrls.length === 0) return { success: false, error: 'No hay URLs de posts/reels', followers: [], total: 0, inserted: 0 };

    console.log(`[IG-SCRAPER] Extrayendo comentarios de ${postUrls.length} posts/reels...`);
    const comments = await scrapeCommentsFromUrls(postUrls);

    const usernames = [...new Set(comments.map(extractUsernameFromComment).filter(Boolean))];
    const toScrape = usernames.slice(0, limit);
    if (toScrape.length === 0) {
      return { success: false, error: 'No se encontraron comentaristas', followers: [], total: 0, inserted: 0 };
    }

    console.log(`[IG-SCRAPER] Enriqueciendo ${toScrape.length} perfiles con Bright Data...`);
    const profiles = await scrapeProfiles(toScrape.map((u) => `https://www.instagram.com/${u}/`));

    const followers = profiles
      .filter((p) => (p?.username || p?.account) && !p.error)
      .map((p) => ({
        pk: String(p.pk || p.id || ''),
        username: p.username || p.account,
        full_name: p.full_name || '',
        profile_pic_url: p.profile_pic_url || null,
      }));

    const { inserted } = await saveFollowers(userId, targetUsername, followers);
    console.log(`[IG-SCRAPER] ✅ ${followers.length} leads desde comentarios, ${inserted} en BD`);
    return { success: true, total: followers.length, inserted, followers };
  } catch (error) {
    console.error('[IG-SCRAPER] Error:', error.message);
    return { success: false, error: error.message, followers: [], total: 0, inserted: 0 };
  }
}

/**
 * Extrae seguidores vía Bright Data (SIN login IG).
 * Solo funciona si BD_DATASET_FOLLOWERS está configurado en .env.
 */
export async function scrapeFollowersFromBrightDataToDb(userId, targetUsername, limit = 100) {
  try {
    const profileUrl = `https://www.instagram.com/${targetUsername}/`;
    console.log(`[IG-SCRAPER] Extrayendo seguidores de @${targetUsername} vía Bright Data (sin login)...`);
    const raw = await scrapeFollowers(profileUrl);
    let items = Array.isArray(raw) ? raw : [raw];
    // Bright Data puede devolver array de objetos o array de arrays
    items = items.flatMap((x) => (Array.isArray(x) ? x : x?.followers ? x.followers : [x]));
    const followers = items
      .filter((f) => f?.account || f?.username)
      .slice(0, limit)
      .map((f) => ({
        pk: String(f.id || f.pk || ''),
        username: f.account || f.username,
        full_name: f.full_name || f.name || '',
        profile_pic_url: f.profile_pic_url || f.avatar || null,
      }));
    if (followers.length === 0) {
      return { success: true, total: 0, inserted: 0, followers: [], source: 'brightdata' };
    }
    const { inserted } = await saveFollowers(userId, targetUsername, followers);
    console.log(`[IG-SCRAPER] ✅ ${followers.length} seguidores vía Bright Data, ${inserted} en BD`);
    return { success: true, total: followers.length, inserted, followers, source: 'brightdata' };
  } catch (error) {
    console.error('[IG-SCRAPER] scrapeFollowersFromBrightData:', error.message);
    return { success: false, error: error.message, followers: [], total: 0, inserted: 0 };
  }
}

/**
 * Extrae seguidores usando la sesión IG activa del usuario (sin credenciales).
 * Requiere que el usuario haya hecho login en Instagram.
 */
export async function scrapeFollowersUsingSession(userId, targetUsername, limit = 100) {
  try {
    const status = await privateApiGetStatus(userId);
    if (!status?.logged) {
      return { success: false, error: 'Sesión de Instagram no activa. Inicia sesión primero.', followers: [], total: 0, inserted: 0 };
    }
    console.log(`[IG-SCRAPER] Obteniendo seguidores de @${targetUsername} con sesión activa (@${status.username})...`);
    const res = await privateApiGetFollowersFromApi(userId, targetUsername, limit, 0);
    if (!res.success || !res.usernames?.length) {
      return { success: true, total: 0, inserted: 0, followers: [], message: res.error || 'No se encontraron seguidores' };
    }
    const toEnrich = res.usernames.slice(0, limit);
    console.log(`[IG-SCRAPER] Enriqueciendo ${toEnrich.length} perfiles con Bright Data...`);
    const profiles = await scrapeProfiles(toEnrich.map((u) => `https://www.instagram.com/${u}/`));
    const followers = profiles
      .filter((p) => (p?.username || p?.account) && !p.error)
      .map((p) => ({
        pk: String(p.pk || p.id || ''),
        username: p.username || p.account,
        full_name: p.full_name || '',
        profile_pic_url: p.profile_pic_url || null,
      }));
    const { inserted } = await saveFollowers(userId, targetUsername, followers);
    console.log(`[IG-SCRAPER] ✅ ${followers.length} seguidores (sesión IG), ${inserted} en BD`);
    return { success: true, total: followers.length, inserted, followers };
  } catch (error) {
    console.error('[IG-SCRAPER] scrapeFollowersUsingSession:', error.message);
    return { success: false, error: error.message, followers: [], total: 0, inserted: 0 };
  }
}

/**
 * Extrae seguidores: Private API (solo usernames) + Bright Data (enriquecimiento).
 * Requiere login porque Bright Data no tiene scraper de followers (salvo que uses BD_DATASET_FOLLOWERS).
 */
export async function scrapeFollowersToDb(userId, targetUsername, scraperUsername, scraperPassword, limit = 100) {
  const proxyUrl = process.env.IG_PROXY_URL || '';
  if (!proxyUrl) {
    console.warn('[IG-SCRAPER] IG_PROXY_URL no configurado. Usa proxy Bright Data para login.');
  }

  const ig = new IgApiClient();
  try {
    ig.state.generateDevice(scraperUsername);
    if (proxyUrl) ig.state.proxyUrl = proxyUrl;

    console.log('[IG-SCRAPER] Login con proxy Bright Data...');
    try {
      await ig.simulate.preLoginFlow();
    } catch {}
    await ig.account.login(scraperUsername, scraperPassword);
    try {
      await ig.simulate.postLoginFlow();
    } catch {}

    await humanDelay(2000, 4000);

    console.log(`[IG-SCRAPER] Obteniendo usernames de seguidores de @${targetUsername} (Private API)...`);
    const targetUserId = await ig.user.getIdByUsername(targetUsername);
    const feed = ig.feed.accountFollowers(targetUserId);
    const usernames = [];
    let page = 0;

    while (usernames.length < limit) {
      const items = await feed.items();
      if (!items?.length) break;
      usernames.push(...items.map((u) => u.username));
      page++;
      if (!feed.isMoreAvailable() || page > 15) break;
      await humanDelay(3000, 6000);
    }

    const toEnrich = usernames.slice(0, limit);
    if (toEnrich.length === 0) {
      return { success: true, total: 0, inserted: 0, followers: [] };
    }

    console.log(`[IG-SCRAPER] Enriqueciendo ${toEnrich.length} perfiles con Bright Data...`);
    const profiles = await scrapeProfiles(toEnrich.map((u) => `https://www.instagram.com/${u}/`));

    const followers = profiles
      .filter((p) => (p?.username || p?.account) && !p.error)
      .map((p) => ({
        pk: String(p.pk || p.id || ''),
        username: p.username || p.account,
        full_name: p.full_name || '',
        profile_pic_url: p.profile_pic_url || null,
      }));

    const { inserted } = await saveFollowers(userId, targetUsername, followers);
    console.log(`[IG-SCRAPER] ✅ ${followers.length} seguidores enriquecidos, ${inserted} en BD`);
    return { success: true, total: followers.length, inserted, followers };
  } catch (error) {
    console.error('[IG-SCRAPER] Error:', error.message);
    return { success: false, error: error.message, followers: [], total: 0, inserted: 0 };
  }
}
