import express from 'express';
import axios from 'axios';
import { supabaseAdmin } from '../config/db.js';
import { validateJwt } from '../config/jwt.js';

const router = express.Router();

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const REDIRECT_URI = `${BACKEND_URL}/api/instagram/graph/callback`;
const SCOPES = ['instagram_basic', 'instagram_manage_messages', 'instagram_manage_comments', 'pages_show_list', 'pages_read_engagement', 'public_profile'].join(',');
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.speedleads.app';

router.get('/auth-url', validateJwt, (req, res) => {
    try {
        if (!META_APP_ID) return res.status(500).json({ error: 'META_APP_ID no configurado en el servidor' });
        const userId = req.user?.userId || req.user?.id || req.user?.sub;
        if (!userId) return res.status(401).json({ error: 'Usuario no identificado. Por favor, inicia sesión nuevamente.' });
        const state = JSON.stringify({ userId, nonce: Date.now() });
        const encodedState = Buffer.from(state).toString('base64');
        const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPES}&state=${encodedState}&response_type=code`;
        res.json({ success: true, url: authUrl });
    } catch (err) {
        res.status(500).json({ error: 'Error interno al generar la URL de autenticación: ' + err.message });
    }
});

router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${FRONTEND_URL}/InstagramChats?error=${error}`);
    if (!code) return res.redirect(`${FRONTEND_URL}/InstagramChats?error=no_code`);
    try {
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
        const userId = decodedState.userId;
        if (!userId) throw new Error('No userId in state');
        const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: { client_id: META_APP_ID, client_secret: META_APP_SECRET, redirect_uri: REDIRECT_URI, code }
        });
        const shortLivedToken = tokenResponse.data.access_token;
        const longLivedResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: { grant_type: 'fb_exchange_token', client_id: META_APP_ID, client_secret: META_APP_SECRET, fb_exchange_token: shortLivedToken }
        });
        const accessToken = longLivedResponse.data.access_token;
        const expiresIn = longLivedResponse.data.expires_in;
        const pagesResponse = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
            params: { access_token: accessToken, fields: 'id,name,access_token,tasks,instagram_business_account{id,username,profile_picture_url}' }
        });
        const pages = pagesResponse.data.data || [];
        const connectedAccounts = [];
        for (const page of pages) {
            if (page.instagram_business_account) {
                const igAccount = page.instagram_business_account;
                const pageToken = page.access_token;
                await supabaseAdmin.from('instagram_official_accounts').upsert({
                    user_id: userId,
                    facebook_page_id: page.id,
                    instagram_business_id: igAccount.id,
                    page_name: page.name,
                    instagram_username: igAccount.username,
                    instagram_profile_picture: igAccount.profile_picture_url,
                    access_token: pageToken,
                    token_expires_at: new Date(Date.now() + (expiresIn ? expiresIn * 1000 : 5184000000))
                }, { onConflict: 'user_id,instagram_business_id' });
                connectedAccounts.push(igAccount.username);
            }
        }
        const redirectUrl = connectedAccounts.length === 0
            ? `${FRONTEND_URL}/InstagramChats?error=${pages.length === 0 ? 'no_pages_found' : 'no_instagram_business_account'}`
            : `${FRONTEND_URL}/InstagramChats?success=true&connected=${connectedAccounts.join(',')}`;
        res.redirect(redirectUrl);
    } catch (err) {
        console.error('❌ [IG-GRAPH] OAuth Error:', err.response?.data || err.message);
        res.redirect(`${FRONTEND_URL}/InstagramChats?error=oauth_failed`);
    }
});

router.post('/disconnect', validateJwt, async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?.sub;
        if (!userId) return res.status(401).json({ error: 'Usuario no identificado' });
        const { error } = await supabaseAdmin.from('instagram_official_accounts').delete().eq('user_id', userId);
        if (error) throw error;
        res.json({ success: true, message: 'Cuenta desconectada' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/accounts', validateJwt, async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?.sub;
        const { data, error } = await supabaseAdmin.from('instagram_official_accounts').select('*').eq('user_id', userId);
        if (error) throw error;
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
