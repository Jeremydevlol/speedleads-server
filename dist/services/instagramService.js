import Bottleneck from 'bottleneck';
import fs from 'fs';
import { IgApiClient, IgLoginTwoFactorRequiredError } from 'instagram-private-api';
import path, { dirname } from 'path';
import pino from 'pino';
import { fileURLToPath } from 'url';
import axios from 'axios';
import puppeteer from 'puppeteer';

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

// Store de pendientes de 2FA por userId
export const pending2FA = new Map();

/**
 * Helper seguro para convertir shortcode a media ID usando BigInt
 * Evita el redondeo de JavaScript con números grandes
 */
function shortcodeToPk(code) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = 0n;
  for (const ch of code) {
    const idx = BigInt(alphabet.indexOf(ch));
    if (idx < 0n) throw new Error(`Shortcode inválido: ${ch}`);
    id = id * 64n + idx;
  }
  return id.toString(); // Siempre como string
}

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
   * Cargar pool de dispositivos realistas
   */
  loadDevicePool() {
    try {
      const devicesPath = path.join(process.cwd(), 'storage', 'ig_devices', 'devices.json');
      if (fs.existsSync(devicesPath)) {
        const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
        P.info(`📱 Cargados ${devices.length} dispositivos del pool`);
        return devices;
      }
    } catch (error) {
      P.warn(`⚠️ Error cargando pool de dispositivos: ${error.message}`);
    }
    return null;
  }

  /**
   * Generar UUID aleatorio
   */
  generateRandomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Generar Device ID aleatorio
   */
  generateRandomDeviceId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Detectar y generar dispositivo basado en el dispositivo REAL del cliente
   */
  async generateRealDeviceFromHeaders(username, deviceHeaders = {}) {
    try {
      const userAgent = deviceHeaders['user-agent'] || '';
      
      if (!userAgent) {
        P.warn('⚠️ No se detectó User-Agent, usando generación por defecto');
        this.ig.state.generateDevice(username);
        return null;
      }

      // Detectar dispositivo móvil o desktop desde User-Agent
      const isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      const isAndroid = /Android/i.test(userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
      
      // Detectar dispositivos desktop reales
      const isMac = /Macintosh|Mac OS X/i.test(userAgent);
      const isWindows = /Windows|Win32|Win64/i.test(userAgent);
      const isLinux = /Linux/i.test(userAgent) && !isAndroid;
      const isDesktop = (isMac || isWindows || isLinux) && !isMobile;
      
      // Extraer información del User-Agent
      let deviceString = null;
      let androidVersion = null;
      let build = null;
      
      if (isAndroid && userAgent) {
        // Extraer versión de Android desde User-Agent
        // Ejemplo: "Android 12" o "Android 13"
        const androidMatch = userAgent.match(/Android\s+([\d.]+)/i);
        if (androidMatch) {
          androidVersion = androidMatch[1].split('.')[0]; // Solo el número principal (12, 13, etc.)
        }
        
        // Intentar extraer información del dispositivo
        // Formato típico: "Samsung SM-G991B" o "Xiaomi Redmi Note 10 Pro"
        const deviceInfo = userAgent.match(/\(Linux; Android [\d.]+; (.+?)\)/i);
        
        if (deviceInfo && deviceInfo[1]) {
          const deviceParts = deviceInfo[1].split(/[;)]/)[0].trim();
          // El formato puede variar, usar lo que encontramos
          P.info(`📱 Dispositivo Android detectado: ${deviceParts}`);
          
          // Construir deviceString en formato Instagram
          // Formato: "VERSION/RELEASE; DPI; RESOLUTION; MANUFACTURER; MODEL; DEVICE; DEVICE"
          // Usar valores comunes si no podemos detectarlos específicamente
          const version = androidVersion || '30';
          const release = androidVersion ? `${androidVersion}.0.0` : '13.0.0';
          const dpi = '420'; // DPI común
          const resolution = '1080x2400'; // Resolución común
          
          // Intentar extraer manufacturer y model
          let manufacturer = 'samsung'; // Default
          let model = 'SM-G991B'; // Default
          
          // Detectar manufacturer común
          if (/samsung/i.test(deviceParts) || /SM-/i.test(deviceParts)) {
            manufacturer = 'samsung';
            const smMatch = deviceParts.match(/SM-([A-Z0-9]+)/i);
            if (smMatch) model = `SM-${smMatch[1]}`;
          } else if (/xiaomi|redmi|mi/i.test(deviceParts)) {
            manufacturer = 'Xiaomi';
            model = deviceParts.match(/(Redmi|Mi|POCO)[\s-]?([A-Z0-9\s]+)/i)?.[0] || 'Mi 9T';
          } else if (/oneplus/i.test(deviceParts)) {
            manufacturer = 'OnePlus';
            model = deviceParts.match(/ONEPLUS\s+([A-Z0-9]+)/i)?.[1] || 'ONEPLUS A6003';
          }
          
          deviceString = `${version}/${release}; ${dpi}dpi; ${resolution}; ${manufacturer.toLowerCase()}; ${model}; ${model.toLowerCase()}; ${model.toLowerCase()}`;
        }
      }
      
      // Si no pudimos construir un deviceString específico, detectar dispositivo desktop real
      if (!deviceString) {
        let detectedDevice = null;
        let deviceInfo = '';
        
        // Detectar dispositivo desktop real
        if (isDesktop) {
          if (isMac) {
            // Extraer versión de macOS
            const macMatch = userAgent.match(/Mac OS X (\d+)[._](\d+)/i);
            const macVersion = macMatch ? `${macMatch[1]}.${macMatch[2]}` : '14.0';
            detectedDevice = {
              type: 'Mac',
              os: 'macOS',
              version: macVersion,
              platform: 'Macintosh'
            };
            deviceInfo = `Mac (macOS ${macVersion})`;
            
            // Extraer modelo si está disponible
            if (userAgent.includes('Intel')) {
              detectedDevice.architecture = 'Intel';
            } else if (userAgent.includes('Apple')) {
              detectedDevice.architecture = 'Apple Silicon';
            }
          } else if (isWindows) {
            // Extraer versión de Windows
            let windowsVersion = '10';
            if (userAgent.includes('Windows NT 10.0')) windowsVersion = '10';
            else if (userAgent.includes('Windows NT 11.0')) windowsVersion = '11';
            else if (userAgent.includes('Windows NT 6.3')) windowsVersion = '8.1';
            else if (userAgent.includes('Windows NT 6.2')) windowsVersion = '8';
            else if (userAgent.includes('Windows NT 6.1')) windowsVersion = '7';
            
            detectedDevice = {
              type: 'Windows',
              os: 'Windows',
              version: windowsVersion,
              platform: 'Win32'
            };
            deviceInfo = `Windows ${windowsVersion}`;
            
            // Detectar arquitectura
            if (userAgent.includes('WOW64') || userAgent.includes('Win64')) {
              detectedDevice.architecture = 'x64';
            } else {
              detectedDevice.architecture = 'x86';
            }
          } else if (isLinux) {
            // Detectar distribución Linux si es posible
            let distro = 'Linux';
            if (userAgent.includes('Ubuntu')) distro = 'Ubuntu';
            else if (userAgent.includes('Fedora')) distro = 'Fedora';
            else if (userAgent.includes('Debian')) distro = 'Debian';
            
            detectedDevice = {
              type: 'Linux',
              os: distro,
              version: 'Unknown',
              platform: 'Linux'
            };
            deviceInfo = distro;
          }
          
          P.info(`💻 Dispositivo DESKTOP REAL detectado: ${deviceInfo}`);
          P.info(`   User-Agent original: ${userAgent.substring(0, 120)}...`);
        } else if (isIOS) {
          P.info(`📱 Dispositivo iOS detectado - Instagram API requiere Android`);
          deviceInfo = 'iOS';
        } else {
          P.info(`📱 Dispositivo no identificado - Instagram API requiere Android`);
          deviceInfo = 'Unknown';
        }
        
        // ⚠️ IMPORTANTE: Instagram API requiere deviceString Android
        // Por eso generamos Android, pero guardamos información del dispositivo real
        this.ig.state.generateDevice(username);
        
        // NO cambiar User-Agent para desktop/iOS (dejar por defecto de IgApiClient)
        // Solo configuramos Accept-Language para mantener coherencia de idioma
        if (deviceHeaders['accept-language']) {
          this.ig.request.defaults.headers = {
            ...this.ig.request.defaults.headers,
            'Accept-Language': deviceHeaders['accept-language']
          };
        }
        
        P.info(`   📝 DeviceString Android generado (requerido por Instagram API): ${this.ig.state.deviceString?.substring(0, 60)}...`);
        P.info(`   ✅ Dejando User-Agent por defecto de IgApiClient (Instagram Android)`);
        
        if (detectedDevice) {
          // Guardar dispositivo real del cliente en la instancia para usar al guardar sesión
          this.realDevice = detectedDevice;
          this.realUserAgent = userAgent;
          P.info(`   💾 Dispositivo real del cliente guardado: ${JSON.stringify(detectedDevice)}`);
        }
        
        return {
          deviceString: this.ig.state.deviceString,
          deviceId: this.ig.state.deviceId,
          uuid: this.ig.state.uuid,
          phoneId: this.ig.state.phoneId,
          isRealDevice: false, // No es dispositivo real Android
          realDevice: detectedDevice, // Dispositivo real del cliente (desktop)
          userAgent: userAgent, // User-Agent real del cliente guardado
          note: `Desktop (${deviceInfo}): Using default Instagram Android fingerprint, real device info saved`
        };
      }
      
      // Configurar dispositivo detectado
      const deviceId = `android-${this.generateRandomDeviceId()}`;
      const uuid = this.generateRandomUUID();
      const phoneId = this.generateRandomUUID();
      
      this.ig.state.deviceString = deviceString;
      this.ig.state.deviceId = deviceId;
      this.ig.state.uuid = uuid;
      this.ig.state.phoneId = phoneId;
      this.ig.state.adid = this.generateRandomUUID();
      this.ig.state.build = build || androidVersion || '30';
      
      // Configurar headers reales del cliente
      // ✅ Para Android real: SÍ usar el User-Agent real del cliente
      // Mantiene coherencia: deviceString Android + User-Agent Android del cliente
      this.ig.request.defaults.headers = {
        ...this.ig.request.defaults.headers,
        'User-Agent': userAgent, // User-Agent Android real del cliente
        'Accept-Language': deviceHeaders['accept-language'] || 'es-ES,es;q=0.9',
        'Accept-Encoding': deviceHeaders['accept-encoding'] || 'gzip, deflate, br'
      };
      
      // Headers específicos de Chrome en Android
      if (deviceHeaders['sec-ch-ua']) {
        this.ig.request.defaults.headers['sec-ch-ua'] = deviceHeaders['sec-ch-ua'];
      }
      if (deviceHeaders['sec-ch-ua-platform']) {
        this.ig.request.defaults.headers['sec-ch-ua-platform'] = deviceHeaders['sec-ch-ua-platform'];
      }
      
      // Limpiar dispositivo real previo (es Android, no desktop)
      this.realDevice = null;
      this.realUserAgent = null;
      
      P.info(`📱 Dispositivo REAL Android detectado y configurado: ${deviceString.substring(0, 80)}...`);
      P.info(`   ✅ User-Agent Android real: ${userAgent.substring(0, 100)}...`);
      P.info(`   ✅ Coherencia: DeviceString Android + User-Agent Android del cliente`);
      
      return {
        deviceString: deviceString,
        deviceId: deviceId,
        uuid: uuid,
        phoneId: phoneId,
        adid: this.ig.state.adid,
        build: build || androidVersion || '30',
        userAgent: userAgent,
        isRealDevice: true
      };
      
    } catch (error) {
      P.warn(`⚠️ Error detectando dispositivo real: ${error.message}, usando generación por defecto`);
      this.ig.state.generateDevice(username);
      return null;
    }
  }

  /**
   * Delay humano aleatorio (simula tiempo de reacción humano)
   */
  async humanDelay(minMs = 500, maxMs = 2000) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }

  /**
   * Periodo de calentamiento después del login (comportamiento humano)
   * Simula actividad normal de usuario antes de activar el bot
   */
  async warmUpPeriod(minutes = 30) {
    try {
      P.info(`🔥 Iniciando periodo de calentamiento de ${minutes} minutos para ${this.username}...`);
      emitToUserIG(this.userId, 'instagram:status', { 
        connected: true, 
        username: this.username,
        igUserId: this.igUserId,
        warmingUp: true,
        estimatedReadyTime: Date.now() + (minutes * 60 * 1000)
      });

      const steps = [
        { action: 'checkProfile', delay: 30000, description: 'Revisando perfil propio...' },
        { action: 'checkFeed', delay: 60000, description: 'Revisando feed...' },
        { action: 'checkStories', delay: 90000, description: 'Revisando stories...' },
        { action: 'checkDMs', delay: 120000, description: 'Revisando DMs...' },
        { action: 'scrollFeed', delay: 300000, description: 'Navegando feed...' },
        { action: 'likePost', delay: 600000, description: 'Simulando actividad...' },
        { action: 'checkNotifications', delay: 900000, description: 'Revisando notificaciones...' }
      ];

      // Calcular tiempo total y ejecutar pasos
      const totalSteps = Math.floor((minutes * 60 * 1000) / 60000); // Pasos cada minuto aproximadamente
      
      for (let i = 0; i < Math.min(steps.length, totalSteps); i++) {
        const step = steps[i];
        
        try {
          // Esperar delay antes de ejecutar acción
          await new Promise(resolve => setTimeout(resolve, step.delay));
          
          // Agregar delay humano antes de cada acción
          await this.humanDelay(1000, 3000);
          
          switch(step.action) {
            case 'checkProfile':
              try {
                await this.ig.account.currentUser();
                P.info(`👤 ${step.description}`);
              } catch (e) {
                P.warn(`⚠️ Error en checkProfile: ${e.message}`);
              }
              break;
              
            case 'checkFeed':
              try {
                const feed = this.ig.feed.timeline();
                await feed.request();
                P.info(`📺 ${step.description}`);
              } catch (e) {
                P.warn(`⚠️ Error en checkFeed: ${e.message}`);
              }
              break;
              
            case 'checkStories':
              try {
                const reelsFeed = this.ig.feed.reelsMedia();
                await reelsFeed.request();
                P.info(`📸 ${step.description}`);
              } catch (e) {
                P.warn(`⚠️ Error en checkStories: ${e.message}`);
              }
              break;
              
            case 'checkDMs':
              try {
                await this.ig.direct.inbox();
                P.info(`💬 ${step.description}`);
              } catch (e) {
                P.warn(`⚠️ Error en checkDMs: ${e.message}`);
              }
              break;
              
            case 'scrollFeed':
              try {
                const feed2 = this.ig.feed.timeline();
                await feed2.request();
                const items = await feed2.items();
                if (items && items.length > 0) {
                  P.info(`📜 ${step.description} (${items.length} posts)`);
                }
              } catch (e) {
                P.warn(`⚠️ Error en scrollFeed: ${e.message}`);
              }
              break;
              
            case 'likePost':
              // No dar like realmente, solo simular
              P.info(`❤️ ${step.description}`);
              break;
              
            case 'checkNotifications':
              try {
                await this.ig.news.inbox();
                P.info(`🔔 ${step.description}`);
              } catch (e) {
                P.warn(`⚠️ Error en checkNotifications: ${e.message}`);
              }
              break;
          }
          
          // Delay aleatorio entre acciones (5-15 segundos)
          await this.humanDelay(5000, 15000);
          
        } catch (error) {
          P.warn(`⚠️ Error en warm-up ${step.action}: ${error.message}`);
        }
      }
      
      P.info(`✅ Periodo de calentamiento completado. Bot listo para operaciones.`);
      emitToUserIG(this.userId, 'instagram:status', { 
        connected: true,
        warmedUp: true,
        ready: true,
        username: this.username,
        igUserId: this.igUserId
      });
      
    } catch (error) {
      P.error(`❌ Error en warm-up period: ${error.message}`);
      emitToUserIG(this.userId, 'instagram:status', { 
        connected: true,
        warmedUp: false,
        ready: true, // Permitir continuar aunque haya fallado el warm-up
        username: this.username,
        igUserId: this.igUserId,
        warning: 'Warm-up period falló, pero el bot está listo'
      });
    }
  }
  
  /**
   * Guardar sesión en archivo (incluyendo processedMessages, processedComments y device fingerprint)
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
      
      // Guardar device fingerprint si está disponible
      const deviceData = this.ig.state.deviceString ? {
        deviceString: this.ig.state.deviceString,
        deviceId: this.ig.state.deviceId,
        uuid: this.ig.state.uuid,
        phoneId: this.ig.state.phoneId,
        adid: this.ig.state.adid,
        build: this.ig.state.build
      } : null;
      
      fs.writeFileSync(file, JSON.stringify({ 
        cookieJar,
        username: this.username,
        igUserId: this.igUserId,
        savedAt: new Date().toISOString(),
        processedMessages: processedMessagesArray,
        processedComments: processedCommentsArray,
        device: deviceData
      }), 'utf8');
      
      P.info(`💾 Sesión guardada (${processedMessagesArray.length} mensajes, ${processedCommentsArray.length} comentarios procesados${deviceData ? ', fingerprint guardado' : ''})`);
    } catch (error) {
      P.warn(`⚠️ Error guardando sesión: ${error.message}`);
    }
  }

  /**
   * Completar login con código 2FA
   * Se llama después de que el usuario ingresa el código de verificación
   */
  async completeTwoFactorLogin(code) {
    try {
      // Verificar que hay un 2FA pendiente
      const pending = pending2FA.get(this.userId);
      if (!pending) {
        P.error(`❌ No hay un login con 2FA pendiente para usuario ${this.userId}`);
        return {
          success: false,
          error: 'No hay un login con 2FA pendiente para este usuario',
          message: 'Por favor, intenta hacer login nuevamente primero'
        };
      }

      const { twoFactorIdentifier, username: igUsername, verificationMethod } = pending;

      P.info(`🔐 Completando login 2FA para usuario ${igUsername} (método: ${verificationMethod === '1' ? 'SMS' : 'TOTP'})`);

      // Completar login con código 2FA
      const loggedUser = await this.ig.account.twoFactorLogin({
        username: igUsername,
        verificationCode: code,
        twoFactorIdentifier,
        verificationMethod, // '1' SMS, '0' TOTP
        trustThisDevice: '1' // Confiar en este dispositivo
      });

      // Si llegamos aquí, el login fue exitoso
      this.igUserId = loggedUser.pk;
      this.logged = true;
      this.username = igUsername;

      P.info(`✅ Login 2FA exitoso para ${igUsername}`);

      // Guardar sesión
      const file = this.stateFile();
      const cookieJar = await this.ig.state.serializeCookieJar();
      
      const processedMessagesArray = this.processedMessages ? Array.from(this.processedMessages) : [];
      const processedCommentsArray = this.processedComments ? Array.from(this.processedComments) : [];
      
      const deviceData = this.ig.state.deviceString ? {
        deviceString: this.ig.state.deviceString,
        deviceId: this.ig.state.deviceId,
        uuid: this.ig.state.uuid,
        phoneId: this.ig.state.phoneId,
        adid: this.ig.state.adid,
        build: this.ig.state.build
      } : null;

      fs.writeFileSync(file, JSON.stringify({
        cookieJar,
        username: igUsername,
        igUserId: this.igUserId,
        savedAt: new Date().toISOString(),
        processedMessages: processedMessagesArray,
        processedComments: processedCommentsArray,
        device: deviceData
      }), 'utf8');

      P.info(`💾 Sesión 2FA guardada para ${igUsername}`);

      // Limpiar 2FA pendiente
      pending2FA.delete(this.userId);

      // Emitir evento de éxito
      emitToUserIG(this.userId, 'instagram:status', {
        connected: true,
        username: igUsername,
        igUserId: this.igUserId,
        twoFA_completed: true
      });

      // Iniciar warm-up period en background
      const warmUpMinutes = 30;
      P.info(`🔥 Iniciando periodo de calentamiento de ${warmUpMinutes} minutos en background...`);
      this.warmUpPeriod(warmUpMinutes).catch(error => {
        P.error(`❌ Error en warm-up period: ${error.message}`);
      });

      return {
        success: true,
        status: 'LOGGED',
        username: igUsername,
        igUserId: this.igUserId,
        twoFA_completed: true
      };

    } catch (error) {
      const msg = String(error?.message || error);
      P.error(`❌ Error completando login 2FA: ${msg}`);
      P.error(`   Tipo: ${error?.constructor?.name || 'Desconocido'}`);

      // Emitir evento de error
      emitToUserIG(this.userId, 'instagram:alert', {
        type: '2fa_failed',
        severity: 'error',
        message: 'Código 2FA incorrecto o expirado',
        description: msg,
        username: pending2FA.get(this.userId)?.username || 'unknown'
      });

      return {
        success: false,
        status: '2FA_FAILED',
        error: 'Código incorrecto o expirado',
        message: 'El código de verificación es incorrecto o ha expirado. Por favor, intenta nuevamente.'
      };
    }
  }

  /**
   * Login a Instagram con usuario/contraseña
   * Restaura sesión desde archivo si existe
   */
  async login({ username, password, proxy, clientIP, deviceHeaders }) {
    try {
      P.info(`Intentando login de Instagram para ${username}`);
      
      this.username = username;
      
      // Delay humano antes de continuar (simula tiempo de pensar)
      await this.humanDelay(500, 1500);

      const file = this.stateFile();
      const challengeFile = path.join(STATE_DIR, `${this.userId}_challenge.json`);
      
      // ⭐ IMPORTANTE: REUTILIZAR SIEMPRE EL MISMO DISPOSITIVO GUARDADO POR CUENTA
      // Esto mantiene consistencia y evita detección por cambios de dispositivo
      
      // Declarar variables primero
      let savedDevice = null;
      let savedIP = null;
      
      // Intentar cargar IP guardada ANTES de configurarla
      if (fs.existsSync(file)) {
        try {
          const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
          
          // ✅ RESTAURAR IP guardada si existe
          if (saved.clientIP) {
            savedIP = saved.clientIP;
            P.info(`📍 IP guardada encontrada: ${savedIP}`);
          }
          
          // ✅ RESTAURAR dispositivo guardado si existe
          if (saved.device && saved.device.deviceString) {
            savedDevice = saved.device;
            P.info(`📱 Dispositivo guardado encontrado, será reutilizado: ${savedDevice.deviceString.substring(0, 60)}...`);
          }
        } catch (loadError) {
          P.warn(`⚠️ Error cargando sesión guardada: ${loadError.message}`);
        }
      }
      
      // 📍 CONFIGURAR UBICACIÓN - Mantener IP/región consistente por cuenta
      // Si hay IP guardada, usarla; sino usar la nueva del cliente
      const ipToUse = savedIP || clientIP;
      
      if (ipToUse && ipToUse !== 'unknown') {
        try {
          // Establecer la IP (guardada o nueva) en los headers de Instagram
          this.ig.request.defaults.headers = {
            ...this.ig.request.defaults.headers,
            'X-Forwarded-For': ipToUse,
            'X-Real-IP': ipToUse,
            'CF-Connecting-IP': ipToUse
          };
          
          if (savedIP) {
            P.info(`📍 Usando IP guardada para mantener consistencia: ${savedIP}`);
            P.info(`   (IP original del cliente era: ${clientIP || 'no detectada'})`);
          } else {
            P.info(`📍 Ubicación REAL configurada - IP del cliente: ${clientIP}`);
            P.info(`   ✅ Esta IP será guardada para futuros logins de esta cuenta`);
          }
          
          // Validar que la IP sea válida (formato IPv4 o IPv6)
          const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
          if (!ipRegex.test(ipToUse) && ipToUse !== '127.0.0.1') {
            P.warn(`⚠️ IP detectada no tiene formato válido: ${ipToUse}`);
          }
          
        } catch (ipError) {
          P.warn(`⚠️ No se pudo configurar IP: ${ipError.message}`);
        }
      } else {
        P.warn(`⚠️ No se pudo obtener IP válida del cliente. IP recibida: ${clientIP || 'null'}`);
        P.warn(`   Instagram puede detectar ubicación incorrecta.`);
      }
      
      // 🕐 CONFIGURAR HORA/TIMEZONE EN TIEMPO REAL
      const now = new Date();
      
      // Usar timezone del cliente si está disponible, sino usar del servidor
      let timezoneOffset = deviceHeaders && deviceHeaders['timezone-offset'] 
        ? parseInt(deviceHeaders['timezone-offset']) 
        : -now.getTimezoneOffset(); // Offset en minutos (ej: -300 para UTC-5)
      
      const timezone = deviceHeaders && deviceHeaders['timezone'] 
        ? deviceHeaders['timezone'] 
        : `UTC${timezoneOffset >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0')}:${String(Math.abs(timezoneOffset) % 60).padStart(2, '0')}`;
      
      const timezoneOffsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
      const timezoneOffsetMinutes = Math.abs(timezoneOffset) % 60;
      const timezoneSign = timezoneOffset >= 0 ? '+' : '-';
      const timezoneString = `UTC${timezoneSign}${String(timezoneOffsetHours).padStart(2, '0')}:${String(timezoneOffsetMinutes).padStart(2, '0')}`;
      
      // Timestamp actual en tiempo real (segundos Unix)
      const currentTimestamp = Math.floor(Date.now() / 1000);
      
      // Usar timestamp del cliente si está disponible (para sincronización)
      const clientTimestamp = deviceHeaders && deviceHeaders['timestamp'] 
        ? Math.floor(parseInt(deviceHeaders['timestamp']) / 1000) 
        : currentTimestamp;
      
      // Configurar headers de tiempo en tiempo real
      this.ig.request.defaults.headers = {
        ...this.ig.request.defaults.headers,
        'Date': now.toUTCString(),
        'X-Request-Time': currentTimestamp.toString(),
        'X-Client-Time': clientTimestamp.toString(),
        'X-Timezone-Offset': timezoneOffset.toString(),
        'X-Timezone': timezone
      };
      
      // Configurar headers de ubicación si están disponibles
      if (deviceHeaders && deviceHeaders['country']) {
        this.ig.request.defaults.headers['X-Country'] = deviceHeaders['country'];
      }
      if (deviceHeaders && deviceHeaders['city']) {
        this.ig.request.defaults.headers['X-City'] = deviceHeaders['city'];
      }
      
      P.info(`🕐 Hora REAL configurada - Timestamp: ${currentTimestamp}, Timezone: ${timezoneString}${deviceHeaders && deviceHeaders['country'] ? `, País: ${deviceHeaders['country']}` : ''}`);
      
      if (proxy) {
        this.ig.state.proxyUrl = proxy;
        P.info(`Usando proxy: ${proxy}`);
      }
      
      // Verificar si hay un challenge pendiente reciente
      if (fs.existsSync(challengeFile)) {
        try {
          const challengeData = JSON.parse(fs.readFileSync(challengeFile, 'utf8'));
          const challengeAge = Date.now() - challengeData.timestamp;
          
          // Si el challenge es reciente (menos de 30 minutos), informar al usuario
          if (challengeAge < 30 * 60 * 1000 && challengeData.username === username) {
            P.info(`⚠️ Hay un challenge pendiente reciente para ${username} (hace ${Math.floor(challengeAge / 60000)} minutos)`);
            P.info(`   Intentando login normalmente. Si falla, puede que necesites verificar nuevamente.`);
          }
        } catch (challengeError) {
          // Ignorar error al leer challenge
        }
      }
      
      // Intentar restaurar sesión existente (cookies Y dispositivo)
      if (fs.existsSync(file)) {
        try {
          const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
          
          // Ya cargamos savedDevice y savedIP arriba, solo necesitamos restaurar cookies
          await this.ig.state.deserializeCookieJar(saved.cookieJar);
          
          // Verificar que la sesión sigue válida
          try {
          const user = await this.ig.account.currentUser();
          this.igUserId = user.pk;
          this.logged = true;
          
          // Si hay dispositivo guardado, restaurarlo AHORA
          if (savedDevice) {
            this.ig.state.deviceString = savedDevice.deviceString;
            this.ig.state.deviceId = savedDevice.deviceId;
            this.ig.state.uuid = savedDevice.uuid;
            this.ig.state.phoneId = savedDevice.phoneId;
            if (savedDevice.adid) this.ig.state.adid = savedDevice.adid;
            if (savedDevice.build) this.ig.state.build = savedDevice.build;
            P.info(`✅ Dispositivo guardado restaurado completamente`);
          }
          
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
            
            // Eliminar challenge pendiente si existe (sesión válida = challenge resuelto)
            if (fs.existsSync(challengeFile)) {
              try {
                fs.unlinkSync(challengeFile);
                P.info(`✅ Challenge resuelto - eliminando archivo de challenge pendiente`);
              } catch (unlinkError) {
                // Ignorar error al eliminar
              }
            }
          
          P.info(`✅ Sesión de Instagram restaurada desde disco para ${username}`);
          emitToUserIG(this.userId, 'instagram:status', { 
            connected: true, 
            username: this.username,
            igUserId: this.igUserId 
          });
          
          return { success: true, restored: true };
          } catch (userError) {
            // Si falla currentUser(), la sesión expiró
            P.warn(`⚠️ Sesión guardada inválida, relogueando: ${userError.message}`);
          // Si falla la restauración, continuar con login normal PERO mantener dispositivo guardado
          }
        } catch (restoreError) {
          P.warn(`⚠️ Error restaurando sesión: ${restoreError.message}`);
          // Continuar con login normal
        }
      }

      // Login normal - con manejo mejorado de challenges
      try {
        // ⭐ REUTILIZAR DISPOSITIVO GUARDADO SI EXISTE, sino usar dispositivo del cliente
        if (savedDevice && savedDevice.deviceString) {
          // ✅ REUTILIZAR DISPOSITIVO GUARDADO (mismo dispositivo siempre por cuenta)
          P.info(`📱 Reutilizando dispositivo guardado para mantener consistencia`);
          this.ig.state.deviceString = savedDevice.deviceString;
          this.ig.state.deviceId = savedDevice.deviceId;
          this.ig.state.uuid = savedDevice.uuid;
          this.ig.state.phoneId = savedDevice.phoneId;
          if (savedDevice.adid) this.ig.state.adid = savedDevice.adid;
          if (savedDevice.build) this.ig.state.build = savedDevice.build;
          
          // Si hay User-Agent guardado, usarlo también
          if (savedDevice.userAgent) {
            this.ig.request.defaults.headers = {
              ...this.ig.request.defaults.headers,
              'User-Agent': savedDevice.userAgent
            };
          }
          
          P.info(`   ✅ Dispositivo: ${savedDevice.deviceString.substring(0, 60)}...`);
        } else if (deviceHeaders && deviceHeaders['user-agent'] && deviceHeaders['user-agent'].trim() !== '') {
          // Si no hay dispositivo guardado, usar dispositivo del cliente
          P.info(`📱 No hay dispositivo guardado, usando dispositivo del cliente en tiempo real...`);
          P.info(`   User-Agent recibido: ${deviceHeaders['user-agent'].substring(0, 100)}...`);
          await this.generateRealDeviceFromHeaders(username, deviceHeaders);
        } else {
          // Si no hay deviceHeaders o User-Agent, intentar obtenerlo de los headers de la request
          // Esto puede pasar si se llama desde app.js directamente
          P.warn('⚠️ No se recibió User-Agent en deviceHeaders');
          P.warn(`   deviceHeaders existe: ${!!deviceHeaders}`);
          P.warn(`   user-agent en deviceHeaders: ${deviceHeaders?.['user-agent'] || 'NO EXISTE'}`);
          
          // Intentar usar generación por defecto pero con información mínima
          this.ig.state.generateDevice(username);
          
          // Si hay deviceHeaders pero sin user-agent, al menos configurar otros headers
          if (deviceHeaders) {
            if (deviceHeaders['accept-language']) {
              this.ig.request.defaults.headers['Accept-Language'] = deviceHeaders['accept-language'];
            }
          }
        }
        
        // 🕐 Configurar timestamp actual en tiempo real para el login
        const loginTimestamp = Math.floor(Date.now() / 1000);
        P.info(`🕐 Login iniciado en tiempo real - Timestamp: ${loginTimestamp}`);
        
        P.info('Realizando login a Instagram...');
        
        // ⭐ SIMULAR COMPORTAMIENTO DE NAVEGADOR ANTES DEL LOGIN
        // Esto ayuda a que Instagram vea la conexión como más "humana"
        try {
          // 1. Simular carga de página inicial (como navegador)
          P.info('🌐 Simulando carga de página inicial (comportamiento de navegador)...');
          await this.humanDelay(2000, 4000);
          
          // 2. Intentar acceder a endpoint público primero (como navegador hace)
          try {
            await this.ig.feed.timeline().request();
            P.info('✅ Simulación de navegación exitosa');
          } catch (navError) {
            // Esto es normal si no estamos logueados, solo simula el comportamiento
            P.info('📱 Navegación simulada (esperado sin login)');
          }
          
          // 3. Delay adicional antes del login (simula tiempo de usuario ingresando datos)
          await this.humanDelay(3000, 6000);
          
        } catch (simError) {
          P.warn(`⚠️ Error en simulación de navegador: ${simError.message}, continuando con login...`);
        }
        
        // Delay humano antes de intentar login (simula tiempo de pensar/ingresar datos)
        await this.humanDelay(1500, 3000);
        
        P.info('🔐 Intentando login final...');
        P.info(`   Username: ${username}`);
        P.info(`   Dispositivo: ${this.ig.state.deviceString?.substring(0, 60) || 'No configurado'}...`);
        
        let loginResult;
        try {
          loginResult = await this.ig.account.login(username, password);
          P.info(`✅ Login API completado sin errores inmediatos`);
        } catch (loginError) {
          // Log detallado del error
          P.error(`❌ Error capturado en login: ${loginError?.message || 'Error desconocido'}`);
          P.error(`   Tipo de error: ${loginError?.constructor?.name || 'Desconocido'}`);
          P.error(`   Es IgLoginTwoFactorRequiredError? ${loginError instanceof IgLoginTwoFactorRequiredError}`);
          
          // ⭐ DETECTAR 2FA PRIMERO (antes de otros errores)
          if (loginError instanceof IgLoginTwoFactorRequiredError) {
            P.info(`🔐 2FA detectado correctamente para ${username}`);
            P.info(`🔐 2FA requerido para ${username}`);
            
            const twoFactorInfo = loginError.response?.body?.two_factor_info || {};
            const igUsername = twoFactorInfo.username || username;
            const twoFactorIdentifier = twoFactorInfo.two_factor_identifier;
            const totpTwoFactorOn = twoFactorInfo.totp_two_factor_on === true;
            
            // Determinar método de verificación: '0' = TOTP (app), '1' = SMS
            const verificationMethod = totpTwoFactorOn ? '0' : '1';
            
            if (!twoFactorIdentifier) {
              P.error(`⚠️ 2FA requerido pero no se encontró two_factor_identifier`);
              throw new Error('2FA requerido pero información incompleta');
            }
            
            // Guardar información de 2FA pendiente
            pending2FA.set(this.userId, {
              twoFactorIdentifier,
              username: igUsername,
              verificationMethod,
              createdAt: Date.now()
            });
            
            P.info(`💾 Información de 2FA guardada para usuario ${this.userId}`);
            P.info(`   Método: ${verificationMethod === '1' ? 'SMS' : 'TOTP (app)'}`);
            
            // Emitir evento por Socket.IO
            emitToUserIG(this.userId, 'instagram:2fa_required', {
              username: igUsername,
              via: verificationMethod === '1' ? 'sms' : 'app',
              message: verificationMethod === '1' 
                ? 'Instagram requiere código de verificación enviado por SMS'
                : 'Instagram requiere código de verificación de tu app de autenticación'
            });
            
            // Retornar respuesta indicando que se requiere 2FA
            return {
              success: false,
              twoFA_required: true,
              status: '2FA_REQUIRED',
              username: igUsername,
              verification_method: verificationMethod,
              via: verificationMethod === '1' ? 'sms' : 'app',
              message: verificationMethod === '1'
                ? 'Instagram requiere código de verificación enviado por SMS'
                : 'Instagram requiere código de verificación de tu app de autenticación'
            };
          }
          
          // Si no es 2FA, relanzar el error para que sea manejado por el catch general
          throw loginError;
        }
        
        // Si llegamos aquí, el login fue exitoso (sin 2FA)
        this.igUserId = loginResult.pk;
        this.logged = true;

        P.info(`✅ Login exitoso para ${username}, iniciando periodo de calentamiento...`);

        // Guardar cookies - asegurarse de que se guarden correctamente
        // Pequeño delay para asegurar que las cookies se establezcan
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Agregar delay humano adicional después del login
        await this.humanDelay(2000, 4000);
        
        const cookieJar = await this.ig.state.serializeCookieJar();
        P.info(`💾 Guardando cookies después del login`);
        
            // Convertir Sets a Arrays para poder guardarlos en JSON
            const processedMessagesArray = this.processedMessages ? Array.from(this.processedMessages) : [];
            const processedCommentsArray = this.processedComments ? Array.from(this.processedComments) : [];
            
            // Guardar device fingerprint si está disponible (incluyendo User-Agent real y dispositivo desktop)
            const deviceData = this.ig.state.deviceString ? {
              deviceString: this.ig.state.deviceString,
              deviceId: this.ig.state.deviceId,
              uuid: this.ig.state.uuid,
              phoneId: this.ig.state.phoneId,
              adid: this.ig.state.adid,
              build: this.ig.state.build,
              // Si es desktop, guardar User-Agent real del cliente; si es Android, guardar el de Android
              userAgent: this.realUserAgent || this.ig.request.defaults.headers?.['User-Agent'] || null,
              realDevice: this.realDevice || null, // Dispositivo real del cliente (desktop/Mac/Windows/Linux)
              isRealDevice: this.realDevice ? false : true, // false si es desktop, true si es Android real
              note: this.realDevice ? `Desktop (${this.realDevice.type}) - Real device info saved` : 'Android real'
            } : null;
            
            // Guardar también la IP usada para mantener consistencia
            const ipUsed = savedIP || clientIP || 'unknown';
            
            fs.writeFileSync(file, JSON.stringify({ 
              cookieJar,
              username,
              igUserId: this.igUserId,
              savedAt: new Date().toISOString(),
              processedMessages: processedMessagesArray,
              processedComments: processedCommentsArray,
              device: deviceData,
              clientIP: ipUsed // Guardar IP para reutilizar
            }), 'utf8');
            
            P.info(`💾 IP guardada para futuros logins: ${ipUsed}`);

        // Eliminar challenge pendiente si existe (login exitoso = challenge resuelto)
        const challengeFile = path.join(STATE_DIR, `${this.userId}_challenge.json`);
        if (fs.existsSync(challengeFile)) {
          try {
            fs.unlinkSync(challengeFile);
            P.info(`✅ Challenge resuelto - eliminando archivo de challenge pendiente`);
          } catch (unlinkError) {
            // Ignorar error al eliminar
          }
        }

        // Si llegamos aquí, el login fue exitoso
        P.info(`✅ Login exitoso y cookies guardadas para ${username}`);
        
        // Limpiar challenge pendiente si existe
        this.pendingChallenge = null;
        
        emitToUserIG(this.userId, 'instagram:status', { 
          connected: true, 
          username: this.username,
          igUserId: this.igUserId 
        });

        // 🔥 PERIODO DE CALENTAMIENTO (WARM-UP) - Comportamiento humano
        // Ejecutar en background para no bloquear la respuesta
        const warmUpMinutes = 30; // 30 minutos de calentamiento
        P.info(`🔥 Iniciando periodo de calentamiento de ${warmUpMinutes} minutos en background...`);
        
        // Ejecutar warm-up en background (no esperar)
        this.warmUpPeriod(warmUpMinutes).catch(error => {
          P.error(`❌ Error en warm-up period: ${error.message}`);
        });

        return { success: true, restored: false };
      } catch (loginError) {
        const msg = String(loginError?.message || loginError);
        
        // Log detallado del error para debugging
        P.error(`📋 [LOGIN ERROR] Detalles completos del error:`);
        P.error(`   Mensaje: ${msg}`);
        P.error(`   Tipo: ${loginError?.constructor?.name || 'Desconocido'}`);
        P.error(`   Stack: ${loginError?.stack?.substring(0, 500) || 'No disponible'}`);
        
        // Detectar si Instagram sugiere usar email para recuperar cuenta
        // Esto puede ser por: cuenta nueva, credenciales incorrectas, o cuenta bloqueada
        const errorBody = loginError.response?.body || {};
        const errorType = errorBody.error_type || '';
        const invalidCredentials = errorBody.invalid_credentials === true;
        
        if (msg.includes('We can send you an email') || 
            msg.includes('email to help you get back') ||
            msg.includes('send you an email to help') ||
            msg.includes('email to help') ||
            msg.includes('can send you an email') ||
            (errorType === 'bad_password' && invalidCredentials)) {
          
          P.error(`📧 Instagram requiere recuperación/cuenta nueva: ${msg}`);
          P.error(`   Error Type: ${errorType}`);
          P.error(`   Invalid Credentials: ${invalidCredentials}`);
          
          // Determinar si es cuenta nueva o problema de credenciales
          const isNewAccount = msg.includes('email to help') || (errorType === 'bad_password' && invalidCredentials);
          
          // ⚠️ NO INTENTAR LOGUEAR CUENTAS NUEVAS - Rechazar explícitamente
          if (isNewAccount) {
            P.error(`🚫 CUENTA NUEVA DETECTADA - Rechazando login. La cuenta debe usarse manualmente primero.`);
            
            emitToUserIG(this.userId, 'instagram:alert', { 
              type: 'new_account_blocked',
              severity: 'error',
              message: 'Cuenta nueva bloqueada - Debe usarse manualmente primero',
              description: 'Las cuentas NUEVAS de Instagram NO pueden hacer login desde API. Instagram bloquea esto automáticamente por seguridad. Debes usar la cuenta manualmente desde navegador/app móvil por 24-48 horas antes de poder hacer login desde aquí.',
              username: username,
              action_required: true,
              is_new_account: true,
              blocked: true,
              instructions: [
                '🔴 CUENTA NUEVA - BLOQUEADA',
                '',
                'Las cuentas nuevas NO pueden hacer login desde API.',
                'Debes usarla manualmente primero.',
                '',
                '✅ SOLUCIÓN OBLIGATORIA:',
                '',
                '1️⃣ Usa la cuenta manualmente 48 horas:',
                '  → Instagram.com o app móvil',
                '  → Publica 1-2 fotos',
                '  → Haz likes y sigue cuentas',
                '  → Envía DMs',
                '',
                '2️⃣ Después de 48 horas, intenta login nuevamente',
                '',
                '⏰ NO intentes login desde aquí hasta que pases 48 horas'
              ],
              timestamp: Date.now()
            });
            
            // Retornar rechazo explícito
            return {
              success: false,
              challenge: false,
              error: 'Cuenta nueva bloqueada - Requiere uso manual primero',
              message: 'Esta cuenta es nueva y NO puede hacer login desde API. Debes usar la cuenta manualmente desde navegador/app móvil por 48 horas antes de intentar login desde aquí. Instagram bloquea automáticamente el login de API para cuentas nuevas.',
              username: username,
              recovery_required: false,
              is_new_account: true,
              blocked: true,
              wait_time: '48 horas',
              must_use_manually_first: true
            };
          }
          
          // Si no es cuenta nueva, manejar como recuperación normal
          emitToUserIG(this.userId, 'instagram:alert', { 
            type: 'account_recovery_required',
            severity: 'warning',
            message: 'Recuperación de cuenta requerida',
            description: 'Instagram está sugiriendo usar el email para recuperar el acceso a tu cuenta. Esto puede indicar: 1) Problemas con las credenciales, 2) La cuenta está bloqueada o necesita verificación, 3) Instagram detectó actividad sospechosa.',
            username: username,
            action_required: true,
            is_new_account: false,
            instructions: isNewAccount ? [
              '🔴 CUENTA NUEVA - REQUIERE CALENTAMIENTO',
              '',
              'Las cuentas nuevas de Instagram NO pueden hacer login desde API inmediatamente.',
              'Instagram bloquea esto por seguridad.',
              '',
              '✅ SOLUCIÓN (24-48 HORAS):',
              '',
              '1️⃣ Usar la cuenta manualmente (AHORA):',
              '  → Abre Instagram.com o la app móvil',
              '  → Haz login con tu usuario y contraseña',
              '  → Verifica que el login manual funcione',
              '',
              '2️⃣ Activar la cuenta (próximas 24-48 horas):',
              '  → Publica 1-2 fotos',
              '  → Completa tu perfil (foto, bio)',
              '  → Sigue 20-30 cuentas',
              '  → Da likes (50-100 likes)',
              '  → Envía algunos DMs',
              '  → Interactúa con otras cuentas normalmente',
              '',
              '3️⃣ Después de 48 horas:',
              '  → Intenta login desde aquí nuevamente',
              '  → La cuenta ya tendrá historial "humano"',
              '  → Instagram confiará más en la actividad',
              '',
              '⏰ IMPORTANTE:',
              '  → NO intentes login desde aquí durante 48 horas',
              '  → Solo usa la cuenta manualmente',
              '  → Esto es normal para cuentas nuevas'
            ] : [
              'PASO 1: Verificar credenciales',
              '  → Asegúrate de que el usuario y contraseña sean correctos',
              '  → Intenta hacer login manualmente en Instagram.com',
              '  → Si no puedes, sigue al paso 2',
              '',
              'PASO 2: Recuperar cuenta',
              '  → Ve a Instagram.com',
              '  → Haz clic en "Olvidé mi contraseña"',
              '  → Ingresa tu usuario o email',
              '  → Sigue las instrucciones para recuperar',
              '',
              'PASO 3: Verificar email',
              '  → Revisa el email asociado a la cuenta',
              '  → Busca mensajes de Instagram sobre recuperación',
              '  → Sigue los pasos indicados en el email',
              '',
              'PASO 4: Esperar si está bloqueada',
              '  → Si la cuenta fue bloqueada, espera 24-48 horas',
              '  → No intentes login desde aquí durante ese tiempo',
              '  → Usa la cuenta manualmente desde navegador/app'
            ],
            timestamp: Date.now()
          });
          
          // Retornar respuesta estructurada
          return {
            success: false,
            challenge: false,
            error: isNewAccount ? 'Cuenta nueva requiere calentamiento' : 'Instagram requiere recuperación de cuenta',
            message: isNewAccount 
              ? 'Esta es una cuenta nueva. Las cuentas nuevas requieren 24-48 horas de uso manual antes de poder hacer login desde API. Por favor, usa la cuenta manualmente desde navegador/app móvil durante 48 horas, luego intenta nuevamente.'
              : 'Instagram está sugiriendo usar el email para recuperar el acceso. Por favor, verifica las credenciales o recupera la cuenta desde Instagram.com.',
            username: username,
            recovery_required: true,
            is_new_account: isNewAccount,
            wait_time: isNewAccount ? '48 horas' : null
          };
        }
        
        // Detectar intento de login sospechoso bloqueado por Instagram
        if (msg.includes('suspicious login') || 
            msg.includes('Suspicious login attempt') ||
            msg.includes('We blocked a suspicious login') ||
            msg.includes('blocked a suspicious login attempt')) {
          P.error(`🚨 Instagram bloqueó intento de login como sospechoso: ${msg}`);
          emitToUserIG(this.userId, 'instagram:alert', { 
            type: 'suspicious_login_blocked',
            severity: 'error',
            message: 'Intento de login bloqueado',
            description: 'Instagram detectó el intento de login desde la API como sospechoso y lo bloqueó. Esto es normal cuando se intenta hacer login desde una API. SOLUCIONES: 1) Verifica el login desde Instagram.com o la app móvil y acepta "Fue yo" cuando aparezca la notificación, 2) Cambia la contraseña si Instagram lo sugiere, 3) Espera 24-48 horas antes de intentar desde aquí, 4) Usa la cuenta normalmente desde navegador/app durante unos días para que Instagram "confíe" en la actividad.',
            username: username,
            action_required: true,
            instructions: [
              '⚠️ INSTAGRAM BLOQUEÓ EL LOGIN COMO SOSPECHOSO',
              '',
              'Esto es normal cuando se intenta login desde API.',
              '',
              'SOLUCIÓN PASO A PASO:',
              '',
              '1️⃣ Verificar en Instagram (AHORA MISMO):',
              '  → Abre Instagram en tu teléfono o navegador',
              '  → Verás una notificación "Suspicious login attempt"',
              '  → Toca "Fue yo" o "It was me"',
              '  → Si aparece "Change password", cámbiala',
              '  → Acepta todas las verificaciones',
              '',
              '2️⃣ Cambiar contraseña (si Instagram lo sugiere):',
              '  → Ve a Instagram.com o la app',
              '  → Configuración > Seguridad',
              '  → Cambia la contraseña',
              '  → Guarda la nueva contraseña',
              '',
              '3️⃣ Usar la cuenta normalmente (24-48 horas):',
              '  → Haz login manual desde navegador/app',
              '  → Publica 1-2 fotos',
              '  → Da likes y sigue algunas cuentas',
              '  → Envía algunos DMs',
              '  → Instagram necesita ver actividad "normal"',
              '',
              '4️⃣ Esperar 24-48 horas:',
              '  → No intentes login desde aquí inmediatamente',
              '  → Instagram necesita "confiar" en la IP',
              '  → La cuenta necesita tener historial de actividad',
              '',
              '5️⃣ Reintentar desde aquí:',
              '  → Después de 24-48 horas',
              '  → Usa la NUEVA contraseña si la cambiaste',
              '  → El login debería funcionar',
              '',
              'NOTA: Si sigues recibiendo este error después de 48 horas,',
              '      Instagram puede estar bloqueando la IP permanentemente.',
              '      En ese caso, usa una VPN o cambia de IP.'
            ],
            timestamp: Date.now()
          });
          
          // Retornar respuesta estructurada
          return {
            success: false,
            challenge: false,
            error: 'Login bloqueado como sospechoso',
            message: 'Instagram bloqueó el intento de login como sospechoso. Por favor, verifica en Instagram (acepta "Fue yo") y cambia la contraseña si se solicita. Espera 24-48 horas antes de reintentar desde aquí.',
            username: username,
            suspicious_login_blocked: true,
            recovery_required: false
          };
        }
        
        // Detectar challenges/checkpoints
        if (msg.includes('challenge') || msg.includes('checkpoint')) {
          P.info(`🔐 Challenge detectado para ${username}. Obteniendo información del challenge...`);
          
          // Intentar extraer información del challenge del error
          let challengeUrl = null;
          let challengeChoice = null;
          let needsCode = false;
          let challengeState = null;
          
          // El error de Instagram puede contener información del challenge
          try {
            if (loginError.response) {
              const responseData = loginError.response?.body || loginError.response?.data || {};
              challengeUrl = responseData.challenge?.url || responseData.challenge_url;
              challengeChoice = responseData.challenge?.choice;
              
              P.info(`📋 Información del challenge extraída:`);
              P.info(`   URL: ${challengeUrl || 'No disponible'}`);
              P.info(`   Choice: ${challengeChoice || 'No disponible'}`);
            }
            
            // También intentar desde el objeto error directamente
            if (loginError.challenge && typeof loginError.challenge === 'object') {
              challengeUrl = loginError.challenge.url || challengeUrl;
              challengeChoice = loginError.challenge.choice || challengeChoice;
            }
            
            // Intentar obtener el estado del challenge para ver si requiere código
            try {
              P.info(`🔍 Obteniendo estado del challenge...`);
              challengeState = await this.ig.challenge.state();
              
              P.info(`📋 Estado del challenge obtenido:`);
              P.info(`   Step: ${challengeState.step_name || 'desconocido'}`);
              P.info(`   Necesita código: ${challengeState.step_name === 'select_verify_method' || challengeState.step_name === 'verify_code'}`);
              
              // Detectar si necesita código
              needsCode = challengeState.step_name === 'select_verify_method' || 
                         challengeState.step_name === 'verify_code' ||
                         (challengeState.fields && challengeState.fields.length > 0);
              
              P.info(`📱 Challenge ${needsCode ? 'REQUIERE código' : 'NO requiere código'}`);
              
            } catch (stateError) {
              P.warn(`⚠️ No se pudo obtener estado del challenge: ${stateError.message}`);
              // Asumir que necesita código si no se puede determinar
              needsCode = true;
            }
          } catch (extractError) {
            P.warn(`⚠️ No se pudo extraer información del challenge: ${extractError.message}`);
            // Asumir que necesita código por defecto
            needsCode = true;
          }
          
          // Guardar información del challenge
          this.pendingChallenge = {
            username,
            password,
            timestamp: Date.now(),
            message: msg,
            retryCount: 0,
            challengeUrl: challengeUrl,
            challengeChoice: challengeChoice,
            needsCode: needsCode,
            challengeState: challengeState
          };
          
          // NO esperar automáticamente - el usuario debe verificar y luego reintentar manualmente
          P.info(`🔐 Challenge detectado. El usuario debe verificar en su teléfono/app y luego reintentar login.`);
          P.warn(`⚠️ IMPORTANTE: Cuentas nuevas requieren verificación manual en Instagram primero.`);
          P.warn(`   La cuenta ${username} necesita ser verificada en Instagram.com o la app móvil.`);
          
          // Mensaje más específico para cuentas nuevas
          const isNewAccount = !fs.existsSync(this.stateFile()) || 
                               (fs.existsSync(this.stateFile()) && 
                                Date.now() - new Date(JSON.parse(fs.readFileSync(this.stateFile(), 'utf8')).savedAt || 0).getTime() < 86400000);
          
          const challengeMessage = isNewAccount ? 
            'Esta es una cuenta nueva y requiere verificación especial. Instagram bloquea logins de API en cuentas nuevas por seguridad. SOLUCIÓN: 1) Haz login MANUALMENTE en Instagram.com o la app móvil primero, 2) Usa la cuenta normalmente por 24-48 horas (posts, likes, follows), 3) Luego intenta login desde aquí. Instagram necesita "confiar" en la cuenta antes de permitir login desde API.' :
            'Instagram requiere verificación de seguridad. Por favor: 1) Verifica en tu teléfono/app de Instagram (acepta el login), 2) Espera 2-5 minutos, 3) Reintenta el login desde aquí.';
          
          // SIEMPRE pedir código si el challenge requiere código (incluso para cuentas nuevas)
          if (needsCode) {
            P.info(`📱 Challenge requiere código de verificación para ${username}`);
            emitToUserIG(this.userId, 'instagram:alert', { 
              type: 'challenge_code_required',
              severity: 'warning',
              message: 'Código de verificación requerido',
              description: 'Instagram requiere un código de verificación para completar el login. Por favor, ingresa el código que recibiste por SMS o Email.',
              username: username,
              action_required: true,
              needs_code: true,
              challenge_id: `challenge_${Date.now()}`,
              instructions: [
                'PASO 1: Revisa tu teléfono/email',
                '  → Instagram envió un código de verificación',
                '  → Revisa SMS o correo electrónico',
                '  → El código es de 6 dígitos',
                '',
                'PASO 2: Ingresa el código',
                '  → Usa el campo de código que aparece',
                '  → Ingresa el código completo',
                '  → El sistema verificará automáticamente',
                '',
                'Si no recibes el código:',
                '  → Espera 30-60 segundos',
                '  → Verifica spam/correo no deseado',
                '  → Puedes solicitar un nuevo código'
              ],
              timestamp: Date.now()
            });
          } else {
            // Challenge que no requiere código (o cuenta nueva)
            emitToUserIG(this.userId, 'instagram:alert', { 
            type: 'challenge_required',
              severity: 'warning',
              message: isNewAccount ? 'Cuenta nueva requiere verificación manual' : 'Verificación requerida',
              description: challengeMessage,
            username: username,
              action_required: true,
              is_new_account: isNewAccount,
              needs_code: false,
              instructions: isNewAccount ? [
              '⚠️ CUENTA NUEVA DETECTADA',
              '',
              'Instagram bloquea logins de API en cuentas nuevas.',
              '',
              'SOLUCIÓN PASO A PASO:',
              '',
              '1️⃣ Haz login MANUALMENTE primero:',
              '   → Ve a Instagram.com o abre la app móvil',
              '   → Inicia sesión con esta cuenta',
              '   → Completa cualquier verificación (SMS/Email)',
              '',
              '2️⃣ Usa la cuenta normalmente:',
              '   → Publica 1-2 fotos',
              '   → Da likes (50-100)',
              '   → Sigue algunas cuentas (20-30)',
              '   → Envía algunos DMs',
              '',
              '3️⃣ Espera 24-48 horas:',
              '   → Instagram necesita "confiar" en la cuenta',
              '   → La cuenta necesita tener actividad normal',
              '',
              '4️⃣ Intenta login desde aquí:',
              '   → Después de 24-48 horas de uso manual',
              '   → El login debería funcionar',
              '',
              'NOTA: Si solo verificas pero no usas la cuenta,',
              '      Instagram seguirá bloqueando el login.'
            ] : [
              'PASO 1: Verificar en teléfono/app',
              '  → Abre Instagram en tu teléfono',
              '  → Verás una notificación de login',
              '  → Toca "Fue yo" o acepta el login',
              '  → Completa cualquier verificación (código SMS/Email)',
              '',
              'PASO 2: Esperar 2-5 minutos',
              '  → Instagram necesita procesar la verificación',
              '  → No intentes login inmediatamente',
              '',
              'PASO 3: Reintentar login',
              '  → Vuelve a hacer login desde aquí',
              '  → Si ya verificaste, debería funcionar',
              '',
              'NOTA: Si falla después de verificar, espera 5-10 minutos más'
            ],
            challengeId: `challenge_${Date.now()}`,
            challengeUrl: challengeUrl,
            timestamp: Date.now()
          });
          }
          
          // Intentar resolver challenge automáticamente si hay información disponible
          // Nota: Instagram normalmente requiere acción manual del usuario
          // Pero podemos guardar el estado para reintentos futuros
          
          P.warn(`💾 Guardando información de challenge para reintentos futuros...`);
          
          // Guardar challenge en archivo para reintentos
          const challengeFile = path.join(STATE_DIR, `${this.userId}_challenge.json`);
          fs.writeFileSync(challengeFile, JSON.stringify({
              username,
            timestamp: Date.now(),
            challengeUrl,
            challengeChoice,
            retryCount: (this.pendingChallenge?.retryCount || 0)
            }), 'utf8');
            
          // Retornar estado de challenge pendiente
          const challengeResponse = {
            success: false, 
            challenge: true, 
            needs_code: needsCode, // SIEMPRE indicar si necesita código
            message: needsCode ?
              'Código de verificación requerido. Por favor, ingresa el código que recibiste por SMS o Email.' :
              (isNewAccount ? 
                'Cuenta nueva detectada. Debes usar la cuenta manualmente en Instagram por 24-48 horas antes de poder hacer login desde aquí.' :
                'Challenge detectado. Verifica tu cuenta en Instagram (teléfono/app). El sistema intentará login automáticamente después de 3 minutos. Si prefieres, puedes reintentar manualmente.'),
            challengeId: `challenge_${Date.now()}`,
            needsUserAction: true,
            needsManualRetry: needsCode ? false : false, // Si necesita código, NO manual retry (debe usar resolve-challenge)
            autoRetry: needsCode ? false : true, // No auto-retry si necesita código
            autoRetryIn: needsCode ? null : 180000, // 3 minutos en milisegundos
            is_new_account: isNewAccount,
            retryInstructions: needsCode ?
              'Ingresa el código de verificación que recibiste por SMS o Email usando el endpoint POST /api/instagram/resolve-challenge.' :
              (isNewAccount ?
                'Usa la cuenta manualmente en Instagram por 24-48 horas, luego intenta login desde aquí.' :
                'Verifica en Instagram. El sistema reintentará automáticamente en 3 minutos. También puedes reintentar manualmente.')
          };
          
          // Programar reintento automático SOLO si NO necesita código (en background, no bloqueante)
          // NO hacer auto-retry si necesita código - el usuario DEBE usar resolve-challenge
          if (!isNewAccount && !needsCode) {
            P.info(`⏰ Programando reintento automático en 3 minutos...`);
            setTimeout(async () => {
              try {
                P.info(`🔄 Reintentando login automático después de challenge para ${username}...`);
                const retryResult = await this.login({ username, password, proxy });
                
                if (retryResult.success) {
                  P.info(`✅ Login exitoso después de reintento automático para ${username}`);
                  emitToUserIG(this.userId, 'instagram:alert', {
                    type: 'challenge_resolved',
                    severity: 'success',
                    message: 'Login exitoso',
                    description: 'El login se completó exitosamente después de la verificación.',
                    username: username,
                    timestamp: Date.now()
                  });
                } else {
                  P.warn(`⚠️ Reintento automático falló. El usuario debe reintentar manualmente.`);
                  emitToUserIG(this.userId, 'instagram:alert', {
                    type: 'challenge_retry_failed',
                    severity: 'warning',
                    message: 'Reintento automático falló',
                    description: 'El sistema intentó login automático pero falló. Por favor verifica en Instagram y reintenta manualmente.',
                    username: username,
                    timestamp: Date.now()
                  });
                }
              } catch (retryError) {
                P.warn(`⚠️ Error en reintento automático: ${retryError.message}`);
              }
            }, 180000); // 3 minutos
          } else if (needsCode && !isNewAccount) {
            P.info(`📱 Challenge requiere código - esperando que el usuario ingrese el código...`);
          }
          
          return challengeResponse;
        }
        
        
        // Detectar cuenta vinculada a Facebook o bloqueo de login    
        if (msg.includes('linked Facebook account') || 
            msg.includes('You can log in with your linked Facebook') ||
            msg.includes('Facebook account')) {
          P.error(`🔗 Error de login detectado: ${msg}`);
          
          // Determinar si es realmente Facebook o un bloqueo genérico
          const isFacebookLinked = msg.includes('linked Facebook account') || 
                                   msg.includes('You can log in with your linked Facebook');
          
          if (isFacebookLinked) {
            emitToUserIG(this.userId, 'instagram:alert', { 
              type: 'facebook_linked_account',
              severity: 'error',
              message: 'Cuenta vinculada a Facebook',
              description: 'Tu cuenta de Instagram está vinculada a Facebook y no permite login directo con usuario/contraseña. SOLUCIONES: 1) Desvincular la cuenta de Facebook en Instagram (Configuración > Cuenta > Facebook), 2) Usar otra cuenta de Instagram NUEVA que NO esté vinculada a Facebook desde el inicio, 3) Crear la cuenta directamente en Instagram (NO desde Facebook), 4) Intentar login manualmente en la app de Instagram primero para establecer la sesión.',
              username: username,
              action_required: true,
              instructions: [
                'SOLUCIÓN 1: Desvincular Facebook',
                '  → Ve a Instagram.com o la app',
                '  → Configuración > Cuenta > Facebook',
                '  → Desvincula la cuenta de Facebook',
                '',
                'SOLUCIÓN 2: Crear cuenta nueva SIN Facebook',
                '  → Crea cuenta directamente en Instagram',
                '  → NO uses "Continuar con Facebook"',
                '  → Usa email/teléfono para crear la cuenta',
                '',
                'SOLUCIÓN 3: Login manual primero',
                '  → Haz login manual en app móvil',
                '  → Luego intenta desde aquí',
                '',
                'Luego intenta login nuevamente'
              ],
              timestamp: Date.now()
            });
          } else {
            // Bloqueo genérico de login (puede ser por otras razones)
            emitToUserIG(this.userId, 'instagram:alert', { 
              type: 'login_blocked',
              severity: 'error',
              message: 'Login bloqueado por Instagram',
              description: `Instagram está bloqueando el login. Posibles causas: 1) La cuenta es nueva y requiere verificación, 2) Instagram detectó actividad sospechosa, 3) La cuenta necesita ser verificada manualmente primero, 4) La IP está siendo bloqueada temporalmente. SOLUCIÓN: Haz login manualmente en Instagram.com o la app móvil primero, luego espera 24-48 horas antes de intentar desde aquí.`,
              username: username,
              action_required: true,
              instructions: [
                'PASO 1: Verificar cuenta manualmente',
                '  → Ve a Instagram.com o la app móvil',
                '  → Inicia sesión con tu cuenta',
                '  → Completa cualquier verificación (SMS/Email)',
                '  → Usa la cuenta normalmente por 24-48 horas',
                '',
                'PASO 2: Esperar período de confianza',
                '  → Instagram necesita "confiar" en la IP',
                '  → Usa la cuenta desde navegador/app por 1-2 días',
                '  → Haz posts, likes, follows normales',
                '',
                'PASO 3: Reintentar desde aquí',
                '  → Después de 24-48 horas',
                '  → Intenta login nuevamente',
                '',
                'Si el problema persiste, usa otra cuenta'
              ],
              error_message: msg,
              timestamp: Date.now()
            });
          }
          
          throw new Error(isFacebookLinked ? 
            'La cuenta está vinculada a Facebook. Debes desvincularla o usar otra cuenta.' : 
            'Instagram está bloqueando el login. Verifica manualmente primero y espera 24-48 horas.');
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
      // Catch del try externo (línea 102)
      P.error(`❌ Error general en login: ${error.message}`);
      
      const errorMsg = String(error.message || '');
      const errorStatus = error.response?.status || error.status || 0;
      
      // Detectar si Instagram sugiere usar email para recuperar cuenta (en catch externo también)
      if (errorMsg.includes('We can send you an email') || 
          errorMsg.includes('email to help you get back') ||
          errorMsg.includes('send you an email to help') ||
          errorMsg.includes('email to help') ||
          errorMsg.includes('can send you an email')) {
        P.error(`📧 Instagram sugiere usar email para recuperar cuenta (catch externo): ${errorMsg}`);
        emitToUserIG(this.userId, 'instagram:alert', { 
          type: 'account_recovery_required',
          severity: 'warning',
          message: 'Recuperación de cuenta requerida',
          description: 'Instagram está sugiriendo usar el email para recuperar el acceso a tu cuenta. Esto puede indicar: 1) Problemas con las credenciales, 2) La cuenta está bloqueada o necesita verificación, 3) Instagram detectó actividad sospechosa. SOLUCIONES: 1) Verifica que el usuario y contraseña sean correctos, 2) Intenta recuperar la cuenta desde Instagram.com usando "Olvidé mi contraseña", 3) Verifica el email asociado a la cuenta, 4) Espera 24-48 horas si la cuenta fue bloqueada recientemente.',
          username: username,
          action_required: true,
          instructions: [
            'PASO 1: Verificar credenciales',
            '  → Asegúrate de que el usuario y contraseña sean correctos',
            '  → Intenta hacer login manualmente en Instagram.com',
            '  → Si no puedes, sigue al paso 2',
            '',
            'PASO 2: Recuperar cuenta',
            '  → Ve a Instagram.com',
            '  → Haz clic en "Olvidé mi contraseña"',
            '  → Ingresa tu usuario o email',
            '  → Sigue las instrucciones para recuperar',
            '',
            'PASO 3: Verificar email',
            '  → Revisa el email asociado a la cuenta',
            '  → Busca mensajes de Instagram sobre recuperación',
            '  → Sigue los pasos indicados en el email',
            '',
            'PASO 4: Esperar si está bloqueada',
            '  → Si la cuenta fue bloqueada, espera 24-48 horas',
            '  → No intentes login desde aquí durante ese tiempo',
            '  → Usa la cuenta manualmente desde navegador/app'
          ],
          timestamp: Date.now()
        });
        
        return {
          success: false,
          challenge: false,
          error: 'Instagram requiere recuperación de cuenta',
          message: 'Instagram está sugiriendo usar el email para recuperar el acceso. Por favor, verifica las credenciales o recupera la cuenta desde Instagram.com.',
          username: username,
          recovery_required: true
        };
      }
      
      // Detectar intento de login sospechoso bloqueado (en catch externo también)
      if (errorMsg.includes('suspicious login') || 
          errorMsg.includes('Suspicious login attempt') ||
          errorMsg.includes('We blocked a suspicious login') ||
          errorMsg.includes('blocked a suspicious login attempt')) {
        P.error(`🚨 Instagram bloqueó intento de login como sospechoso (catch externo): ${errorMsg}`);
        emitToUserIG(this.userId, 'instagram:alert', { 
          type: 'suspicious_login_blocked',
          severity: 'error',
          message: 'Intento de login bloqueado',
          description: 'Instagram detectó el intento de login desde la API como sospechoso y lo bloqueó. Esto es normal cuando se intenta hacer login desde una API. SOLUCIONES: 1) Verifica el login desde Instagram.com o la app móvil y acepta "Fue yo" cuando aparezca la notificación, 2) Cambia la contraseña si Instagram lo sugiere, 3) Espera 24-48 horas antes de intentar desde aquí, 4) Usa la cuenta normalmente desde navegador/app durante unos días para que Instagram "confíe" en la actividad.',
          username: username,
          action_required: true,
          instructions: [
            '⚠️ INSTAGRAM BLOQUEÓ EL LOGIN COMO SOSPECHOSO',
            '',
            'Esto es normal cuando se intenta login desde API.',
            '',
            'SOLUCIÓN PASO A PASO:',
            '',
            '1️⃣ Verificar en Instagram (AHORA MISMO):',
            '  → Abre Instagram en tu teléfono o navegador',
            '  → Verás una notificación "Suspicious login attempt"',
            '  → Toca "Fue yo" o "It was me"',
            '  → Si aparece "Change password", cámbiala',
            '  → Acepta todas las verificaciones',
            '',
            '2️⃣ Cambiar contraseña (si Instagram lo sugiere):',
            '  → Ve a Instagram.com o la app',
            '  → Configuración > Seguridad',
            '  → Cambia la contraseña',
            '  → Guarda la nueva contraseña',
            '',
            '3️⃣ Usar la cuenta normalmente (24-48 horas):',
            '  → Haz login manual desde navegador/app',
            '  → Publica 1-2 fotos',
            '  → Da likes y sigue algunas cuentas',
            '  → Envía algunos DMs',
            '  → Instagram necesita ver actividad "normal"',
            '',
            '4️⃣ Esperar 24-48 horas:',
            '  → No intentes login desde aquí inmediatamente',
            '  → Instagram necesita "confiar" en la IP',
            '  → La cuenta necesita tener historial de actividad',
            '',
            '5️⃣ Reintentar desde aquí:',
            '  → Después de 24-48 horas',
            '  → Usa la NUEVA contraseña si la cambiaste',
            '  → El login debería funcionar',
            '',
            'NOTA: Si sigues recibiendo este error después de 48 horas,',
            '      Instagram puede estar bloqueando la IP permanentemente.',
            '      En ese caso, usa una VPN o cambia de IP.'
          ],
          timestamp: Date.now()
        });
        
        return {
          success: false,
          challenge: false,
          error: 'Login bloqueado como sospechoso',
          message: 'Instagram bloqueó el intento de login como sospechoso. Por favor, verifica en Instagram (acepta "Fue yo") y cambia la contraseña si se solicita. Espera 24-48 horas antes de reintentar desde aquí.',
          username: username,
          suspicious_login_blocked: true,
          recovery_required: false
        };
      }
      
      // Si es un error 401 después de challenge, dar instrucciones específicas
      
      if (errorStatus === 401 || errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
        // Puede ser que el usuario verificó pero el login aún falla
        if (this.pendingChallenge) {
          P.warn(`⚠️ Login falló con 401 pero hay challenge pendiente. El usuario debe reintentar después de verificar.`);
          emitToUserIG(this.userId, 'instagram:alert', {
            type: 'challenge_verification_pending',
            severity: 'warning',
            message: 'Verificación aún pendiente',
            description: 'El login falló después de verificación. Posibles causas: 1) Instagram aún no procesó la verificación (espera 2-5 minutos más), 2) La verificación no se completó correctamente, 3) Necesitas verificar de nuevo. SOLUCIÓN: Verifica nuevamente en Instagram, espera 2-5 minutos, y reintenta el login.',
            username: this.pendingChallenge?.username || username,
            action_required: true,
            instructions: [
              'Si ya verificaste en teléfono:',
              '  → Espera 2-5 minutos más',
              '  → Instagram necesita procesar la verificación',
              '  → Luego reintenta el login',
              '',
              'Si no verificaste aún:',
              '  → Abre Instagram en tu teléfono',
              '  → Verifica el login (acepta o "Fue yo")',
              '  → Espera 2-5 minutos',
              '  → Reintenta el login desde aquí'
            ],
            timestamp: Date.now()
          });
          
          // Retornar error más descriptivo
          throw new Error('Login falló con 401. Si ya verificaste en Instagram, espera 2-5 minutos y reintenta. Si no verificaste, verifica primero en tu teléfono/app.');
        }
      }
      
      emitToUserIG(this.userId, 'instagram:status', { connected: false, error: error.message });
      
      // Si hay un pendingChallenge, retornar información del challenge en lugar de lanzar error
      if (this.pendingChallenge) {
        P.info(`⚠️ Error en login pero hay challenge pendiente, retornando información del challenge`);
        return {
          success: false,
          challenge: true,
          needs_code: this.pendingChallenge.needsCode || false,
          message: 'Error durante login, pero hay un challenge pendiente. Por favor, verifica en Instagram.',
          needsUserAction: true,
          needsManualRetry: !this.pendingChallenge.needsCode,
          autoRetry: false,
          autoRetryIn: null,
          is_new_account: false,
          retryInstructions: this.pendingChallenge.needsCode ? 
            'Ingresa el código de verificación que recibiste por SMS o Email usando el endpoint /api/instagram/resolve-challenge.' :
            'Verifica en Instagram y luego reintenta el login.',
          challengeId: `challenge_${Date.now()}`,
          error: error.message
        };
      }
      
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

  /**
   * FUNCIONES DE AUDIO ELIMINADAS
   * Instagram deshabilitó oficialmente broadcastVoice en 2025
   * Las funciones sendAudio, replyAudio y generateAudioWithElevenLabs han sido eliminadas
   * Si necesitas enviar audio, usa texto o envía el audio como archivo/video
   */

  /**
   * Enviar audio a un usuario por username - DESHABILITADO
   * @deprecated Instagram deshabilitó broadcastVoice en 2025
   */
  async sendAudio({ username, audioBuffer }) {
    throw new Error('❌ Función deshabilitada: Instagram deshabilitó oficialmente broadcastVoice en 2025. Usa texto o envía el audio como archivo/video.');
  }

  /**
   * Responder con audio en un thread existente - DESHABILITADO
   * @deprecated Instagram deshabilitó broadcastVoice en 2025
   */
  async replyAudio({ threadId, audioBuffer }) {
    throw new Error('❌ Función deshabilitada: Instagram deshabilitó oficialmente broadcastVoice en 2025. Usa texto o envía el audio como archivo/video.');
  }

  /**
   * Obtener historial completo de un thread
   */
  async getThreadHistory(threadId, limit = 50) {
    return this.limiter.schedule(async () => {
      try {
        if (!this.logged) {
          throw new Error('No hay sesión activa de Instagram');
        }

        P.info(`📖 Obteniendo historial del thread ${threadId} (límite: ${limit})`);
        
        const thread = this.ig.entity.directThread(threadId);
        
        // Intentar obtener mensajes del thread
        const messages = [];
        let hasMore = true;
        let count = 0;

        try {
          // Usar request() para obtener mensajes del thread
          const threadData = await thread.request();
          
          if (threadData.thread && threadData.thread.items) {
            for (const item of threadData.thread.items) {
              if (count >= limit) break;

              // Procesar el mensaje según su tipo
              let messageText = '';
              let mediaType = null;
              let mediaUrl = null;

              if (item.item_type === 'text') {
                messageText = item.text || '';
              } else if (item.item_type === 'media_share') {
                messageText = item.media_share?.caption || '';
                mediaType = 'media';
              } else if (item.item_type === 'media') {
                if (item.media.image_versions2) {
                  mediaType = 'image';
                  mediaUrl = item.media.image_versions2?.candidates?.[0]?.url;
                } else if (item.media.video_versions) {
                  mediaType = 'video';
                  mediaUrl = item.media.video_versions?.[0]?.url;
                }
              } else if (item.item_type === 'voice_media') {
                messageText = '[Audio]';
                mediaType = 'audio';
                mediaUrl = item.voice_media?.media?.audio?.audio_src;
              } else if (item.item_type === 'like') {
                messageText = '❤️ Me gusta';
              } else if (item.item_type === 'story_share') {
                messageText = item.story_share?.media?.caption || '[Compartió tu historia]';
                mediaType = 'story';
              } else {
                messageText = '[Otro tipo de mensaje]';
              }

              // Obtener información del usuario que envió el mensaje
              const sender = threadData.thread.users?.find(u => u.pk === item.user_id);
              
              messages.push({
                id: item.item_id,
                text: messageText,
                sender: {
                  pk: item.user_id,
                  username: sender?.username || 'Usuario',
                  full_name: sender?.full_name || sender?.username || 'Usuario',
                  is_private: sender?.is_private || false,
                  is_verified: sender?.is_verified || false
                },
                timestamp: item.timestamp || Date.now(),
                is_own: item.user_id === this.igUserId,
                media_type: mediaType,
                media_url: mediaUrl,
                item_type: item.item_type
              });

              count++;
            }
          }
        } catch (requestError) {
          P.warn(`⚠️ Error obteniendo mensajes con request(): ${requestError.message}`);
          
          // Intentar método alternativo: usar threadFeed
          try {
            const feed = this.ig.feed.directInbox();
            const inbox = await feed.request();
            const thread = inbox.inbox?.threads?.find(t => t.thread_id === threadId);
            
            if (thread && thread.items) {
              for (const item of thread.items.slice(0, limit)) {
                messages.push({
                  id: item.item_id || item.id,
                  text: item.text || '',
                  sender: {
                    pk: item.user_id,
                    username: thread.users?.[0]?.username || 'Usuario',
                    full_name: thread.users?.[0]?.full_name || 'Usuario'
                  },
                  timestamp: item.timestamp || Date.now(),
                  is_own: item.user_id === this.igUserId,
                  item_type: item.item_type || 'text'
                });
                count++;
                if (count >= limit) break;
              }
            }
          } catch (feedError) {
            P.error(`❌ Error con método alternativo: ${feedError.message}`);
            throw requestError; // Re-lanzar el error original
          }
        }

        // Ordenar mensajes por timestamp (más antiguos primero)
        messages.sort((a, b) => a.timestamp - b.timestamp);

        P.info(`✅ ${messages.length} mensajes obtenidos del thread ${threadId}`);
        return {
          success: true,
          thread_id: threadId,
          messages: messages,
          count: messages.length
        };
      } catch (error) {
        P.error(`❌ Error obteniendo historial del thread ${threadId}: ${error.message}`);
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
   * Maneja errores 500 con alertas al usuario
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
      
      // Detectar error 500 de Instagram (sesión corrupta o bloqueada)
      if (error.message && error.message.includes('500')) {
        P.error('🔴 Error 500 detectado - La sesión de Instagram puede estar corrupta o bloqueada');
        
        // Marcar la sesión como problemática
        this.sessionCorrupted = true;
        
        // Emitir alerta al usuario
        emitToUserIG(this.userId, 'instagram:alert', {
          type: 'session_error',
          severity: 'error',
          title: 'Sesión de Instagram con problemas',
          message: 'Instagram está rechazando las solicitudes. Es posible que necesites volver a iniciar sesión.',
          description: 'Esto puede ocurrir por: cambio de IP, actividad sospechosa detectada, o sesión expirada.',
          action: 'relogin',
          actionLabel: 'Volver a iniciar sesión',
          username: this.username
        });
        
        // Emitir estado desconectado
        emitToUserIG(this.userId, 'instagram:status', {
          connected: false,
          username: this.username,
          error: 'session_corrupted',
          message: 'La sesión necesita ser renovada'
        });
      }
      
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
   * Nota: respondWithAudio está deshabilitado (Instagram eliminó broadcastVoice en 2025)
   */
  async handleIncomingWithAI({ threadId, text, aiFunction, respondWithAudio = false }) {
    try {
      P.info(`🤖 Generando respuesta con IA para thread ${threadId}`);
      
      const respuesta = await aiFunction(text);
      
      if (!respuesta || respuesta.trim().length === 0) {
        P.warn('⚠️ IA no generó respuesta');
        return null;
      }

      // Siempre enviar como texto (audio deshabilitado por Instagram)
      if (respondWithAudio) {
        P.warn('⚠️ Audio deshabilitado por Instagram, enviando como texto');
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
   * Responder con IA a un mensaje de audio - MODIFICADO
   * Transcribe el audio, genera respuesta y envía como TEXTO (audio deshabilitado)
   */
  async handleIncomingAudioWithAI({ threadId, audioUrl, transcribeFunction, aiFunction }) {
    try {
      P.info(`🎤 Procesando audio recibido en thread ${threadId}`);
      
      // Transcribir audio
      let transcription = '';
      if (transcribeFunction) {
        try {
          // Descargar audio
          const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });
          const audioBuffer = Buffer.from(audioResponse.data);
          
          // Transcribir
          const transcriptionResult = await transcribeFunction(audioBuffer, 'audio.mp4');
          transcription = transcriptionResult.text || '';
          P.info(`✅ Audio transcrito: ${transcription.substring(0, 100)}...`);
        } catch (transcribeError) {
          P.error(`❌ Error transcribiendo audio: ${transcribeError.message}`);
          throw new Error('No se pudo transcribir el audio');
        }
      } else {
        throw new Error('transcribeFunction es requerida');
      }

      if (!transcription || transcription.trim().length === 0) {
        P.warn('⚠️ Transcripción vacía');
        return null;
      }

      // Generar respuesta con IA
      P.info(`🤖 Generando respuesta con IA para audio transcrito`);
      const respuesta = await aiFunction(transcription);
      
      if (!respuesta || respuesta.trim().length === 0) {
        P.warn('⚠️ IA no generó respuesta');
        return null;
      }

      // Enviar respuesta como texto (audio deshabilitado por Instagram)
      P.info(`📝 Enviando respuesta como texto (audio deshabilitado por Instagram)`);
      await this.replyText({ threadId, text: respuesta });
      P.info(`✅ Respuesta de IA enviada como texto: ${respuesta.substring(0, 50)}...`);
      return { transcription, respuesta, audio: false };
    } catch (error) {
      P.error(`❌ Error en handleIncomingAudioWithAI: ${error.message}`);
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
      
      // Si hay un choice, seleccionar método de verificación primero
      if (choice) {
        P.info(`📱 Seleccionando método de verificación: ${choice}`);
        await this.ig.challenge.selectVerifyMethod(choice);
      }
      
      // Enviar código de seguridad
      P.info(`📤 Enviando código de verificación a Instagram...`);
      const challengeResult = await this.ig.challenge.sendSecurityCode(code);

      if (challengeResult) {
        P.info(`✅ Código enviado exitosamente`);
        
        // Verificar el estado después de enviar el código
        const state = await this.ig.challenge.state();
        
        if (state.logged_in_user) {
          // Login exitoso
          this.igUserId = state.logged_in_user.pk;
        this.logged = true;

        // Guardar cookies
        const file = this.stateFile();
        const cookieJar = await this.ig.state.serializeCookieJar();
          
          // Convertir Sets a Arrays para poder guardarlos en JSON
          const processedMessagesArray = this.processedMessages ? Array.from(this.processedMessages) : [];
          const processedCommentsArray = this.processedComments ? Array.from(this.processedComments) : [];
          
        fs.writeFileSync(file, JSON.stringify({ 
          cookieJar,
            username: this.pendingChallenge.username || this.username,
          igUserId: this.igUserId,
            savedAt: new Date().toISOString(),
            processedMessages: processedMessagesArray,
            processedComments: processedCommentsArray
        }), 'utf8');
          
          // Eliminar challenge pendiente
          this.pendingChallenge = null;
          
          // Eliminar archivo de challenge si existe
          const challengeFile = path.join(STATE_DIR, `${this.userId}_challenge.json`);
          if (fs.existsSync(challengeFile)) {
            try {
              fs.unlinkSync(challengeFile);
            } catch (unlinkError) {
              // Ignorar error
            }
          }

        emitToUserIG(this.userId, 'instagram:status', { 
          connected: true, 
          username: this.username,
          igUserId: this.igUserId 
        });
          
          emitToUserIG(this.userId, 'instagram:alert', {
            type: 'challenge_resolved',
            severity: 'success',
            message: 'Login exitoso',
            description: 'El código de verificación fue correcto y el login se completó exitosamente.',
            username: this.username,
            timestamp: Date.now()
          });

        return { success: true, message: 'Challenge resuelto y login exitoso' };
      } else {
          // El código fue enviado pero aún no está logueado
          // Puede necesitar otro paso
          P.info(`⚠️ Código enviado pero login aún pendiente. Estado: ${state.step_name}`);
          throw new Error('El código fue aceptado pero el login aún no está completo. Puede requerir acción adicional.');
        }
      } else {
        throw new Error('No se pudo enviar el código');
      }
    } catch (error) {
      P.error(`❌ Error resolviendo challenge: ${error.message}`);
      
      // Detectar si el código fue incorrecto
      if (error.message.includes('wrong') || error.message.includes('incorrect') || error.message.includes('invalid')) {
        emitToUserIG(this.userId, 'instagram:alert', {
          type: 'challenge_code_invalid',
          severity: 'error',
          message: 'Código inválido',
          description: 'El código de verificación ingresado es incorrecto. Por favor, verifica el código e inténtalo nuevamente.',
          username: this.pendingChallenge?.username || this.username,
          timestamp: Date.now()
        });
      } else {
      emitToUserIG(this.userId, 'instagram:error', { 
        message: error.message,
        type: 'challenge_failed'
      });
      }
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
   * Forzar logout completo - Limpia TODO el estado de la sesión
   * Usar cuando hay errores 500 o sesiones corruptas
   */
  async forceLogout() {
    try {
      P.info(`🔴 FORCE LOGOUT para usuario ${this.userId}`);
      
      // 1. Eliminar archivo de estado principal
      const file = this.stateFile();
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        P.info('✅ Archivo de sesión principal eliminado');
      }
      
      // 2. Eliminar archivos de cookies adicionales
      const cookiesDir = path.join(STATE_DIR, 'cookies');
      if (fs.existsSync(cookiesDir)) {
        const userCookieFile = path.join(cookiesDir, `${this.userId}.json`);
        if (fs.existsSync(userCookieFile)) {
          fs.unlinkSync(userCookieFile);
          P.info('✅ Archivo de cookies eliminado');
        }
      }
      
      // 3. Eliminar cualquier archivo relacionado con este usuario
      const stateFiles = fs.readdirSync(STATE_DIR);
      for (const stateFile of stateFiles) {
        if (stateFile.includes(this.userId)) {
          const filePath = path.join(STATE_DIR, stateFile);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
            P.info(`✅ Archivo adicional eliminado: ${stateFile}`);
          }
        }
      }
      
      // 4. Limpiar estado en memoria
      this.logged = false;
      this.igUserId = null;
      this.username = null;
      this.sessionCorrupted = false;
      this.pendingChallenge = null;
      
      // 5. Recrear instancia de IgApiClient
      this.ig = new IgApiClient();
      
      // 6. Limpiar pending 2FA si existe
      if (pending2FA.has(this.userId)) {
        pending2FA.delete(this.userId);
        P.info('✅ 2FA pendiente eliminado');
      }
      
      // 7. Emitir estado desconectado
      emitToUserIG(this.userId, 'instagram:status', { 
        connected: false,
        forceLogout: true,
        message: 'Sesión limpiada completamente. Por favor, vuelve a iniciar sesión.'
      });
      
      P.info(`✅ FORCE LOGOUT completado para usuario ${this.userId}`);
      
      return { 
        success: true, 
        message: 'Sesión limpiada completamente. Por favor, vuelve a iniciar sesión con tus credenciales de Instagram.'
      };
    } catch (error) {
      P.error(`❌ Error en forceLogout: ${error.message}`);
      // Aún así, limpiar lo que se pueda
      this.logged = false;
      this.igUserId = null;
      throw error;
    }
  }

  /**
   * Obtener comentarios de una publicación específica por URL
   */
  async getCommentsFromPost(postUrl, limit = 10000) {
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
                await this.ig.state.deserializeCookieJar(data.cookieJar);
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
            let id = 0n; // BigInt para evitar overflow
            
            for (let i = 0; i < shortcode.length; i++) {
              const char = shortcode[i];
              const index = BigInt(alphabet.indexOf(char));
              if (index < 0n) {
                throw new Error(`Carácter inválido en shortcode: ${char}`);
              }
              id = id * 64n + index;
            }
            
            mediaId = id.toString(); // Convertir a string
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

            let emptyPagesCount = 0;
            let maxEmptyPages = 10; // Reintentar hasta 10 veces si no hay items (más agresivo)
            let consecutiveErrors = 0;
            let maxConsecutiveErrors = 5;
            let logicalEmptyPages = 0; // páginas con solo duplicados (sin comentarios nuevos)
            const maxLogicalEmptyPages = 5;
            
            while (hasMore || emptyPagesCount < maxEmptyPages) {
              try {
                P.info(`📥 Solicitando página ${Math.floor(count / 20) + 1} de comentarios...`);
                const items = await commentsFeed.items();
                
                if (!items || items.length === 0) {
                  emptyPagesCount++;
                  P.info(`⚠️ Página vacía (${emptyPagesCount}/${maxEmptyPages})`);
                  
                  if (emptyPagesCount >= maxEmptyPages) {
                    P.info(`⚠️ No hay más comentarios después de ${emptyPagesCount} intentos`);
                    break;
                  }
                  
                  // Esperar menos tiempo para ser más rápido
                  await new Promise(resolve => setTimeout(resolve, 1500));
                  continue;
                }
                
                // Resetear contador de errores consecutivos
                consecutiveErrors = 0;

                // Resetear contador de páginas vacías si obtuvimos items
                emptyPagesCount = 0;
                
                P.info(`✅ Recibidos ${items.length} comentarios en esta página`);

                let newCommentsThisPage = 0;
                for (const comment of items) {
                  // Evitar duplicados
                  const commentId = comment.pk.toString();
                  if (!comments.find(c => c.id === commentId)) {
                    comments.push({
                      id: commentId,
                      post_id: shortcode,
                      author_name: comment.user.full_name || comment.user.username,
                      username: comment.user.username,
                      author_avatar: comment.user.profile_pic_url,
                      comment_text: comment.text,
                      timestamp: comment.created_at.toString(),
                      like_count: comment.comment_like_count || 0,
                      is_verified: comment.user.is_verified || false,
                      is_business: comment.user.is_business || false,
                    });
                    count++;
                    newCommentsThisPage++;
                  }
                }

                if (newCommentsThisPage === 0) {
                  logicalEmptyPages++;
                  P.info(`⚠️ Página sin comentarios nuevos (${logicalEmptyPages}/${maxLogicalEmptyPages})`);
                  if (logicalEmptyPages >= maxLogicalEmptyPages) {
                    P.info('⚠️ Demasiadas páginas sin comentarios nuevos, deteniendo extracción');
                    break;
                  }
                } else {
                  logicalEmptyPages = 0;
                }
                
                P.info(`📊 Total acumulado: ${count} comentarios`);
                
                if (count % 20 === 0) {
                  P.info(`📈 Progreso: ${count} comentarios extraídos...`);
                }

                // Parar si ya alcanzamos el número de comentarios del post
                if (postInfo && postInfo.comment_count && count >= postInfo.comment_count) {
                  P.info(`🎯 Alcanzado el total de comentarios reportado por el post (${postInfo.comment_count}), deteniendo extracción`);
                  break;
                }

                // Parar si alcanzamos el límite solicitado por el cliente
                if (count >= limit) {
                  P.info(`🎯 Alcanzado el límite solicitado de comentarios (${limit}), deteniendo extracción`);
                  break;
                }

                hasMore = commentsFeed.isMoreAvailable();
                P.info(`🔄 ¿Hay más disponibles? ${hasMore}`);
                
                if (hasMore) {
                  // Delay reducido entre páginas (1s en lugar de 2s) para ser más rápido
                  await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                  P.info(`✅ Feed indica que no hay más comentarios`);
                  break;
                }
              } catch (pageError) {
                P.error(`❌ Error obteniendo página de comentarios: ${pageError.message}`);
                consecutiveErrors++;
                emptyPagesCount++;
                
                if (consecutiveErrors >= maxConsecutiveErrors) {
                  P.error(`❌ Demasiados errores consecutivos (${consecutiveErrors}), deteniendo extracción`);
                  break;
                }
                
                if (emptyPagesCount >= maxEmptyPages) {
                  P.error(`❌ Demasiadas páginas vacías (${emptyPagesCount}), deteniendo extracción`);
                  break;
                }
                
                // Esperar menos tiempo antes de reintentar (1.5s en lugar de 3s)
                await new Promise(resolve => setTimeout(resolve, 1500));
              }
            }

            if (comments.length > 0) {
              P.info(`✅ ${comments.length} comentarios extraídos usando media ID: ${testMediaId}`);
              
              // Guardar comentarios en caché para extracción incremental
              const cacheFile = path.join(STATE_DIR, `comments_${shortcode}.json`);
              let cachedComments = [];
              
              // Cargar comentarios previos si existen
              if (fs.existsSync(cacheFile)) {
                try {
                  const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                  cachedComments = cacheData.comments || [];
                  P.info(`📦 Encontrados ${cachedComments.length} comentarios en caché previo`);
                } catch (err) {
                  P.warn(`⚠️ Error leyendo caché: ${err.message}`);
                }
              }
              
              // Combinar comentarios nuevos con los del caché (evitar duplicados)
              const allComments = [...cachedComments];
              let newCommentsCount = 0;
              
              for (const comment of comments) {
                if (!allComments.find(c => c.id === comment.id)) {
                  allComments.push(comment);
                  newCommentsCount++;
                }
              }
              
              P.info(`✨ ${newCommentsCount} comentarios nuevos agregados (total acumulado: ${allComments.length})`);
              
              // Guardar todos los comentarios en caché
              fs.writeFileSync(cacheFile, JSON.stringify({
                shortcode,
                post_url: postUrl,
                total_expected: postInfo.comment_count,
                total_cached: allComments.length,
                last_updated: new Date().toISOString(),
                comments: allComments
              }, null, 2));
              
              P.info(`💾 Caché actualizado: ${allComments.length}/${postInfo.comment_count} comentarios guardados`);
              
              // Si no obtuvimos todos los comentarios, informar al usuario
              if (allComments.length < postInfo.comment_count) {
                const missing = postInfo.comment_count - allComments.length;
                P.warn(`⚠️ Faltan ${missing} comentarios por extraer`);
                P.info(`💡 Vuelve a ejecutar la extracción para obtener los comentarios faltantes`);
              } else {
                P.info(`🎉 ¡TODOS los ${allComments.length} comentarios han sido extraídos!`);
              }
              
              return {
                success: true,
                comments: allComments,
                post_info: postInfo,
                extracted_count: allComments.length,
                new_comments: newCommentsCount,
                limit_requested: limit,
                total_comments: postInfo.comment_count,
                extraction_method: 'private_api_incremental',
                is_complete: allComments.length >= postInfo.comment_count
              };
            }
          } catch (mediaIdError) {
            P.info(`⚠️ Método con media ID ${testMediaId} falló: ${mediaIdError.message}`);
            if (mediaIdError.response) {
              P.warn(`   Status: ${mediaIdError.response.status}`);
              P.warn(`   Body: ${JSON.stringify(mediaIdError.response.body || {}).substring(0, 200)}`);
            }
          }
        }

          // Si llegamos aquí, intentar cargar desde caché como último recurso
          const cacheFile = path.join(STATE_DIR, `comments_${shortcode}.json`);
          if (fs.existsSync(cacheFile)) {
            try {
              const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
              P.info(`📦 Retornando ${cacheData.comments.length} comentarios desde caché`);
              return {
                success: true,
                comments: cacheData.comments,
                post_info: postInfo,
                extracted_count: cacheData.comments.length,
                new_comments: 0,
                limit_requested: limit,
                total_comments: postInfo.comment_count,
                extraction_method: 'cache_only',
                is_complete: cacheData.comments.length >= postInfo.comment_count
              };
            } catch (err) {
              P.warn(`⚠️ Error leyendo caché: ${err.message}`);
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

  /**
   * Extraer TODOS los comentarios usando web scraping con Puppeteer
   * Se usa como fallback cuando la API privada no devuelve todos los comentarios
   */
  async scrapeAllComments(postUrl, expectedCount) {
    let browser;
    try {
      P.info(`🌐 Iniciando web scraping para obtener TODOS los ${expectedCount} comentarios...`);
      
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
      
      P.info(`📱 Navegando a: ${postUrl}`);
      await page.goto(postUrl, { waitForTimeout: 5000 });
      
      // Esperar a que carguen los comentarios
      await page.waitForSelector('article', { timeout: 10000 });
      
      const comments = [];
      let scrollAttempts = 0;
      const maxScrolls = 50; // Máximo de scrolls para evitar loop infinito
      
      while (comments.length < expectedCount && scrollAttempts < maxScrolls) {
        // Extraer comentarios visibles
        const newComments = await page.evaluate(() => {
          const commentElements = document.querySelectorAll('ul ul li');
          const extracted = [];
          
          commentElements.forEach(el => {
            const usernameEl = el.querySelector('a[href^="/"]');
            const textEl = el.querySelector('span');
            
            if (usernameEl && textEl) {
              const username = usernameEl.textContent.trim();
              const text = textEl.textContent.trim();
              
              if (username && text && !text.startsWith('@')) {
                extracted.push({
                  username,
                  text,
                  id: `${username}_${text.substring(0, 20)}`
                });
              }
            }
          });
          
          return extracted;
        });
        
        // Agregar solo comentarios nuevos (evitar duplicados)
        newComments.forEach(comment => {
          if (!comments.find(c => c.id === comment.id)) {
            comments.push(comment);
          }
        });
        
        P.info(`📊 Scraping: ${comments.length}/${expectedCount} comentarios extraídos...`);
        
        // Hacer scroll para cargar más comentarios
        await page.evaluate(() => {
          window.scrollBy(0, 1000);
        });
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        scrollAttempts++;
      }
      
      await browser.close();
      
      P.info(`✅ Web scraping completado: ${comments.length} comentarios extraídos`);
      return comments;
      
    } catch (error) {
      if (browser) await browser.close();
      P.error(`❌ Error en web scraping: ${error.message}`);
      return [];
    }
  }

  /**
   * Extraer usuarios que dieron like a un post
   * Nota: Instagram no pagina los likers y puede truncar la lista en posts grandes
   */
  async getLikesFromPost(postUrl, limit = 10000) {
    return this.limiter.schedule(async () => {
      try {
        if (!this.logged) {
          throw new Error('No hay sesión activa de Instagram');
        }

        P.info(`❤️ Obteniendo likes de publicación: ${postUrl}`);
        
        // a) Extraer shortcode de la URL (eliminar query params)
        const cleanUrl = postUrl.split('?')[0];
        const m = cleanUrl.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (!m) {
          throw new Error('URL de Instagram inválida');
        }
        
        const shortcode = m[1];
        P.info(`📝 Shortcode extraído: ${shortcode}`);
        
        // b) Convertir shortcode a mediaId usando BigInt y resolver pk real
        let mediaPk = shortcodeToPk(shortcode);
        P.info(`🔄 Media ID inicial: ${mediaPk}`);
        
        let postInfo;
        try {
          const info = await this.ig.media.info(mediaPk);
          const item = info?.items?.[0];
          
          if (item?.pk) {
            mediaPk = String(item.pk);
            P.info(`✅ Media PK real resuelto: ${mediaPk}`);
          }
          
          // Detectar si el autor ocultó el contador de likes
          const likesHidden = Boolean(item?.like_and_view_counts_disabled);
          
          postInfo = {
            id: mediaPk,
            shortcode: item?.code ?? shortcode,
            like_count: item?.like_count ?? 0,
            comment_count: item?.comment_count ?? 0,
            likes_hidden: likesHidden,
            owner: {
              username: item?.user?.username ?? 'unknown',
              full_name: item?.user?.full_name ?? ''
            }
          };
          
          P.info(`✅ Post info: @${postInfo.owner.username} - ${postInfo.like_count} likes${likesHidden ? ' (ocultos)' : ''}`);
        } catch (err) {
          P.warn(`⚠️ No se pudo obtener info del media: ${err.message}`);
          postInfo = {
            id: mediaPk,
            shortcode,
            like_count: 0,
            comment_count: 0,
            likes_hidden: false,
            owner: { username: 'unknown', full_name: '' }
          };
        }
        
        // c) Pedir likers (sin paginación, Instagram devuelve lo que puede)
        P.info(`❤️ Solicitando likers del media...`);
        const res = await this.ig.media.likers(mediaPk);
        
        const likers = (res?.users ?? []).map(u => ({
          user_id: String(u.pk),
          username: u.username,
          full_name: u.full_name || u.username,
          profile_pic_url: u.profile_pic_url,
          is_verified: !!u.is_verified,
          is_private: !!u.is_private,
        }));
        
        const totalReportedByApi = res?.user_count ?? likers.length;
        P.info(`✅ Recibidos ${likers.length} likers (API reporta ${totalReportedByApi} total)`);
        
        // d) Aplicar límite en memoria
        const sliced = likers.slice(0, Math.min(limit, likers.length));
        
        // e) Advertir si Instagram truncó la lista
        if (sliced.length < totalReportedByApi) {
          P.warn(`⚠️ Instagram truncó la lista: ${sliced.length}/${totalReportedByApi} likers`);
          P.info(`💡 Esto es normal en posts con muchos likes - Instagram no devuelve todos`);
        }
        
        return {
          success: true,
          likes: sliced,
          extracted_count: sliced.length,
          total_reported_by_api: totalReportedByApi,
          post_info: postInfo,
          note: 'Instagram puede truncar la lista de likers en posts grandes.'
        };
        
      } catch (error) {
        P.error(`❌ Error obteniendo likes de publicación: ${error.message}`);
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
                await this.ig.state.deserializeCookieJar(data.cookieJar);
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
          
          // Emitir alerta via Socket.IO
          emitToUserIG(this.userId, 'instagram:alert', {
            type: 'private_account_target',
            severity: 'error',
            message: `La cuenta @${username} es privada`,
            description: 'No se pueden obtener seguidores de cuentas privadas. La cuenta objetivo debe ser pública para extraer sus seguidores.',
            username: username,
            account_info: userInfo
          });
          
          return {
            success: false,
            error: 'La cuenta es privada',
            followers: [],
            public_followers: [],
            private_followers: [],
            alerts: [{
              type: 'private_account_target',
              severity: 'error',
              message: `La cuenta @${username} es privada`,
              description: 'No se pueden obtener seguidores de cuentas privadas. La cuenta objetivo debe ser pública para extraer sus seguidores.',
              username: username,
              account_info: userInfo
            }],
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
          
          // Separar seguidores públicos de privados
          const publicFollowers = followers.filter(f => !f.is_private);
          const privateFollowers = followers.filter(f => f.is_private);
          
          // Generar alertas si es necesario
          const alerts = [];
          
          // Alerta: Contar cuentas privadas entre los seguidores
          if (privateFollowers.length > 0) {
            alerts.push({
              type: 'private_followers_detected',
              severity: 'info',
              message: `${privateFollowers.length} de ${followers.length} seguidores extraídos son cuentas privadas`,
              description: `Estas cuentas pueden no aceptar mensajes directos de cuentas que no siguen.`,
              count: privateFollowers.length,
              total: followers.length
            });
            P.info(`⚠️ ALERTA: ${privateFollowers.length} cuentas privadas detectadas entre ${followers.length} seguidores`);
          }
          
          // Alerta: Detecta si parece que no se pudieron extraer todos los seguidores
          if (followers.length < userInfo.follower_count) {
            const difference = userInfo.follower_count - followers.length;
            if (difference > 100) { // Solo alertar si la diferencia es significativa
              alerts.push({
                type: 'partial_extraction',
                severity: 'warning',
                message: `Solo se pudieron extraer ${followers.length} de ${userInfo.follower_count} seguidores`,
                description: `La diferencia de ${difference} seguidores podría deberse a límites de la API o configuración de privacidad de la cuenta.`,
                extracted: followers.length,
                total: userInfo.follower_count,
                difference: difference
              });
              P.warn(`⚠️ ALERTA: Solo se extrajeron ${followers.length} de ${userInfo.follower_count} seguidores`);
            }
          }
          
          return {
            success: true,
            followers,
            public_followers: publicFollowers,
            private_followers: privateFollowers,
            account_info: userInfo,
            extracted_count: followers.length,
            public_count: publicFollowers.length,
            private_count: privateFollowers.length,
            limit_requested: limit,
            total_followers: userInfo.follower_count,
            alerts: alerts.length > 0 ? alerts : undefined
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
  P.info(`🔍 getOrCreateIGSession llamado para userId: ${userId}`);
  P.info(`   Map tiene sesión: ${igSessions.has(userId)}`);
  
  if (igSessions.has(userId)) {
    const existing = igSessions.get(userId);
    P.info(`   Sesión existente - logged: ${existing.logged}, username: ${existing.username}`);
    // Verificar si la sesión tiene cookies cargadas
    if (existing.logged) {
      P.info(`   ✅ Retornando sesión existente logueada`);
      return existing;
    }
    // Si no está logueada pero existe, intentar cargar desde archivo
    try {
      const file = path.join(STATE_DIR, `${userId}.json`);
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (data.cookieJar && data.username) {
          await existing.ig.state.deserializeCookieJar(data.cookieJar);
          
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
          
          // Restaurar dispositivo guardado si existe
          if (data.device && data.device.deviceString) {
            existing.ig.state.deviceString = data.device.deviceString;
            existing.ig.state.deviceId = data.device.deviceId;
            existing.ig.state.uuid = data.device.uuid;
            existing.ig.state.phoneId = data.device.phoneId;
            if (data.device.adid) existing.ig.state.adid = data.device.adid;
            if (data.device.build) existing.ig.state.build = data.device.build;
            P.info(`✅ Dispositivo guardado restaurado desde archivo`);
          }
          
          // Restaurar IP guardada si existe (para mantener consistencia)
          if (data.clientIP && data.clientIP !== 'unknown') {
            existing.ig.request.defaults.headers = {
              ...existing.ig.request.defaults.headers,
              'X-Forwarded-For': data.clientIP,
              'X-Real-IP': data.clientIP,
              'CF-Connecting-IP': data.clientIP
            };
            P.info(`📍 IP guardada restaurada: ${data.clientIP}`);
          }
          
          // ⭐ IMPORTANTE: Verificar que la sesión sea válida antes de marcar como logged
          try {
            P.info(`🔍 Verificando validez de sesión restaurada...`);
            const user = await existing.ig.account.currentUser();
            existing.logged = true;
            existing.username = data.username;
            existing.igUserId = user.pk || data.igUserId;
            P.info(`✅ Sesión restaurada desde archivo y VERIFICADA como válida para usuario ${userId}`);
            P.info(`   Username: ${existing.username}, UserID: ${existing.igUserId}`);
            return existing;
          } catch (verifyError) {
            // Si falla la verificación, la sesión expiró
            P.warn(`⚠️ Sesión guardada inválida o expirada (${verifyError.message?.substring(0, 100)}), se requerirá nuevo login`);
            P.warn(`   Esto es normal si las cookies expiraron o Instagram cerró la sesión`);
            existing.logged = false;
            existing.username = null;
            existing.igUserId = null;
            // No retornar aquí, dejar que continúe y cree nueva sesión si es necesario
          }
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
          await service.ig.state.deserializeCookieJar(data.cookieJar);
          
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
          
          // Restaurar dispositivo guardado si existe
          if (data.device && data.device.deviceString) {
            service.ig.state.deviceString = data.device.deviceString;
            service.ig.state.deviceId = data.device.deviceId;
            service.ig.state.uuid = data.device.uuid;
            service.ig.state.phoneId = data.device.phoneId;
            if (data.device.adid) service.ig.state.adid = data.device.adid;
            if (data.device.build) service.ig.state.build = data.device.build;
            P.info(`✅ Dispositivo guardado restaurado desde archivo`);
          }
          
          // Restaurar IP guardada si existe (para mantener consistencia)
          if (data.clientIP && data.clientIP !== 'unknown') {
            service.ig.request.defaults.headers = {
              ...service.ig.request.defaults.headers,
              'X-Forwarded-For': data.clientIP,
              'X-Real-IP': data.clientIP,
              'CF-Connecting-IP': data.clientIP
            };
            P.info(`📍 IP guardada restaurada: ${data.clientIP}`);
          }
          
          // ⭐ IMPORTANTE: Verificar que la sesión sea válida antes de marcar como logged
          try {
            P.info(`🔍 Verificando validez de sesión restaurada...`);
            const user = await service.ig.account.currentUser();
            service.logged = true;
            service.username = data.username;
            service.igUserId = user.pk || data.igUserId;
            P.info(`✅ Sesión cargada desde archivo y VERIFICADA como válida para usuario ${userId}`);
            P.info(`   Username: ${service.username}, UserID: ${service.igUserId}`);
          } catch (verifyError) {
            // Si falla la verificación, la sesión expiró
            P.warn(`⚠️ Sesión guardada inválida o expirada (${verifyError.message?.substring(0, 100)}), se requerirá nuevo login`);
            P.warn(`   Esto es normal si las cookies expiraron o Instagram cerró la sesión`);
            service.logged = false;
            service.username = null;
            service.igUserId = null;
          }
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
 * Restaurar todas las sesiones guardadas al iniciar el servidor
 * Esto ayuda a mantener las sesiones activas después de reinicios
 */
export async function restoreAllSavedSessions() {
  try {
    P.info(`🔄 Intentando restaurar todas las sesiones guardadas...`);
    
    if (!fs.existsSync(STATE_DIR)) {
      P.info(`ℹ️ No hay directorio de sesiones, no hay sesiones que restaurar`);
      return;
    }
    
    const files = fs.readdirSync(STATE_DIR);
    const sessionFiles = files.filter(f => f.endsWith('.json') && !f.includes('_challenge'));
    
    if (sessionFiles.length === 0) {
      P.info(`ℹ️ No hay archivos de sesión guardados`);
      return;
    }
    
    P.info(`📁 Encontrados ${sessionFiles.length} archivo(s) de sesión`);
    
    for (const file of sessionFiles) {
      try {
        const userId = file.replace('.json', '');
        const filePath = path.join(STATE_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (!data.cookieJar || !data.username) {
          P.info(`⚠️ Archivo ${file} no tiene cookies válidas, saltando`);
          continue;
        }
        
        // Solo restaurar si no existe ya en memoria
        if (igSessions.has(userId)) {
          P.info(`ℹ️ Sesión para usuario ${userId} ya existe en memoria, saltando restauración`);
          continue;
        }
        
        P.info(`📥 Restaurando sesión para usuario ${userId} (${data.username})...`);
        
        // Crear sesión y restaurarla
        const service = new InstagramService(userId);
        await service.ig.state.deserializeCookieJar(data.cookieJar);
        
        // Restaurar dispositivo
        if (data.device && data.device.deviceString) {
          service.ig.state.deviceString = data.device.deviceString;
          service.ig.state.deviceId = data.device.deviceId;
          service.ig.state.uuid = data.device.uuid;
          service.ig.state.phoneId = data.device.phoneId;
          if (data.device.adid) service.ig.state.adid = data.device.adid;
          if (data.device.build) service.ig.state.build = data.device.build;
        }
        
        // Restaurar IP
        if (data.clientIP && data.clientIP !== 'unknown') {
          service.ig.request.defaults.headers = {
            ...service.ig.request.defaults.headers,
            'X-Forwarded-For': data.clientIP,
            'X-Real-IP': data.clientIP,
            'CF-Connecting-IP': data.clientIP
          };
        }
        
        // Restaurar datos procesados
        if (data.processedMessages && Array.isArray(data.processedMessages)) {
          service.processedMessages = new Set(data.processedMessages);
        }
        if (data.processedComments && Array.isArray(data.processedComments)) {
          service.processedComments = new Set(data.processedComments);
        }
        
        // Verificar validez de sesión (pero no bloquear si falla)
        try {
          const user = await service.ig.account.currentUser();
          service.logged = true;
          service.username = data.username;
          service.igUserId = user.pk || data.igUserId;
          igSessions.set(userId, service);
          P.info(`✅ Sesión restaurada exitosamente para ${data.username}`);
        } catch (verifyError) {
          P.warn(`⚠️ Sesión para ${data.username} expiró (${verifyError.message?.substring(0, 50)}), se requerirá nuevo login`);
          // No agregar a igSessions si está expirada, pero tampoco bloquear
        }
        
      } catch (fileError) {
        P.warn(`⚠️ Error restaurando sesión desde ${file}: ${fileError.message}`);
      }
    }
    
    const restoredCount = Array.from(igSessions.values()).filter(s => s.logged).length;
    P.info(`✅ Restauración completada: ${restoredCount} sesión(es) activa(s) de ${sessionFiles.length} archivo(s)`);
    
  } catch (error) {
    P.error(`❌ Error restaurando sesiones guardadas: ${error.message}`);
  }
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
export async function igSendMessage(username, message, userId = null) {
  try {
    // Si se proporciona userId, usar esa sesión específica
    let session = null;
    if (userId) {
      session = await getOrCreateIGSession(userId);
      if (!session.logged) {
        return {
          success: false,
          error: `No hay sesión activa de Instagram para el usuario ${userId}. Debe hacer login primero.`,
          data: null
        };
      }
    } else {
      // Si no se proporciona userId, usar la primera sesión disponible (comportamiento antiguo para compatibilidad)
      for (const [uid, userSession] of igSessions) {
      if (userSession.logged) {
        session = userSession;
          console.log(`⚠️ [IG] No se proporcionó userId, usando sesión de usuario ${uid}`);
        break;
        }
      }
    }
    
    if (!session || !session.logged) {
      return {
        success: false,
        error: 'No hay sesión activa de Instagram. Debe hacer login primero.',
        data: null
      };
    }
    
    console.log(`📤 [IG] Enviando mensaje a ${username} desde usuario ${session.userId || 'desconocido'}: "${message}"`);
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
export async function igGetFollowers(username, limit = 100, userId = null) {
  try {
    // Si se proporciona userId, usar esa sesión específica
    let session = null;
    if (userId) {
      session = await getOrCreateIGSession(userId);
      if (!session.logged) {
        return {
          success: false,
          error: `No hay sesión activa de Instagram para el usuario ${userId}. Debe hacer login primero.`,
          followers: [],
          account_info: null
        };
      }
    } else {
      // Si no se proporciona userId, usar la primera sesión disponible (comportamiento antiguo para compatibilidad)
      for (const [uid, userSession] of igSessions) {
      if (userSession.logged) {
        session = userSession;
          console.log(`⚠️ [IG] No se proporcionó userId para obtener seguidores, usando sesión de usuario ${uid}`);
        break;
        }
      }
    }
    
    if (!session || !session.logged) {
      return {
        success: false,
        error: 'No hay sesión activa de Instagram. Debe hacer login primero.',
        followers: [],
        account_info: null
      };
    }
    
    console.log(`👥 [IG] Obteniendo seguidores de ${username} (límite: ${limit}) desde usuario ${session.userId || 'desconocido'}`);
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

// Función wrapper para obtener historial de un thread
export async function igGetThreadHistory(threadId, limit = 50, userId = null) {
  try {
    // Si se proporciona userId, usar esa sesión específica
    let session = null;
    if (userId) {
      session = await getOrCreateIGSession(userId);
    } else {
      // Usar la primera sesión disponible
      for (const [uid, userSession] of igSessions) {
        if (userSession.logged) {
          session = userSession;
          break;
        }
      }
    }
    
    if (!session) {
      return {
        success: false,
        error: 'No hay sesión activa de Instagram. Debe hacer login primero.',
        messages: [],
        count: 0
      };
    }
    
    console.log(`📖 [IG] Obteniendo historial del thread ${threadId}...`);
    const result = await session.getThreadHistory(threadId, limit);
    
    return result;
  } catch (error) {
    console.error(`❌ [IG] Error obteniendo historial del thread: ${error.message}`);
    return {
      success: false,
      error: error.message,
      messages: [],
      count: 0
    };
  }
}

export { InstagramService };
