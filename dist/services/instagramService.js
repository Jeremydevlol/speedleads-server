/**
 * Instagram Hybrid Service (Graph API + Private API)
 * 
 * Arquitectura híbrida:
 * - Graph API (oficial Meta): Auth OAuth, DMs (respond), comments, inbox, threads
 * - Private API (extracción): Followers, likers, search users, DMs iniciales
 * 
 * La Private API se usa SOLO para operaciones de lectura/extracción de datos
 * que la Graph API oficial no soporta. Todas las escrituras van por Graph API.
 * 
 * Tabla Supabase: instagram_official_accounts (credenciales Graph API)
 * Tabla Supabase: instagram_private_sessions (credenciales Private API, opcional)
 */

import axios from 'axios';
import Bottleneck from 'bottleneck';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { IgApiClient, IgLoginTwoFactorRequiredError } from 'instagram-private-api';
import { supabaseAdmin } from '../config/db.js';

// ═══════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_URL = 'https://graph.instagram.com';
const FB_GRAPH_URL = 'https://graph.facebook.com';

const P = pino({ level: 'info', transport: { target: 'pino-pretty', options: { colorize: true } } });

// Store de sesiones (token + metadata) por userId
export const igSessions = new Map();

// Store de login pendiente 2FA
export const pending2FA = new Map();

// Directorio para guardar sesiones de Private API
const STATE_DIR = path.join(process.cwd(), 'storage', 'ig_state');
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

// Variable global para Socket.IO
let globalIO = null;

/**
 * Configurar Socket.IO desde app.js
 */
export function configureIGIO(io) {
  globalIO = io;
  P.info('✅ Socket.IO configurado para Instagram Hybrid Service');
}

/**
 * Emitir eventos a usuario específico
 */
function emitToUserIG(userId, event, data) {
  if (globalIO) {
    globalIO.to(`user:${userId}`).emit(event, data);
  }
}

// ═══════════════════════════════════════════════════════════
// PRIVATE API CLIENT (solo para extracción de datos)
// ═══════════════════════════════════════════════════════════

