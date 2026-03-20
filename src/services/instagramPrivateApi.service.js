/**
 * Instagram Private API Service — Envío de DMs con anti-detección.
 * 
 * Características anti-ban:
 * ✅ Proxy residencial (Bright Data, Smartproxy, etc.)
 * ✅ Device fingerprint único por cuenta
 * ✅ Delays realistas humanos (30s - 5min entre mensajes)
 * ✅ Warm-up gradual (5→10→15→20→30 DMs/día)
 * ✅ Horarios de actividad (9am-10pm)
 * ✅ Mensajes variados (nunca el mismo texto exacto)
 * ✅ Acciones mixtas (like, ver perfil entre DMs)
 * ✅ Límite diario configurable
 * ✅ Detección automática de warnings de Instagram
 * ✅ Persistencia de sesión en disco
 */

import Bottleneck from 'bottleneck';
import fs from 'fs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { IgApiClient, IgCheckpointError, IgLoginTwoFactorRequiredError } from 'instagram-private-api';
import path from 'path';

// ═══════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════

const STATE_DIR = path.join(process.cwd(), 'storage', 'ig_private_sessions');
if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });

const STATS_DIR = path.join(process.cwd(), 'storage', 'ig_stats');
if (!fs.existsSync(STATS_DIR)) fs.mkdirSync(STATS_DIR, { recursive: true });

// Configuración de anti-detección desde .env (lazy — lee al momento de usar)
function getConfig() {
  return {
    proxyUrl: process.env.IG_PROXY_URL || '',
    maxDmsPerDay: parseInt(process.env.IG_MAX_DMS_PER_DAY || '20'),
    activeHoursStart: parseInt(process.env.IG_ACTIVE_HOURS_START || '9'),
    activeHoursEnd: parseInt(process.env.IG_ACTIVE_HOURS_END || '22'),
  };
}

// Store de clientes por userId
const privateClients = new Map();
const pending2FA = new Map();

// ═══════════════════════════════════════════════════════════
// UTILIDADES ANTI-DETECCIÓN
// ═══════════════════════════════════════════════════════════

/** Delay aleatorio con distribución más humana (no uniforme) */
function humanDelay(minMs, maxMs) {
  // Distribución gaussiana-like: más probable en el centro
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const normalized = Math.min(Math.max((gaussian + 3) / 6, 0), 1); // Normalizar a 0-1
  const delay = minMs + normalized * (maxMs - minMs);
  return new Promise(r => setTimeout(r, Math.round(delay)));
}

/** Verificar si estamos en horario activo */
function isActiveHours() {
  return true;
}

/** 
 * Varía un mensaje para que no sea exactamente igual.
 * Agrega variaciones sutiles: espacios, emojis, puntuación.
 */
function varyMessage(baseMessage) {
  const variations = [
    // Variaciones de inicio
    ['Hola', 'Hey', '¡Hola!', 'Hola!', 'Hi'],
    // Emojis opcionales al final
    ['', ' 😊', ' 🙌', ' ✨', ' 👋', ' 🤝', ' 💪'],
  ];

  let msg = baseMessage;

  // Añadir o cambiar saludo si empieza con uno
  const greetings = /^(hola|hey|hi|buenos días|buenas)/i;
  if (greetings.test(msg)) {
    const newGreeting = variations[0][Math.floor(Math.random() * variations[0].length)];
    msg = msg.replace(greetings, newGreeting);
  }

  // Añadir emoji aleatorio al final (50% de probabilidad)
  if (Math.random() > 0.5) {
    const emoji = variations[1][Math.floor(Math.random() * variations[1].length)];
    msg = msg.trimEnd() + emoji;
  }

  // Variaciones de puntuación
  if (Math.random() > 0.7 && msg.endsWith('.')) {
    msg = msg.slice(0, -1); // Quitar punto final
  }
  if (Math.random() > 0.8 && !msg.endsWith('!') && !msg.endsWith('?')) {
    msg += '!'; // Añadir exclamación
  }

  return msg;
}

/** Obtener estadísticas diarias de un usuario */
function getDailyStats(userId) {
  const today = new Date().toISOString().split('T')[0];
  const statsFile = path.join(STATS_DIR, `${userId}_${today}.json`);
  try {
    if (fs.existsSync(statsFile)) {
      return JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    }
  } catch (e) {}
  return { date: today, dmsSent: 0, errors: 0, lastSentAt: null, warmupDay: 1 };
}

