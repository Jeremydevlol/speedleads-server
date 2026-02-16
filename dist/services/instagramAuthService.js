import axios from 'axios';
import { supabaseAdmin } from '../config/db.js';

const FB_API_VERSION = 'v19.0';
const FB_GRAPH_URL = 'https://graph.facebook.com';

class InstagramAuthService {
  constructor() {
    this.appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
    this.appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
    this.baseUrl = process.env.NODE_ENV === 'production'
      ? (process.env.API_URL || process.env.BACKEND_URL)
      : `http://localhost:${process.env.PORT || 5001}`;
    this.redirectUri = `${this.baseUrl}/api/instagram/auth/callback`;
  }

  getAuthUrl(state = '') {
    if (!this.appId) throw new Error('META_APP_ID / FACEBOOK_APP_ID is not configured');
    const scopes = [
      'instagram_basic',
      'instagram_manage_messages',
      'instagram_manage_comments',
      'pages_show_list',
      'pages_read_engagement',
    ];
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(','),
      response_type: 'code',
      state: state
    });
    return `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeAndGetAccount(code, userId) {
    if (!this.appId || !this.appSecret) throw new Error('Facebook/Meta credentials not configured');
    try {
      const tokenResponse = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/oauth/access_token`, {
        params: { client_id: this.appId, client_secret: this.appSecret, redirect_uri: this.redirectUri, code }
      });
      const shortLivedToken = tokenResponse.data.access_token;
      const longTokenResponse = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/oauth/access_token`, {
        params: { grant_type: 'fb_exchange_token', client_id: this.appId, client_secret: this.appSecret, fb_exchange_token: shortLivedToken }
      });
      const accessToken = longTokenResponse.data.access_token;
      const expiresIn = longTokenResponse.data.expires_in;
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      const accountData = await this.findInstagramBusinessAccount(accessToken);
      if (!accountData) {
        return { success: false, error: 'REQUIRES_PRO_ACCOUNT', message: 'No Instagram Business/Creator account found linked to your Facebook Pages.' };
      }
      await this.saveAccountToDb(userId, { ...accountData, access_token: accessToken, token_expires_at: expiresAt, status: 'CONNECTED' });
      return { success: true, account: accountData };
    } catch (error) {
      console.error('Instagram Auth Error:', error.response?.data || error.message);
      if (error.response?.data?.error?.code === 190) {
        return { success: false, error: 'NEEDS_REAUTH', message: 'Authentication failed or expired.' };
      }
      throw error;
    }
  }

  async findInstagramBusinessAccount(accessToken) {
    const pagesResponse = await axios.get(`${FB_GRAPH_URL}/${FB_API_VERSION}/me/accounts`, {
      params: { access_token: accessToken, fields: 'id,name,instagram_business_account{id,username,profile_picture_url}' }
    });
    const pages = pagesResponse.data.data || [];
    for (const page of pages) {
      if (page.instagram_business_account) {
        return {
          ig_user_id: page.instagram_business_account.id,
          ig_username: page.instagram_business_account.username,
          page_id: page.id,
          page_name: page.name
        };
      }
    }
    return null;
  }

  async saveAccountToDb(userId, data) {
    const { ig_user_id, ig_username, page_id, page_name, access_token, token_expires_at } = data;
    const { error } = await supabaseAdmin
      .from('instagram_official_accounts')
      .upsert({
        user_id: userId,
        instagram_business_id: ig_user_id,
        instagram_username: ig_username,
        facebook_page_id: page_id,
        page_name: page_name || null,
        access_token,
        token_expires_at,
      }, { onConflict: 'user_id,instagram_business_id' });
    if (error) throw new Error(`Database error: ${error.message}`);
  }

  async getStatus(userId) {
    const { data, error } = await supabaseAdmin
      .from('instagram_official_accounts')
      .select('instagram_username, token_expires_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') return { status: 'DISCONNECTED' };
      throw error;
    }
    if (!data) return { status: 'DISCONNECTED' };
    return { status: 'CONNECTED', ig_username: data.instagram_username, expires_at: data.token_expires_at };
  }

  async disconnect(userId) {
    const { error } = await supabaseAdmin.from('instagram_official_accounts').delete().eq('user_id', userId);
    if (error) throw error;
    return true;
  }
}

export default new InstagramAuthService();
