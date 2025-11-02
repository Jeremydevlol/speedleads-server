import Bottleneck from 'bottleneck';
import fs from 'fs';
import { IgApiClient } from 'instagram-private-api';
import path, { dirname } from 'path';
import pino from 'pino';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const P = pino({ name: 'instagram', level: 'info' });

const STATE_DIR = path.join(process.cwd(), 'storage', 'ig_state');
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

// Store de sesiones de Instagram por usuario
export const igSessions = new Map();
const initializing = new Map();

// Variable global para Socket.IO
let globalIO = null;

// Configurar Socket.IO desde app.js
export function configureIGIO(io) {
  globalIO = io;
  P.info('Socket.IO configurado para Instagram');
}

// Emitir eventos a usuario específico
export function emitToUserIG(userId, event, data) {
  if (globalIO) {
    globalIO.to(userId).emit(event, data);
    P.info(`📡 Evento Instagram emitido a usuario ${userId}: ${event}`);
  } else {
    P.warn('⚠️ globalIO no configurado para Instagram');
  }
}

class InstagramService {
  constructor(userId) {
    this.userId = userId;
    this.ig = new IgApiClient();
    this.logged = false;
    this.igUserId = null;
    this.username = null;
    this.pendingChallenge = null; // Para manejar challenges pendientes

    // Rate limiter: máx 1 acción cada 1.5 segundos
    this.limiter = new Bottleneck({
      minTime: 1500, // 1.5s entre acciones
      reservoir: 40, // máx 40 acciones rápidas
      reservoirRefreshAmount: 40,
      reservoirRefreshInterval: 60 * 1000 // cada minuto
    });

    P.info(`InstagramService creado para usuario ${userId}`);
  }

  stateFile() {
    return path.join(STATE_DIR, `${this.userId}.json`);
  }
  
  /**
   * Guardar sesión en archivo (incluyendo processedMessages y processedComments)
   */
  async saveSession() {
    try {
      const file = this.stateFile();
      
      if (!this.logged || !this.username) {
        return; // No guardar si no hay sesión activa
      }
      
      const cookieJar = await this.ig.state.serializeCookieJar();
      
      // Convertir Sets a Arrays para poder guardarlos en JSON
      const processedMessagesArray = this.processedMessages ? Array.from(this.processedMessages) : [];
      const processedCommentsArray = this.processedComments ? Array.from(this.processedComments) : [];
      
      fs.writeFileSync(file, JSON.stringify({ 
        cookieJar,
        username: this.username,
        igUserId: this.igUserId,
        savedAt: new Date().toISOString(),
        processedMessages: processedMessagesArray,
        processedComments: processedCommentsArray
      }), 'utf8');
      
      P.info(`💾 Sesión guardada (${processedMessagesArray.length} mensajes, ${processedCommentsArray.length} comentarios procesados)`);
    } catch (error) {
      P.warn(`⚠️ Error guardando sesión: ${error.message}`);
    }
  }

  /**
   * Login a Instagram con usuario/contraseña
   * Restaura sesión desde archivo si existe
   */
  async login({ username, password, proxy }) {
    try {
      P.info(`Intentando login de Instagram para ${username}`);
      
      this.username = username;
      this.ig.state.generateDevice(username);
      
      if (proxy) {
        this.ig.state.proxyUrl = proxy;
        P.info(`Usando proxy: ${proxy}`);
      }

      const file = this.stateFile();
      
      // Intentar restaurar sesión existente
      if (fs.existsSync(file)) {
        try {
          const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
          await this.ig.state.deserializeCookieJar(saved.cookieJar);
          
          // Verificar que la sesión sigue válida
          const user = await this.ig.account.currentUser();
          this.igUserId = user.pk;
          this.logged = true;
          
          // Restaurar processedMessages y processedComments desde archivo
          if (saved.processedMessages && Array.isArray(saved.processedMessages)) {
            this.processedMessages = new Set(saved.processedMessages);
            P.info(`✅ Restaurados ${this.processedMessages.size} mensajes procesados desde archivo`);
          } else {
            this.processedMessages = new Set();
          }
          
          if (saved.processedComments && Array.isArray(saved.processedComments)) {
            this.processedComments = new Set(saved.processedComments);
            P.info(`✅ Restaurados ${this.processedComments.size} comentarios procesados desde archivo`);
          } else {
            this.processedComments = new Set();
          }
          
          P.info(`✅ Sesión de Instagram restaurada desde disco para ${username}`);
          emitToUserIG(this.userId, 'instagram:status', { 
            connected: true, 
            username: this.username,
            igUserId: this.igUserId 
          });
          
          return { success: true, restored: true };
        } catch (restoreError) {
          P.warn(`⚠️ Sesión guardada inválida, relogueando: ${restoreError.message}`);
          // Si falla la restauración, continuar con login normal
        }
      }

      // Login normal
      try {
        P.info('Realizando login a Instagram...');
        const loginResult = await this.ig.account.login(username, password);
        this.igUserId = loginResult.pk;
        this.logged = true;

        // Guardar cookies - asegurarse de que se guarden correctamente
        // Pequeño delay para asegurar que las cookies se establezcan
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const cookieJar = await this.ig.state.serializeCookieJar();
        P.info(`💾 Guardando cookies después del login`);
        
            // Convertir Sets a Arrays para poder guardarlos en JSON
            const processedMessagesArray = this.processedMessages ? Array.from(this.processedMessages) : [];
            const processedCommentsArray = this.processedComments ? Array.from(this.processedComments) : [];
            
            fs.writeFileSync(file, JSON.stringify({ 
              cookieJar,
              username,
              igUserId: this.igUserId,
              savedAt: new Date().toISOString(),
              processedMessages: processedMessagesArray,
              processedComments: processedCommentsArray
            }), 'utf8');

        P.info(`✅ Login exitoso y cookies guardadas para ${username}`);
        emitToUserIG(this.userId, 'instagram:status', { 
          connected: true, 
          username: this.username,
          igUserId: this.igUserId 
        });

        return { success: true, restored: false };
      } catch (loginError) {
        const msg = String(loginError?.message || loginError);
        
        // Detectar challenges/checkpoints
        if (msg.includes('challenge') || msg.includes('checkpoint')) {
          P.info(`🔐 Challenge detectado para ${username}. Esperando verificación del usuario...`);
          
          // Guardar información del challenge
          this.pendingChallenge = {
            username,
            password,
            timestamp: Date.now(),
            message: msg,
            retryCount: 0
          };
          
          emitToUserIG(this.userId, 'instagram:challenge', { 
            message: 'Por favor verifica tu cuenta en Instagram y haz clic en "No he sido yo" para autorizar el dispositivo.',
            type: 'challenge_required',
            username: username,
            challengeId: `challenge_${Date.now()}`,
            instructions: 'Ve a Instagram.com, verifica tu identidad y autoriza el dispositivo. Luego espera 2-3 minutos.'
          });
          
          // Esperar y reintentar automáticamente
          P.info(`⏳ Esperando 60 segundos para que el usuario verifique...`);
          await new Promise(resolve => setTimeout(resolve, 60000)); // Esperar 1 minuto
          
          // Reintentar login después de la verificación
          P.info(`🔄 Reintentando login después de esperar verificación...`);
          try {
            const retryResult = await this.ig.account.login(username, password);
            this.igUserId = retryResult.pk;
            this.logged = true;
            
            // Guardar cookies - asegurarse de que se guarden correctamente
            // Pequeño delay para asegurar que las cookies se establezcan
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const cookieJar = await this.ig.state.serializeCookieJar();
            P.info(`💾 Guardando cookies después de verificación`);
            
            // Convertir Sets a Arrays para poder guardarlos en JSON
            const processedMessagesArray = this.processedMessages ? Array.from(this.processedMessages) : [];
            const processedCommentsArray = this.processedComments ? Array.from(this.processedComments) : [];
            
            fs.writeFileSync(file, JSON.stringify({ 
              cookieJar,
              username,
              igUserId: this.igUserId,
              savedAt: new Date().toISOString(),
              processedMessages: processedMessagesArray,
              processedComments: processedCommentsArray
            }), 'utf8');
            
            P.info(`✅ Login exitoso después de verificación para ${username}`);
            emitToUserIG(this.userId, 'instagram:status', { 
              connected: true, 
              username: this.username,
              igUserId: this.igUserId,
              message: 'Login completado después de verificación'
            });
            
            this.pendingChallenge = null;
            return { success: true, restored: false, afterChallenge: true };
          } catch (retryError) {
            P.warn(`⚠️ Reintento falló, el usuario aún no ha verificado: ${retryError.message}`);
            
            // Retornar estado de challenge pendiente
            return { 
              success: false, 
              challenge: true, 
              message: 'Challenge pendiente. El usuario debe verificar su cuenta en Instagram. Reintenta el login en unos minutos.',
              challengeId: `challenge_${Date.now()}`,
              needsUserAction: true
            };
          }
        }
        
        // Detectar rate limit
        if (msg.includes('rate') || msg.includes('spam')) {
          P.error(`🚨 Rate limit detectado: ${msg}`);
          emitToUserIG(this.userId, 'instagram:error', { 
            message: 'Demasiados intentos. Espera 24 horas.',
            type: 'rate_limit'
          });
          throw new Error('Rate limit alcanzado. Espera antes de reintentar.');
        }

        P.error(`❌ Error en login: ${msg}`);
        throw loginError;
      }
    } catch (error) {
      P.error(`❌ Error general en login: ${error.message}`);
      emitToUserIG(this.userId, 'instagram:status', { connected: false, error: error.message });
      throw error;
    }
  }