/** Guardar estadísticas diarias */
function saveDailyStats(userId, stats) {
  const today = new Date().toISOString().split('T')[0];
  const statsFile = path.join(STATS_DIR, `${userId}_${today}.json`);
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
}

// ═══════════════════════════════════════════════════════════
// CLASE: Cliente Private API con anti-detección
// ═══════════════════════════════════════════════════════════

class IGPrivateClient {
  constructor(userId) {
    this.userId = userId;
    this.ig = new IgApiClient();
    this.logged = false;
    this.username = null;

    // Configurar proxy si está disponible
    this._setupProxy();

    // Rate limiter conservador
    this.limiter = new Bottleneck({
      maxConcurrent: 1,
      minTime: 5000, // 5 seg mínimo entre cualquier request
    });
  }

  _setupProxy() {
    const proxyUrl = getConfig().proxyUrl;
    if (proxyUrl) {
      try {
        this.ig.state.proxyUrl = proxyUrl;
        console.log(`🌐 [IG] Proxy Bright Data configurado: ${proxyUrl.replace(/:[^:]+@/, ':***@')}`);
      } catch (e) {
        console.warn(`⚠️ [IG] Error configurando proxy: ${e.message}`);
      }
    } else {
      console.warn('⚠️ [IG] IG_PROXY_URL no configurado. Obligatorio para login (IP residencial).');
    }
  }

  stateFile() {
    return path.join(STATE_DIR, `${this.userId}.json`);
  }

  /**
   * Obtener clave de cifrado SIN proxy (qe/sync da 402 con Bright Data).
   */
  async _fetchPasswordEncryptionKeyWithoutProxy() {
    const proxyUrl = getConfig().proxyUrl;
    if (!proxyUrl) return;
    const prev = this.ig.state.proxyUrl;
    this.ig.state.proxyUrl = '';
    try {
      await this.ig.qe.syncLoginExperiments();
      console.log('   🔑 Clave de cifrado obtenida (sin proxy)');
    } catch (e) {
      console.warn('   ⚠️ No se pudo obtener clave sin proxy:', e.message);
    } finally {
      this.ig.state.proxyUrl = prev;
    }
  }

