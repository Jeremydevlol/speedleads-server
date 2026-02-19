import express from 'express';
import {
    igPrivateLogin,
    igPrivateComplete2FA,
    igSubmitChallengeCode,
    igRetryAfterCheckpoint,
    igGetHybridStatus,
    igGetFollowers,
    igGetFollowing,
    igGetLikesFromPost,
    igSearchUsers,
    igSearchHashtags,
    igGetHashtagMedia,
    igSearchLocations,
    igGetLocationMedia,
    igGetUserInfo,
    igGetUserMedia,
    igGetTimeline,
    igSendInitialDM,
    igSendMassDM,
    igPrivateLogout
} from '../services/instagramService.js';
import { validateJwt } from '../config/jwt.js';
import { saveScrapedFollowers, getScrapedFollowers, getScrapedTargets } from '../db/igScrapedRepo.js';

const router = express.Router();

function getUserId(req) {
    return req.user?.userId || req.user?.id || req.user?.sub || req.body?.userId || req.query?.userId;
}

router.get('/status', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const status = await igGetHybridStatus(userId);
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/login', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { username, password } = req.body;
        if (!userId || !username || !password) {
            return res.status(400).json({ error: 'Faltan datos requeridos (userId, username, password)' });
        }
        const result = await igPrivateLogin(username, password, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/2fa', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { code } = req.body;
        if (!userId || !code) return res.status(400).json({ error: 'Faltan datos requeridos' });
        const result = await igPrivateComplete2FA(code, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/challenge/code', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { code } = req.body;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!code) return res.status(400).json({ error: 'Código de verificación requerido' });
        const result = await igSubmitChallengeCode(code, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/challenge/retry', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await igRetryAfterCheckpoint(userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/logout', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await igPrivateLogout(userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/followers/:username', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { username } = req.params;
        const limit = parseInt(req.query.limit) || 30;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await igGetFollowers(username, limit, userId);

        if (result.success && result.followers && result.followers.length > 0) {
            try {
                const saveResult = await saveScrapedFollowers(userId, username, null, result.followers);
                console.log(`[IG] Saved ${saveResult.saved} followers for @${username} to DB`);
                result.saved_to_db = saveResult.saved;
            } catch (dbErr) {
                console.error(`[IG] Error saving followers to DB:`, dbErr.message);
            }
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/scraped-followers/:username', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { username } = req.params;
        const limit = parseInt(req.query.limit) || 200;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const followers = await getScrapedFollowers(userId, username, limit);
        res.json({ success: true, followers, total: followers.length, source: 'database' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/scraped-targets', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const targets = await getScrapedTargets(userId);
        res.json({ success: true, targets });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/likes-from-post', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { postUrl, limit = 50 } = req.body;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!postUrl) return res.status(400).json({ error: 'postUrl es requerido' });
        const result = await igGetLikesFromPost(postUrl, limit, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/search', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { q, limit = 10 } = req.query;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!q) return res.status(400).json({ error: 'Query parameter (q) is required' });
        const result = await igSearchUsers(q, parseInt(limit), userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/user/:username', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { username } = req.params;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await igGetUserInfo(username, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/send-initial-dm', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { recipientUsername, message } = req.body;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!recipientUsername || !message) return res.status(400).json({ error: 'Faltan datos requeridos' });
        const result = await igSendInitialDM(recipientUsername, message, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Envío masivo de DMs (Instagram Private API).
 * Body: { recipientUsernames: string[], message: string, delayBetweenMs?: number, useUsernameTemplate?: boolean }
 */
router.post('/send-mass-dm', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { recipientUsernames, message, delayBetweenMs, useUsernameTemplate } = req.body;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!recipientUsernames || !Array.isArray(recipientUsernames) || recipientUsernames.length === 0) {
            return res.status(400).json({ error: 'recipientUsernames es requerido (array de usernames)' });
        }
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'message es requerido' });
        }
        const result = await igSendMassDM(recipientUsernames, message, userId, {
            delayBetweenMs: typeof delayBetweenMs === 'number' ? Math.max(5000, delayBetweenMs) : undefined,
            useUsernameTemplate: !!useUsernameTemplate
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────────────
// NUEVOS ENDPOINTS: Hashtags, Ubicaciones, Media, Timeline
// ─────────────────────────────────────────────────────────

router.get('/following/:username', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { username } = req.params;
        const limit = parseInt(req.query.limit) || 30;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await igGetFollowing(username, limit, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/search/hashtags', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { q, limit = 20 } = req.query;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!q) return res.status(400).json({ error: 'Query parameter (q) es requerido' });
        const result = await igSearchHashtags(q, parseInt(limit), userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/hashtag/:hashtag/media', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { hashtag } = req.params;
        const limit = parseInt(req.query.limit) || 30;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await igGetHashtagMedia(hashtag, limit, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/search/locations', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { q, limit = 20 } = req.query;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!q) return res.status(400).json({ error: 'Query parameter (q) es requerido' });
        const result = await igSearchLocations(q, parseInt(limit), userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/location/:locationId/media', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { locationId } = req.params;
        const limit = parseInt(req.query.limit) || 30;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await igGetLocationMedia(locationId, limit, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/user/:username/media', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { username } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await igGetUserMedia(username, limit, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/timeline', validateJwt, async (req, res) => {
    try {
        const userId = getUserId(req);
        const limit = parseInt(req.query.limit) || 20;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await igGetTimeline(limit, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