  /**
   * Enviar DM a un usuario por username
   */
  async sendText({ username, text }) {
    return this.limiter.schedule(async () => {
      try {
        if (!this.logged) {
          throw new Error('No hay sesión activa de Instagram');
        }

        P.info(`📤 Enviando DM a ${username}: ${text.substring(0, 50)}...`);
        
        const userId = await this.ig.user.getIdByUsername(username);
        const thread = this.ig.entity.directThread([String(userId)]);
        await thread.broadcastText(text);
        
        P.info(`✅ DM enviado exitosamente a ${username}`);
        return { success: true, username, text };
      } catch (error) {
        P.error(`❌ Error enviando DM a ${username}: ${error.message}`);
        throw error;
      }
    });
  }

  /**
   * Responder en un thread existente
   */
  async replyText({ threadId, text }) {
    return this.limiter.schedule(async () => {
      try {
        if (!this.logged) {
          throw new Error('No hay sesión activa de Instagram');
        }

        P.info(`📤 Respondiendo en thread ${threadId}: ${text.substring(0, 50)}...`);
        
        const thread = this.ig.entity.directThread(threadId);
        await thread.broadcastText(text);
        
        P.info(`✅ Respuesta enviada en thread ${threadId}`);
        return { success: true, threadId, text };
      } catch (error) {
        P.error(`❌ Error respondiendo en thread ${threadId}: ${error.message}`);
        throw error;
      }
    });
  }

  // Responder a un comentario en un post
  async replyToComment(mediaId, commentId, text) {
    return this.limiter.schedule(async () => {
      try {
        if (!this.logged) {
          throw new Error('No hay sesión activa de Instagram');
        }

        P.info(`💬 Respondiendo a comentario ${commentId} en media ${mediaId}`);
        P.info(`📝 Texto: "${text.substring(0, 100)}..."`);
        
        // Convertir IDs a formato correcto si es necesario
        const mediaIdStr = String(mediaId);
        const commentIdStr = String(commentId);
        
        P.info(`🔄 Media ID: ${mediaIdStr}, Comment ID: ${commentIdStr}`);
        
        try {
          // Método 1: Intentar con repliedToCommentId
          const result = await this.ig.media.comment({
            mediaId: mediaIdStr,
            text: text,
            module: 'comments_v2',
            repliedToCommentId: commentIdStr
          });
          
          P.info(`✅ Respuesta enviada al comentario ${commentIdStr}`);
          P.info(`📊 Resultado:`, JSON.stringify(result, null, 2));
          
          return { success: true, mediaId: mediaIdStr, commentId: commentIdStr, text, result };
        } catch (method1Error) {
          P.warn(`⚠️ Método 1 falló: ${method1Error.message}`);
          
          // Método 2: Intentar sin repliedToCommentId (como comentario normal mencionando al usuario)
          try {
            P.info(`🔄 Intentando método alternativo...`);
            const result2 = await this.ig.media.comment({
              mediaId: mediaIdStr,
              text: text
            });
            
            P.info(`✅ Respuesta enviada como comentario nuevo`);
            return { success: true, mediaId: mediaIdStr, commentId: commentIdStr, text, result: result2, method: 'alternative' };
          } catch (method2Error) {
            P.error(`❌ Método alternativo también falló: ${method2Error.message}`);
            throw method2Error;
          }
        }
      } catch (error) {
        P.error(`❌ Error respondiendo a comentario: ${error.message}`);
        P.error(`📋 Stack:`, error.stack);
        throw error;
      }
    });
  }

  /**
   * Obtener bandeja de entrada (inbox)
   * Retorna threads con mensajes recientes
   */
  async fetchInbox() {
    try {
      if (!this.logged) {
        throw new Error('No hay sesión activa de Instagram');
      }

      P.info('📥 Obteniendo bandeja de entrada...');
      
      const inbox = await this.ig.feed.directInbox().request();
      const threads = inbox.inbox?.threads || [];
      
      P.info(`✅ ${threads.length} threads encontrados en inbox`);
      
      const processedThreads = threads.map(t => {
        const lastItem = t.items?.[0];
        return {
          thread_id: t.thread_id,
          thread_title: t.thread_title,
          users: t.users?.map(u => ({
            pk: u.pk,
            username: u.username,
            full_name: u.full_name,
            profile_pic_url: u.profile_pic_url
          })),
          last_message: lastItem ? {
            id: lastItem.item_id,
            type: lastItem.item_type,
            text: lastItem.text || null,
            timestamp: lastItem.timestamp,
            user_id: lastItem.user_id
          } : null,
          last_activity_at: t.last_activity_at
        };
      });

      return processedThreads;
    } catch (error) {
      P.error(`❌ Error obteniendo inbox: ${error.message}`);
      throw error;
    }
  }

  /**
   * Polling de inbox y emitir nuevos mensajes
   */
  async fetchInboxOnce() {
    try {
      const threads = await this.fetchInbox();
      
      for (const thread of threads) {
        if (thread.last_message) {
          emitToUserIG(this.userId, 'instagram:message', {
            thread_id: thread.thread_id,
            users: thread.users,
            message: thread.last_message
          });
        }
      }

      return threads;
    } catch (error) {
      P.error(`❌ Error en fetchInboxOnce: ${error.message}`);
      throw error;
    }
  }

