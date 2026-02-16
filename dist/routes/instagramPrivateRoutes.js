import express from 'express';
import {
    igPrivateLogin,
    igPrivateComplete2FA,
    igGetHybridStatus,
    igGetFollowers,
    igGetLikesFromPost,
    igSearchUsers,
    igGetUserInfo,
    igSendInitialDM,
    igPrivateLogout
} from '../services/instagramService.js';
import { validateJwt } from '../config/jwt.js';

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
        const limit = parseInt(req.query.limit) || 50;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const result = await igGetFollowers(username, limit, userId);
        res.json(result);
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

export default router;
