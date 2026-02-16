import instagramAuthService from '../services/instagramAuthService.js';

export const startConnect = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?.sub;
        const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
        const url = instagramAuthService.getAuthUrl(state);
        res.json({ success: true, url });
    } catch (error) {
        console.error('Start Connect Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const callback = async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
        console.error('Facebook Auth Error:', error, error_description);
        return res.redirect(`${process.env.FRONTEND_URL || 'https://www.speedleads.app'}/integrations?status=error&message=${encodeURIComponent(error_description)}`);
    }
    if (!code || !state) {
        return res.status(400).json({ success: false, error: 'Missing code or state' });
    }
    try {
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('ascii'));
        const userId = decodedState.userId;
        if (!userId) throw new Error('Invalid state parameter');
        const result = await instagramAuthService.exchangeCodeAndGetAccount(code, userId);
        if (!result.success) {
            return res.redirect(`${process.env.FRONTEND_URL || 'https://www.speedleads.app'}/integrations?status=error&code=${result.error}&message=${encodeURIComponent(result.message)}`);
        }
        res.redirect(`${process.env.FRONTEND_URL || 'https://www.speedleads.app'}/integrations?status=success&username=${result.account.ig_username}`);
    } catch (err) {
        console.error('Callback Logic Error:', err);
        res.redirect(`${process.env.FRONTEND_URL || 'https://www.speedleads.app'}/integrations?status=error&message=${encodeURIComponent(err.message)}`);
    }
};

export const getStatus = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?.sub;
        const status = await instagramAuthService.getStatus(userId);
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('Get Status Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const disconnect = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?.sub;
        if (!userId) return res.status(401).json({ error: 'Usuario no identificado' });
        await instagramAuthService.disconnect(userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Disconnect Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