  /**
   * Responder con IA a un mensaje
   */
  async handleIncomingWithAI({ threadId, text, aiFunction }) {
    try {
      P.info(`🤖 Generando respuesta con IA para thread ${threadId}`);
      
      const respuesta = await aiFunction(text);
      
      if (!respuesta || respuesta.trim().length === 0) {
        P.warn('⚠️ IA no generó respuesta');
        return null;
      }

      await this.replyText({ threadId, text: respuesta });
      
      P.info(`✅ Respuesta de IA enviada: ${respuesta.substring(0, 50)}...`);
      return respuesta;
    } catch (error) {
      P.error(`❌ Error en handleIncomingWithAI: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resolver challenge con código de verificación
   */
  async resolveChallenge({ code, choice = null }) {
    try {
      if (!this.pendingChallenge) {
        throw new Error('No hay challenge pendiente');
      }

      P.info(`🔐 Resolviendo challenge con código: ${code}`);
      
      // Intentar resolver el challenge
      const challengeResult = await this.ig.challenge.resolve({
        code: code,
        choice: choice
      });

      if (challengeResult) {
        P.info(`✅ Challenge resuelto exitosamente`);
        
        // Limpiar challenge pendiente
        this.pendingChallenge = null;
        
        // Intentar login nuevamente
        const loginResult = await this.ig.account.login(
          this.pendingChallenge?.username || this.username, 
          this.password
        );
        
        this.igUserId = loginResult.pk;
        this.logged = true;

        // Guardar cookies
        const file = this.stateFile();
        const cookieJar = await this.ig.state.serializeCookieJar();
        fs.writeFileSync(file, JSON.stringify({ 
          cookieJar,
          username: this.username,
          igUserId: this.igUserId,
          savedAt: new Date().toISOString()
        }), 'utf8');

        emitToUserIG(this.userId, 'instagram:status', { 
          connected: true, 
          username: this.username,
          igUserId: this.igUserId 
        });

        return { success: true, message: 'Challenge resuelto y login exitoso' };
      } else {
        throw new Error('No se pudo resolver el challenge');
      }
    } catch (error) {
      P.error(`❌ Error resolviendo challenge: ${error.message}`);
      emitToUserIG(this.userId, 'instagram:error', { 
        message: error.message,
        type: 'challenge_failed'
      });
      throw error;
    }
  }

  /**
   * Obtener información del challenge pendiente
   */
  getPendingChallenge() {
    return this.pendingChallenge;
  }

  /**
   * Cerrar sesión y limpiar estado
   */
  async logout() {
    try {
      P.info(`Cerrando sesión de Instagram para usuario ${this.userId}`);
      
      const file = this.stateFile();
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        P.info('✅ Archivo de sesión eliminado');
      }

      this.logged = false;
      this.igUserId = null;
      
      emitToUserIG(this.userId, 'instagram:status', { connected: false });
      
      return { success: true };
    } catch (error) {
      P.error(`❌ Error en logout: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener comentarios de una publicación específica por URL
   */
  async getCommentsFromPost(postUrl, limit = 50) {
    return this.limiter.schedule(async () => {
      try {
        // Verificar que haya sesión activa con cookies
        if (!this.logged) {
          P.warn(`⚠️ Sesión no está logueada, intentando restaurar desde archivo...`);
          try {
            const file = this.stateFile();
            if (fs.existsSync(file)) {
              const data = JSON.parse(fs.readFileSync(file, 'utf8'));
              if (data.cookieJar && data.username) {
                await this.ig.state.deserializeCookieJar(JSON.stringify(data.cookieJar));
                this.logged = true;
                this.username = data.username;
                this.igUserId = data.igUserId;
                P.info(`✅ Sesión restaurada desde archivo para obtener comentarios`);
              } else {
                throw new Error('No hay cookies guardadas. Debe hacer login primero.');
              }
            } else {
              throw new Error('No hay sesión guardada. Debe hacer login primero.');
            }
          } catch (restoreError) {
            P.error(`❌ Error restaurando sesión: ${restoreError.message}`);
            throw new Error('No hay sesión activa de Instagram. Debe hacer login primero.');
          }
        }
        
        P.info(`💬 Obteniendo comentarios de publicación: ${postUrl}`);

        // Extraer el código de la publicación de la URL
        let shortcode;
        try {
          // Patrones comunes de URLs de Instagram
          const urlPatterns = [
            /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
            /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
            /instagram\.com\/tv\/([A-Za-z0-9_-]+)/,
            /instagram\.com\/.*\/([A-Za-z0-9_-]+)\//
          ];
          
          // También manejar URLs con query parameters como ?igsh=
          const cleanUrl = postUrl.split('?')[0];

          let match = null;
          for (const pattern of urlPatterns) {
            match = cleanUrl.match(pattern);
            if (match) break;
          }

          if (!match) {
            throw new Error('URL de Instagram no válida. Debe ser un post, reel o video.');
          }

          shortcode = match[1];
          P.info(`📝 Código de publicación extraído: ${shortcode}`);

        } catch (urlError) {
          P.error(`❌ Error procesando URL: ${urlError.message}`);
          throw new Error(`URL de Instagram no válida: ${urlError.message}`);
        }

        // Obtener información real del media usando el shortcode
        let postInfo;
        let mediaId = null;
        
        try {
          // Método 1: Intentar convertir shortcode a media ID manualmente
          try {
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
            let id = 0;
            
            for (let i = 0; i < shortcode.length; i++) {
              const char = shortcode[i];
              const index = alphabet.indexOf(char);
              if (index === -1) {
                throw new Error(`Carácter inválido en shortcode: ${char}`);
              }
              id = id * 64 + index;
            }
            
            mediaId = id.toString();
            P.info(`🔄 Media ID convertido: ${mediaId} (desde shortcode: ${shortcode})`);
            
            // Intentar obtener información real del media
            try {
              const mediaInfo = await this.ig.media.info(mediaId);
              
              if (mediaInfo && mediaInfo.items && mediaInfo.items.length > 0) {
                const item = mediaInfo.items[0];
                // Usar el pk del item como mediaId real
                const realMediaId = item.pk.toString();
                mediaId = realMediaId; // Actualizar mediaId con el pk real
                
                postInfo = {
                  id: realMediaId,
                  shortcode: item.code || shortcode,
                  caption: item.caption?.text || '',
                  media_type: item.media_type || 1,
                  like_count: item.like_count || 0,
                  comment_count: item.comment_count || 0,
                  taken_at: item.taken_at || Math.floor(Date.now() / 1000),
                  owner: {
                    username: item.user?.username || 'unknown',
                    full_name: item.user?.full_name || 'Usuario desconocido',
                    profile_pic_url: item.user?.profile_pic_url || null
                  }
                };
                
                P.info(`✅ Información del media obtenida: @${postInfo.owner.username} - ${postInfo.comment_count} comentarios`);
                P.info(`✅ Media ID real (pk): ${realMediaId}`);
              }
            } catch (infoError) {
              P.info(`⚠️ No se pudo obtener info del media con ID ${mediaId}, usando información básica`);
              postInfo = {
                id: mediaId,
                shortcode: shortcode,
                caption: 'Información obtenida por shortcode',
                media_type: 1,
                like_count: 0,
                comment_count: 0,
                taken_at: Math.floor(Date.now() / 1000),
                owner: {
                  username: 'unknown',
                  full_name: 'Usuario desconocido',
                  profile_pic_url: null
                }
              };
            }
          } catch (conversionError) {
            P.warn(`⚠️ Error convirtiendo shortcode: ${conversionError.message}`);
            postInfo = {
              id: shortcode,
              shortcode: shortcode,
              caption: 'Información obtenida por shortcode',
              media_type: 1,
              like_count: 0,
              comment_count: 0,
              taken_at: Math.floor(Date.now() / 1000),
              owner: {
                username: 'unknown',
                full_name: 'Usuario desconocido',
                profile_pic_url: null
              }
            };
          }
          
          P.info(`📸 Usando media ID: ${mediaId || shortcode}`);
        } catch (infoError) {
          P.error(`❌ Error procesando información: ${infoError.message}`);
          throw new Error(`No se pudo procesar información: ${infoError.message}`);
        }

        // Obtener comentarios de la publicación usando múltiples métodos
        const comments = [];
        try {
          P.info(`💬 Obteniendo comentarios de la publicación...`);
          
          // Método 0: Intentar obtener ID usando shortcodeToMediaId si está disponible
          let finalMediaId = mediaId;
          try {
            // Primero intentar obtener información del media usando shortcode directamente
            try {
              P.info(`🔄 Método 0a: Obteniendo info del media con shortcode: ${shortcode}`);
              const mediaInfo = await this.ig.media.info(shortcode);
              
              if (mediaInfo && mediaInfo.items && mediaInfo.items.length > 0) {
                const item = mediaInfo.items[0];
                const realMediaId = item.pk.toString();
                finalMediaId = realMediaId;
                
                postInfo = {
                  id: realMediaId,
                  shortcode: item.code || shortcode,
                  caption: item.caption?.text || '',
                  media_type: item.media_type || 1,
                  like_count: item.like_count || 0,
                  comment_count: item.comment_count || 0,
                  taken_at: item.taken_at || Math.floor(Date.now() / 1000),
                  owner: {
                    username: item.user?.username || 'unknown',
                    full_name: item.user?.full_name || 'Usuario desconocido',
                    profile_pic_url: item.user?.profile_pic_url || null
                  }
                };
                
                P.info(`✅ Post info obtenida directamente: @${postInfo.owner.username} - ${postInfo.comment_count} comentarios`);
                P.info(`✅ Media ID real (pk): ${realMediaId}`);
              }
            } catch (directError) {
              P.info(`⚠️ No se pudo obtener info directa con shortcode: ${directError.message}`);
              
              // Intentar con shortcodeToMediaId si está disponible
              if (this.ig.util && typeof this.ig.util.shortcodeToMediaId === 'function') {
                P.info(`🔄 Método 0b: Usando shortcodeToMediaId nativo...`);
                const utilMediaId = await this.ig.util.shortcodeToMediaId(shortcode);
                if (utilMediaId) {
                  finalMediaId = utilMediaId.toString();
                  P.info(`✅ Media ID obtenido con shortcodeToMediaId: ${finalMediaId}`);
                  
                  // Actualizar postInfo si tenemos nueva información
                  try {
                    const mediaInfo = await this.ig.media.info(finalMediaId);
                    if (mediaInfo && mediaInfo.items && mediaInfo.items.length > 0) {
                      const item = mediaInfo.items[0];
                      postInfo.id = item.pk.toString();
                      postInfo.comment_count = item.comment_count || 0;
                      P.info(`✅ Post info actualizada: ${item.comment_count} comentarios`);
                    }
                  } catch (infoError) {
                    P.warn(`⚠️ No se pudo actualizar post info: ${infoError.message}`);
                  }
                }
              }
            }
          } catch (utilError) {
            P.info(`⚠️ Método shortcodeToMediaId no disponible: ${utilError.message}`);
          }
          
          // Método 1: Intentar con media ID (finalMediaId o mediaId original)
          const testMediaId = finalMediaId || mediaId || shortcode;
          if (testMediaId) {
            try {
              P.info(`🔄 Método 1: Intentando con media ID: ${testMediaId}`);
              const commentsFeed = this.ig.feed.mediaComments(testMediaId);
              let hasMore = true;
              let count = 0;

            while (hasMore && count < limit) {
              try {
                const items = await commentsFeed.items();
                
                if (!items || items.length === 0) {
                  P.info(`⚠️ No hay más comentarios disponibles`);
                  break;
                }

                for (const comment of items) {
                  if (count >= limit) break;

                  comments.push({
                    id: comment.pk.toString(),
                    post_id: shortcode,
                    author_name: comment.user.full_name || comment.user.username,
                    username: comment.user.username,
                    author_avatar: comment.user.profile_pic_url,
                    comment_text: comment.text,
                    timestamp: comment.created_at.toString(),
                    like_count: comment.comment_like_count || 0,
                    is_verified: comment.user.is_verified || false,
                    is_business: comment.user.is_business || false
                  });

                  count++;
                }
                
                if (count % 10 === 0) {
                  P.info(`📈 Progreso: ${count}/${limit} comentarios extraídos...`);
                }

                hasMore = commentsFeed.isMoreAvailable();
                
                if (hasMore && count < limit) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }

              } catch (pageError) {
                P.error(`❌ Error obteniendo página de comentarios: ${pageError.message}`);
                break;
              }
            }

            if (comments.length > 0) {
              P.info(`✅ ${comments.length} comentarios extraídos usando media ID: ${testMediaId}`);
              return {
                success: true,
                comments,
                post_info: postInfo,
                extracted_count: comments.length,
                limit_requested: limit,
                total_comments: postInfo.comment_count
              };
            }

          } catch (mediaIdError) {
            P.info(`⚠️ Método con media ID ${testMediaId} falló: ${mediaIdError.message}`);
            // Log detallado del error
            if (mediaIdError.response) {
              P.warn(`   Status: ${mediaIdError.response.status}`);
              P.warn(`   Body: ${JSON.stringify(mediaIdError.response.body || {}).substring(0, 200)}`);
            }
          }
        }

          // Método 2: Intentar con shortcode directamente (respaldo)
          try {
            P.info(`🔄 Método 2: Intentando con shortcode directamente: ${shortcode}`);
            const commentsFeed2 = this.ig.feed.mediaComments(shortcode);
            let hasMore = true;
            let count = 0;
            const comments2 = [];

            while (hasMore && count < limit) {
              try {
                const items = await commentsFeed2.items();
                
                if (!items || items.length === 0) {
                  P.info(`⚠️ No hay más comentarios disponibles`);
                  break;
                }

                for (const comment of items) {
                  if (count >= limit) break;

                  comments2.push({
                    id: comment.pk.toString(),
                    post_id: shortcode,
                    author_name: comment.user.full_name || comment.user.username,
                    username: comment.user.username,
                    author_avatar: comment.user.profile_pic_url,
                    comment_text: comment.text,
                    timestamp: comment.created_at.toString(),
                    like_count: comment.comment_like_count || 0,
                    is_verified: comment.user.is_verified || false,
                    is_business: comment.user.is_business || false
                  });

                  count++;
                }
                
                if (count % 10 === 0) {
                  P.info(`📈 Progreso: ${count}/${limit} comentarios extraídos...`);
                }

                hasMore = commentsFeed2.isMoreAvailable();
                
                if (hasMore && count < limit) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }

              } catch (pageError) {
                P.error(`❌ Error obteniendo página de comentarios: ${pageError.message}`);
                break;
              }
            }

            if (comments2.length > 0) {
              P.info(`✅ ${comments2.length} comentarios extraídos usando shortcode directamente`);
              return {
                success: true,
                comments: comments2,
                post_info: postInfo,
                extracted_count: comments2.length,
                limit_requested: limit,
                total_comments: postInfo.comment_count
              };
            }

          } catch (shortcodeError) {
            P.info(`⚠️ Método con shortcode falló: ${shortcodeError.message}`);
          }
          
          // Método 3: Intentar con pk del postInfo si está disponible
          if (postInfo && postInfo.id && postInfo.id !== shortcode && postInfo.id !== mediaId) {
            try {
              P.info(`🔄 Método 3: Intentando con pk del postInfo: ${postInfo.id}`);
              const commentsFeed3 = this.ig.feed.mediaComments(postInfo.id);
              let hasMore = true;
              let count = 0;
              const comments3 = [];

              while (hasMore && count < limit) {
                try {
                  const items = await commentsFeed3.items();
                  
                  if (!items || items.length === 0) {
                    P.info(`⚠️ No hay más comentarios disponibles`);
                    break;
                  }

                  for (const comment of items) {
                    if (count >= limit) break;

                    comments3.push({
                      id: comment.pk.toString(),
                      post_id: postInfo.id,
                      author_name: comment.user.full_name || comment.user.username,
                      username: comment.user.username,
                      author_avatar: comment.user.profile_pic_url,
                      comment_text: comment.text,
                      timestamp: comment.created_at.toString(),
                      like_count: comment.comment_like_count || 0,
                      is_verified: comment.user.is_verified || false,
                      is_business: comment.user.is_business || false
                    });

                    count++;
                  }
                  
                  if (count % 10 === 0) {
                    P.info(`📈 Progreso: ${count}/${limit} comentarios extraídos...`);
                  }

                  hasMore = commentsFeed3.isMoreAvailable();
                  
                  if (hasMore && count < limit) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                  }

                } catch (pageError) {
                  P.error(`❌ Error obteniendo página de comentarios: ${pageError.message}`);
                  break;
                }
              }

              if (comments3.length > 0) {
                P.info(`✅ ${comments3.length} comentarios extraídos usando pk del postInfo`);
                return {
                  success: true,
                  comments: comments3,
                  post_info: postInfo,
                  extracted_count: comments3.length,
                  limit_requested: limit,
                  total_comments: postInfo.comment_count
                };
              }

            } catch (pkError) {
              P.info(`⚠️ Método con pk del postInfo falló: ${pkError.message}`);
            }
          }

          P.info(`✅ ${comments.length} comentarios extraídos de la publicación`);
          
          return {
            success: true,
            comments,
            post_info: postInfo,
            extracted_count: comments.length,
            limit_requested: limit,
            total_comments: postInfo.comment_count
          };

        } catch (feedError) {
          P.error(`❌ Error obteniendo comentarios: ${feedError.message}`);
          
          return {
            success: false,
            error: `No se pudieron obtener comentarios: ${feedError.message}`,
            comments: [],
            post_info: postInfo
          };
        }

      } catch (error) {
        P.error(`❌ Error obteniendo comentarios de publicación: ${error.message}`);
        throw error;
      }
    });
  }
  async getRecentComments(limit = 10) {
    try {
      if (!this.logged) {
        throw new Error('No hay sesión activa de Instagram');
      }

      P.info('📸 Obteniendo posts recientes del usuario...');
      
      // Obtener el ID del usuario actual
      const user = await this.ig.account.currentUser();
      const userId = user.pk;

      // Obtener feed de posts del usuario
      const userFeed = this.ig.feed.user(userId);
      const posts = await userFeed.items();

      P.info(`📸 ${posts.length} posts encontrados`);

      const allComments = [];

      // Iterar sobre los posts más recientes (máximo 5 posts)
      for (const post of posts.slice(0, 5)) {
        try {
          P.info(`📝 Obteniendo comentarios del post ${post.id}...`);
          
          // Obtener comentarios del post
          const commentsFeed = this.ig.feed.mediaComments(post.id);
          const comments = await commentsFeed.items();

          P.info(`💬 ${comments.length} comentarios encontrados en post ${post.id}`);

          // Procesar cada comentario
          for (const comment of comments) {
            allComments.push({
              id: comment.pk.toString(),
              post_id: post.id,
              author_name: comment.user.full_name || comment.user.username,
              username: comment.user.username,
              author_avatar: comment.user.profile_pic_url,
              comment_text: comment.text,
              timestamp: comment.created_at.toString(),
              post_caption: post.caption?.text || '',
              post_image: post.image_versions2?.candidates?.[0]?.url || ''
            });

            // Limitar el número total de comentarios
            if (allComments.length >= limit) {
              break;
            }
          }

          if (allComments.length >= limit) {
            break;
          }
        } catch (postError) {
          P.error(`❌ Error obteniendo comentarios del post ${post.id}: ${postError.message}`);
          continue;
        }
      }

      P.info(`✅ Total de comentarios obtenidos: ${allComments.length}`);
      return allComments;

    } catch (error) {
      P.error(`❌ Error obteniendo comentarios: ${error.message}`);
      throw error;
    }
  }