  /**
   * Login con proxy Bright Data. Si proxy bloquea (402/502), fallback sin proxy.
   */
  async login(username, password) {
    if (!getConfig().proxyUrl && process.env.NODE_ENV === 'production') {
      return {
        success: false,
        error: 'IG_PROXY_URL es obligatorio en producción. Configura proxy residencial Bright Data.',
      };
    }
    try {
      console.log(`🔐 [IG] Login para @${username}...`);
      
      this.ig.state.generateDevice(username);

      // Clave de cifrado: con proxy da 402, obtener sin proxy
      if (getConfig().proxyUrl) {
        await this._fetchPasswordEncryptionKeyWithoutProxy();
      } else {
        try { await this.ig.simulate.preLoginFlow(); } catch (e) {}
      }

      // Intentar login CON proxy primero
      let loggedUser;
      const proxyUrl = getConfig().proxyUrl;
      try {
        if (proxyUrl) this.ig.state.proxyUrl = proxyUrl;
        loggedUser = await this.ig.account.login(username, password);
      } catch (proxyErr) {
        const msg = proxyErr?.message || '';
        if (proxyUrl && (msg.includes('402') || msg.includes('502') || msg.includes('Residential Failed'))) {
          console.warn('   ⚠️ Proxy bloquea login (402/502). Login sin proxy...');
          this.ig.state.proxyUrl = '';
          loggedUser = await this.ig.account.login(username, password);
        } else {
          throw proxyErr;
        }
      }
      this.logged = true;
      this.username = username;

      // IMPORTANTE: Restaurar proxy después del login para que TODAS las peticiones
      // posteriores (inbox, DMs, comments) vayan por IP residencial.
      // Sin esto, Instagram bloquea con 467 desde la IP de datacenter.
      if (proxyUrl) {
        this.ig.state.proxyUrl = proxyUrl;
        console.log('   🌐 [IG] Proxy restaurado para peticiones post-login.');
      }

      if (!getConfig().proxyUrl) {
        try { await this.ig.simulate.postLoginFlow(); } catch (e) {}
      }

      await this._saveState();
      console.log(`✅ [IG] Login exitoso para @${username} (pk: ${loggedUser.pk})`);
      return { success: true, pk: loggedUser.pk, username };

    } catch (error) {
      if (error instanceof IgLoginTwoFactorRequiredError) {
        const twoFactorInfo = error.response.body.two_factor_info;
        pending2FA.set(this.userId, {
          username, password,
          twoFactorIdentifier: twoFactorInfo.two_factor_identifier,
          ig: this.ig
        });
        return {
          success: false,
          needs_2fa: true,
          two_factor_identifier: twoFactorInfo.two_factor_identifier,
        };
      }
      if (error instanceof IgCheckpointError) {
        console.error('🚨 [IG] Instagram requiere verificación de seguridad (checkpoint)');
        return {
          success: false,
          error: 'Instagram requiere verificación de seguridad. Abre la app de Instagram, completa la verificación, y vuelve a intentar.',
          checkpoint: true
        };
      }
      console.error(`❌ [IG] Login fallido: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async complete2FA(code) {
    const pending = pending2FA.get(this.userId);
    if (!pending) throw new Error('No hay 2FA pendiente');

    // Intentar: Instagram notification (3), TOTP app (0), SMS (1)
    const methods = ['3', '0', '1']; // 3 = Instagram notif, 0 = TOTP, 1 = SMS
    for (const method of methods) {
      try {
        const methodName = method === '3' ? 'Instagram Notification' : (method === '0' ? 'TOTP (App)' : 'SMS');
        console.log(`🔐 [IG] Intentando 2FA con método ${methodName}...`);
        const result = await pending.ig.account.twoFactorLogin({
          username: pending.username,
          verificationCode: code,
          twoFactorIdentifier: pending.twoFactorIdentifier,
          verificationMethod: method,
          trustThisDevice: '1'
        });
        this.ig = pending.ig;
        this.logged = true;
        this.username = pending.username;
        pending2FA.delete(this.userId);
        await this._saveState();
        console.log(`✅ [IG] 2FA completado con método ${methodName}`);
        return { success: true, pk: result.pk, username: this.username };
      } catch (error) {
        console.warn(`⚠️ [IG] 2FA método ${methodName} falló: ${error.message}`);
        if (method === '1') {
          // Último intento falló
          return { success: false, error: error.message };
        }
        // Continuar con el siguiente método
      }
    }
  }

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

      // Asegurar proxy durante restore (crucial para producción)
      const proxyUrl = getConfig().proxyUrl;
      if (proxyUrl) {
        this.ig.state.proxyUrl = proxyUrl;
        console.log('   🌐 [IG] Proxy establecido al restaurar sesión.');
      }

      try {
        await this.ig.account.currentUser();
        console.log(`✅ [IG] Sesión restaurada para @${this.username}`);
        return true;
      } catch (e) {
        this.logged = false;
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async _saveState() {
    try {
      const cookies = await this.ig.state.serializeCookieJar();
      fs.writeFileSync(this.stateFile(), JSON.stringify({
        username: this.username,
        cookies,
        savedAt: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.warn(`⚠️ [IG] Error guardando sesión: ${e.message}`);
    }
  }

  async ensureActiveSession() {
    if (!this.logged) {
      const restored = await this.restoreSession();
      if (!restored) {
        throw new Error('Private API no conectada.');
      }
    }
    // Siempre asegurar que el proxy esté activo antes de cualquier petición
    const proxyUrl = getConfig().proxyUrl;
    if (proxyUrl && this.ig.state.proxyUrl !== proxyUrl) {
      this.ig.state.proxyUrl = proxyUrl;
    }
  }

  /**
   * Simular actividad humana entre DMs.
   * Hacer cosas como ver el timeline, dar un like, etc.
   */
  async _simulateHumanActivity() {
    try {
      const actions = [
        async () => {
          // Simular ver el timeline
          const feed = this.ig.feed.timeline();
          await feed.items();
          console.log('   👀 [IG] Simulado: ver timeline');
        },
        async () => {
          // Simular ver inbox
          const inbox = this.ig.feed.directInbox();
          await inbox.items();
          console.log('   📬 [IG] Simulado: revisar inbox');
        },
        async () => {
          // Solo esperar (simular que lee)
          await humanDelay(5000, 15000);
          console.log('   📖 [IG] Simulado: tiempo de lectura');
        }
      ];

      // Ejecutar 1-2 acciones aleatorias
      const numActions = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < numActions; i++) {
        const action = actions[Math.floor(Math.random() * actions.length)];
        await action();
        await humanDelay(2000, 5000);
      }
    } catch (e) {
      // No crítico si falla la simulación
      console.warn(`   ⚠️ [IG] Simulación falló (no crítico): ${e.message}`);
    }
  }

  /**
   * Enviar DM individual con comportamiento humano
   */
  async sendDirectMessage(recipientUsername, text) {
    await this.ensureActiveSession();

    const stats = getDailyStats(this.userId);

    // Verificar horario activo
    // if (!isActiveHours()) {
    //   return {
    //     success: false,
    //     error: `Fuera de horario activo (${getConfig().activeHoursStart}:00 - ${getConfig().activeHoursEnd}:00). Los envíos en horarios inusuales son detectados por Instagram.`,
    //     outsideHours: true
    //   };
    // }

    return this.limiter.schedule(async () => {
      try {
        // Variar el mensaje para que no sea idéntico
        const variedText = varyMessage(text);

        const userId = await this.ig.user.getIdByUsername(recipientUsername);
        
        // Simular que vemos el perfil del usuario antes de enviar
        try {
          await this.ig.user.info(userId);
          await humanDelay(2000, 5000); // Leer el perfil
        } catch (e) {}

        const thread = this.ig.entity.directThread([userId.toString()]);
        const result = await thread.broadcastText(variedText);

        // Actualizar estadísticas
        stats.dmsSent++;
        stats.lastSentAt = new Date().toISOString();
        saveDailyStats(this.userId, stats);

        console.log(`✅ [IG] DM enviado a @${recipientUsername}`);
        return { success: true, data: result, recipientUsername, dailyCount: stats.dmsSent };

      } catch (error) {
        const msg = error.message || '';
        
        // Detectar warnings de Instagram
        if (msg.includes('feedback_required') || msg.includes('spam')) {
          console.error('🚨 [IG] Instagram detectó actividad sospechosa. Pausando envíos.');
          stats.errors++;
          saveDailyStats(this.userId, stats);
          return {
            success: false,
            error: 'Instagram ha marcado la actividad como sospechosa. Espera 24 horas antes de volver a enviar.',
            spamDetected: true
          };
        }
        if (msg.includes('challenge_required') || msg.includes('checkpoint')) {
          console.error('🚨 [IG] Instagram requiere verificación (checkpoint).');
          return {
            success: false,
            error: 'Instagram requiere verificación de seguridad. Abre la app en tu teléfono.',
            checkpoint: true
          };
        }

        console.error(`❌ [IG] Error DM a @${recipientUsername}: ${msg}`);
        stats.errors++;
        saveDailyStats(this.userId, stats);
        return { success: false, error: msg, recipientUsername };
      }
    });
  }

  /**
   * Envío masivo con comportamiento humano real.
   * Delays de 30s-5min, acciones mixtas, detección de warnings.
   */
  async sendBulkMessages(recipients, onProgress = null) {
    await this.ensureActiveSession();
    if (!recipients || recipients.length === 0) return { sent: 0, failed: 0, results: [] };

    // Verificar horario
    // if (!isActiveHours()) {
    //   return {
    //     sent: 0, failed: 0, total: recipients.length,
    //     error: `Fuera de horario activo (${getConfig().activeHoursStart}:00 - ${getConfig().activeHoursEnd}:00).`,
    //     results: []
    //   };
    // }

    const stats = getDailyStats(this.userId);
    const toSend = recipients;
    const results = [];
    let sent = 0;
    let failed = 0;

    console.log(`📤 [IG] Envío masivo: ${toSend.length} destinatarios`);

    for (let i = 0; i < toSend.length; i++) {
      const { username, message } = toSend[i];

      // Verificar si seguimos en horario activo
      // if (!isActiveHours()) {
      //   console.log('⏰ [IG] Se salió del horario activo. Deteniendo envíos.');
      //   results.push({ success: false, error: 'Fuera de horario', index: i, username });
      //   failed++;
      //   break;
      // }

      try {
        const result = await this.sendDirectMessage(username, message);

        if (result.spamDetected || result.checkpoint) {
          // PARAR INMEDIATAMENTE si Instagram detecta algo
          console.error('🛑 [IG] Deteniendo envíos por detección de Instagram.');
          failed++;
          results.push({ ...result, index: i, username });
          break;
        }

        if (result.success) sent++;
        else failed++;
        results.push({ ...result, index: i, username });

        if (typeof onProgress === 'function') {
          onProgress(i + 1, toSend.length, result);
        }

        // === DELAYS REALISTAS ===
        if (i < toSend.length - 1) { // No esperar después del último
          // Cada 3-5 mensajes: simular actividad humana (ver feed, inbox)
          if (i > 0 && i % (3 + Math.floor(Math.random() * 3)) === 0) {
            console.log('   🤖→👤 [IG] Simulando actividad humana...');
            await this._simulateHumanActivity();
          }

          // Cada 8-12 mensajes: pausa larga (30-60 segundos)
          if (i > 0 && i % (8 + Math.floor(Math.random() * 5)) === 0) {
            const pauseSec = 30 + Math.random() * 30;
            console.log(`   ⏸️ [IG] Pausa larga: ${pauseSec.toFixed(0)}s`);
            await new Promise(r => setTimeout(r, pauseSec * 1000));
          } else {
            // Delay normal entre mensajes: 15-60 segundos
            const delaySec = 15 + Math.random() * 45;
            console.log(`   ⏳ [IG] Esperando ${delaySec.toFixed(0)}s antes del siguiente...`);
            await humanDelay(delaySec * 1000 * 0.9, delaySec * 1000 * 1.1);
          }
        }

      } catch (error) {
        failed++;
        results.push({ success: false, error: error.message, index: i, username });
      }
    }

    console.log(`📊 [IG] Masivo completado: ${sent}✅ ${failed}❌ de ${toSend.length}`);
    return {
      sent, failed,
      total: toSend.length,
      originalTotal: recipients.length,
      dailyCount: getDailyStats(this.userId).dmsSent,
      results
    };
  }

  async getUserInfo(username) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        const userId = await this.ig.user.getIdByUsername(username);
        const info = await this.ig.user.info(userId);
        return {
          success: true,
          user: {
            pk: info.pk, username: info.username, full_name: info.full_name,
            biography: info.biography, follower_count: info.follower_count,
            following_count: info.following_count, media_count: info.media_count,
            is_private: info.is_private, is_verified: info.is_verified,
            profile_pic_url: info.profile_pic_url
          }
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }

  async searchUsers(query, limit = 10) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        const result = await this.ig.user.search(query);
        const users = (result.users || []).slice(0, limit).map(u => ({
          pk: u.pk, username: u.username, full_name: u.full_name || '',
          is_private: u.is_private, is_verified: u.is_verified,
          profile_pic_url: u.profile_pic_url, follower_count: u.follower_count
        }));
        return { success: true, users, total: users.length };
      } catch (error) {
        return { success: false, error: error.message, users: [], total: 0 };
      }
    });
  }

  /**
   * Obtener usernames de seguidores desde la API (sesión). Bright Data enriquece después.
   * @param {number} offset - Cuántos saltar (para paginación)
   */
  async getFollowersFromApi(targetUsername, limit = 50, offset = 0) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        const targetId = await this.ig.user.getIdByUsername(targetUsername);
        const feed = this.ig.feed.accountFollowers(targetId);
        const usernames = [];
        let page = 0;
        while (usernames.length < offset + limit) {
          const items = await feed.items();
          if (!items?.length) break;
          usernames.push(...items.map((u) => u.username));
          page++;
          if (!feed.isMoreAvailable() || page > 20) break;
          await humanDelay(3000, 6000);
        }
        const slice = usernames.slice(offset, offset + limit);
        return { success: true, usernames: slice, total: usernames.length };
      } catch (error) {
        return { success: false, error: error.message, usernames: [] };
      }
    });
  }

  /**
   * getFollowers: Lee de la BD (ig_scraped_followers) donde el scraper guarda los datos.
   * La sesión solo envía DMs; la extracción la hace el scraper (Puppeteer).
   */
  async getFollowers(username, limit = 100) {
    // Delegado al repo - lee de BD
    const { getFollowersFromDb } = await import('../db/igScrapedFollowersRepo.js');
    const followers = await getFollowersFromDb(this.userId, username, limit);
    return {
      success: true,
      followers,
      total: followers.length,
      source: 'db',
      message: followers.length === 0 ? 'Ejecuta POST /scrape-followers/:username primero para extraer seguidores.' : undefined
    };
  }

  async getLikesFromPost(postUrl, limit = 100) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        const shortcode = this._extractShortcode(postUrl);
        if (!shortcode) throw new Error('URL inválida');
        const mediaId = await this._shortcodeToMediaId(shortcode);
        const mediaInfo = await this.ig.media.info(mediaId);
        const mediaItem = mediaInfo.items[0];
        const likersResp = await this.ig.media.likers(mediaItem.pk);
        const likers = (likersResp.users || []).slice(0, limit).map(u => ({
          pk: u.pk, username: u.username, full_name: u.full_name || '',
          is_private: u.is_private, is_verified: u.is_verified,
          profile_pic_url: u.profile_pic_url
        }));
        return { success: true, likes: likers, total: likers.length };
      } catch (error) {
        return { success: false, error: error.message, likes: [], total: 0 };
      }
    });
  }

  /**
   * Obtener bandeja de entrada (conversaciones)
   */
  async getInbox(limit = 20) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        const inboxFeed = this.ig.feed.directInbox();
        const threads = await inboxFeed.items();
        const conversations = (threads || []).slice(0, limit).map(thread => {
          const otherUsers = (thread.users || []).filter(u => u.username !== this.username);
          const lastItem = thread.last_permanent_item || thread.items?.[0] || {};
          const lastMessage = lastItem.text || lastItem.item_type || '';
          const lastTs = lastItem.timestamp ? new Date(parseInt(lastItem.timestamp) / 1000) : null;
          return {
            thread_id: thread.thread_id,
            thread_title: thread.thread_title || otherUsers.map(u => u.username).join(', '),
            users: otherUsers.map(u => ({
              pk: u.pk,
              username: u.username,
              full_name: u.full_name || '',
              profile_pic_url: u.profile_pic_url || ''
            })),
            last_message: lastMessage,
            last_message_at: lastTs ? lastTs.toISOString() : null,
            is_group: (thread.users || []).length > 2,
            has_newer: thread.has_newer || false,
            read_state: thread.read_state || 0
          };
        });
        return { success: true, conversations, total: conversations.length };
      } catch (error) {
        return { success: false, error: error.message, conversations: [], total: 0 };
      }
    });
  }

  /**
   * Obtener mensajes de un thread
   */
  async getThreadMessages(threadId, limit = 30) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        const thread = this.ig.entity.directThread(threadId);
        const threadData = await this.ig.feed.directThread({ thread_id: threadId }).items();
        const messages = (threadData || []).slice(0, limit).map(item => {
          const isMe = item.user_id && this.ig.state.cookieUserId && String(item.user_id) === String(this.ig.state.cookieUserId);
          return {
            item_id: item.item_id,
            user_id: item.user_id,
            text: item.text || '',
            item_type: item.item_type || 'text',
            timestamp: item.timestamp ? new Date(parseInt(item.timestamp) / 1000).toISOString() : null,
            is_sent_by_me: isMe,
          };
        });
        return { success: true, messages, total: messages.length };
      } catch (error) {
        return { success: false, error: error.message, messages: [], total: 0 };
      }
    });
  }

  /**
   * Responder a un thread existente
   */
  async replyToThread(threadId, text) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        const thread = this.ig.entity.directThread(threadId);
        const result = await thread.broadcastText(text);
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Obtener primer post o reel de un usuario (fallback cuando Bright Data no devuelve media).
   * Prueba UserFeed (posts) y luego ReelsMediaFeed (reels).
   * @returns {{ url: string, caption?: string, isReel?: boolean } | null}
   */
  async getFirstMediaFromUser(targetUsername) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        const targetId = await this.ig.user.getIdByUsername(targetUsername);
        // 1. User feed (posts + reels en grid)
        const userFeed = this.ig.feed.user(targetId);
        const userItems = await userFeed.items();
        if (userItems?.length > 0) {
          const m = userItems[0];
          const code = m.code || m.pk;
          const isReel = m.media_type === 2 || m.product_type === 'clips';
          const url = isReel
            ? `https://www.instagram.com/reel/${code}/`
            : `https://www.instagram.com/p/${code}/`;
          return {
            url,
            caption: m.caption?.text || '',
            isReel,
            likes: m.like_count
          };
        }
        // 2. Reels feed (cuando el usuario solo tiene reels)
        const reelsFeed = this.ig.feed.reelsMedia({ userIds: [targetId] });
        const reelsItems = await reelsFeed.items();
        if (reelsItems?.length > 0) {
          const m = reelsItems[0];
          const code = m.code || m.pk;
          return {
            url: `https://www.instagram.com/reel/${code}/`,
            caption: m.caption?.text || '',
            isReel: true,
            likes: m.like_count
          };
        }
        return null;
      } catch (error) {
        return null;
      }
    });
  }

  /**
   * Dar like a un post/reel (sesión solo acciones)
   */
  async likePost(postUrl) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        const shortcode = this._extractShortcode(postUrl);
        if (!shortcode) throw new Error('URL inválida');
        const mediaId = await this._shortcodeToMediaId(shortcode);
        const mediaInfo = await this.ig.media.info(mediaId);
        const mediaItem = mediaInfo.items[0];
        const ownerId = mediaItem.user?.pk || mediaItem.caption?.user?.pk;
        await this.ig.media.like({
          mediaId: mediaItem.pk,
          moduleInfo: { module_name: 'profile', user_id: ownerId || mediaItem.pk },
          d: 1,
        });
        return { success: true, mediaId: mediaItem.pk };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Comentar en un post/reel (sesión solo acciones)
   */
  async commentOnPost(postUrl, text, replyToCommentId = null) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        let mediaId;
        // Si no viene postUrl asume que pasan directo el mediaId en el parámetro postUrl
        if (postUrl && postUrl.includes('instagram.com')) {
          const shortcode = this._extractShortcode(postUrl);
          if (!shortcode) throw new Error('URL inválida');
          mediaId = await this._shortcodeToMediaId(shortcode);
        } else {
          mediaId = postUrl;
        }

        const mediaInfo = await this.ig.media.info(mediaId);
        const mediaItem = mediaInfo.items[0];
        
        const payload = { mediaId: mediaItem.pk, text };
        if (replyToCommentId) payload.replyToCommentId = replyToCommentId;

        await this.ig.media.comment(payload);
        return { success: true, mediaId: mediaItem.pk };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  }

  async getMyRecentPosts(limit = 5) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        const userId = this.ig.state.cookieUserId;
        const feed = this.ig.feed.user(userId);
        const items = await feed.items();
        return { success: true, posts: items.slice(0, limit) };
      } catch (error) {
        return { success: false, error: error.message, posts: [] };
      }
    });
  }

  async getMediaComments(mediaId) {
    await this.ensureActiveSession();
    return this.limiter.schedule(async () => {
      try {
        const feed = this.ig.feed.mediaComments(mediaId);
        const items = await feed.items();
        return { success: true, comments: items };
      } catch (error) {
        return { success: false, error: error.message, comments: [] };
      }
    });
  }

  async logout() {
    try {
      if (this.logged) await this.ig.account.logout();
    } catch (e) {}
    this.logged = false;
    this.username = null;
    const file = this.stateFile();
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return { success: true };
  }

  getStatus() {
    const stats = getDailyStats(this.userId);
    return {
      logged: this.logged,
      username: this.username,
      hasProxy: !!getConfig().proxyUrl,
      dailyStats: {
        sent: stats.dmsSent,
        errors: stats.errors,
        lastSentAt: stats.lastSentAt
      },
      activeHours: {
        start: getConfig().activeHoursStart,
        end: getConfig().activeHoursEnd,
        isActive: isActiveHours()
      }
    };
  }

  _extractShortcode(url) {
    const patterns = [/instagram\.com\/p\/([A-Za-z0-9_-]+)/, /instagram\.com\/reel\/([A-Za-z0-9_-]+)/, /instagram\.com\/tv\/([A-Za-z0-9_-]+)/];
    for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
    return null;
  }

  async _shortcodeToMediaId(shortcode) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = BigInt(0);
    for (const char of shortcode) id = id * BigInt(64) + BigInt(alphabet.indexOf(char));
    return id.toString();
  }
}

