/**
 * Rutas Bright Data — Scrapers sin sesión IG, sin login.
 * Acceso: desarrollo sin auth, o con header X-BRIGHTDATA-TEST en producción.
 */
import express from 'express';
import {
  scrapeProfileByUsername,
  scrapeProfiles,
  scrapePosts,
  scrapeReels,
  scrapeComments,
  scrapeCommentsFromUrls,
} from '../services/brightDataScraper.service.js';
import { scrapeLeadsFromCommenters } from '../services/instagramFollowersScraper.service.js';

const router = express.Router();

function allowAccess(req) {
  if (process.env.NODE_ENV !== 'production') return true;
  const key = req.get('X-BRIGHTDATA-TEST');
  return key === process.env.BRIGHTDATA_TEST_KEY;
}

router.use((req, res, next) => {
  if (!allowAccess(req)) {
    return res.status(403).json({ error: 'Acceso no permitido. Usa X-BRIGHTDATA-TEST en producción.' });
  }
  next();
});

/**
 * GET /profile/:username — Scrapear perfil de un usuario
 */
router.get('/profile/:username', async (req, res) => {
  try {
    const username = req.params.username.replace(/^@/, '');
    const data = await scrapeProfileByUsername(username);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /profiles — Scrapear varios perfiles
 * Body: { usernames: string[] }
 */
router.post('/profiles', async (req, res) => {
  try {
    const { usernames } = req.body;
    if (!usernames || !Array.isArray(usernames)) {
      return res.status(400).json({ error: 'usernames (array) requerido' });
    }
    const urls = usernames.map((u) => `https://www.instagram.com/${String(u).replace(/^@/, '')}/`);
    const data = await scrapeProfiles(urls);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /posts — Scrapear posts por URL
 * Body: { urls: string[] }
 */
router.post('/posts', async (req, res) => {
  try {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'urls (array) requerido' });
    }
    const data = await scrapePosts(urls);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /reels — Scrapear reels por URL
 * Body: { urls: string[] }
 */
router.post('/reels', async (req, res) => {
  try {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'urls (array) requerido' });
    }
    const data = await scrapeReels(urls);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /comments — Scrapear comentarios de posts/reels
 * Body: { urls: string[] }
 */
router.post('/comments', async (req, res) => {
  try {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'urls (array) requerido' });
    }
    const data = await scrapeCommentsFromUrls(urls);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /scrape-leads/:username — Extraer leads desde comentaristas (100% Bright Data, sin login IG)
 * Body: { limit?, userId? } — userId opcional (header X-User-Id) para guardar en BD
 */
router.post('/scrape-leads/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const limit = parseInt(req.body?.limit) || 50;
    const userId = (req.body?.userId || req.headers['x-user-id'] || '').trim();
    if (!userId) {
      return res.status(400).json({
        error: 'userId requerido (body.userId o header X-User-Id) para guardar leads en BD'
      });
    }
    const result = await scrapeLeadsFromCommenters(userId, username.replace(/^@/, ''), limit);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