  /**
   * Buscar usuarios de Instagram
   */
  async searchUsers(query, limit = 10) {
    return this.limiter.schedule(async () => {
      try {
        P.info(`🔍 Buscando usuarios: "${query}"`);
        
        // Intentar búsqueda usando searchExact primero (más confiable)
        try {
          const exactUser = await this.ig.user.searchExact(query);
          
          if (exactUser) {
            P.info(`✅ Usuario exacto encontrado: ${exactUser.username}`);
            
            // Obtener información adicional del usuario
            let additionalInfo = {
              follower_count: exactUser.follower_count || 0,
              following_count: exactUser.following_count || 0,
              media_count: exactUser.media_count || 0,
              biography: exactUser.biography || '',
              external_url: exactUser.external_url || null,
              is_business: exactUser.is_business || false,
              category: exactUser.category || null,
              is_verified: exactUser.is_verified || false,
              is_private: exactUser.is_private || false
            };
            
            try {
              const userInfo = await this.ig.user.info(exactUser.pk);
              additionalInfo = {
                follower_count: userInfo.follower_count || additionalInfo.follower_count,
                following_count: userInfo.following_count || additionalInfo.following_count,
                media_count: userInfo.media_count || additionalInfo.media_count,
                biography: userInfo.biography || additionalInfo.biography,
                external_url: userInfo.external_url || additionalInfo.external_url,
                is_business: userInfo.is_business || additionalInfo.is_business,
                category: userInfo.category || additionalInfo.category,
                is_verified: userInfo.is_verified || additionalInfo.is_verified,
                is_private: userInfo.is_private || additionalInfo.is_private
              };
            } catch (infoError) {
              P.warn(`⚠️ No se pudo obtener información adicional: ${infoError.message}`);
            }
            
            return [{
              pk: exactUser.pk,
              username: exactUser.username,
              full_name: exactUser.full_name || exactUser.username,
              profile_pic_url: exactUser.profile_pic_url || '/default-avatar.png',
              follower_count: additionalInfo.follower_count,
              following_count: additionalInfo.following_count,
              media_count: additionalInfo.media_count,
              biography: additionalInfo.biography,
              external_url: additionalInfo.external_url,
              is_business: additionalInfo.is_business,
              category: additionalInfo.category,
              is_verified: additionalInfo.is_verified,
              is_private: additionalInfo.is_private,
              // Información adicional para mostrar en el frontend
              display_name: exactUser.full_name || exactUser.username,
              verified_badge: (additionalInfo.is_verified || exactUser.is_verified) ? '✓' : '',
              private_badge: (additionalInfo.is_private || exactUser.is_private) ? '🔒' : '',
              business_badge: (additionalInfo.is_business || exactUser.is_business) ? '🏢' : '',
              stats: {
                followers: additionalInfo.follower_count,
                following: additionalInfo.following_count,
                posts: additionalInfo.media_count
              }
            }];
          }
        } catch (exactError) {
          P.warn(`⚠️ Búsqueda exacta falló: ${exactError.message}`);
        }

        // Si la búsqueda exacta falla, intentar búsqueda general
        try {
          const searchResults = await this.ig.user.search(query);
          
          // Verificar que searchResults es un array
          const results = Array.isArray(searchResults) ? searchResults : [];
          
          // Limitar resultados
          const limitedResults = results.slice(0, limit);
          
          P.info(`✅ ${limitedResults.length} usuarios encontrados para "${query}"`);
          
          // Procesar cada resultado para obtener información completa
          const processedResults = [];
          
          for (const user of limitedResults) {
            try {
              // Obtener información adicional del usuario
              let additionalInfo = {};
              try {
                const userInfo = await this.ig.user.info(user.pk);
                additionalInfo = {
                  follower_count: userInfo.follower_count || user.follower_count || 0,
                  following_count: userInfo.following_count || user.following_count || 0,
                  media_count: userInfo.media_count || user.media_count || 0,
                  biography: userInfo.biography || user.biography || '',
                  external_url: userInfo.external_url || user.external_url || null,
                  is_business: userInfo.is_business || user.is_business || false,
                  category: userInfo.category || user.category || null,
                  is_verified: userInfo.is_verified || user.is_verified || false,
                  is_private: userInfo.is_private || user.is_private || false
                };
              } catch (infoError) {
                P.warn(`⚠️ No se pudo obtener información adicional para ${user.username}: ${infoError.message}`);
                additionalInfo = {
                  follower_count: user.follower_count || 0,
                  following_count: user.following_count || 0,
                  media_count: user.media_count || 0,
                  biography: user.biography || '',
                  external_url: user.external_url || null,
                  is_business: user.is_business || false,
                  category: user.category || null,
                  is_verified: user.is_verified || false,
                  is_private: user.is_private || false
                };
              }
              
              processedResults.push({
                pk: user.pk,
                username: user.username,
                full_name: user.full_name || user.username,
                profile_pic_url: user.profile_pic_url || '/default-avatar.png',
                follower_count: additionalInfo.follower_count,
                following_count: additionalInfo.following_count,
                media_count: additionalInfo.media_count,
                biography: additionalInfo.biography,
                external_url: additionalInfo.external_url,
                is_business: additionalInfo.is_business,
                category: additionalInfo.category,
                is_verified: additionalInfo.is_verified,
                is_private: additionalInfo.is_private,
                // Información adicional para mostrar en el frontend
                display_name: user.full_name || user.username,
                verified_badge: additionalInfo.is_verified ? '✓' : '',
                private_badge: additionalInfo.is_private ? '🔒' : '',
                business_badge: additionalInfo.is_business ? '🏢' : '',
                stats: {
                  followers: additionalInfo.follower_count,
                  following: additionalInfo.following_count,
                  posts: additionalInfo.media_count
                }
              });
              
              // Pequeño delay para evitar rate limiting
              await new Promise(resolve => setTimeout(resolve, 100));
              
            } catch (userError) {
              P.warn(`⚠️ Error procesando usuario ${user.username}: ${userError.message}`);
              // Agregar usuario básico si falla el procesamiento
              processedResults.push({
                pk: user.pk,
                username: user.username,
                full_name: user.full_name || user.username,
                profile_pic_url: user.profile_pic_url || '/default-avatar.png',
                follower_count: user.follower_count || 0,
                following_count: user.following_count || 0,
                media_count: user.media_count || 0,
                biography: user.biography || '',
                external_url: user.external_url || null,
                is_business: user.is_business || false,
                category: user.category || null,
                is_verified: user.is_verified || false,
                is_private: user.is_private || false,
                display_name: user.full_name || user.username,
                verified_badge: (user.is_verified || false) ? '✓' : '',
                private_badge: (user.is_private || false) ? '🔒' : '',
                business_badge: (user.is_business || false) ? '🏢' : '',
                stats: {
                  followers: user.follower_count || 0,
                  following: user.following_count || 0,
                  posts: user.media_count || 0
                }
              });
            }
          }
          
          return processedResults;
        } catch (searchError) {
          P.error(`❌ Error en búsqueda general: ${searchError.message}`);
          
          // Si ambas búsquedas fallan, devolver un mensaje informativo
          P.warn(`⚠️ Búsqueda de Instagram restringida para: "${query}"`);
          return [];
        }
      } catch (error) {
        P.error(`❌ Error buscando usuarios: ${error.message}`);
        throw error;
      }
    });
  }