class PrivateAPIClient {
  constructor(userId) {
    this.userId = userId;
    this.ig = new IgApiClient();
    this.logged = false;
    this.username = null;

    // Rate limiter más agresivo para Private API (evitar bans)
    this.limiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 3000,   // 3 segundos mínimo entre requests
      reservoir: 60,   // 60 requests por hora
      reservoirRefreshAmount: 60,
      reservoirRefreshInterval: 60 * 60 * 1000
    });
  }

  stateFile() {
    return path.join(STATE_DIR, `${this.userId}.json`);
  }

  /**
   * Login con username/password
   */
  async login(username, password) {
    try {
      P.info(`🔐 [PRIVATE] Intentando login para @${username}...`);
      this.ig.state.generateDevice(username);

      try {
        await this.ig.simulate.preLoginFlow();
      } catch (e) {
        P.warn(`⚠️ [PRIVATE] preLoginFlow error (no crítico): ${e.message}`);
      }

      const loggedUser = await this.ig.account.login(username, password);
      this.logged = true;
      this.username = username;

      try {
        await this.ig.simulate.postLoginFlow();
      } catch (e) {
        // No critical
      }

      // Guardar sesión
      await this._saveState();

      P.info(`✅ [PRIVATE] Login exitoso para @${username} (pk: ${loggedUser.pk})`);
      return { success: true, pk: loggedUser.pk, username };
    } catch (error) {
      if (error instanceof IgLoginTwoFactorRequiredError) {
        const twoFactorInfo = error.response.body.two_factor_info;
        pending2FA.set(this.userId, {
          username,
          password,
          twoFactorIdentifier: twoFactorInfo.two_factor_identifier,
          methods: twoFactorInfo.enabled_methods || [],
          ig: this.ig
        });
        P.info(`📲 [PRIVATE] 2FA requerido para @${username}`);
        return {
          success: false,
          needs_2fa: true,
          two_factor_identifier: twoFactorInfo.two_factor_identifier,
          methods: twoFactorInfo.enabled_methods || []
        };
      }
      P.error(`❌ [PRIVATE] Login fallido: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Completar login con código 2FA
   */
  async complete2FA(code) {
    const pending = pending2FA.get(this.userId);
    if (!pending) {
      throw new Error('No hay 2FA pendiente para este usuario');
    }

    try {
      const result = await pending.ig.account.twoFactorLogin({
        username: pending.username,
        verificationCode: code,
        twoFactorIdentifier: pending.twoFactorIdentifier,
        verificationMethod: '1',
        trustThisDevice: '1'
      });

      this.ig = pending.ig;
      this.logged = true;
      this.username = pending.username;
      pending2FA.delete(this.userId);

      await this._saveState();

      P.info(`✅ [PRIVATE] 2FA completado para @${this.username}`);
      return { success: true, pk: result.pk, username: this.username };
    } catch (error) {
      P.error(`❌ [PRIVATE] Error 2FA: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Restaurar sesión desde archivo
   */
  async restoreSession() {
    const file = this.stateFile();
    if (!fs.existsSync(file)) return false;

    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!saved.username || !saved.cookies) return false;

      this.ig.state.generateDevice(saved.username);
      await this.ig.state.deserializeCookieJar(saved.cookies);
      this.username = saved.username;
      this.logged = true;

      // Verificar que la sesión siga activa
      try {
        await this.ig.account.currentUser();
        P.info(`✅ [PRIVATE] Sesión restaurada para @${this.username}`);
        return true;
      } catch (e) {
        P.warn(`⚠️ [PRIVATE] Sesión expirada para @${this.username}`);
        this.logged = false;
        return false;
      }
    } catch (error) {
      P.warn(`⚠️ [PRIVATE] Error restaurando sesión: ${error.message}`);
      return false;
    }
  }

  /**
   * Guardar estado de la sesión
   */
  async _saveState() {
    try {
      const cookies = await this.ig.state.serializeCookieJar();
      const data = {
        username: this.username,
        cookies,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.stateFile(), JSON.stringify(data, null, 2));
      P.info(`💾 [PRIVATE] Sesión guardada para @${this.username}`);
    } catch (error) {
      P.warn(`⚠️ [PRIVATE] Error guardando sesión: ${error.message}`);
    }
  }

  /**
   * Obtener likers de un post
   */
  async getLikesFromPost(postUrl, limit = 100) {
    if (!this.logged) throw new Error('Private API no conectada. Inicia sesión con usuario/contraseña primero.');

    return this.limiter.schedule(async () => {
      try {
        // Extraer shortcode de la URL
        const shortcode = this._extractShortcode(postUrl);
        if (!shortcode) throw new Error('URL de post inválida');

        // Obtener media ID desde shortcode
        const mediaInfo = await this.ig.media.info(await this._shortcodeToMediaId(shortcode));
        const mediaItem = mediaInfo.items[0];

        // Obtener likers
        const likersFeed = this.ig.media.likers(mediaItem.pk);
        const likersResponse = await likersFeed;

        const likers = (likersResponse.users || []).slice(0, limit).map(u => ({
          pk: u.pk,
          username: u.username,
          full_name: u.full_name || '',
          is_private: u.is_private,
          is_verified: u.is_verified,
          profile_pic_url: u.profile_pic_url
        }));

        P.info(`✅ [PRIVATE] ${likers.length} likers obtenidos del post ${shortcode}`);

        return {
          success: true,
          likes: likers,
          total: likers.length,
          post_info: {
            pk: mediaItem.pk,
            shortcode,
            like_count: mediaItem.like_count || 0,
            comment_count: mediaItem.comment_count || 0,
            owner: {
              username: mediaItem.user?.username || 'unknown',
              pk: mediaItem.user?.pk
            }
          }
        };
      } catch (error) {
        P.error(`❌ [PRIVATE] Error obteniendo likers: ${error.message}`);
        return { success: false, error: error.message, likes: [], total: 0 };
      }
    });
  }

  /**
   * Obtener seguidores de un usuario
   */
  async getFollowers(username, limit = 100) {
    if (!this.logged) throw new Error('Private API no conectada.');

    return this.limiter.schedule(async () => {
      try {
        const userId = await this.ig.user.getIdByUsername(username);
        const followersFeed = this.ig.feed.accountFollowers(userId);

        let followers = [];
        let page = 0;

        while (followers.length < limit) {
          const items = await followersFeed.items();
          if (!items || items.length === 0) break;

          followers.push(...items.map(u => ({
            pk: u.pk,
            username: u.username,
            full_name: u.full_name || '',
            is_private: u.is_private,
            is_verified: u.is_verified,
            profile_pic_url: u.profile_pic_url
          })));

          page++;
          if (!followersFeed.isMoreAvailable() || page > 10) break;

          // Delay entre páginas
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
        }

        followers = followers.slice(0, limit);
        P.info(`✅ [PRIVATE] ${followers.length} seguidores obtenidos de @${username}`);

        return { success: true, followers, total: followers.length };
      } catch (error) {
        P.error(`❌ [PRIVATE] Error obteniendo seguidores de @${username}: ${error.message}`);
        return { success: false, error: error.message, followers: [], total: 0 };
      }
    });
  }

  /**
   * Buscar usuarios por query
   */
  async searchUsers(query, limit = 10) {
    if (!this.logged) throw new Error('Private API no conectada.');

    return this.limiter.schedule(async () => {
      try {
        const result = await this.ig.user.search(query);
        const users = (result.users || []).slice(0, limit).map(u => ({
          pk: u.pk,
          username: u.username,
          full_name: u.full_name || '',
          is_private: u.is_private,
          is_verified: u.is_verified,
          profile_pic_url: u.profile_pic_url,
          follower_count: u.follower_count,
          is_business: u.is_business || false
        }));

        P.info(`✅ [PRIVATE] ${users.length} usuarios encontrados para '${query}'`);
        return { success: true, users, total: users.length };
      } catch (error) {
        P.error(`❌ [PRIVATE] Error buscando usuarios: ${error.message}`);
        return { success: false, error: error.message, users: [], total: 0 };
      }
    });
  }

  /**
   * Enviar DM vía Private API (para contacto inicial fuera de ventana 24h)
   */
  async sendDirectMessage(recipientUsername, text) {
    if (!this.logged) throw new Error('Private API no conectada.');

    return this.limiter.schedule(async () => {
      try {
        const userId = await this.ig.user.getIdByUsername(recipientUsername);
        const thread = this.ig.entity.directThread([userId.toString()]);
        const result = await thread.broadcastText(text);

        P.info(`✅ [PRIVATE] DM enviado a @${recipientUsername}`);
        return { success: true, data: result };
      } catch (error) {
        P.error(`❌ [PRIVATE] Error enviando DM a @${recipientUsername}: ${error.message}`);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Obtener info de un usuario por username
   */
  async getUserInfo(username) {
    if (!this.logged) throw new Error('Private API no conectada.');

    return this.limiter.schedule(async () => {
      try {
        const userId = await this.ig.user.getIdByUsername(username);
        const userInfo = await this.ig.user.info(userId);

        return {
          success: true,
          user: {
            pk: userInfo.pk,
            username: userInfo.username,
            full_name: userInfo.full_name,
            biography: userInfo.biography,
            follower_count: userInfo.follower_count,
            following_count: userInfo.following_count,
            media_count: userInfo.media_count,
            is_private: userInfo.is_private,
            is_verified: userInfo.is_verified,
            is_business: userInfo.is_business,
            profile_pic_url: userInfo.profile_pic_url
          }
        };
      } catch (error) {
        P.error(`❌ [PRIVATE] Error obteniendo info de @${username}: ${error.message}`);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Logout de Private API
   */
  async logout() {
    try {
      if (this.logged) {
        await this.ig.account.logout();
      }
      this.logged = false;
      this.username = null;

      // Eliminar archivo de sesión
      const file = this.stateFile();
      if (fs.existsSync(file)) fs.unlinkSync(file);

      P.info(`🔒 [PRIVATE] Sesión cerrada`);
      return { success: true };
    } catch (error) {
      P.warn(`⚠️ [PRIVATE] Error en logout: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Helpers
  _extractShortcode(url) {
    const patterns = [
      /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
      /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
      /instagram\.com\/tv\/([A-Za-z0-9_-]+)/
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  async _shortcodeToMediaId(shortcode) {
    // Algoritmo para convertir shortcode a media ID de Instagram
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = BigInt(0);
    for (const char of shortcode) {
      id = id * BigInt(64) + BigInt(alphabet.indexOf(char));
    }
    return id.toString();
  }
}

// ═══════════════════════════════════════════════════════════
// CLASE PRINCIPAL: InstagramHybridService
// Graph API (oficial) + Private API (extracción de datos)
// ═══════════════════════════════════════════════════════════

class InstagramGraphService {
  constructor(userId) {
    this.userId = userId;
    this.igUserId = null;        // Instagram Business Account ID
    this.username = null;        // Instagram username
    this.accessToken = null;     // Page access token (long-lived)
    this.pageId = null;          // Facebook Page ID
    this.tokenExpiresAt = null;
    this.connected = false;

    // Private API client (para extracción de datos)
    this.privateClient = new PrivateAPIClient(userId);

    // Rate limiter para respetar límites de Graph API
    this.limiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 1000,   // 1 segundo mínimo entre requests
      reservoir: 200,  // 200 requests por hora (límite Graph API)
      reservoirRefreshAmount: 200,
      reservoirRefreshInterval: 60 * 60 * 1000 // 1 hora
    });

    // Sets para tracking
    this.processedMessages = new Set();
    this.processedComments = new Set();
    this.conversationHistory = new Map();

    P.info(`📸 InstagramHybridService creado para usuario ${userId}`);
  }

  // ─────────────────────────────────────────────────────────
  // CONEXIÓN Y ESTADO
  // ─────────────────────────────────────────────────────────

  /**
   * Cargar credenciales desde Supabase
   */
  async loadCredentials() {
    try {
      const { data, error } = await supabaseAdmin
        .from('instagram_official_accounts')
        .select('*')
        .eq('user_id', this.userId)
        .maybeSingle();

      if (error) {
        P.error(`❌ Error cargando credenciales: ${error.message}`);
        return false;
      }

      if (!data) {
        P.info(`ℹ️ No hay cuenta de Instagram conectada para usuario ${this.userId}`);
        return false;
      }

      // Verificar que el token no haya expirado
      if (data.token_expires_at) {
        const expiresAt = new Date(data.token_expires_at);
        if (expiresAt < new Date()) {
          P.warn(`⚠️ Token expirado para usuario ${this.userId}. Expiró: ${expiresAt.toISOString()}`);
          this.connected = false;
          emitToUserIG(this.userId, 'instagram:status', {
            connected: false,
            error: 'token_expired',
            message: 'Tu token de Instagram ha expirado. Por favor, reconecta tu cuenta.'
          });
          return false;
        }
      }

      this.igUserId = data.instagram_business_id;
      this.username = data.instagram_username;
      this.accessToken = data.access_token;
      this.pageId = data.facebook_page_id;
      this.tokenExpiresAt = data.token_expires_at;
      this.connected = true;

      P.info(`✅ Credenciales cargadas para @${this.username} (IG ID: ${this.igUserId})`);
      return true;
    } catch (err) {
      P.error(`❌ Error en loadCredentials: ${err.message}`);
      return false;
    }
  }

  /**
   * Verificar que la sesión esté activa
   */
  async ensureConnected() {
    if (!this.connected || !this.accessToken) {
      const loaded = await this.loadCredentials();
      if (!loaded) {
        throw new Error('No hay cuenta de Instagram conectada. Conecta tu cuenta desde Configuración.');
      }
    }
    return true;
  }

  /**
   * Verificar estado de la conexión
   */
  async checkStatus() {
    try {
      await this.ensureConnected();

      // Verificar que el token funcione haciendo una llamada simple
      const response = await axios.get(`${GRAPH_URL}/${GRAPH_API_VERSION}/${this.igUserId}`, {
        params: {
          access_token: this.accessToken,
          fields: 'id,username,name,profile_picture_url,followers_count,media_count'
        }
      });

      return {
        connected: true,
        username: response.data.username || this.username,
        igUserId: response.data.id,
        full_name: response.data.name,
        profile_picture: response.data.profile_picture_url,
        followers_count: response.data.followers_count,
        media_count: response.data.media_count
      };
    } catch (error) {
      P.error(`❌ Error verificando estado: ${error.response?.data?.error?.message || error.message}`);

      // Si es error de token, marcar como desconectado
      if (error.response?.data?.error?.code === 190) {
        this.connected = false;
        emitToUserIG(this.userId, 'instagram:status', {
          connected: false,
          error: 'token_invalid',
          message: 'Token de Instagram inválido. Por favor, reconecta tu cuenta.'
        });
      }

      return { connected: false, error: error.message };
    }
  }

  // ─────────────────────────────────────────────────────────
  // MENSAJES DIRECTOS (DMs)
  // ─────────────────────────────────────────────────────────

  /**
   * Enviar DM de texto a un usuario por IGSID (Instagram Scoped ID)
   * NOTA: La Graph API solo permite responder a usuarios que iniciaron conversación (ventana de 24h)
   */
  async sendText({ recipientId, text }) {
    return this.limiter.schedule(async () => {
      try {
        await this.ensureConnected();

        P.info(`📤 Enviando DM a recipientId ${recipientId}: ${text.substring(0, 50)}...`);

        const response = await axios.post(
          `${GRAPH_URL}/${GRAPH_API_VERSION}/${this.igUserId}/messages`,
          {
            recipient: { id: recipientId },
            message: { text: text }
          },
          {
            params: { access_token: this.accessToken }
          }
        );

        P.info(`✅ DM enviado exitosamente (message_id: ${response.data?.message_id})`);

        // Guardar en Supabase
        this._saveOutgoingMessage(recipientId, text, response.data?.message_id)
          .catch(e => P.warn(`⚠️ Error guardando mensaje: ${e.message}`));

        return {
          success: true,
          message_id: response.data?.message_id,
          recipient_id: recipientId,
          text
        };
      } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        P.error(`❌ Error enviando DM: ${errMsg}`);

        // Manejar errores específicos
        if (error.response?.data?.error?.code === 10) {
          throw new Error('No se puede enviar mensaje: el usuario no inició una conversación o la ventana de 24h expiró.');
        }

        throw new Error(`Error enviando DM: ${errMsg}`);
      }
    });
  }

  /**
   * Responder en un thread/conversación existente
   * Usa el ID del participante para responder
   */
  async replyText({ threadId, text, recipientId }) {
    return this.limiter.schedule(async () => {
      try {
        await this.ensureConnected();

        // Si no tenemos recipientId, obtenerlo del thread
        let targetRecipientId = recipientId;
        if (!targetRecipientId && threadId) {
          targetRecipientId = await this._getRecipientFromThread(threadId);
        }

        if (!targetRecipientId) {
          throw new Error('No se pudo determinar el destinatario del mensaje.');
        }

        P.info(`📤 Respondiendo en thread ${threadId}: ${text.substring(0, 50)}...`);

        const response = await axios.post(
          `${GRAPH_URL}/${GRAPH_API_VERSION}/${this.igUserId}/messages`,
          {
            recipient: { id: targetRecipientId },
            message: { text: text }
          },
          {
            params: { access_token: this.accessToken }
          }
        );

        P.info(`✅ Respuesta enviada en thread ${threadId}`);

        // Persistir en Supabase
        this._saveOutgoingMessage(targetRecipientId, text, response.data?.message_id, threadId)
          .catch(e => P.warn(`⚠️ Error guardando reply: ${e.message}`));

        return {
          success: true,
          message_id: response.data?.message_id,
          threadId,
          text
        };
      } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        P.error(`❌ Error respondiendo en thread ${threadId}: ${errMsg}`);
        throw new Error(`Error respondiendo: ${errMsg}`);
      }
    });
  }

  /**
   * Enviar mensaje con imagen
   */
  async sendImage({ recipientId, imageUrl }) {
    return this.limiter.schedule(async () => {
      try {
        await this.ensureConnected();

        P.info(`🖼️ Enviando imagen a ${recipientId}`);

        const response = await axios.post(
          `${GRAPH_URL}/${GRAPH_API_VERSION}/${this.igUserId}/messages`,
          {
            recipient: { id: recipientId },
            message: {
              attachment: {
                type: 'image',
                payload: { url: imageUrl }
              }
            }
          },
          {
            params: { access_token: this.accessToken }
          }
        );

        P.info(`✅ Imagen enviada exitosamente`);
        return { success: true, message_id: response.data?.message_id };
      } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        P.error(`❌ Error enviando imagen: ${errMsg}`);
        throw new Error(`Error enviando imagen: ${errMsg}`);
      }
    });
  }

  // ─────────────────────────────────────────────────────────
  // INBOX Y CONVERSACIONES
  // ─────────────────────────────────────────────────────────

  /**
   * Obtener bandeja de entrada (conversaciones)
   */
  async fetchInbox() {
    return this.limiter.schedule(async () => {
      try {
        await this.ensureConnected();

        P.info('📥 Obteniendo conversaciones...');

        const response = await axios.get(
          `${GRAPH_URL}/${GRAPH_API_VERSION}/${this.igUserId}/conversations`,
          {
            params: {
              access_token: this.accessToken,
              fields: 'id,participants,messages.limit(1){id,message,from,to,created_time}',
              platform: 'instagram'
            }
          }
        );

        const conversations = response.data?.data || [];
        P.info(`✅ ${conversations.length} conversaciones encontradas`);

        const processedThreads = conversations.map(conv => {
          const participants = conv.participants?.data || [];
          // El otro participante (no somos nosotros)
          const contact = participants.find(p => p.id !== this.igUserId) || participants[0];
          const lastMsg = conv.messages?.data?.[0];

          return {
            thread_id: conv.id,
            thread_title: contact?.username || contact?.name || 'Usuario',
            users: participants.map(p => ({
              pk: p.id,
              username: p.username || p.name,
              full_name: p.name || p.username,
              profile_pic_url: null
            })),
            last_message: lastMsg ? {
              id: lastMsg.id,
              type: 'text',
              text: lastMsg.message || '',
              timestamp: new Date(lastMsg.created_time).getTime(),
              user_id: lastMsg.from?.id,
              from_username: lastMsg.from?.username || lastMsg.from?.name,
              item_type: 'text'
            } : null,
            last_activity_at: lastMsg ? new Date(lastMsg.created_time).getTime() : Date.now(),
            unread_count: 0
          };
        });

        // Persistencia en Supabase (background)
        this._syncConversationsToSupabase(processedThreads)
          .catch(err => P.warn(`⚠️ Error persistencia: ${err.message}`));

        return processedThreads;

      } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        P.error(`❌ Error obteniendo inbox: ${errMsg}`);

        if (error.response?.data?.error?.code === 190) {
          this.connected = false;
          emitToUserIG(this.userId, 'instagram:alert', {
            type: 'session_expired',
            severity: 'error',
            message: 'Token de Instagram expirado',
            description: 'Tu token ha expirado. Reconecta tu cuenta desde Configuración.',
            action_required: true,
            timestamp: Date.now()
          });
        }

        throw new Error(`Error obteniendo inbox: ${errMsg}`);
      }
    });
  }

  /**
   * Obtener historial de un thread/conversación
   */
  async getThreadHistory(threadId, limit = 20) {
    return this.limiter.schedule(async () => {
      try {
        await this.ensureConnected();

        P.info(`📖 Obteniendo historial del thread ${threadId} (límite: ${limit})`);

        // La Graph API devuelve máximo 20 mensajes por request
        const effectiveLimit = Math.min(limit, 20);

        const response = await axios.get(
          `${GRAPH_URL}/${GRAPH_API_VERSION}/${threadId}`,
          {
            params: {
              access_token: this.accessToken,
              fields: `messages.limit(${effectiveLimit}){id,message,from,to,created_time,attachments}`
            }
          }
        );

        const messagesData = response.data?.messages?.data || [];

        const messages = messagesData.map(msg => {
          const isOwn = msg.from?.id === this.igUserId;

          // Detectar tipo de media
          let mediaType = null;
          let mediaUrl = null;
          if (msg.attachments?.data?.[0]) {
            const attachment = msg.attachments.data[0];
            mediaType = attachment.type || 'media';
            mediaUrl = attachment.url || attachment.image_data?.url;
          }

          return {
            id: msg.id,
            text: msg.message || '',
            sender: {
              pk: msg.from?.id,
              username: msg.from?.username || msg.from?.name || 'Usuario',
              full_name: msg.from?.name || msg.from?.username || 'Usuario'
            },
            timestamp: new Date(msg.created_time).getTime(),
            is_own: isOwn,
            media_type: mediaType,
            media_url: mediaUrl,
            item_type: mediaType || 'text'
          };
        });

        // Ordenar mensajes por timestamp (más antiguos primero)
        messages.sort((a, b) => a.timestamp - b.timestamp);

        P.info(`✅ ${messages.length} mensajes obtenidos del thread ${threadId}`);

        return {
          success: true,
          thread_id: threadId,
          messages,
          count: messages.length
        };
      } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        P.error(`❌ Error obteniendo historial del thread ${threadId}: ${errMsg}`);
        throw new Error(`Error obteniendo historial: ${errMsg}`);
      }
    });
  }

  /**
   * Polling de inbox y emitir nuevos mensajes por socket
   */
  async fetchInboxOnce() {
    try {
      const threads = await this.fetchInbox();

      for (const thread of threads) {
        if (thread.last_message) {
          const msgId = thread.last_message.id;
          if (!this.processedMessages.has(msgId)) {
            this.processedMessages.add(msgId);
            emitToUserIG(this.userId, 'instagram:message', {
              thread_id: thread.thread_id,
              users: thread.users,
              message: thread.last_message
            });
          }
        }
      }

      // Limitar tamaño del Set
      if (this.processedMessages.size > 5000) {
        const arr = Array.from(this.processedMessages);
        this.processedMessages = new Set(arr.slice(-2500));
      }

      return threads;
    } catch (error) {
      P.error(`❌ Error en fetchInboxOnce: ${error.message}`);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────
  // COMENTARIOS
  // ─────────────────────────────────────────────────────────

  /**
   * Responder a un comentario en un post
   * POST /{ig-comment-id}/replies?message={message}
   */
  async replyToComment(mediaId, commentId, text) {
    return this.limiter.schedule(async () => {
      try {
        await this.ensureConnected();

        P.info(`💬 Respondiendo a comentario ${commentId} en media ${mediaId}`);
        P.info(`📝 Texto: "${text.substring(0, 100)}..."`);

        const response = await axios.post(
          `${GRAPH_URL}/${GRAPH_API_VERSION}/${commentId}/replies`,
          null,
          {
            params: {
              message: text,
              access_token: this.accessToken
            }
          }
        );

        P.info(`✅ Respuesta enviada al comentario ${commentId} (reply_id: ${response.data?.id})`);

        return {
          success: true,
          mediaId,
          commentId,
          text,
          reply_id: response.data?.id
        };
      } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        P.error(`❌ Error respondiendo a comentario: ${errMsg}`);

        // Intentar como comentario nuevo en el media si falla el reply
        if (error.response?.status === 400) {
          P.info(`🔄 Intentando como comentario nuevo en el post...`);
          try {
            const fallbackResponse = await axios.post(
              `${GRAPH_URL}/${GRAPH_API_VERSION}/${mediaId}/comments`,
              null,
              {
                params: {
                  message: text,
                  access_token: this.accessToken
                }
              }
            );

            P.info(`✅ Comentario nuevo enviado (id: ${fallbackResponse.data?.id})`);
            return {
              success: true,
              mediaId,
              commentId,
              text,
              reply_id: fallbackResponse.data?.id,
              method: 'new_comment'
            };
          } catch (fallbackError) {
            P.error(`❌ Fallback también falló: ${fallbackError.response?.data?.error?.message}`);
          }
        }

        throw new Error(`Error respondiendo a comentario: ${errMsg}`);
      }
    });
  }

  /**
   * Obtener comentarios de un post por Media ID
   */
  async getCommentsFromMedia(mediaId, limit = 50) {
    return this.limiter.schedule(async () => {
      try {
        await this.ensureConnected();

        P.info(`💬 Obteniendo comentarios del media ${mediaId} (límite: ${limit})`);

        const response = await axios.get(
          `${GRAPH_URL}/${GRAPH_API_VERSION}/${mediaId}/comments`,
          {
            params: {
              access_token: this.accessToken,
              fields: 'id,text,timestamp,from{id,username},replies{id,text,timestamp,from{id,username}}',
              limit: Math.min(limit, 50)
            }
          }
        );

        const comments = response.data?.data || [];

        const processedComments = comments.map(c => ({
          id: c.id,
          text: c.text,
          timestamp: new Date(c.timestamp).getTime(),
          from: {
            id: c.from?.id,
            username: c.from?.username
          },
          replies: (c.replies?.data || []).map(r => ({
            id: r.id,
            text: r.text,
            timestamp: new Date(r.timestamp).getTime(),
            from: {
              id: r.from?.id,
              username: r.from?.username
            }
          }))
        }));

        P.info(`✅ ${processedComments.length} comentarios obtenidos`);

        return {
          success: true,
          mediaId,
          comments: processedComments,
          count: processedComments.length
        };
      } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        P.error(`❌ Error obteniendo comentarios: ${errMsg}`);
        throw new Error(`Error obteniendo comentarios: ${errMsg}`);
      }
    });
  }

  /**
   * Obtener comentarios de un post por URL
   * Primero resuelve la URL a un media ID usando la Graph API
   */
  async getCommentsFromPost(postUrl, limit = 50) {
    try {
      await this.ensureConnected();

      P.info(`🔍 Obteniendo comentarios del post: ${postUrl}`);

      // Extraer shortcode de la URL
      const shortcodeMatch = postUrl.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (!shortcodeMatch) {
        throw new Error('URL de Instagram inválida. Debe contener /p/, /reel/ o /tv/');
      }

      // Obtener media ID del usuario para encontrar el post
      // La Graph API no permite buscar por shortcode directamente,
      // pero podemos listar los medios del usuario y encontrar coincidencia,
      // o usar el endpoint de oEmbed
      const mediaId = await this._resolveMediaId(postUrl);

      if (!mediaId) {
        throw new Error('No se pudo resolver la URL a un media ID. Asegúrate de que el post pertenezca a tu cuenta conectada.');
      }

      return await this.getCommentsFromMedia(mediaId, limit);
    } catch (error) {
      P.error(`❌ Error en getCommentsFromPost: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener comentarios recientes de todas las publicaciones
   */
  async getRecentComments(limit = 10) {
    return this.limiter.schedule(async () => {
      try {
        await this.ensureConnected();

        P.info(`🔍 Obteniendo comentarios recientes (límite: ${limit})`);

        // Obtener medias recientes
        const mediaResponse = await axios.get(
          `${GRAPH_URL}/${GRAPH_API_VERSION}/${this.igUserId}/media`,
          {
            params: {
              access_token: this.accessToken,
              fields: 'id,caption,timestamp,permalink,comments{id,text,timestamp,from{id,username}}',
              limit: 10
            }
          }
        );

        const allComments = [];
        const medias = mediaResponse.data?.data || [];

        for (const media of medias) {
          const comments = media.comments?.data || [];
          for (const comment of comments) {
            allComments.push({
              id: comment.id,
              text: comment.text,
              timestamp: new Date(comment.timestamp).getTime(),
              from: {
                id: comment.from?.id,
                username: comment.from?.username
              },
              media_id: media.id,
              media_permalink: media.permalink,
              media_caption: media.caption?.substring(0, 100)
            });
          }
        }

        // Ordenar por más recientes y limitar
        allComments.sort((a, b) => b.timestamp - a.timestamp);
        const limited = allComments.slice(0, limit);

        P.info(`✅ ${limited.length} comentarios recientes obtenidos`);

        return {
          success: true,
          comments: limited,
          count: limited.length
        };
      } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        P.error(`❌ Error obteniendo comentarios recientes: ${errMsg}`);
        throw new Error(`Error obteniendo comentarios: ${errMsg}`);
      }
    });
  }

  // ─────────────────────────────────────────────────────────
  // IA INTEGRATION
  // ─────────────────────────────────────────────────────────

  /**
   * Responder con IA a un mensaje
   */
  async handleIncomingWithAI({ threadId, text, aiFunction, recipientId }) {
    try {
      P.info(`🤖 Generando respuesta con IA para thread ${threadId}`);

      const respuesta = await aiFunction(text);

      if (!respuesta || respuesta.trim().length === 0) {
        P.warn('⚠️ IA no generó respuesta');
        return null;
      }

      await this.replyText({ threadId, text: respuesta, recipientId });
      P.info(`✅ Respuesta de IA enviada: ${respuesta.substring(0, 50)}...`);
      return respuesta;
    } catch (error) {
      P.error(`❌ Error en handleIncomingWithAI: ${error.message}`);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────
  // MEDIA & ACCOUNT INFO
  // ─────────────────────────────────────────────────────────

  /**
   * Obtener información de la cuenta (posts recientes, etc.)
   */
  async getAccountMedia(limit = 12) {
    return this.limiter.schedule(async () => {
      try {
        await this.ensureConnected();

        const response = await axios.get(
          `${GRAPH_URL}/${GRAPH_API_VERSION}/${this.igUserId}/media`,
          {
            params: {
              access_token: this.accessToken,
              fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
              limit
            }
          }
        );

        return {
          success: true,
          media: response.data?.data || [],
          count: response.data?.data?.length || 0
        };
      } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        P.error(`❌ Error obteniendo media: ${errMsg}`);
        throw new Error(`Error obteniendo media: ${errMsg}`);
      }
    });
  }

  // ─────────────────────────────────────────────────────────
  // DISCONNECT & CLEANUP
  // ─────────────────────────────────────────────────────────

  /**
   * Desconectar cuenta
   */
  async logout() {
    try {
      P.info(`Desconectando cuenta de Instagram para usuario ${this.userId}`);

      this.connected = false;
      this.accessToken = null;
      this.igUserId = null;
      this.username = null;

      emitToUserIG(this.userId, 'instagram:status', { connected: false });

      return { success: true };
    } catch (error) {
      P.error(`❌ Error en logout: ${error.message}`);
      throw error;
    }
  }

  /**
   * Forzar logout completo
   */
  async forceLogout() {
    try {
      P.info(`🔴 FORCE LOGOUT para usuario ${this.userId}`);

      // Limpiar de DB
      await supabaseAdmin
        .from('instagram_official_accounts')
        .delete()
        .eq('user_id', this.userId);

      this.connected = false;
      this.accessToken = null;
      this.igUserId = null;
      this.username = null;
      this.pageId = null;

      emitToUserIG(this.userId, 'instagram:status', {
        connected: false,
        forceLogout: true,
        message: 'Cuenta desconectada. Para volver a usar Instagram, reconecta tu cuenta.'
      });

      P.info(`✅ FORCE LOGOUT completado para usuario ${this.userId}`);

      return {
        success: true,
        message: 'Cuenta desconectada. Reconecta desde Configuración.'
      };
    } catch (error) {
      P.error(`❌ Error en forceLogout: ${error.message}`);
      this.connected = false;
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────
  // HELPERS PRIVADOS
  // ─────────────────────────────────────────────────────────

  /**
   * Obtener recipientId de un thread
   */
  async _getRecipientFromThread(threadId) {
    try {
      const response = await axios.get(
        `${GRAPH_URL}/${GRAPH_API_VERSION}/${threadId}`,
        {
          params: {
            access_token: this.accessToken,
            fields: 'participants'
          }
        }
      );

      const participants = response.data?.participants?.data || [];
      const contact = participants.find(p => p.id !== this.igUserId);
      return contact?.id || null;
    } catch (error) {
      P.warn(`⚠️ Error obteniendo participantes del thread: ${error.message}`);
      return null;
    }
  }

  /**
   * Resolver URL de post a Media ID usando oEmbed
   */
  async _resolveMediaId(postUrl) {
    try {
      // Método 1: Intentar con oEmbed para obtener info básica  
      // y luego buscar en los medios del usuario
      const mediaResponse = await axios.get(
        `${GRAPH_URL}/${GRAPH_API_VERSION}/${this.igUserId}/media`,
        {
          params: {
            access_token: this.accessToken,
            fields: 'id,permalink,shortcode',
            limit: 50
          }
        }
      );

      const medias = mediaResponse.data?.data || [];
      const shortcodeMatch = postUrl.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
      const targetShortcode = shortcodeMatch?.[2];

      if (targetShortcode) {
        // Buscar por permalink que contenga el shortcode
        const found = medias.find(m =>
          m.permalink?.includes(targetShortcode) ||
          m.shortcode === targetShortcode
        );

        if (found) return found.id;
      }

      // Método 2: Buscar por URL exacta en permalink
      const foundByUrl = medias.find(m => m.permalink === postUrl);
      if (foundByUrl) return foundByUrl.id;

      return null;
    } catch (error) {
      P.warn(`⚠️ Error resolviendo media ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Guardar mensaje saliente en Supabase
   */
  async _saveOutgoingMessage(recipientId, text, messageId, threadId = null) {
    try {
      if (!this.userId) return;

      // Buscar o crear conversación
      let conversationId = threadId;
      if (!conversationId) {
        const { data: conv } = await supabaseAdmin
          .from('instagram_conversations')
          .select('id')
          .eq('user_id', this.userId)
          .eq('participant_username', recipientId)
          .maybeSingle();

        conversationId = conv?.id;
      }

      if (!conversationId) return;

      await supabaseAdmin
        .from('instagram_messages')
        .upsert({
          conversation_id: conversationId,
          external_message_id: messageId || `local_${Date.now()}_${Math.random()}`,
          sender_id: String(this.igUserId),
          message: text,
          media_type: 'text',
          is_incoming: false,
          timestamp: new Date().toISOString(),
          created_at: new Date().toISOString()
        }, {
          onConflict: 'external_message_id'
        });
    } catch (e) {
      P.warn(`⚠️ Error guardando mensaje saliente: ${e.message}`);
    }
  }

  /**
   * Sincronizar conversaciones a Supabase
   */
  async _syncConversationsToSupabase(threads) {
    for (const thread of threads) {
      try {
        const contact = thread.users?.find(u => u.pk !== this.igUserId) || thread.users?.[0];

        await supabaseAdmin
          .from('instagram_conversations')
          .upsert({
            thread_id: thread.thread_id,
            user_id: this.userId,
            participant_name: contact?.full_name || contact?.username || 'Usuario',
            participant_username: contact?.username || 'unknown',
            participant_avatar: contact?.profile_pic_url,
            last_message_at: new Date(thread.last_activity_at).toISOString(),
            updated_at: new Date().toISOString(),
            unread_count: thread.unread_count || 0,
            is_group: false
          }, {
            onConflict: 'user_id,thread_id'
          });

        // Guardar último mensaje
        if (thread.last_message) {
          const isIncoming = String(thread.last_message.user_id) !== String(this.igUserId);
          await supabaseAdmin
            .from('instagram_messages')
            .upsert({
              conversation_id: thread.thread_id,
              external_message_id: thread.last_message.id,
              sender_id: String(thread.last_message.user_id),
              message: thread.last_message.text || '',
              media_type: thread.last_message.item_type || 'text',
              is_incoming: isIncoming,
              timestamp: new Date(thread.last_message.timestamp).toISOString(),
              created_at: new Date().toISOString()
            }, {
              onConflict: 'external_message_id'
            });
        }
      } catch (e) {
        P.warn(`⚠️ Error sincronizando thread: ${e.message}`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// FUNCIONES EXPORTADAS (misma interfaz que el servicio anterior)
// ═══════════════════════════════════════════════════════════

/**
 * Obtener o crear sesión de Instagram para un usuario
 */
export async function getOrCreateIGSession(userId) {
  P.info(`🔍 getOrCreateIGSession llamado para userId: ${userId}`);

  if (igSessions.has(userId)) {
    const existing = igSessions.get(userId);
    if (existing.connected) {
      P.info(`   ✅ Retornando sesión existente conectada`);
      return existing;
    }

    // Intentar recargar credenciales
    const loaded = await existing.loadCredentials();
    if (loaded) {
      P.info(`   ✅ Credenciales recargadas exitosamente`);
      return existing;
    }
  }

  // Crear nueva sesión
  const service = new InstagramGraphService(userId);

  // Cargar ambas sesiones (Graph API + Private API)
  const [graphLoaded, privateLoaded] = await Promise.all([
    service.loadCredentials(),
    service.privateClient.restoreSession()
  ]);

  igSessions.set(userId, service);

  if (graphLoaded && privateLoaded) {
    P.info(`✅ Sesión HÍBRIDA completa para usuario ${userId}`);
  } else if (graphLoaded) {
    P.info(`✅ Sesión Graph API conectada para usuario ${userId}`);
  } else if (privateLoaded) {
    P.info(`✅ Sesión Private API conectada para usuario ${userId}`);
  } else {
    P.info(`ℹ️ Sesión creada sin conexiones activas para usuario ${userId}`);
  }

  return service;
}

/**
 * Restaurar sesiones al iniciar el servidor
 */
export async function restoreAllSavedSessions() {
  try {
    P.info(`🔄 Restaurando sesiones de Instagram desde Supabase...`);

    const { data: accounts, error } = await supabaseAdmin
      .from('instagram_official_accounts')
      .select('user_id, instagram_username, token_expires_at');

    if (error) {
      P.error(`❌ Error consultando cuentas: ${error.message}`);
      return;
    }

    if (!accounts || accounts.length === 0) {
      P.info(`ℹ️ No hay cuentas de Instagram conectadas`);
      return;
    }

    P.info(`📁 Encontradas ${accounts.length} cuenta(s) conectada(s)`);

    let restoredCount = 0;
    for (const account of accounts) {
      try {
        // Verificar que el token no haya expirado
        if (account.token_expires_at) {
          const expiresAt = new Date(account.token_expires_at);
          if (expiresAt < new Date()) {
            P.warn(`⚠️ Token expirado para usuario ${account.user_id} (@${account.instagram_username})`);
            continue;
          }
        }

        if (!igSessions.has(account.user_id)) {
          const service = new InstagramGraphService(account.user_id);

          // Cargar credenciales Graph API
          const loaded = await service.loadCredentials();

          // Restaurar sesión Private API si existe
          const privateLoaded = await service.privateClient.restoreSession();

          if (loaded || privateLoaded) {
            igSessions.set(account.user_id, service);
            restoredCount++;
            const type = loaded && privateLoaded ? 'HÍBRIDA' : (loaded ? 'GRAPH' : 'PRIVATE');
            P.info(`✅ Sesión ${type} restaurada para @${account.instagram_username || service.privateClient.username}`);
          }
        }
      } catch (err) {
        P.warn(`⚠️ Error restaurando sesión de ${account.user_id}: ${err.message}`);
      }
    }

    P.info(`✅ ${restoredCount} sesión(es) restaurada(s) exitosamente`);
  } catch (err) {
    P.error(`❌ Error en restoreAllSavedSessions: ${err.message}`);
  }
}

/**
 * Eliminar sesión de Instagram
 */
export function removeIGSession(userId) {
  if (igSessions.has(userId)) {
    igSessions.delete(userId);
    P.info(`🗑️ Sesión de Instagram eliminada para usuario ${userId}`);
  }
}

// ═══════════════════════════════════════════════════════════
// FUNCIONES WRAPPER (compatibilidad con código existente)
// ═══════════════════════════════════════════════════════════

/**
 * Sincronizar inbox
 */
export async function igSyncInbox(userId = null) {
  try {
    let session = null;

    if (userId) {
      session = await getOrCreateIGSession(userId);
    } else {
      for (const [, userSession] of igSessions) {
        if (userSession.connected) {
          session = userSession;
          break;
        }
      }
    }

    if (!session || !session.connected) {
      return {
        success: false,
        error: 'No hay cuenta de Instagram conectada.',
        data: []
      };
    }

    const threads = await session.fetchInboxOnce();
    return { success: true, data: threads };
  } catch (error) {
    P.error(`❌ Error en igSyncInbox: ${error.message}`);
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Obtener comentarios de un post
 */
export async function igGetCommentsFromPost(postUrl, limit = 50, userId = null) {
  try {
    let session = null;

    if (userId) {
      session = await getOrCreateIGSession(userId);
    } else {
      for (const [, userSession] of igSessions) {
        if (userSession.connected) {
          session = userSession;
          break;
        }
      }
    }

    if (!session || !session.connected) {
      return {
        success: false,
        error: 'No hay cuenta de Instagram conectada.',
        comments: [],
        count: 0
      };
    }

    return await session.getCommentsFromPost(postUrl, limit);
  } catch (error) {
    P.error(`❌ Error en igGetCommentsFromPost: ${error.message}`);
    return { success: false, error: error.message, comments: [], count: 0 };
  }
}

/**
 * Obtener comentarios recientes
 */
export async function igGetComments(limit = 20, userId = null) {
  try {
    let session = null;

    if (userId) {
      session = await getOrCreateIGSession(userId);
    } else {
      for (const [, userSession] of igSessions) {
        if (userSession.connected) {
          session = userSession;
          break;
        }
      }
    }

    if (!session || !session.connected) {
      return {
        success: false,
        error: 'No hay cuenta de Instagram conectada.',
        comments: [],
        count: 0
      };
    }

    return await session.getRecentComments(limit);
  } catch (error) {
    P.error(`❌ Error en igGetComments: ${error.message}`);
    return { success: false, error: error.message, comments: [], count: 0 };
  }
}

/**
 * Enviar mensaje directo
 */
export async function igSendMessage(recipientId, message, userId = null) {
  try {
    let session = null;

    if (userId) {
      session = await getOrCreateIGSession(userId);
    } else {
      for (const [uid, userSession] of igSessions) {
        if (userSession.connected) {
          session = userSession;
          P.info(`⚠️ Usando sesión de usuario ${uid} (no se proporcionó userId)`);
          break;
        }
      }
    }

    if (!session || !session.connected) {
      return {
        success: false,
        error: 'No hay cuenta de Instagram conectada.',
        data: null
      };
    }

    P.info(`📤 Enviando mensaje a ${recipientId} desde @${session.username}: "${message.substring(0, 50)}..."`);
    const result = await session.sendText({ recipientId, text: message });

    return {
      success: true,
      data: result,
      message: 'Mensaje enviado exitosamente'
    };
  } catch (error) {
    P.error(`❌ Error enviando mensaje: ${error.message}`);
    return { success: false, error: error.message, data: null };
  }
}

/**
 * Obtener historial de un thread
 */
export async function igGetThreadHistory(threadId, limit = 20, userId = null) {
  try {
    let session = null;

    if (userId) {
      session = await getOrCreateIGSession(userId);
    } else {
      for (const [, userSession] of igSessions) {
        if (userSession.connected) {
          session = userSession;
          break;
        }
      }
    }

    if (!session || !session.connected) {
      return {
        success: false,
        error: 'No hay cuenta de Instagram conectada.',
        messages: [],
        count: 0
      };
    }

    return await session.getThreadHistory(threadId, limit);
  } catch (error) {
    P.error(`❌ Error en igGetThreadHistory: ${error.message}`);
    return { success: false, error: error.message, messages: [], count: 0 };
  }
}

// ═══════════════════════════════════════════════════════════
// FUNCIONES WRAPPER — Private API (extracción de datos)
// ═══════════════════════════════════════════════════════════

/**
 * Login con Private API (para funcionalidades de extracción)
 */
export async function igPrivateLogin(username, password, userId) {
  try {
    const session = await getOrCreateIGSession(userId);
    const result = await session.privateClient.login(username, password);

    if (result.success) {
      emitToUserIG(userId, 'instagram:private-status', {
        connected: true,
        username,
        message: 'Cuenta privada conectada para extracción de datos'
      });
    }

    return result;
  } catch (error) {
    P.error(`❌ Error en igPrivateLogin: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Completar 2FA de Private API
 */
export async function igPrivateComplete2FA(code, userId) {
  try {
    const session = await getOrCreateIGSession(userId);
    return await session.privateClient.complete2FA(code);
  } catch (error) {
    P.error(`❌ Error en igPrivateComplete2FA: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener seguidores de un usuario (Private API)
 */
export async function igGetFollowers(username, limit = 100, userId = null) {
  try {
    const session = await _getConnectedSession(userId);
    if (!session) return { success: false, error: 'No hay sesión activa', followers: [] };

    if (!session.privateClient.logged) {
      return { success: false, error: 'Private API no conectada. Inicia sesión con usuario/contraseña.', followers: [] };
    }

    return await session.privateClient.getFollowers(username, limit);
  } catch (error) {
    P.error(`❌ Error en igGetFollowers: ${error.message}`);
    return { success: false, error: error.message, followers: [] };
  }
}

/**
 * Obtener likers de un post (Private API)
 */
export async function igGetLikesFromPost(postUrl, limit = 100, userId = null) {
  try {
    const session = await _getConnectedSession(userId);
    if (!session) return { success: false, error: 'No hay sesión activa', likes: [] };

    if (!session.privateClient.logged) {
      return { success: false, error: 'Private API no conectada. Inicia sesión con usuario/contraseña.', likes: [] };
    }

    return await session.privateClient.getLikesFromPost(postUrl, limit);
  } catch (error) {
    P.error(`❌ Error en igGetLikesFromPost: ${error.message}`);
    return { success: false, error: error.message, likes: [] };
  }
}

/**
 * Buscar usuarios (Private API)
 */
export async function igSearchUsers(query, limit = 10, userId = null) {
  try {
    const session = await _getConnectedSession(userId);
    if (!session) return { success: false, error: 'No hay sesión activa', users: [] };

    if (!session.privateClient.logged) {
      return { success: false, error: 'Private API no conectada.', users: [] };
    }

    return await session.privateClient.searchUsers(query, limit);
  } catch (error) {
    P.error(`❌ Error en igSearchUsers: ${error.message}`);
    return { success: false, error: error.message, users: [] };
  }
}

/**
 * Obtener info de un usuario (Private API)
 */
export async function igGetUserInfo(username, userId = null) {
  try {
    const session = await _getConnectedSession(userId);
    if (!session) return { success: false, error: 'No hay sesión activa' };

    if (!session.privateClient.logged) {
      return { success: false, error: 'Private API no conectada.' };
    }

    return await session.privateClient.getUserInfo(username);
  } catch (error) {
    P.error(`❌ Error en igGetUserInfo: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Enviar DM vía Private API (contacto inicial, sin ventana 24h)
 * Intenta primero Graph API; si falla por ventana, usa Private API como fallback
 */
export async function igSendInitialDM(recipientUsername, message, userId = null) {
  try {
    const session = await _getConnectedSession(userId);
    if (!session) return { success: false, error: 'No hay sesión activa' };

    // Intentar primero con Graph API
    if (session.connected) {
      try {
        const result = await session.sendText({ recipientId: recipientUsername, text: message });
        if (result) {
          return { success: true, via: 'graph_api', data: result };
        }
      } catch (graphError) {
        P.info(`ℹ️ Graph API no pudo enviar DM (posiblemente fuera de ventana 24h), intentando Private API...`);
      }
    }

    // Fallback a Private API
    if (session.privateClient.logged) {
      const result = await session.privateClient.sendDirectMessage(recipientUsername, message);
      if (result.success) {
        return { success: true, via: 'private_api', data: result.data };
      }
      return result;
    }

    return { success: false, error: 'Ninguna API disponible para enviar el mensaje. Conecta Private API para DMs iniciales.' };
  } catch (error) {
    P.error(`❌ Error en igSendInitialDM: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Logout de Private API
 */
export async function igPrivateLogout(userId) {
  try {
    const session = await getOrCreateIGSession(userId);
    return await session.privateClient.logout();
  } catch (error) {
    P.error(`❌ Error en igPrivateLogout: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener estado de ambas APIs
 */
export async function igGetHybridStatus(userId) {
  try {
    const session = await getOrCreateIGSession(userId);

    let graphStatus = { connected: false };
    if (session.connected) {
      graphStatus = await session.checkStatus();
    }

    return {
      graph_api: {
        connected: session.connected,
        username: session.username,
        ...graphStatus
      },
      private_api: {
        connected: session.privateClient.logged,
        username: session.privateClient.username
      }
    };
  } catch (error) {
    return {
      graph_api: { connected: false, error: error.message },
      private_api: { connected: false }
    };
  }
}

// Helper interno
async function _getConnectedSession(userId) {
  if (userId) {
    return await getOrCreateIGSession(userId);
  }
  for (const [, session] of igSessions) {
    if (session.connected || session.privateClient.logged) {
      return session;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

export { InstagramGraphService as InstagramService };
export default InstagramGraphService;