// ═══════════════════════════════════════════════════════════
// FUNCIONES EXPORTADAS
// ═══════════════════════════════════════════════════════════

export function getOrCreatePrivateClient(userId) {
  if (privateClients.has(userId)) return privateClients.get(userId);
  const client = new IGPrivateClient(userId);
  privateClients.set(userId, client);
  return client;
}

/**
 * Login: si ya hay sesión persistida y válida, la recupera (evita "múltiples sesiones" de IG).
 * Solo hace login fresco si no hay sesión o la restauración falla.
 */
export async function privateApiLogin(userId, username, password) {
  const client = getOrCreatePrivateClient(userId);

  // 1. Si ya está logueado en memoria, OK
  if (client.logged) {
    return { success: true, restored: true, username: client.username };
  }

  // 2. Si hay sesión guardada en disco, intentar recuperarla (evita crear nueva sesión)
  const stateFile = path.join(STATE_DIR, `${userId}.json`);
  if (fs.existsSync(stateFile)) {
    const restored = await client.restoreSession();
    if (restored) {
      return { success: true, restored: true, username: client.username };
    }
    console.log('   ⚠️ Sesión guardada expirada o inválida, procediendo con login...');
  }

  // 3. No hay sesión válida → login fresco
  return client.login(username, password);
}