  /**
   * Enviar mensaje directo a un usuario
   */
  async sendMessage(username, message) {
    return this.limiter.schedule(async () => {
      try {
        // Verificar que haya sesión activa con cookies
        if (!this.logged) {
          P.warn(`⚠️ Sesión no está logueada, intentando restaurar desde archivo...`);
          try {
            const file = this.stateFile();
            if (fs.existsSync(file)) {
              const data = JSON.parse(fs.readFileSync(file, 'utf8'));
              if (data.cookieJar && data.username) {
                await this.ig.state.deserializeCookieJar(JSON.stringify(data.cookieJar));
                this.logged = true;
                this.username = data.username;
                this.igUserId = data.igUserId;
                P.info(`✅ Sesión restaurada desde archivo para enviar mensaje`);
              } else {
                throw new Error('No hay cookies guardadas. Debe hacer login primero.');
              }
            } else {
              throw new Error('No hay sesión guardada. Debe hacer login primero.');
            }
          } catch (restoreError) {
            P.error(`❌ Error restaurando sesión: ${restoreError.message}`);
            throw new Error('No hay sesión activa de Instagram. Debe hacer login primero.');
          }
        }
        
        P.info(`📤 Enviando mensaje a ${username}: "${message}"`);

        let user = null;
        let userId = null;

        // Método 1: Intentar búsqueda exacta primero
        try {
          P.info(`🔍 Intentando búsqueda exacta para ${username}...`);
          const exactUser = await this.ig.user.searchExact(username);
          if (exactUser && exactUser.pk) {
            user = exactUser;
            userId = exactUser.pk;
            P.info(`✅ Usuario exacto encontrado: ${username} (ID: ${userId})`);
          }
        } catch (exactError) {
          P.warn(`⚠️ Búsqueda exacta falló para ${username}: ${exactError.message}`);
        }

        // Si no se encontró con búsqueda exacta, intentar búsqueda general
        if (!user) {
          try {
            const searchResults = await this.ig.user.search(username);
            if (searchResults && searchResults.length > 0) {
              // Buscar el usuario exacto en los resultados
              const foundUser = searchResults.find(u => u.username === username);
              if (foundUser && foundUser.pk) {
                user = foundUser;
                userId = foundUser.pk;
                P.info(`✅ Usuario encontrado en búsqueda general: ${username} (ID: ${userId})`);
              } else if (searchResults[0] && searchResults[0].pk) {
                // Usar el primer resultado si no se encuentra el exacto
                user = searchResults[0];
                userId = searchResults[0].pk;
                P.info(`✅ Usando primer resultado de búsqueda: ${user.username} (ID: ${userId})`);
              }
            }
          } catch (searchError) {
            P.warn(`⚠️ Búsqueda general falló para ${username}: ${searchError.message}`);
          }
        }

        // Si aún no tenemos un usuario válido, intentar obtener por username directamente
        if (!user || !userId) {
          try {
            P.info(`🔄 Intentando obtener info por username: ${username}...`);
            const userInfo = await this.ig.user.infoByUsername(username);
            if (userInfo && userInfo.pk) {
              user = userInfo;
              userId = userInfo.pk;
              P.info(`✅ Usuario obtenido por username: ${username} (ID: ${userId})`);
            }
          } catch (infoError) {
            P.warn(`⚠️ Error obteniendo info por username: ${infoError.message}`);
          }
        }

        // Método final: Intentar getIdByUsername directamente (más directo)
        if (!userId) {
          try {
            P.info(`🔄 Método final: Obteniendo ID directamente con getIdByUsername...`);
            userId = await this.ig.user.getIdByUsername(username);
            P.info(`✅ ID obtenido directamente: ${userId}`);
          } catch (getIdError) {
            P.error(`❌ Error obteniendo ID: ${getIdError.message}`);
            // No lanzar error aquí, continuar para intentar con el error descriptivo
          }
        }

        // Verificar que tenemos un userId válido
        if (!userId) {
          const errorMsg = `No se pudo obtener información válida del usuario ${username}. ` +
            `Verifica que el username sea correcto y que tengas sesión activa.`;
          P.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }

        P.info(`📤 Preparando envío REAL de mensaje a ${username} (ID: ${userId})`);

        // Enviar mensaje REAL usando la API de Instagram
        try {
          // Usar el método correcto de la API de Instagram
          const thread = this.ig.entity.directThread([String(userId)]);
          await thread.broadcastText(message);

          P.info(`✅ Mensaje REAL enviado exitosamente a ${username}`);
        return {
          success: true,
          recipient: username,
          message: message,
          timestamp: new Date().toISOString(),
          user_id: userId,
            status: 'sent',
            note: 'Mensaje enviado exitosamente a Instagram'
          };
        } catch (apiError) {
          P.error(`❌ Error enviando mensaje real a ${username}: ${apiError.message}`);
          
          // Fallback: intentar método alternativo usando sendText
          try {
            P.info(`🔄 Intentando método alternativo para ${username}...`);
            
            const sendResult = await this.sendText({
              username: username,
              text: message
            });

            if (sendResult && sendResult.success) {
              P.info(`✅ Mensaje REAL enviado exitosamente (método alternativo) a ${username}`);
        return {
          success: true,
          recipient: username,
          message: message,
          timestamp: new Date().toISOString(),
          user_id: userId,
                status: 'sent',
                method: 'alternative',
                note: 'Mensaje enviado usando método alternativo'
              };
            }
          } catch (altError) {
            P.error(`❌ Error en método alternativo para ${username}: ${altError.message}`);
            throw new Error(`No se pudo enviar mensaje a ${username}: ${apiError.message}`);
          }
        }
      } catch (error) {
        P.error(`❌ Error enviando mensaje a ${username}: ${error.message}`);
        throw error;
      }
    });
  }

  /**
   * Obtener seguidores de una cuenta de Instagram
   */
  async getFollowers(username, limit = 100) {
    return this.limiter.schedule(async () => {
      try {
        P.info(`👥 Obteniendo seguidores de ${username} (límite: ${limit})`);

        // Obtener información del usuario usando el método correcto
        let userId;
        let userInfo;
        
        try {
          // Usar el método correcto de la API: usernameinfo
          const user = await this.ig.user.searchExact(username);
          
          if (!user) {
            throw new Error(`Usuario ${username} no encontrado`);
          }
          
          userId = user.pk;
          userInfo = {
            username: user.username,
            full_name: user.full_name,
            is_private: user.is_private,
            follower_count: user.follower_count,
            following_count: user.following_count,
            media_count: user.media_count,
            biography: user.biography,
            profile_pic_url: user.profile_pic_url,
            is_verified: user.is_verified,
            is_business: user.is_business
          };
          
          P.info(`✅ Usuario encontrado: ${username} (ID: ${userId})`);
        } catch (searchError) {
          P.error(`❌ Error buscando usuario: ${searchError.message}`);
          throw new Error(`No se pudo encontrar el usuario ${username}: ${searchError.message}`);
        }

        P.info(`📊 Información del usuario ${username}:`);
        P.info(`   - Seguidores: ${userInfo.follower_count || 'N/A'}`);
        P.info(`   - Siguiendo: ${userInfo.following_count || 'N/A'}`);
        P.info(`   - Posts: ${userInfo.media_count || 'N/A'}`);
        P.info(`   - Privado: ${userInfo.is_private ? 'Sí' : 'No'}`);

        // Verificar si la cuenta es privada
        if (userInfo.is_private) {
          P.warn(`⚠️ La cuenta ${username} es privada. No se pueden obtener seguidores.`);
          return {
            success: false,
            error: 'La cuenta es privada',
            followers: [],
            account_info: userInfo
          };
        }

        // Intentar obtener seguidores usando el feed con paginación
        try {
          const followersFeed = this.ig.feed.accountFollowers(userId);
          const followers = [];
          let count = 0;
          let hasMore = true;

          P.info(`🔄 Extrayendo seguidores de ${username} (total: ${userInfo.follower_count})...`);

          // Iterar sobre todas las páginas hasta alcanzar el límite o no haber más
          while (hasMore && count < limit) {
            try {
              // Obtener items de la página actual
              const items = await followersFeed.items();
              
              if (!items || items.length === 0) {
                P.info(`⚠️ No hay más seguidores disponibles`);
                break;
              }

              // Procesar los seguidores obtenidos
              for (const follower of items) {
                if (count >= limit) break;

                followers.push({
                  pk: follower.pk,
                  username: follower.username,
                  full_name: follower.full_name,
                  profile_pic_url: follower.profile_pic_url,
                  is_verified: follower.is_verified || false,
                  is_private: follower.is_private || false,
                  follower_count: follower.follower_count || 0,
                  following_count: follower.following_count || 0,
                  media_count: follower.media_count || 0,
                  biography: follower.biography || '',
                  external_url: follower.external_url || null,
                  is_business: follower.is_business || false
                });

                count++;
              }
              
              // Mostrar progreso cada 20 seguidores
              if (count % 20 === 0) {
                P.info(`📈 Progreso: ${count}/${userInfo.follower_count} seguidores extraídos...`);
              }

              // Verificar si hay más páginas
              hasMore = followersFeed.isMoreAvailable();
              
              if (hasMore && count < limit) {
                // Delay entre páginas para evitar rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
              }

            } catch (pageError) {
              P.error(`❌ Error obteniendo página: ${pageError.message}`);
              // Si hay error en una página, continuar con lo que tenemos
              break;
            }
          }

          P.info(`✅ ${followers.length} seguidores extraídos de ${username} (de ${userInfo.follower_count} totales)`);
          
          return {
            success: true,
            followers,
            account_info: userInfo,
            extracted_count: followers.length,
            limit_requested: limit,
            total_followers: userInfo.follower_count
          };

        } catch (feedError) {
          P.error(`❌ Error obteniendo seguidores: ${feedError.message}`);
          
          // Si falla la extracción, devolver información básica del usuario
          return {
            success: false,
            error: `No se pudieron obtener seguidores: ${feedError.message}`,
            followers: [],
            account_info: userInfo
          };
        }

      } catch (error) {
        P.error(`❌ Error obteniendo seguidores de ${username}: ${error.message}`);
        throw error;
      }
    });
  }