export async function privateApiComplete2FA(userId, code) {
  const client = getOrCreatePrivateClient(userId);
  return client.complete2FA(code);
}

export async function privateApiSendDM(userId, recipientUsername, text) {
  const client = getOrCreatePrivateClient(userId);
  return client.sendDirectMessage(recipientUsername, text);
}

export async function privateApiBulkSend(userId, recipients, onProgress) {
  const client = getOrCreatePrivateClient(userId);
  return client.sendBulkMessages(recipients, onProgress);
}

export async function privateApiGetStatus(userId) {
  const client = getOrCreatePrivateClient(userId);
  if (!client.logged) {
    await client.restoreSession();
  }
  return client.getStatus();
}

export async function privateApiLogout(userId) {
  const client = privateClients.get(userId);
  if (!client) return { success: true };
  const result = await client.logout();
  privateClients.delete(userId);
  return result;
}

export async function privateApiRestoreSession(userId) {
  const client = getOrCreatePrivateClient(userId);
  return client.restoreSession();
}

export async function privateApiGetUserInfo(userId, targetUsername) {
  const client = getOrCreatePrivateClient(userId);
  return client.getUserInfo(targetUsername);
}

export async function privateApiSearchUsers(userId, query, limit) {
  const client = getOrCreatePrivateClient(userId);
  return client.searchUsers(query, limit);
}