  /**
   * Verificar estado de la sesión
   */
  async checkStatus() {
    try {
      if (!this.logged) {
        return { connected: false };
      }

      const user = await this.ig.account.currentUser();
      return {
        connected: true,
        username: this.username,
        igUserId: user.pk,
        full_name: user.full_name
      };
    } catch (error) {
      P.error(`❌ Error verificando estado: ${error.message}`);
      this.logged = false;
      return { connected: false, error: error.message };
    }
  }
}

/**
 * Obtener o crear sesión de Instagram para un usuario
 */
export async function getOrCreateIGSession(userId) {
  if (igSessions.has(userId)) {
    const existing = igSessions.get(userId);
    // Verificar si la sesión tiene cookies cargadas
    if (existing.logged) {
      return existing;
    }
    // Si no está logueada pero existe, intentar cargar desde archivo
    try {
      const file = path.join(STATE_DIR, `${userId}.json`);
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (data.cookieJar && data.username) {
          await existing.ig.state.deserializeCookieJar(JSON.stringify(data.cookieJar));
          existing.logged = true;
          existing.username = data.username;
          existing.igUserId = data.igUserId;
          
          // Restaurar processedMessages y processedComments
          if (data.processedMessages && Array.isArray(data.processedMessages)) {
            existing.processedMessages = new Set(data.processedMessages);
            P.info(`✅ Restaurados ${existing.processedMessages.size} mensajes procesados`);
          } else {
            existing.processedMessages = new Set();
          }
          
          if (data.processedComments && Array.isArray(data.processedComments)) {
            existing.processedComments = new Set(data.processedComments);
            P.info(`✅ Restaurados ${existing.processedComments.size} comentarios procesados`);
          } else {
            existing.processedComments = new Set();
          }
          
          P.info(`✅ Sesión restaurada desde archivo para usuario ${userId}`);
          return existing;
        }
      }
    } catch (restoreError) {
      P.warn(`⚠️ No se pudo restaurar sesión desde archivo: ${restoreError.message}`);
    }
  }

  if (initializing.has(userId)) {
    return initializing.get(userId);
  }

  const sessionPromise = (async () => {
    const service = new InstagramService(userId);
    
    // Intentar cargar sesión guardada si existe
    try {
      const file = path.join(STATE_DIR, `${userId}.json`);
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (data.cookieJar && data.username) {
          await service.ig.state.deserializeCookieJar(JSON.stringify(data.cookieJar));
          service.logged = true;
          service.username = data.username;
          service.igUserId = data.igUserId;
          
          // Restaurar processedMessages y processedComments
          if (data.processedMessages && Array.isArray(data.processedMessages)) {
            service.processedMessages = new Set(data.processedMessages);
            P.info(`✅ Restaurados ${service.processedMessages.size} mensajes procesados`);
          } else {
            service.processedMessages = new Set();
          }
          
          if (data.processedComments && Array.isArray(data.processedComments)) {
            service.processedComments = new Set(data.processedComments);
            P.info(`✅ Restaurados ${service.processedComments.size} comentarios procesados`);
          } else {
            service.processedComments = new Set();
          }
          
          P.info(`✅ Sesión cargada desde archivo para usuario ${userId}`);
        }
      }
    } catch (loadError) {
      P.info(`ℹ️ No hay sesión guardada para usuario ${userId}, se creará una nueva al hacer login`);
    }
    
    igSessions.set(userId, service);
    return service;
  })();

  initializing.set(userId, sessionPromise);
  const service = await sessionPromise;
  initializing.delete(userId);

  return service;
}

/**
 * Eliminar sesión de Instagram
 */
export function removeIGSession(userId) {
  if (igSessions.has(userId)) {
    igSessions.delete(userId);
    P.info(`Sesión de Instagram eliminada para usuario ${userId}`);
  }
}

// Función wrapper para extraer DMs reales
export async function igSyncInbox() {
  try {
    // Usar la primera sesión disponible o crear una nueva
    let session = null;
    for (const [userId, userSession] of igSessions) {
      if (userSession.logged) {
        session = userSession;
        break;
      }
    }
    
    if (!session) {
      return {
        success: false,
        error: 'No hay sesión activa de Instagram. Debe hacer login primero.',
        data: []
      };
    }
    
    console.log('🔄 [IG] Extrayendo DMs reales de Instagram...');
    const result = await session.fetchInbox();
    
    return {
      success: true,
      data: result,
      message: 'DMs reales extraídos exitosamente'
    };
  } catch (error) {
    console.error('❌ [IG] Error extrayendo DMs:', error.message);
    return {
      success: false,
      error: error.message,
      data: []
    };
  }
}

// Función wrapper para extraer comentarios de una publicación específica
export async function igGetCommentsFromPost(postUrl, limit = 50) {
  try {
    // Usar la primera sesión disponible o crear una nueva
    let session = null;
    for (const [userId, userSession] of igSessions) {
      if (userSession.logged) {
        session = userSession;
        break;
      }
    }
    
    if (!session) {
      return {
        success: false,
        error: 'No hay sesión activa de Instagram. Debe hacer login primero.',
        comments: [],
        post_info: null
      };
    }
    
    console.log(`💬 [IG] Extrayendo comentarios de publicación: ${postUrl}`);
    const result = await session.getCommentsFromPost(postUrl, limit);
    
    return {
      success: result.success,
      comments: result.comments || [],
      post_info: result.post_info,
      extracted_count: result.extracted_count || 0,
      limit_requested: limit,
      total_comments: result.total_comments,
      error: result.error,
      message: result.success ? 
        `${result.extracted_count} comentarios extraídos de la publicación` : 
        `Error extrayendo comentarios: ${result.error}`
    };
  } catch (error) {
    console.error('❌ [IG] Error obteniendo comentarios de publicación:', error.message);
    return {
      success: false,
      comments: [],
      post_info: null,
      error: error.message,
      message: 'Error interno obteniendo comentarios de publicación'
    };
  }
}

// Función wrapper para extraer comentarios reales
export async function igGetComments(limit = 20) {
  try {
    // Usar la primera sesión disponible o crear una nueva
    let session = null;
    for (const [userId, userSession] of igSessions) {
      if (userSession.logged) {
        session = userSession;
        break;
      }
    }
    
    if (!session) {
      return {
        success: false,
        error: 'No hay sesión activa de Instagram. Debe hacer login primero.',
        data: []
      };
    }
    
    console.log('🔄 [IG] Extrayendo comentarios reales de Instagram...');
    const result = await session.getRecentComments(limit);
    
    return {
      success: true,
      data: result,
      message: 'Comentarios reales extraídos exitosamente'
    };
  } catch (error) {
    console.error('❌ [IG] Error extrayendo comentarios:', error.message);
    return {
      success: false,
      error: error.message,
      data: []
    };
  }
}

// Función wrapper para buscar usuarios de Instagram
export async function igSearchUsers(query, limit = 10) {
  try {
    // Usar la primera sesión disponible o crear una nueva
    let session = null;
    for (const [userId, userSession] of igSessions) {
      if (userSession.logged) {
        session = userSession;
        break;
      }
    }
    
    if (!session) {
      return {
        success: false,
        error: 'No hay sesión activa de Instagram. Debe hacer login primero.',
        data: []
      };
    }
    
    console.log(`🔍 [IG] Buscando usuarios de Instagram: "${query}"`);
    const result = await session.searchUsers(query, limit);
    
    return {
      success: true,
      data: result,
      message: 'Búsqueda de usuarios exitosa'
    };
  } catch (error) {
    console.error('❌ [IG] Error buscando usuarios:', error.message);
    return {
      success: false,
      error: error.message,
      data: []
    };
  }
}

// Función wrapper para enviar mensaje directo
export async function igSendMessage(username, message) {
  try {
    // Usar la primera sesión disponible o crear una nueva
    let session = null;
    for (const [userId, userSession] of igSessions) {
      if (userSession.logged) {
        session = userSession;
        break;
      }
    }
    
    if (!session) {
      return {
        success: false,
        error: 'No hay sesión activa de Instagram. Debe hacer login primero.',
        data: null
      };
    }
    
    console.log(`📤 [IG] Enviando mensaje a ${username}: "${message}"`);
    const result = await session.sendMessage(username, message);
    
    return {
      success: true,
      data: result,
      message: 'Mensaje enviado exitosamente'
    };
  } catch (error) {
    console.error('❌ [IG] Error enviando mensaje:', error.message);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

// Función wrapper para obtener seguidores de una cuenta
export async function igGetFollowers(username, limit = 100) {
  try {
    // Usar la primera sesión disponible o crear una nueva
    let session = null;
    for (const [userId, userSession] of igSessions) {
      if (userSession.logged) {
        session = userSession;
        break;
      }
    }
    
    if (!session) {
      return {
        success: false,
        error: 'No hay sesión activa de Instagram. Debe hacer login primero.',
        followers: [],
        account_info: null
      };
    }
    
    console.log(`👥 [IG] Obteniendo seguidores de ${username} (límite: ${limit})`);
    const result = await session.getFollowers(username, limit);
    
    return {
      success: result.success,
      followers: result.followers || [],
      account_info: result.account_info,
      extracted_count: result.extracted_count || 0,
      limit_requested: limit,
      error: result.error,
      message: result.success ? 
        `${result.extracted_count} seguidores extraídos de ${username}` : 
        `Error extrayendo seguidores: ${result.error}`
    };
  } catch (error) {
    console.error('❌ [IG] Error obteniendo seguidores:', error.message);
    return {
      success: false,
      followers: [],
      account_info: null,
      error: error.message,
      message: 'Error interno obteniendo seguidores'
    };
  }
}

export { InstagramService };