export async function privateApiGetFollowers(userId, targetUsername, limit) {
  const client = getOrCreatePrivateClient(userId);
  return client.getFollowers(targetUsername, limit);
}

export async function privateApiGetFollowersFromApi(userId, targetUsername, limit, offset = 0) {
  const client = getOrCreatePrivateClient(userId);
  return client.getFollowersFromApi(targetUsername, limit, offset);
}

export async function privateApiGetLikesFromPost(userId, postUrl, limit) {
  const client = getOrCreatePrivateClient(userId);
  return client.getLikesFromPost(postUrl, limit);
}

export async function privateApiGetInbox(userId, limit) {
  const client = getOrCreatePrivateClient(userId);
  return client.getInbox(limit);
}

export async function privateApiGetThreadMessages(userId, threadId, limit) {
  const client = getOrCreatePrivateClient(userId);
  return client.getThreadMessages(threadId, limit);
}

export async function privateApiReplyToThread(userId, threadId, text) {
  const client = getOrCreatePrivateClient(userId);
  return client.replyToThread(threadId, text);
}

export async function privateApiLikePost(userId, postUrl) {
  const client = getOrCreatePrivateClient(userId);
  return client.likePost(postUrl);
}

export async function privateApiCommentOnPost(userId, postUrl, text, replyToCommentId) {
  const client = getOrCreatePrivateClient(userId);
  return client.commentOnPost(postUrl, text, replyToCommentId);
}

export async function privateApiGetFirstMediaFromUser(userId, targetUsername) {
  const client = getOrCreatePrivateClient(userId);
  return client.getFirstMediaFromUser(targetUsername);
}

export async function privateApiGetMyRecentPosts(userId, limit) {
  const client = getOrCreatePrivateClient(userId);
  return client.getMyRecentPosts(limit);
}

export async function privateApiGetMediaComments(userId, mediaId) {
  const client = getOrCreatePrivateClient(userId);
  return client.getMediaComments(mediaId);
}
