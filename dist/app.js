// app.js
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import http from 'http';
import multer from 'multer';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import paymentRoutes from './routes/paymentRoutes.js';
import sessionsRoutes from './routes/sessionsRoutes.js';
import { transcribeAudioBuffer } from './services/openaiService.js'; // Asegúrate de importar la función
// Rutas
import authRoutes from './routes/authRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import configuracionChatRoutes from './routes/configuracionChatRoutes.js';
import health from './routes/health.js';
import personalityRoutes from './routes/personalityRoutes.js';
import whatsappRoutes from './routes/whatsappRoutes.js';
// NUEVAS RUTAS PARA STRIPE CONNECT (afiliados)
import billingRouter, { stripeWebhookRaw } from '../src/billing.js';
import googleCalendarRoutes from '../src/routes/googleCalendar.routes.js';
import { saveCalendarToken } from './controllers/whatsappController.js';
import ai from './routes/ai.js';
import affiliateConnectRoutes from './routes/connect.js';
import contactsRoutes from './routes/contactsRoutes.js'; // Importación de contactos
import contadorRoutes from './routes/contadorRoutes.js';
import customDomainsRoutes from './routes/customDomainsRoutes.js';
import dealcarRoutes from './routes/dealcarRoutes.js';
import dominioRoutes from './routes/dominioRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import IntegracionesInstaladasRoutes from './routes/IntegracionesInstaladasRoutes.js';
import leadsBulkRoutes from './routes/leads-bulk.js'; // Envío masivo de leads
import leadsImportRoutes from './routes/leadsImportRoutes.js'; // Importación de leads
import leadsRoutes from './routes/leadsRoutes.js'; // Asegúrate de que la ruta sea correcta
import affiliateStatusRoutes from './routes/status.js';
import telegramRoutes from './routes/telegramRoutes.js';
import userSettingsRoutes from './routes/userSettingsRoutes.js'; // <-- NUEVO: Importa tus rutas de userSettings
import webchatChatsRoutes from './routes/webchatChatsRoutes.js'; // Asegúrate de que la ruta sea correcta
import webchatConfigRoutes from './routes/webchatConfigRoutes.js';
import webhooksRoutes from './routes/webhooksRoutes.js';
import websitesRoutes from './routes/websitesRoutes.js';
import instagramRoutes from './routes/instagramRoutes.js';

// =============================================
// CONFIGURACIÓN DE VARIABLES DE ENTORNO
// =============================================
const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env');
try {
  const envConfig = dotenv.config({ path: envPath });
  if (envConfig.error) {
    console.warn(`⚠️ No se encontró archivo .env en: ${envPath}`);
    console.warn('⚠️ Usando variables de entorno del sistema (Render Dashboard)');
  } else {
    console.log(`✅ Archivo .env cargado desde: ${envPath}`);
  }
} catch (error) {
  console.warn('⚠️ Error al cargar .env, usando variables del sistema');
}
dotenv.config();
// Variables obligatorias
const ENV_CONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5001,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  BACKEND_URL: process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5001}`,
  SESSION_SECRET: process.env.SESSION_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  DATABASE_URL: process.env.DATABASE_URL,
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
  SESSION_DOMAIN: process.env.SESSION_DOMAIN,
  ENABLE_WILDCARD_SUBDOMAINS: process.env.ENABLE_WILDCARD_SUBDOMAINS || 'false',
  FORCE_LOGIN: process.env.FORCE_LOGIN || 'false',
  // Custom Domains Configuration
  CLOUDFRONT_DOMAIN: process.env.CLOUDFRONT_DOMAIN || 'domains.uniclick.io',
  NEXT_PUBLIC_CLOUDFRONT_DOMAIN: process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN || 'domains.uniclick.io',
  // Supabase Configuration
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

const checkRequiredVars = () => {
  const requiredVars = [
    'SESSION_SECRET',
    'JWT_SECRET',
    'OPENAI_API_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'DATABASE_URL'
  ];
  const missingVars = requiredVars.filter(varName => !ENV_CONFIG[varName]);
  if (missingVars.length > 0) {
    console.warn('\n⚠️ WARNING: Variables de entorno faltantes:');
    console.warn(missingVars.map(v => `  - ${v}`).join('\n'));
    console.warn('⚠️ El servidor continuará pero algunas funcionalidades pueden no estar disponibles');
    console.warn('⚠️ Configura estas variables en Render Dashboard para habilitar todas las funcionalidades\n');
  } else {
    console.log('✅ Todas las variables requeridas están configuradas');
  }
};

const showConfigSummary = () => {
  console.log('\n=== CONFIGURACIÓN DEL SISTEMA ===');
  console.log(`Entorno: ${ENV_CONFIG.NODE_ENV}`);
  console.log(`Servidor: ${ENV_CONFIG.BACKEND_URL}`);
  console.log(`Frontend: ${ENV_CONFIG.FRONTEND_URL}`);
  console.log(`OpenAI: ${ENV_CONFIG.OPENAI_API_KEY ? 'Configurada' : 'NO DISPONIBLE'}`);
  console.log(`Google Auth: ${ENV_CONFIG.GOOGLE_CLIENT_ID ? 'Configurado' : 'NO DISPONIBLE'}`);
  console.log(`Database: ${ENV_CONFIG.DATABASE_URL ? 'Conectada' : 'NO DISPONIBLE'}`);
  console.log('==================================\n');
};

checkRequiredVars();
showConfigSummary();

// =============================================
// EXPRESS
// =============================================
const app = express();

// Middleware para evitar caché en APIs (EXCEPTO videos y assets estáticos)
app.use('/api', (req, res, next) => {
  // 🎬 Allow caching for video streaming and static assets
  const cacheableEndpoints = [
    '/video/stream/',
    '/video/preload/',
    '/video/versions/',
    '/connection/detect'
  ];
  
  const shouldCache = cacheableEndpoints.some(endpoint => req.path.includes(endpoint));
  
  if (shouldCache) {
    // 🚀 Optimized cache headers for video content
    const isVideoContent = req.path.includes('/video/');
    
    if (isVideoContent) {
      // Long-term caching for video files (immutable content)
      res.set({
        'Cache-Control': 'public, max-age=31536000, immutable', // 1 year
        'Vary': 'Accept-Encoding, Range',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
        'X-Content-Type-Options': 'nosniff'
      });
    } else {
      // Moderate caching for API responses
      res.set({
        'Cache-Control': 'public, max-age=1800', // 30 minutes
        'Vary': 'Accept-Encoding, User-Agent'
      });
    }
  } else {
    // No cache for other API endpoints
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  
  next();
});

// Rutas de Webhooks
app.use('/webhooks', webhooksRoutes);

// Definimos un array con los orígenes permitidos (CENTRALIZADO en app.uniclick.io)
const allowedOrigins = [
  'https://app.uniclick.io',  // 🎯 ÚNICO origen permitido para autenticación
  'https://uniclick.io',      // Dominio principal
  'https://www.uniclick.io',  // Dominio www
  'https://www.speedleads.app', // Frontend principal en Vercel
  'https://speedleads.app',   // Frontend sin www
  'https://web.whatsapp.com', // Para webhooks de WhatsApp (sin trailing slash)
  'http://localhost:3000',    // Solo para desarrollo (sin trailing slash)
  'http://uniclick.io:5001',  // Solo para desarrollo
  'http://app.uniclick.io:5001', // Solo para desarrollo
  // 🌐 PATRÓN PARA SUBDOMINIOS DE WEBSITES DE USUARIOS
  /^https?:\/\/[a-zA-Z0-9-]+\.uniclick\.io(:\d+)?$/
];


// Configuración de CORS para Express (CENTRALIZADO en app.uniclick.io)
app.use(cors({
  origin: function (origin, callback) {
    // En desarrollo, permitir todo
    if (ENV_CONFIG.NODE_ENV === 'development') {
      // No loggear nada en desarrollo para evitar spam de extensiones
      return callback(null, true);
    }

    // Permitir requests sin origin (apps móviles, etc.)
    if (!origin) return callback(null, true);

    // Verificar si el origin está en la lista permitida (strings exactos)
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    // 🌐 NUEVO: Verificar con regex para subdominios de websites de usuarios
    const isSubdomainAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });

    if (isSubdomainAllowed) {
      return callback(null, true);
    }

    // 🌐 ADICIONAL: Permitir cualquier subdominio de uniclick.io para websites
    if (origin && origin.match(/^https?:\/\/[a-zA-Z0-9-]+\.uniclick\.io(:\d+)?$/)) {
      return callback(null, true);
    }

    // Silencia extensiones de Chrome y otros esquemas (no error, sin CORS)
    if (origin?.startsWith('chrome-extension://') || !/^https?:\/\//i.test(origin || '')) {
      return callback(null, false);
    }
    
    // (opcional) console.debug(`CORS blocked origin: ${origin}`);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true                 // <-- Habilita envío de cookies
}));

// Domain security middleware ANTES de definir rutas
import { authMiddleware, centralizeAuthMiddleware, contentTypeMiddleware, customDomainRoutingMiddleware, domainSecurityMiddleware, noCacheMiddleware } from './middleware/domainSecurity.js';

// ⚙️ Configurar Express para confiar en proxies (Render, Cloudflare, etc.)
// Esto permite extraer la IP real del cliente desde headers como X-Forwarded-For
app.set('trust proxy', true);

// Middleware de cookies (necesario para el resto de middlewares)
app.use(cookieParser());

// ⚡ 1) WEBHOOK DE STRIPE — RAW BODY — PRIMERO DE TODO
app.post('/api/stripe/webhook', ...stripeWebhookRaw);

// ⚡ 2) BODY PARSERS — DESPUÉS del webhook (y ANTES del resto)
app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ extended: true, limit: '1gb' }));

// Endpoint de diagnóstico de Instagram (ANTES de todos los middlewares)
app.get('/instagram-diagnostic', (req, res) => {
  console.log('🔍 [DIAGNOSTIC] Endpoint de diagnóstico de Instagram llamado');
  res.json({
    success: true,
    message: 'Instagram endpoints funcionando',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: [
      'GET /instagram-diagnostic',
      'POST /api/instagram/login',
      'POST /api/instagram/2fa',
      'GET /api/instagram/status',
      'GET /api/instagram/dms',
      'GET /api/instagram/comments'
    ],
    status: 'OK',
    debug: 'Endpoint funcionando correctamente'
  });
});

// Endpoint de prueba para verificar conexión frontend-backend
app.get('/instagram-test', (req, res) => {
  console.log('🧪 [TEST] Endpoint de prueba de Instagram llamado');
  res.json({
    success: true,
    message: 'Conexión frontend-backend funcionando',
    timestamp: new Date().toISOString(),
    server: 'Backend funcionando correctamente',
    frontend: 'Puede conectarse al backend',
    status: 'OK'
  });
});

// Endpoints de Instagram para pruebas (ANTES de middlewares de autenticación)
app.get('/api/instagram/dms', async (req, res) => {
  console.log('📱 [DMS] Endpoint de DMs de Instagram llamado');
  
  try {
    // Importar el servicio de Instagram
    const { igSyncInbox } = await import('./services/instagramService.js');
    
    console.log('🔄 [DMS] Extrayendo DMs reales de Instagram...');
    
    // Extraer DMs reales de la cuenta
    const result = await igSyncInbox();
    
    if (result.success) {
      // Formatear los datos para mostrar información clara
      const formattedDMs = result.data?.map((thread, index) => {
        const user = thread.users?.[0] || {};
        const lastMessage = thread.last_message || {};
        
        // Convertir timestamp a fecha legible
        const messageDate = lastMessage.timestamp ? 
          new Date(parseInt(lastMessage.timestamp) / 1000).toLocaleString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }) : 'Fecha no disponible';
        
        return {
          id: `dm_${index + 1}`,
          thread_id: thread.thread_id,
          user_name: user.full_name || 'Usuario sin nombre',
          username: user.username || 'sin_usuario',
          user_avatar: user.profile_pic_url || '/default-avatar.png',
          last_message: lastMessage.text || 'Sin mensaje',
          message_date: messageDate,
          timestamp: lastMessage.timestamp,
          unread_count: thread.unread_count || 0,
          thread_title: thread.thread_title || user.full_name || 'Conversación'
        };
      }) || [];
      
      console.log(`✅ [DMS] ${formattedDMs.length} DMs reales formateados de Instagram`);
      res.json({
        success: true,
        data: formattedDMs,
        count: formattedDMs.length,
        message: 'DMs reales de Instagram extraídos y formateados exitosamente'
      });
    } else {
      console.log('❌ [DMS] Error extrayendo DMs reales:', result.error);
      res.json({
        success: false,
        data: [],
        count: 0,
        error: result.error,
        message: 'Error extrayendo DMs reales de Instagram'
      });
    }
  } catch (error) {
    console.error('❌ [DMS] Error en extracción de DMs:', error.message);
    res.json({
      success: false,
      data: [],
      count: 0,
      error: error.message,
      message: 'Error interno extrayendo DMs de Instagram'
    });
  }
});

app.get('/api/instagram/comments', async (req, res) => {
  console.log('💬 [COMMENTS] Endpoint de comentarios de Instagram llamado');
  
  try {
    // Importar el servicio de Instagram
    const { igGetComments } = await import('./services/instagramService.js');
    
    console.log('🔄 [COMMENTS] Extrayendo comentarios reales de Instagram...');
    
    // Extraer comentarios reales de la cuenta
    const result = await igGetComments();
    
    if (result.success) {
      // Formatear los datos para mostrar información clara
      const formattedComments = result.data?.map((comment, index) => {
        // Convertir timestamp a fecha legible
        const commentDate = comment.timestamp ? 
          new Date(parseInt(comment.timestamp) * 1000).toLocaleString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }) : 'Fecha no disponible';
        
        return {
          id: `comment_${index + 1}`,
          comment_id: comment.id,
          post_id: comment.post_id,
          user_name: comment.author_name || 'Usuario sin nombre',
          username: comment.username || 'sin_usuario',
          user_avatar: comment.author_avatar || '/default-avatar.png',
          comment_text: comment.comment_text || 'Sin comentario',
          comment_date: commentDate,
          timestamp: comment.timestamp,
          post_caption: comment.post_caption || 'Sin caption',
          post_image: comment.post_image || null
        };
      }) || [];
      
      console.log(`✅ [COMMENTS] ${formattedComments.length} comentarios reales formateados de Instagram`);
      res.json({
        success: true,
        data: formattedComments,
        count: formattedComments.length,
        message: 'Comentarios reales de Instagram extraídos y formateados exitosamente'
      });
    } else {
      console.log('❌ [COMMENTS] Error extrayendo comentarios reales:', result.error);
      res.json({
        success: false,
        data: [],
        count: 0,
        error: result.error,
        message: 'Error extrayendo comentarios reales de Instagram'
      });
    }
  } catch (error) {
    console.error('❌ [COMMENTS] Error en extracción de comentarios:', error.message);
    res.json({
      success: false,
      data: [],
      count: 0,
      error: error.message,
      message: 'Error interno extrayendo comentarios de Instagram'
    });
  }
});

app.get('/api/instagram/bot/status', async (req, res) => {
  console.log('🤖 [BOT] Endpoint de estado del bot llamado');
  const { userId } = req.query;
  
  // Usar userId del frontend o generar uno por defecto
  const actualUserId = userId || 'a123ccc0-7ee7-45da-92dc-52059c7e21c8';
  
  try {
    const { default: instagramBotService } = await import('./services/instagramBotService.js');
    const status = instagramBotService.getBotStatusForUser(actualUserId);
    
    res.json({
      success: true,
      active: status.isActive || false,
      personality: status.personalityData?.nombre || 'ninguna',
      personalityId: status.personalityData?.id || null,
      messages_sent: status.messagesSent || 0,
      last_activity: status.lastActivity || Date.now(),
      userId: actualUserId
    });
  } catch (error) {
    console.error('❌ [BOT] Error obteniendo estado:', error.message);
    res.json({
      success: false,
      active: false,
      error: error.message
    });
  }
});

// Endpoint para buscar usuarios de Instagram
app.get('/api/instagram/search', async (req, res) => {
  console.log('🔍 [SEARCH] Endpoint de búsqueda de usuarios de Instagram llamado');
  const { query, limit = 10 } = req.query;
  
  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Parámetro "query" es requerido para buscar usuarios',
      message: 'Debe proporcionar un término de búsqueda'
    });
  }
  
  try {
    // Importar el servicio de Instagram
    const { igSearchUsers } = await import('./services/instagramService.js');
    
    console.log(`🔍 [SEARCH] Buscando usuarios reales de Instagram: "${query}"`);
    
    // Buscar usuarios reales en Instagram
    const result = await igSearchUsers(query, parseInt(limit));
    
    if (result.success && result.data && result.data.length > 0) {
      // Formatear los resultados de búsqueda
      const formattedUsers = result.data?.map((user, index) => {
        return {
          id: `user_${index + 1}`,
          user_id: user.pk || user.id,
          username: user.username || 'sin_usuario',
          full_name: user.full_name || user.fullName || 'Usuario sin nombre',
          profile_pic_url: user.profile_pic_url || user.profilePicUrl || '/default-avatar.png',
          is_verified: user.is_verified || user.isVerified || false,
          is_private: user.is_private || user.isPrivate || false,
          follower_count: user.follower_count || user.followerCount || 0,
          following_count: user.following_count || user.followingCount || 0,
          media_count: user.media_count || user.mediaCount || 0,
          biography: user.biography || user.bio || '',
          external_url: user.external_url || user.externalUrl || null,
          is_business: user.is_business || user.isBusiness || false,
          category: user.category || null
        };
      }) || [];
      
      console.log(`✅ [SEARCH] ${formattedUsers.length} usuarios reales encontrados para: "${query}"`);
      res.json({
        success: true,
        data: formattedUsers,
        count: formattedUsers.length,
        query: query,
        message: `Búsqueda exitosa: ${formattedUsers.length} usuarios encontrados`
      });
    } else {
      // Si no se encuentran usuarios reales, devolver un mensaje informativo
      console.log(`⚠️ [SEARCH] No se encontraron usuarios reales para: "${query}"`);
      res.json({
        success: true,
        data: [],
        count: 0,
        query: query,
        message: `No se encontraron usuarios para "${query}". La búsqueda de Instagram puede estar restringida o el usuario no existe.`,
        note: 'Para buscar usuarios específicos, usa el endpoint de envío directo de mensajes'
      });
    }
  } catch (error) {
    console.error('❌ [SEARCH] Error en búsqueda de usuarios:', error.message);
    res.json({
      success: false,
      data: [],
      count: 0,
      error: error.message,
      message: 'Error interno buscando usuarios de Instagram'
    });
  }
});

// Endpoint para enviar mensaje directo a un usuario específico
app.post('/api/instagram/send-message', async (req, res) => {
  console.log('📤 [SEND] Endpoint de envío de mensaje directo llamado');
  const { username, message, userId, personalityId, send_as_audio = true } = req.body;
  
  if (!username || !message) {
    return res.status(400).json({
      success: false,
      error: 'Username y message son requeridos',
      message: 'Debe proporcionar username y mensaje'
    });
  }
  
  try {
    // Importar servicios necesarios
    const { igSendMessage } = await import('./services/instagramService.js');
    
    let finalMessage = message;
    let messageGenerated = false;
    let actualPersonalityId = personalityId;
    let actualUserId = userId;
    
    console.log(`🔍 [SEND] DEBUG - userId recibido: ${userId}, personalityId recibido: ${personalityId}`);
    
    // Si no hay userId, intentar obtenerlo del token o req
    if (!actualUserId) {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          // Intentar obtener userId del token
          try {
            const { validateJwt } = await import('./config/jwt.js');
            const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
            if (decoded) {
              actualUserId = decoded.userId || decoded.sub || decoded.user?.id;
              console.log(`✅ [SEND] userId obtenido del token: ${actualUserId}`);
            }
          } catch (jwtError) {
            console.log(`⚠️ [SEND] No se pudo obtener userId del token: ${jwtError.message}`);
          }
        }
      } catch (error) {
        console.log(`⚠️ [SEND] Error obteniendo userId: ${error.message}`);
      }
    }
    
    // Si no hay personalityId pero hay userId, intentar obtenerlo del bot activo
    if (!actualPersonalityId && actualUserId) {
      try {
        const { default: instagramBotService } = await import('./services/instagramBotService.js');
        
        console.log(`🔍 [SEND] Buscando bot activo para userId: ${actualUserId}`);
        const botData = instagramBotService.activeBots.get(actualUserId);
        
        if (botData && botData.isRunning && botData.personalityData) {
          actualPersonalityId = botData.personalityData.id;
          console.log(`✅ [SEND] personalityId obtenido del bot activo: "${botData.personalityData.nombre}" (ID: ${actualPersonalityId})`);
        } else {
          console.log(`⚠️ [SEND] No hay bot activo para userId ${actualUserId}`);
          if (instagramBotService.activeBots.size > 0) {
            console.log(`   Bots activos disponibles:`, Array.from(instagramBotService.activeBots.keys()));
          } else {
            console.log(`   No hay ningún bot activo. Activa el bot desde el frontend primero.`);
          }
        }
      } catch (botError) {
        console.log(`❌ [SEND] Error obteniendo personalityId del bot: ${botError.message}`);
      }
    }
    
    // Resumen final de lo que se encontró
    if (!actualUserId) {
      console.log(`❌ [SEND] No se puede generar mensaje con IA: falta userId`);
      console.log(`   El mensaje se enviará tal cual sin personalización.`);
      console.log(`   Solución: El frontend debe enviar userId en el body o incluir un token de autenticación válido.`);
    } else if (!actualPersonalityId) {
      console.log(`❌ [SEND] No se puede generar mensaje con IA: falta personalityId`);
      console.log(`   userId encontrado: ${actualUserId}`);
      console.log(`   El mensaje se enviará tal cual sin personalización.`);
      console.log(`   Solución: El frontend debe enviar personalityId en el body o activar el bot primero.`);
    }
    
    // Si hay personalidadId (del body o del bot activo) y userId, generar mensaje con IA
    console.log(`🔍 [SEND] DEBUG FINAL - actualPersonalityId: ${actualPersonalityId}, actualUserId: ${actualUserId}`);
    
    if (actualPersonalityId && actualUserId) {
      console.log(`✅ [SEND] Condiciones para IA cumplidas - Generando mensaje personalizado...`);
      try {
        console.log(`🧠 [SEND] Generando mensaje personalizado con IA (personalityId: ${actualPersonalityId})...`);
        
        const { generateBotResponse } = await import('./services/openaiService.js');
        const { supabaseAdmin } = await import('./config/db.js');
        
        // PRIORIDAD 1: Intentar obtener personalidad del bot activo SOLO si coincide con la solicitada
        let personalityData = null;
        try {
          const { default: instagramBotService } = await import('./services/instagramBotService.js');
          const botData = instagramBotService.activeBots.get(actualUserId);
          
          if (botData && botData.isRunning && botData.personalityData) {
            // SOLO usar la personalidad del bot si coincide con la que viene del frontend
            if (botData.personalityData.id === actualPersonalityId) {
              personalityData = botData.personalityData;
              console.log(`✅ [SEND] Usando personalidad del bot activo (coincide): "${personalityData.nombre}" (ID: ${personalityData.id})`);
            } else {
              console.log(`ℹ️ [SEND] Personalidad del bot (${botData.personalityData.id}) != solicitada (${actualPersonalityId}), cargando desde DB`);
            }
          }
        } catch (botError) {
          console.log(`⚠️ [SEND] Error obteniendo personalidad del bot: ${botError.message}`);
        }
        
        // PRIORIDAD 2: Si no se encontró en el bot o no coincide, cargar desde DB
        if (!personalityData && actualPersonalityId) {
          try {
            console.log(`📥 [SEND] Cargando personalidad ${actualPersonalityId} desde DB...`);
            const { data: personalityDataFromDB, error: personalityError } = await supabaseAdmin
              .from('personalities')
              .select('*')
              .eq('id', actualPersonalityId)
              .eq('users_id', actualUserId)
              .single();
            
            if (personalityDataFromDB && !personalityError) {
              personalityData = personalityDataFromDB;
              console.log(`✅ [SEND] Personalidad cargada desde DB: "${personalityData.nombre}" (ID: ${personalityData.id})`);
            } else {
              console.log(`❌ [SEND] Personalidad ${actualPersonalityId} NO encontrada en DB: ${personalityError?.message || 'Sin datos'}`);
            }
          } catch (dbError) {
            console.log(`❌ [SEND] Error cargando personalidad desde DB: ${dbError.message}`);
          }
        }
        
        if (personalityData) {
          // Cargar instrucciones adicionales si es necesario (similar a loadPersonalityData)
          let combinedInstructions = personalityData.instrucciones || '';
          try {
            const { data: additionalInstructions } = await supabaseAdmin
              .from('personality_instructions')
              .select('instruccion')
              .eq('personality_id', actualPersonalityId)
              .eq('users_id', actualUserId)
              .order('created_at', { ascending: true });
            
            if (additionalInstructions && additionalInstructions.length > 0) {
              const additionalText = additionalInstructions.map(instr => instr.instruccion).join('\n');
              combinedInstructions = `${combinedInstructions}\n\n${additionalText}`;
              console.log(`📚 [SEND] ${additionalInstructions.length} instrucciones adicionales agregadas a la personalidad`);
            }
          } catch (instrError) {
            console.log(`⚠️ [SEND] Error cargando instrucciones adicionales: ${instrError.message}`);
          }
          
          // Crear objeto de personalidad completo con instrucciones combinadas
          const fullPersonalityData = {
            ...personalityData,
            instrucciones: combinedInstructions
          };
          
          console.log(`🎭 [SEND] Usando personalidad completa: "${fullPersonalityData.nombre}" (ID: ${fullPersonalityData.id})`);
          console.log(`📝 [SEND] Instrucciones totales: ${combinedInstructions.length} caracteres`);
          
          // Generar mensaje usando la personalidad
          const greetingPrompt = `Eres un experto en comunicación. Necesitas crear un mensaje personalizado basado en el siguiente mensaje base para enviar a ${username}:

MENSAJE BASE:
${message}

INSTRUCCIONES:
1. Crea una variación personalizada del mensaje base
2. NO copies el mensaje exacto
3. Adapta el tono usando la personalidad "${fullPersonalityData.nombre}"
4. Hazlo natural y conversacional
5. Máximo 400 caracteres
6. Mantén la esencia del mensaje original

Genera SOLO el mensaje personalizado, sin explicaciones.`;

          const aiResponse = await generateBotResponse({
            personality: fullPersonalityData,
            userMessage: greetingPrompt,
            userId: actualUserId,
            history: [],
            mediaType: null,
            mediaContent: null,
            context: `Generando mensaje personalizado para ${username}`,
            followerInfo: {
              username: username,
              full_name: '',
              biography: '',
              follower_count: 0,
              is_business: false
            }
          });

          if (aiResponse && aiResponse.trim() !== '') {
            finalMessage = aiResponse.trim();
            messageGenerated = true;
            console.log(`✅ [SEND] Mensaje generado con IA: "${finalMessage.substring(0, 60)}..."`);
          } else {
            console.log(`⚠️ [SEND] IA no generó respuesta, usando mensaje original`);
          }
        } else {
          console.log(`❌ [SEND] Personalidad ${actualPersonalityId} no encontrada en DB`);
          console.log(`   Verifica que la personalidad exista y pertenezca al usuario ${actualUserId}`);
          console.log(`   El mensaje se enviará tal cual sin personalización.`);
        }
      } catch (aiError) {
        console.log(`❌ [SEND] Error generando mensaje con IA: ${aiError.message}`);
        console.error(`   Stack:`, aiError.stack);
        console.log(`   El mensaje se enviará tal cual sin personalización.`);
      }
    } else {
      console.log(`⚠️ [SEND] No se generará mensaje con IA porque:`);
      if (!actualUserId) console.log(`   - Falta userId (debe venir en el body o token)`);
      if (!actualPersonalityId) console.log(`   - Falta personalityId (debe venir en el body o haber bot activo)`);
      console.log(`   El mensaje se enviará tal cual: "${message}"`);
    }
    
    console.log(`📤 [SEND] Enviando mensaje a ${username}: "${finalMessage.substring(0, 60)}${finalMessage.length > 60 ? '...' : ''}"`);
    console.log(`🎤 [SEND] Modo de envío: ${send_as_audio ? 'AUDIO' : 'TEXTO'}`);
    console.log(`🔍 [SEND] send_as_audio value: ${send_as_audio}, type: ${typeof send_as_audio}`);
    
    // Obtener userId final (del body, token, o usar null para sesión por defecto)
    let userIdToUse = actualUserId;
    if (!userIdToUse) {
      // Intentar obtener del token si aún no lo tenemos
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const { validateJwt } = await import('./config/jwt.js');
          const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
          if (decoded) {
            userIdToUse = decoded.userId || decoded.sub || decoded.user?.id;
            console.log(`✅ [SEND] userId obtenido del token: ${userIdToUse}`);
          }
        }
      } catch (tokenError) {
        console.log(`⚠️ [SEND] No se pudo obtener userId del token: ${tokenError.message}`);
      }
    }
    
    console.log(`🔍 [SEND] userIdToUse final: ${userIdToUse || 'null (usará sesión disponible)'}`);
    
    // Enviar mensaje real a Instagram (con userId para usar la sesión correcta)
    let result;
    
    // Validar send_as_audio explícitamente
    const shouldSendAsAudio = send_as_audio === true || send_as_audio === 'true' || (send_as_audio !== false && send_as_audio !== 'false');
    console.log(`🔍 [SEND] Evaluación de audio: send_as_audio=${send_as_audio}, shouldSendAsAudio=${shouldSendAsAudio}`);
    
    if (shouldSendAsAudio) {
      // Enviar como audio usando ElevenLabs
      try {
        console.log(`🎤 [SEND] ═══════════════════════════════════════════════════════`);
        console.log(`🎤 [SEND] INICIANDO ENVÍO DE AUDIO para @${username}`);
        console.log(`🎤 [SEND] userIdToUse: ${userIdToUse || 'null'}`);
        
        const { getOrCreateIGSession, igSessions } = await import('./services/instagramService.js');
        
        // Obtener sesión - primero buscar cualquier sesión activa existente
        console.log(`🔍 [SEND] Obteniendo sesión de Instagram...`);
        console.log(`   userIdToUse: ${userIdToUse || 'null'}`);
        
        let session = null;
        
        // PRIORIDAD 1: Buscar cualquier sesión activa existente (sin crear nueva)
        console.log(`🔍 [SEND] Buscando sesiones activas existentes...`);
        for (const [uid, userSession] of igSessions.entries()) {
          if (userSession && userSession.logged) {
            session = userSession;
            userIdToUse = uid;
            console.log(`✅ [SEND] Sesión activa encontrada: usuario ${uid}, username: ${session.username || 'sin username'}`);
            break;
          }
        }
        
        // PRIORIDAD 2: Si no hay sesión activa pero tenemos userId, intentar obtenerla
        if (!session && userIdToUse) {
          console.log(`🔍 [SEND] Intentando obtener sesión con userId ${userIdToUse}...`);
          session = await getOrCreateIGSession(userIdToUse);
          if (session && session.logged) {
            console.log(`✅ [SEND] Sesión obtenida con userId ${userIdToUse}: ${session.username || 'sin username'} (logged: ${session.logged})`);
          } else {
            console.log(`⚠️ [SEND] Sesión con userId ${userIdToUse} no está logueada`);
            session = null;
          }
        }
        
        if (!session || !session.logged) {
          throw new Error('No hay sesión activa de Instagram. Debe hacer login primero.');
        }
        
        console.log(`✅ [SEND] Sesión final obtenida: ${session.username || 'sin username'} (logged: ${session.logged}, userId: ${session.userId || userIdToUse})`);
        
        // Generar audio desde el texto
        console.log(`🎵 [SEND] Generando audio con ElevenLabs...`);
        console.log(`   Texto: "${finalMessage.substring(0, 100)}${finalMessage.length > 100 ? '...' : ''}"`);
        
        const audioResult = await session.generateAudioWithElevenLabs(finalMessage);
        
        if (audioResult.success && audioResult.audioBuffer) {
          console.log(`✅ [SEND] Audio generado exitosamente: ${(audioResult.audioBuffer.length / 1024).toFixed(2)} KB`);
          
          // Enviar audio
          console.log(`📤 [SEND] Enviando audio a @${username}...`);
          const audioSendResult = await session.sendAudio({
            username: username,
            audioBuffer: audioResult.audioBuffer
          });
          
          // Normalizar respuesta para que tenga el mismo formato que igSendMessage
          result = {
            success: audioSendResult.success,
            data: {
              username: username,
              sentAt: new Date().toISOString(),
              status: 'sent',
              type: 'audio'
            },
            message: 'Audio enviado exitosamente'
          };
          console.log(`🎤 [SEND] ✅✅✅ AUDIO ENVIADO EXITOSAMENTE a @${username} ✅✅✅`);
          console.log(`🎤 [SEND] ═══════════════════════════════════════════════════════`);
        } else {
          throw new Error('No se pudo generar el audio - resultado inválido');
        }
      } catch (audioError) {
        console.log(`❌ [SEND] ═══════════════════════════════════════════════════════`);
        console.log(`❌ [SEND] ERROR ENVIANDO AUDIO a @${username}`);
        console.log(`❌ [SEND] Error: ${audioError.message}`);
        console.log(`❌ [SEND] Stack: ${audioError.stack}`);
        console.log(`❌ [SEND] Fallback: enviando como texto`);
        console.log(`❌ [SEND] ═══════════════════════════════════════════════════════`);
        
        // Fallback a texto si falla el audio
        result = await igSendMessage(username, finalMessage, userIdToUse);
      }
    } else {
      // Enviar como texto normal
      console.log(`📝 [SEND] Enviando como texto (send_as_audio = false)`);
      result = await igSendMessage(username, finalMessage, userIdToUse);
    }
    
    if (result.success) {
      console.log(`✅ [SEND] Mensaje enviado exitosamente a ${username}`);
      
      // Guardar en historial para continuidad de conversación si hay userId
      if (actualUserId) {
        try {
          const { default: instagramBotService } = await import('./services/instagramBotService.js');
          const botData = instagramBotService.activeBots.get(actualUserId);
          
          if (botData) {
            if (!botData.conversationHistory) {
              botData.conversationHistory = new Map();
            }
            
            let history = botData.conversationHistory.get(username) || [];
            history.push({
              role: 'assistant',
              content: finalMessage,
              timestamp: Date.now(),
              isInitialMessage: true
            });
            
            botData.conversationHistory.set(username, history.slice(-50));
            console.log(`💾 [SEND] Historial guardado para ${username} para continuidad de conversación`);
          } else {
            // Si no hay bot activo, crear historial básico en el servicio para que el bot lo encuentre después
            const { getOrCreateIGSession } = await import('./services/instagramService.js');
            try {
              const session = await getOrCreateIGSession(actualUserId);
              
              if (!session.conversationHistory) {
                session.conversationHistory = new Map();
              }
              
              let history = session.conversationHistory.get(username) || [];
              history.push({
                role: 'assistant',
                content: finalMessage,
                timestamp: Date.now(),
                isInitialMessage: true
              });
              
              session.conversationHistory.set(username, history.slice(-50));
              console.log(`💾 [SEND] Historial guardado en sesión para ${username}`);
            } catch (sessionError) {
              console.log(`⚠️ [SEND] Error guardando historial en sesión: ${sessionError.message}`);
            }
          }
        } catch (histError) {
          console.log(`⚠️ [SEND] Error guardando historial: ${histError.message}`);
        }
      }
      
      res.json({
        success: true,
        message: 'Mensaje enviado exitosamente',
        recipient: username,
        sent_message: finalMessage,
        sent_as_audio: send_as_audio,
        ai_generated: messageGenerated,
        personality_used: actualPersonalityId || null,
        personality_name: (messageGenerated && actualPersonalityId && personalityData) ? personalityData.nombre : null,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`❌ [SEND] Error enviando mensaje a ${username}:`, result.error);
      res.json({
        success: false,
        error: result.error,
        message: 'Error enviando mensaje a Instagram'
      });
    }
  } catch (error) {
    console.error('❌ [SEND] Error enviando mensaje:', error.message);
    res.json({
      success: false,
      error: error.message,
      message: 'Error interno enviando mensaje a Instagram'
    });
  }
});

// Endpoint para buscar y enviar mensaje a un usuario
app.post('/api/instagram/find-and-send', async (req, res) => {
  console.log('🔍📤 [FIND-SEND] Endpoint de búsqueda y envío llamado');
  const { username, message } = req.body;
  
  if (!username || !message) {
    return res.status(400).json({
      success: false,
      error: 'Username y message son requeridos',
      message: 'Debe proporcionar username y mensaje'
    });
  }
  
  try {
    // Importar el servicio de Instagram
    const { igSearchUsers, igSendMessage } = await import('./services/instagramService.js');
    
    console.log(`🔍 [FIND-SEND] Buscando usuario: ${username}`);
    
    // Buscar el usuario primero
    const searchResult = await igSearchUsers(username, 1);
    
    if (searchResult.success && searchResult.data && searchResult.data.length > 0) {
      const user = searchResult.data[0];
      console.log(`✅ [FIND-SEND] Usuario encontrado: ${user.username}`);
      
      // Enviar mensaje al usuario encontrado (con userId para usar la sesión correcta)
      const userId = req.user?.userId || req.user?.id || req.user?.sub;
      const sendResult = await igSendMessage(user.username, message, userId);
      
      if (sendResult.success) {
        console.log(`✅ [FIND-SEND] Mensaje enviado exitosamente a ${user.username}`);
        res.json({
          success: true,
          message: 'Mensaje enviado exitosamente',
          recipient: user.username,
          recipient_name: user.full_name,
          sent_message: message,
          timestamp: new Date().toISOString(),
          user_info: {
            username: user.username,
            full_name: user.full_name,
            profile_pic_url: user.profile_pic_url,
            is_verified: user.is_verified,
            follower_count: user.follower_count
          }
        });
      } else {
        console.log(`❌ [FIND-SEND] Error enviando mensaje:`, sendResult.error);
        res.json({
          success: false,
          error: sendResult.error,
          message: 'Error enviando mensaje a Instagram'
        });
      }
    } else {
      console.log(`❌ [FIND-SEND] Usuario ${username} no encontrado`);
      res.json({
        success: false,
        error: `Usuario ${username} no encontrado`,
        message: 'El usuario no existe o no está disponible'
      });
    }
  } catch (error) {
    console.error('❌ [FIND-SEND] Error:', error.message);
    res.json({
      success: false,
      error: error.message,
      message: 'Error interno buscando y enviando mensaje'
    });
  }
});

// Endpoint para importar lista de leads de Instagram (ANTES de middlewares de autenticación)
app.post('/api/instagram/import-leads', async (req, res) => {
  console.log('📥 [IMPORT-LEADS] Endpoint de importación de leads llamado');
  const { usernames, source = 'manual' } = req.body;

  if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere un array de usernames',
      message: 'Debe proporcionar una lista de usernames en formato array'
    });
  }

  try {
    console.log(`📥 [IMPORT-LEADS] Importando ${usernames.length} leads de Instagram...`);

    const leads = usernames.map((username, index) => {
      return {
        id: `lead_${index + 1}`,
        username: typeof username === 'string' ? username.trim() : username.username?.trim(),
        full_name: typeof username === 'object' ? username.full_name : null,
        source: source,
        imported_at: new Date().toISOString(),
        status: 'pending'
      };
    });

    console.log(`✅ [IMPORT-LEADS] ${leads.length} leads importados exitosamente`);

    res.json({
      success: true,
      leads,
      count: leads.length,
      message: `${leads.length} leads importados exitosamente`,
      source
    });

  } catch (error) {
    console.error('❌ [IMPORT-LEADS] Error importando leads:', error.message);
    res.json({
      success: false,
      leads: [],
      count: 0,
      error: error.message,
      message: 'Error interno importando leads de Instagram'
    });
  }
});

// Endpoint para envío masivo desde lista de usernames (ANTES de middlewares de autenticación)
app.post('/api/instagram/bulk-send-list', async (req, res) => {
  console.log('📤📋 [BULK-LIST] Endpoint de envío masivo desde lista llamado');
  const { usernames, message, delay = 2000 } = req.body;

  if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere un array de usernames',
      message: 'Debe proporcionar una lista de usernames'
    });
  }

  if (!message) {
    return res.status(400).json({
      success: false,
      error: 'message es requerido',
      message: 'Debe proporcionar el mensaje a enviar'
    });
  }

  try {
    const { igSendMessage } = await import('./services/instagramService.js');

    console.log(`📤 [BULK-LIST] Enviando mensajes a ${usernames.length} usuarios...`);

    let sentCount = 0;
    let failedCount = 0;
    const results = [];

    // Enviar mensajes a cada usuario con delay
    for (let i = 0; i < usernames.length; i++) {
      const username = typeof usernames[i] === 'string' ? usernames[i].trim() : usernames[i].username?.trim();
      
      if (!username) {
        failedCount++;
        results.push({
          username: 'unknown',
          status: 'failed',
          error: 'Username inválido',
          timestamp: new Date().toISOString()
        });
        continue;
      }

      try {
        console.log(`📤 [BULK-LIST] Enviando mensaje ${i + 1}/${usernames.length} a ${username}...`);
        
        // Obtener userId del request
        const userId = req.user?.userId || req.user?.id || req.user?.sub;
        const sendResult = await igSendMessage(username, message, userId);
        
        if (sendResult.success) {
          sentCount++;
          results.push({
            username: username,
            status: 'sent',
            timestamp: new Date().toISOString()
          });
          console.log(`✅ [BULK-LIST] Mensaje enviado a ${username}`);
        } else {
          failedCount++;
          results.push({
            username: username,
            status: 'failed',
            error: sendResult.error,
            timestamp: new Date().toISOString()
          });
          console.log(`❌ [BULK-LIST] Error enviando a ${username}: ${sendResult.error}`);
        }
      } catch (error) {
        failedCount++;
        results.push({
          username: username,
          status: 'failed',
          error: error.message,
          timestamp: new Date().toISOString()
        });
        console.log(`❌ [BULK-LIST] Error enviando a ${username}: ${error.message}`);
      }

      // Delay entre mensajes para evitar rate limiting
      if (i < usernames.length - 1) {
        console.log(`⏳ [BULK-LIST] Esperando ${delay}ms antes del siguiente mensaje...`);
        await new Promise(resolve => setTimeout(resolve, parseInt(delay)));
      }
    }

    console.log(`✅ [BULK-LIST] Envío masivo completado: ${sentCount} enviados, ${failedCount} fallidos`);

    res.json({
      success: true,
      message: `Envío masivo completado: ${sentCount} mensajes enviados, ${failedCount} fallidos`,
      sent_count: sentCount,
      failed_count: failedCount,
      total_users: usernames.length,
      results
    });

  } catch (error) {
    console.error('❌ [BULK-LIST] Error en envío masivo:', error.message);
    res.json({
      success: false,
      error: error.message,
      message: 'Error interno en envío masivo desde lista',
      sent_count: 0,
      failed_count: 0,
      total_users: 0
    });
  }
});

// Endpoint para obtener seguidores de una cuenta (ANTES de middlewares de autenticación)
app.get('/api/instagram/followers', async (req, res) => {
  console.log('👥 [FOLLOWERS] Endpoint de seguidores llamado');
  const { username, limit = 100 } = req.query;

  if (!username) {
    return res.status(400).json({
      success: false,
      error: 'Parámetro "username" es requerido',
      message: 'Debe proporcionar el username de la cuenta'
    });
  }

  try {
    const { igGetFollowers } = await import('./services/instagramService.js');

    console.log(`👥 [FOLLOWERS] Obteniendo seguidores de ${username} (límite: ${limit})`);

    const result = await igGetFollowers(username, parseInt(limit));

    if (result.success) {
      const formattedFollowers = result.followers?.map((follower, index) => {
        return {
          id: `follower_${index + 1}`,
          user_id: follower.pk || follower.id,
          username: follower.username || 'sin_usuario',
          full_name: follower.full_name || follower.fullName || 'Usuario sin nombre',
          profile_pic_url: follower.profile_pic_url || follower.profilePicUrl || '/default-avatar.png',
          is_verified: follower.is_verified || follower.isVerified || false,
          is_private: follower.is_private || follower.isPrivate || false,
          follower_count: follower.follower_count || follower.followerCount || 0,
          following_count: follower.following_count || follower.followingCount || 0,
          media_count: follower.media_count || follower.mediaCount || 0,
          biography: follower.biography || follower.bio || '',
          external_url: follower.external_url || follower.externalUrl || null,
          is_business: follower.is_business || follower.isBusiness || false
        };
      }) || [];

      console.log(`✅ [FOLLOWERS] ${formattedFollowers.length} seguidores extraídos de ${username}`);
      res.json({
        success: true,
        followers: formattedFollowers,
        count: formattedFollowers.length,
        account_info: result.account_info,
        extracted_count: result.extracted_count,
        limit_requested: parseInt(limit),
        message: `Seguidores extraídos exitosamente: ${formattedFollowers.length} de ${username}`
      });
    } else {
      console.log(`❌ [FOLLOWERS] Error extrayendo seguidores de ${username}:`, result.error);
      res.json({
        success: false,
        followers: [],
        count: 0,
        account_info: result.account_info,
        error: result.error,
        message: `Error extrayendo seguidores de ${username}: ${result.error}`
      });
    }
  } catch (error) {
    console.error('❌ [FOLLOWERS] Error obteniendo seguidores:', error.message);
    res.json({
      success: false,
      followers: [],
      count: 0,
      error: error.message,
      message: 'Error interno obteniendo seguidores de Instagram'
    });
  }
});

// Endpoint para enviar mensajes masivos a seguidores CON IA (ANTES de middlewares de autenticación)
app.post('/api/instagram/bulk-send-followers', async (req, res) => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📤👥 [BULK-FOLLOWERS] Endpoint de envío masivo a seguidores llamado');
  console.log('📥 [BULK-FOLLOWERS] Body recibido:', JSON.stringify(req.body, null, 2));
  console.log('📥 [BULK-FOLLOWERS] Headers:', {
    'content-type': req.headers['content-type'],
    'authorization': req.headers['authorization'] ? 'Bearer ***' : 'no presente'
  });
  const { target_username, message, limit = 50, delay = 2000, userId, personalityId, send_as_audio = true } = req.body;

  if (!target_username || !message) {
    return res.status(400).json({
      success: false,
      error: 'target_username y message son requeridos',
      message: 'Debe proporcionar el username de la cuenta objetivo y el mensaje'
    });
  }

  try {
    // Obtener userId y personalityId del bot activo automáticamente
    let actualUserId = userId;
    let actualPersonalityId = personalityId;
    
    console.log(`🔍 [BULK-FOLLOWERS] userId del body: ${actualUserId || 'no proporcionado'}`);
    console.log(`🔍 [BULK-FOLLOWERS] personalityId del body: ${actualPersonalityId || 'no proporcionado'}`);
    
    // Importar el servicio de bot ANTES de buscar
    const { default: instagramBotService } = await import('./services/instagramBotService.js');
    
    // Si no hay userId, intentar obtenerlo del token JWT
    if (!actualUserId) {
      try {
        const authHeader = req.headers.authorization;
        console.log(`🔍 [BULK-FOLLOWERS] Buscando userId en token JWT...`);
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const { validateJwt } = await import('./config/jwt.js');
          try {
            const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
            if (decoded) {
              actualUserId = decoded.userId || decoded.sub || decoded.user?.id;
              console.log(`✅ [BULK-FOLLOWERS] userId obtenido del token: ${actualUserId}`);
            }
          } catch (jwtError) {
            console.log(`⚠️ [BULK-FOLLOWERS] Error validando JWT: ${jwtError.message}`);
          }
        }
      } catch (error) {
        console.log(`❌ [BULK-FOLLOWERS] Error obteniendo userId del token: ${error.message}`);
      }
    }
    
    // Si tenemos userId, buscar su bot activo
    if (actualUserId && !actualPersonalityId) {
      try {
        console.log(`🔍 [BULK-FOLLOWERS] Buscando bot activo para userId: ${actualUserId}`);
        const botData = instagramBotService.activeBots.get(actualUserId);
        
        if (botData && botData.isRunning && botData.personalityData) {
          actualPersonalityId = botData.personalityData.id;
          console.log(`✅ [BULK-FOLLOWERS] Usando personalidad del bot activo: "${botData.personalityData.nombre}" (ID: ${actualPersonalityId})`);
        } else {
          console.log(`⚠️ [BULK-FOLLOWERS] Bot no activo o sin personalidad para userId: ${actualUserId}`);
        }
      } catch (botError) {
        console.log(`❌ [BULK-FOLLOWERS] Error obteniendo bot: ${botError.message}`);
      }
    }
    
    // Si NO tenemos userId ni personalityId, buscar CUALQUIER bot activo
    if (!actualUserId || !actualPersonalityId) {
      try {
        console.log(`🔍 [BULK-FOLLOWERS] Buscando cualquier bot activo (sin userId específico)...`);
        console.log(`🔍 [BULK-FOLLOWERS] Total de bots activos: ${instagramBotService.activeBots.size}`);
        
        // Buscar el primer bot activo que tenga personalidad
        for (const [botUserId, botData] of instagramBotService.activeBots.entries()) {
          console.log(`🔍 [BULK-FOLLOWERS] Revisando bot de userId: ${botUserId}`);
          console.log(`   - isRunning: ${botData.isRunning}`);
          console.log(`   - tiene personalidad: ${!!botData.personalityData}`);
          
          if (botData && botData.isRunning && botData.personalityData) {
            if (!actualUserId) {
              actualUserId = botUserId;
              console.log(`✅ [BULK-FOLLOWERS] userId encontrado de bot activo: ${actualUserId}`);
            }
            if (!actualPersonalityId) {
              actualPersonalityId = botData.personalityData.id;
              console.log(`✅ [BULK-FOLLOWERS] Personalidad encontrada de bot activo: "${botData.personalityData.nombre}" (ID: ${actualPersonalityId})`);
            }
            
            if (actualUserId && actualPersonalityId) {
              console.log(`✅ [BULK-FOLLOWERS] Bot activo encontrado! userId: ${actualUserId}, personalidad: "${botData.personalityData.nombre}"`);
              break;
            }
          }
        }
      } catch (searchError) {
        console.log(`❌ [BULK-FOLLOWERS] Error buscando bots activos: ${searchError.message}`);
      }
    }
    
    console.log(`👤 [BULK-FOLLOWERS] userId final: ${actualUserId || 'NINGUNO - Se enviará sin IA'}`);
    console.log(`🎭 [BULK-FOLLOWERS] personalityId final: ${actualPersonalityId || 'NINGUNO - Se enviará sin IA'}`);

    const { igGetFollowers, igSendMessage } = await import('./services/instagramService.js');
    const { generateBotResponse } = await import('./services/openaiService.js');
    const { supabaseAdmin } = await import('./config/db.js');

    console.log(`👥 [BULK-FOLLOWERS] Obteniendo seguidores de ${target_username}...`);
    console.log(`🎭 [BULK-FOLLOWERS] Personalidad a usar: ${actualPersonalityId || 'ninguna'}`);
    console.log(`👤 [BULK-FOLLOWERS] Usuario: ${actualUserId || 'no especificado'}`);

    // Primero obtener los seguidores (usando la sesión del usuario correcto)
    const followersResult = await igGetFollowers(target_username, parseInt(limit), actualUserId);

    if (!followersResult.success || !followersResult.followers || followersResult.followers.length === 0) {
      return res.json({
        success: false,
        error: followersResult.error || 'No se pudieron obtener seguidores',
        message: `Error obteniendo seguidores de ${target_username}`,
        sent_count: 0,
        failed_count: 0,
        total_followers: 0
      });
    }

    console.log(`📤 [BULK-FOLLOWERS] Enviando mensajes a ${followersResult.followers.length} seguidores...`);
    console.log(`📝 [BULK-FOLLOWERS] MENSAJE BASE RECIBIDO: "${message}"`);
    console.log(`📝 [BULK-FOLLOWERS] Este mensaje base se usará para generar variaciones personalizadas con IA`);
    console.log(`🎤 [BULK-FOLLOWERS] send_as_audio configurado: ${send_as_audio} (tipo: ${typeof send_as_audio})`);

    // Cargar personalidad si está disponible (de bot activo o desde DB)
    let personalityData = null;
    if (actualPersonalityId && actualUserId) {
      try {
        // PRIORIDAD 1: Intentar del bot activo (ya cargado)
        const botData = instagramBotService.activeBots.get(actualUserId);
        
        if (botData && botData.personalityData && botData.personalityData.id === actualPersonalityId) {
          personalityData = botData.personalityData;
          console.log(`✅ [BULK-FOLLOWERS] Usando personalidad del bot activo: "${personalityData.nombre}"`);
        } else {
          // PRIORIDAD 2: Cargar desde DB
          console.log(`🔍 [BULK-FOLLOWERS] Cargando personalidad ${actualPersonalityId} desde DB...`);
          const { data: personalityDataFromDB } = await supabaseAdmin
            .from('personalities')
            .select('*')
            .eq('id', actualPersonalityId)
            .eq('users_id', actualUserId)
            .single();
          
          if (personalityDataFromDB) {
            personalityData = personalityDataFromDB;
            
            // Cargar instrucciones adicionales
            const { data: additionalInstructions } = await supabaseAdmin
              .from('personality_instructions')
              .select('instruccion')
              .eq('personality_id', actualPersonalityId)
              .eq('users_id', actualUserId)
              .order('created_at', { ascending: true });
            
            if (additionalInstructions && additionalInstructions.length > 0) {
              const additionalText = additionalInstructions.map(instr => instr.instruccion).join('\n');
              personalityData.instrucciones = `${personalityData.instrucciones || ''}\n\n${additionalText}`;
              console.log(`✅ [BULK-FOLLOWERS] ${additionalInstructions.length} instrucciones adicionales agregadas`);
            }
            
            console.log(`✅ [BULK-FOLLOWERS] Personalidad cargada desde DB: "${personalityData.nombre}"`);
          } else {
            console.log(`❌ [BULK-FOLLOWERS] Personalidad ${actualPersonalityId} no encontrada en DB`);
          }
        }
      } catch (personalityError) {
        console.log(`❌ [BULK-FOLLOWERS] Error cargando personalidad: ${personalityError.message}`);
        console.error(personalityError);
      }
    }
    
    if (!personalityData && actualPersonalityId && actualUserId) {
      console.log(`⚠️ [BULK-FOLLOWERS] ❌ No se pudo cargar la personalidad ${actualPersonalityId}`);
      console.log(`   Se enviará el mensaje base SIN personalización con IA`);
      console.log(`   Verifica que:`);
      console.log(`   1. El bot esté activo con una personalidad`);
      console.log(`   2. La personalidad ${actualPersonalityId} exista en la base de datos`);
      console.log(`   3. El userId ${actualUserId} tenga acceso a esa personalidad`);
    } else if (personalityData) {
      console.log(`✅ [BULK-FOLLOWERS] Personalidad cargada correctamente: "${personalityData.nombre}"`);
      console.log(`✅ [BULK-FOLLOWERS] Listo para generar mensajes con IA`);
    } else {
      console.log(`⚠️ [BULK-FOLLOWERS] ⚠️ NO SE GENERARÁN MENSAJES CON IA`);
      console.log(`   Razones:`);
      console.log(`   - Personalidad: ${personalityData ? 'Cargada' : 'NO disponible'}`);
      console.log(`   - userId: ${actualUserId || 'NO disponible'}`);
      console.log(`   → Los mensajes se enviarán tal cual sin personalización`);
    }

    let sentCount = 0;
    let failedCount = 0;
    let aiGeneratedCount = 0;
    const results = [];

    // Enviar mensajes a cada seguidor con delay
    for (let i = 0; i < followersResult.followers.length; i++) {
      const follower = followersResult.followers[i];
      
      try {
        console.log(`📤 [BULK-FOLLOWERS] Procesando ${i + 1}/${followersResult.followers.length}: ${follower.username}...`);
        
        let finalMessage = message;
        let aiGenerated = false;

        // Generar mensaje con IA si hay personalidad y mensaje base
        // IMPORTANTE: Verificar que tenemos TODO lo necesario
        console.log(`🔍 [BULK-FOLLOWERS] Verificando condiciones para IA:`);
        console.log(`   - personalidad: ${personalityData ? 'SÍ' : 'NO'}`);
        console.log(`   - userId: ${actualUserId ? 'SÍ' : 'NO'}`);
        console.log(`   - mensaje base: ${message && message.trim() ? 'SÍ' : 'NO'}`);
        
        if (personalityData && actualUserId && message && message.trim()) {
          try {
            console.log(`🧠 [BULK-FOLLOWERS] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🧠 [BULK-FOLLOWERS] Generando mensaje con IA para: ${follower.username}`);
            console.log(`🧠 [BULK-FOLLOWERS] Mensaje base a personalizar: "${message}"`);
            console.log(`🧠 [BULK-FOLLOWERS] Personalidad a usar: "${personalityData.nombre}" (ID: ${personalityData.id})`);
            
            const greetingPrompt = `Eres un experto en comunicación y ventas. Tu tarea es crear un mensaje ÚNICO y DIFERENTE para este seguidor específico, basándote en el mensaje base pero variándolo completamente.

MENSAJE BASE DEL CLIENTE (REFERENCIA):
"${message}"

IMPORTANTE: Este mensaje base es solo una REFERENCIA. Debes crear una VARIACIÓN COMPLETAMENTE DIFERENTE que comunique el mismo mensaje, pero con palabras distintas, estructura diferente y enfoque único.

PERFIL DEL SEGUIDOR:
- Usuario: @${follower.username}
- Nombre: ${follower.full_name || 'No disponible'}
- Biografía: ${follower.biography || 'No disponible'}
- Tipo: ${follower.is_business ? 'Negocio' : 'Personal'}
- Seguidores: ${follower.follower_count || 0}

PERSONALIDAD A USAR:
Debes hablar como "${personalityData.nombre}". ${personalityData.instrucciones ? `Instrucciones: ${personalityData.instrucciones.substring(0, 250)}...` : ''}

REGLAS ESTRICTAS PARA LA VARIACIÓN:
1. ✅ VARIACIÓN COMPLETA: Crea un mensaje DIFERENTE cada vez, aunque el mensaje base sea el mismo
2. ✅ NO REPETIR: No uses las mismas palabras exactas del mensaje base
3. ✅ MANTENER ESENCIA: Comunica el mismo mensaje/idea pero con palabras completamente diferentes
4. ✅ PERSONALIZADO: Adapta el tono y enfoque específicamente para ${follower.username}
5. ✅ NATURAL: Debe sonar como escrito por un humano, no robótico
6. ✅ ÚNICO: Este mensaje debe ser diferente a cualquier otro que hayas generado antes
7. ✅ LÍMITE: Máximo 400 caracteres
8. ❌ NO incluyas explicaciones, solo el mensaje final

EJEMPLOS:
Mensaje base: "Tenemos ofertas especiales"
Variación 1: "¡Hola! Te tenemos una sorpresa con promociones increíbles que no te puedes perder 😊"
Variación 2: "Oye, ¿sabías que tenemos descuentos exclusivos ahora mismo? Déjame contarte más..."
Variación 3: "¡Buenas noticias! Acabamos de lanzar una promoción especial que creo que te va a encantar"

Genera SOLO el mensaje personalizado final (sin explicaciones, sin prefijos, sin comillas).`;

            const aiResponse = await generateBotResponse({
              personality: personalityData,
              userMessage: greetingPrompt,
              userId: actualUserId,
              history: [],
              mediaType: null,
              mediaContent: null,
              context: `Generando mensaje personalizado para seguidor ${follower.username}`,
              followerInfo: {
                username: follower.username,
                full_name: follower.full_name || '',
                biography: follower.biography || '',
                follower_count: follower.follower_count || 0,
                is_business: follower.is_business || false
              }
            });

            if (aiResponse && aiResponse.trim() !== '') {
              finalMessage = aiResponse.trim();
              aiGenerated = true;
              aiGeneratedCount++;
              console.log(`✅ [BULK-FOLLOWERS] ✅ MENSAJE GENERADO CON IA:`);
              console.log(`   Base: "${message.substring(0, 60)}${message.length > 60 ? '...' : ''}"`);
              console.log(`   Generado: "${finalMessage}"`);
              console.log(`   Para: @${follower.username}`);
            } else {
              console.log(`⚠️ [BULK-FOLLOWERS] IA no generó respuesta para ${follower.username}, usando mensaje base`);
              console.log(`   Mensaje base: "${message}"`);
            }
          } catch (aiError) {
            console.log(`❌ [BULK-FOLLOWERS] Error generando IA para ${follower.username}: ${aiError.message}`);
            console.log(`   Usando mensaje base sin personalización`);
          }
        } else {
          if (!personalityData) {
            console.log(`⚠️ [BULK-FOLLOWERS] ⚠️ NO SE GENERARÁ CON IA - Razones:`);
            console.log(`   - Personalidad disponible: ${personalityData ? 'SÍ' : 'NO'}`);
            console.log(`   - userId disponible: ${actualUserId ? 'SÍ' : 'NO'}`);
            console.log(`   - Mensaje base disponible: ${message && message.trim() ? 'SÍ' : 'NO'}`);
            console.log(`   → Se enviará el mensaje base tal cual: "${message}"`);
          } else if (!actualUserId) {
            console.log(`⚠️ [BULK-FOLLOWERS] No hay userId, no se puede generar con IA`);
            console.log(`   → Se enviará el mensaje base: "${message}"`);
          } else if (!message || !message.trim()) {
            console.log(`⚠️ [BULK-FOLLOWERS] No hay mensaje base, no se puede personalizar`);
          }
        }
        
        // Enviar mensaje usando la sesión del usuario correcto
        let sendResult;
        
        if (send_as_audio) {
          // Enviar como audio usando ElevenLabs
          try {
            console.log(`🎤 [BULK-FOLLOWERS] Generando audio para @${follower.username}...`);
            const { getOrCreateIGSession } = await import('./services/instagramService.js');
            
            // Obtener userId - usar el del token si no está en body
            let userIdToUse = actualUserId;
            if (!userIdToUse) {
              // Intentar obtener del token
              try {
                const authHeader = req.headers.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                  const { validateJwt } = await import('./config/jwt.js');
                  const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
                  if (decoded) {
                    userIdToUse = decoded.userId || decoded.sub || decoded.user?.id;
                    console.log(`✅ [BULK-FOLLOWERS] userId obtenido del token para audio: ${userIdToUse}`);
                  }
                }
              } catch (tokenError) {
                console.log(`⚠️ [BULK-FOLLOWERS] No se pudo obtener userId del token: ${tokenError.message}`);
              }
            }
            
            // Obtener sesión (con userId o sin él, usará la primera disponible)
            const session = userIdToUse ? await getOrCreateIGSession(userIdToUse) : await getOrCreateIGSession(actualUserId);
            
            // Generar audio desde el texto
            console.log(`🎵 [BULK-FOLLOWERS] Generando audio con ElevenLabs: "${finalMessage.substring(0, 50)}..."`);
            const audioResult = await session.generateAudioWithElevenLabs(finalMessage);
            
            if (audioResult.success && audioResult.audioBuffer) {
              console.log(`✅ [BULK-FOLLOWERS] Audio generado: ${(audioResult.audioBuffer.length / 1024).toFixed(2)} KB`);
              
              // Enviar audio
              const audioSendResult = await session.sendAudio({
                username: follower.username,
                audioBuffer: audioResult.audioBuffer
              });
              
              sendResult = audioSendResult;
              console.log(`🎤 [BULK-FOLLOWERS] ✅ Audio enviado exitosamente a @${follower.username}`);
            } else {
              throw new Error('No se pudo generar el audio');
            }
          } catch (audioError) {
            console.log(`❌ [BULK-FOLLOWERS] Error enviando audio a @${follower.username}: ${audioError.message}`);
            console.log(`   Stack: ${audioError.stack}`);
            console.log(`   Fallback: enviando como texto`);
            
            // Fallback a texto si falla el audio
            sendResult = await igSendMessage(follower.username, finalMessage, actualUserId);
          }
        } else {
          // Enviar como texto normal
          sendResult = await igSendMessage(follower.username, finalMessage, actualUserId);
        }
        
        if (sendResult.success) {
          sentCount++;
          results.push({
            username: follower.username,
            full_name: follower.full_name,
            status: 'sent',
            ai_generated: aiGenerated,
            sent_as_audio: send_as_audio,
            message_preview: finalMessage.substring(0, 60) + '...',
            timestamp: new Date().toISOString()
          });
          console.log(`✅ [BULK-FOLLOWERS] Mensaje ${aiGenerated ? '(IA)' : '(base)'} ${send_as_audio ? '(AUDIO)' : '(texto)'} enviado a ${follower.username}`);
          
          // IMPORTANTE: Marcar que ya se envió mensaje inicial a este usuario
          // Esto previene que el bot auto-responda este mensaje que acabamos de enviar
          try {
            const { default: instagramBotService } = await import('./services/instagramBotService.js');
            const { getOrCreateIGSession } = await import('./services/instagramService.js');
            
            if (actualUserId) {
              const botData = instagramBotService.activeBots.get(actualUserId);
              const igService = await getOrCreateIGSession(actualUserId);
              
              if (botData) {
                // Guardar historial de conversación con el mensaje inicial
                if (!botData.conversationHistory) {
                  botData.conversationHistory = new Map();
                }
                let history = botData.conversationHistory.get(follower.username) || [];
                history.push({
                  role: 'assistant',
                  content: finalMessage,
                  timestamp: Date.now(),
                  isInitialMessage: true
                });
                botData.conversationHistory.set(follower.username, history.slice(-50));
                console.log(`💾 [BULK-FOLLOWERS] Historial guardado para ${follower.username}`);
              }
              
              if (igService) {
                // Guardar también en la sesión de Instagram
                if (!igService.conversationHistory) {
                  igService.conversationHistory = new Map();
                }
                let history = igService.conversationHistory.get(follower.username) || [];
                history.push({
                  role: 'assistant',
                  content: finalMessage,
                  timestamp: Date.now(),
                  isInitialMessage: true
                });
                igService.conversationHistory.set(follower.username, history.slice(-50));
                console.log(`💾 [BULK-FOLLOWERS] Historial guardado en sesión para ${follower.username}`);
              }
            }
          } catch (histError) {
            console.log(`⚠️ [BULK-FOLLOWERS] Error guardando historial para ${follower.username}: ${histError.message}`);
          }
        } else {
          failedCount++;
          results.push({
            username: follower.username,
            full_name: follower.full_name,
            status: 'failed',
            error: sendResult.error,
            timestamp: new Date().toISOString()
          });
          console.log(`❌ [BULK-FOLLOWERS] Error enviando a ${follower.username}: ${sendResult.error}`);
          
          // Si el error indica que no hay sesión activa, detener el proceso
          if (sendResult.error && sendResult.error.includes('No hay sesión activa')) {
            console.error(`🚨 [BULK-FOLLOWERS] SESIÓN EXPIRADA DURANTE ENVÍO MASIVO. Deteniendo proceso...`);
            console.log(`📊 [BULK-FOLLOWERS] Resumen hasta ahora: ${sentCount} enviados, ${failedCount} fallidos`);
            break; // Salir del loop
          }
        }
      } catch (error) {
        failedCount++;
        results.push({
          username: follower.username,
          full_name: follower.full_name,
          status: 'failed',
          error: error.message,
          timestamp: new Date().toISOString()
        });
        console.log(`❌ [BULK-FOLLOWERS] Error enviando a ${follower.username}: ${error.message}`);
        
        // Si el error indica que no hay sesión activa, detener el proceso
        if (error.message && error.message.includes('No hay sesión activa')) {
          console.error(`🚨 [BULK-FOLLOWERS] SESIÓN EXPIRADA DURANTE ENVÍO MASIVO. Deteniendo proceso...`);
          console.log(`📊 [BULK-FOLLOWERS] Resumen hasta ahora: ${sentCount} enviados, ${failedCount} fallidos`);
          break; // Salir del loop
        }
      }

      // Delay entre mensajes para evitar rate limiting
      if (i < followersResult.followers.length - 1) {
        console.log(`⏳ [BULK-FOLLOWERS] Esperando ${delay}ms antes del siguiente mensaje...`);
        await new Promise(resolve => setTimeout(resolve, parseInt(delay)));
      }
    }

    console.log(`✅ [BULK-FOLLOWERS] Envío masivo completado: ${sentCount} enviados (${aiGeneratedCount} con IA), ${failedCount} fallidos`);
    console.log(`🎤 [BULK-FOLLOWERS] Modo de envío: ${send_as_audio ? 'AUDIO' : 'TEXTO'}`);

    res.json({
      success: true,
      message: `Envío masivo completado: ${sentCount} mensajes enviados (${aiGeneratedCount} generados con IA), ${failedCount} fallidos`,
      target_username,
      sent_count: sentCount,
      ai_generated_count: aiGeneratedCount,
      failed_count: failedCount,
      total_followers: followersResult.followers.length,
      personality_used: actualPersonalityId || null,
      personality_name: personalityData?.nombre || null,
      send_as_audio: send_as_audio,
      results,
      account_info: followersResult.account_info
    });

  } catch (error) {
    console.error('❌ [BULK-FOLLOWERS] Error en envío masivo:', error.message);
    res.json({
      success: false,
      error: error.message,
      message: 'Error interno en envío masivo a seguidores',
      sent_count: 0,
      failed_count: 0,
      total_followers: 0
    });
  }
});

// ═══════════════════════════════════════════════════════════
// NUEVOS ENDPOINTS: Envío masivo a likers y commenters
// ═══════════════════════════════════════════════════════════

// Endpoint para enviar mensajes masivos a usuarios que dieron LIKE
app.post('/api/instagram/bulk-send-likers', async (req, res) => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📤❤️ [BULK-LIKERS] Endpoint de envío masivo a likers llamado');
  
  const { postUrl, message, limit = 50, delay = 2000, userId, personalityId } = req.body;

  if (!postUrl || !message) {
    return res.status(400).json({
      success: false,
      error: 'postUrl y message son requeridos'
    });
  }

  try {
    let actualUserId = userId;
    let actualPersonalityId = personalityId;
    
    const { default: instagramBotService } = await import('./services/instagramBotService.js');
    
    // Obtener userId del token si no se proporciona
    if (!actualUserId) {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const { validateJwt } = await import('./config/jwt.js');
          const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
          if (decoded) {
            actualUserId = decoded.userId || decoded.sub || decoded.user?.id;
          }
        }
      } catch (error) {
        console.log(`⚠️ [BULK-LIKERS] Error obteniendo userId: ${error.message}`);
      }
    }
    
    // Buscar bot activo
    if (actualUserId && !actualPersonalityId) {
      const botData = instagramBotService.activeBots.get(actualUserId);
      if (botData?.isRunning && botData.personalityData) {
        actualPersonalityId = botData.personalityData.id;
      }
    }
    
    // Buscar cualquier bot activo si no hay userId
    if (!actualUserId || !actualPersonalityId) {
      for (const [botUserId, botData] of instagramBotService.activeBots.entries()) {
        if (botData?.isRunning && botData.personalityData) {
          if (!actualUserId) actualUserId = botUserId;
          if (!actualPersonalityId) actualPersonalityId = botData.personalityData.id;
          if (actualUserId && actualPersonalityId) break;
        }
      }
    }

    const { getOrCreateIGSession, igSendMessage } = await import('./services/instagramService.js');
    const { generateBotResponse } = await import('./services/openaiService.js');
    const { supabaseAdmin } = await import('./config/db.js');

    const igService = await getOrCreateIGSession(actualUserId);
    const likesResult = await igService.getLikesFromPost(postUrl, parseInt(limit));

    if (!likesResult.success || !likesResult.likes?.length) {
      return res.json({
        success: false,
        error: likesResult.error || 'No se pudieron obtener likes',
        sent_count: 0,
        failed_count: 0
      });
    }

    // Cargar personalidad
    let personalityData = null;
    if (actualPersonalityId && actualUserId) {
      const botData = instagramBotService.activeBots.get(actualUserId);
      if (botData?.personalityData?.id === actualPersonalityId) {
        personalityData = botData.personalityData;
      } else {
        const { data } = await supabaseAdmin
          .from('personalities')
          .select('*')
          .eq('id', actualPersonalityId)
          .eq('users_id', actualUserId)
          .single();
        personalityData = data;
      }
    }

    let sentCount = 0, failedCount = 0, aiGeneratedCount = 0;
    const results = [];

    for (let i = 0; i < likesResult.likes.length; i++) {
      const liker = likesResult.likes[i];
      console.log(`📨 [${i + 1}/${likesResult.likes.length}] @${liker.username}`);

      try {
        let finalMessage = message;
        let aiGenerated = false;

        if (personalityData && actualUserId && message && message.trim()) {
          try {
            console.log(`🧠 [BULK-LIKERS] Generando mensaje con IA para: ${liker.username}`);
            
            const greetingPrompt = `Eres un experto en comunicación y ventas. Tu tarea es crear un mensaje ÚNICO y DIFERENTE para este usuario que dio like, basándote en el mensaje base pero variándolo completamente.

MENSAJE BASE DEL CLIENTE (REFERENCIA):
"${message}"

IMPORTANTE: Este mensaje base es solo una REFERENCIA. Debes crear una VARIACIÓN COMPLETAMENTE DIFERENTE que comunique el mismo mensaje, pero con palabras distintas, estructura diferente y enfoque único.

CONTEXTO DEL USUARIO:
- Usuario: @${liker.username}
- Nombre: ${liker.full_name || 'No disponible'}
- Acción: Dio like al post de @${likesResult.post_info.owner.username}
- Post: ${likesResult.post_info.like_count} likes, ${likesResult.post_info.comment_count} comentarios

PERSONALIDAD A USAR:
Debes hablar como "${personalityData.nombre}". ${personalityData.instrucciones ? `Instrucciones: ${personalityData.instrucciones.substring(0, 250)}...` : ''}

REGLAS ESTRICTAS PARA LA VARIACIÓN:
1. ✅ VARIACIÓN COMPLETA: Crea un mensaje DIFERENTE cada vez
2. ✅ NO REPETIR: No uses las mismas palabras exactas del mensaje base
3. ✅ MANTENER ESENCIA: Comunica el mismo mensaje/idea pero con palabras diferentes
4. ✅ PERSONALIZADO: Menciona que viste que le gustó el contenido
5. ✅ NATURAL: Debe sonar como escrito por un humano
6. ✅ ÚNICO: Este mensaje debe ser diferente a cualquier otro
7. ✅ LÍMITE: Máximo 400 caracteres
8. ❌ NO incluyas explicaciones, solo el mensaje final

Genera SOLO el mensaje personalizado final (sin explicaciones, sin prefijos, sin comillas).`;

            const aiResponse = await generateBotResponse({
              personality: personalityData,
              userMessage: greetingPrompt,
              userId: actualUserId,
              history: [],
              mediaType: null,
              mediaContent: null,
              context: `Generando mensaje para liker ${liker.username}`
            });

            if (aiResponse?.trim()) {
              finalMessage = aiResponse.trim();
              aiGenerated = true;
              aiGeneratedCount++;
              console.log(`✅ [BULK-LIKERS] Mensaje generado: "${finalMessage.substring(0, 60)}..."`);
            }
          } catch (aiError) {
            console.log(`⚠️ Error IA: ${aiError.message}`);
          }
        }

        const sendResult = await igSendMessage(liker.username, finalMessage, actualUserId);
        
        if (sendResult.success) {
          sentCount++;
          results.push({ username: liker.username, status: 'sent', ai_generated: aiGenerated });
          
          // Guardar en historial
          if (!igService.conversationHistory) igService.conversationHistory = new Map();
          let history = igService.conversationHistory.get(liker.username) || [];
          history.push({ role: 'assistant', content: finalMessage, timestamp: Date.now() });
          igService.conversationHistory.set(liker.username, history.slice(-50));
        } else {
          failedCount++;
          results.push({ username: liker.username, status: 'failed', error: sendResult.error });
          if (sendResult.error?.includes('No hay sesión activa')) break;
        }
      } catch (error) {
        failedCount++;
        results.push({ username: liker.username, status: 'failed', error: error.message });
        if (error.message?.includes('No hay sesión activa')) break;
      }

      if (i < likesResult.likes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, parseInt(delay)));
      }
    }

    res.json({
      success: true,
      message: `${sentCount} enviados (${aiGeneratedCount} con IA), ${failedCount} fallidos`,
      sent_count: sentCount,
      ai_generated_count: aiGeneratedCount,
      failed_count: failedCount,
      results
    });

  } catch (error) {
    console.error('❌ [BULK-LIKERS] Error:', error.message);
    res.json({ success: false, error: error.message, sent_count: 0, failed_count: 0 });
  }
});

// Endpoint para enviar mensajes masivos a usuarios que COMENTARON
app.post('/api/instagram/bulk-send-commenters', async (req, res) => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📤💬 [BULK-COMMENTERS] Endpoint de envío masivo a commenters llamado');
  
  const { postUrl, message, limit = 50, delay = 2000, userId, personalityId } = req.body;

  if (!postUrl || !message) {
    return res.status(400).json({
      success: false,
      error: 'postUrl y message son requeridos'
    });
  }

  try {
    let actualUserId = userId;
    let actualPersonalityId = personalityId;
    
    const { default: instagramBotService } = await import('./services/instagramBotService.js');
    
    // Obtener userId del token si no se proporciona
    if (!actualUserId) {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const { validateJwt } = await import('./config/jwt.js');
          const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
          if (decoded) {
            actualUserId = decoded.userId || decoded.sub || decoded.user?.id;
          }
        }
      } catch (error) {
        console.log(`⚠️ [BULK-COMMENTERS] Error obteniendo userId: ${error.message}`);
      }
    }
    
    // Buscar bot activo
    if (actualUserId && !actualPersonalityId) {
      const botData = instagramBotService.activeBots.get(actualUserId);
      if (botData?.isRunning && botData.personalityData) {
        actualPersonalityId = botData.personalityData.id;
      }
    }
    
    // Buscar cualquier bot activo si no hay userId
    if (!actualUserId || !actualPersonalityId) {
      for (const [botUserId, botData] of instagramBotService.activeBots.entries()) {
        if (botData?.isRunning && botData.personalityData) {
          if (!actualUserId) actualUserId = botUserId;
          if (!actualPersonalityId) actualPersonalityId = botData.personalityData.id;
          if (actualUserId && actualPersonalityId) break;
        }
      }
    }

    const { getOrCreateIGSession, igSendMessage } = await import('./services/instagramService.js');
    const { generateBotResponse } = await import('./services/openaiService.js');
    const { supabaseAdmin } = await import('./config/db.js');

    const igService = await getOrCreateIGSession(actualUserId);
    const commentsResult = await igService.getCommentsFromPost(postUrl, parseInt(limit));

    if (!commentsResult.success || !commentsResult.comments?.length) {
      return res.json({
        success: false,
        error: commentsResult.error || 'No se pudieron obtener comentarios',
        sent_count: 0,
        failed_count: 0
      });
    }

    // Cargar personalidad
    let personalityData = null;
    if (actualPersonalityId && actualUserId) {
      const botData = instagramBotService.activeBots.get(actualUserId);
      if (botData?.personalityData?.id === actualPersonalityId) {
        personalityData = botData.personalityData;
      } else {
        const { data } = await supabaseAdmin
          .from('personalities')
          .select('*')
          .eq('id', actualPersonalityId)
          .eq('users_id', actualUserId)
          .single();
        personalityData = data;
      }
    }

    let sentCount = 0, failedCount = 0, aiGeneratedCount = 0;
    const results = [];

    for (let i = 0; i < commentsResult.comments.length; i++) {
      const commenter = commentsResult.comments[i];
      console.log(`📨 [${i + 1}/${commentsResult.comments.length}] @${commenter.username}`);

      try {
        let finalMessage = message;
        let aiGenerated = false;

        if (personalityData && actualUserId && message && message.trim()) {
          try {
            console.log(`🧠 [BULK-COMMENTERS] Generando mensaje con IA para: ${commenter.username}`);
            
            const greetingPrompt = `Eres un experto en comunicación y ventas. Tu tarea es crear un mensaje ÚNICO y DIFERENTE para este usuario que comentó, basándote en el mensaje base pero variándolo completamente.

MENSAJE BASE DEL CLIENTE (REFERENCIA):
"${message}"

IMPORTANTE: Este mensaje base es solo una REFERENCIA. Debes crear una VARIACIÓN COMPLETAMENTE DIFERENTE que comunique el mismo mensaje, pero con palabras distintas, estructura diferente y enfoque único.

CONTEXTO DEL USUARIO:
- Usuario: @${commenter.username}
- Nombre: ${commenter.full_name || 'No disponible'}
- Su comentario: "${commenter.comment_text}"
- Likes en su comentario: ${commenter.like_count}
- Post de: @${commentsResult.post_info.owner.username}

PERSONALIDAD A USAR:
Debes hablar como "${personalityData.nombre}". ${personalityData.instrucciones ? `Instrucciones: ${personalityData.instrucciones.substring(0, 250)}...` : ''}

REGLAS ESTRICTAS PARA LA VARIACIÓN:
1. ✅ VARIACIÓN COMPLETA: Crea un mensaje DIFERENTE cada vez
2. ✅ NO REPETIR: No uses las mismas palabras exactas del mensaje base
3. ✅ MANTENER ESENCIA: Comunica el mismo mensaje/idea pero con palabras diferentes
4. ✅ PERSONALIZADO: Haz referencia natural a su comentario "${commenter.comment_text}"
5. ✅ NATURAL: Debe sonar como escrito por un humano
6. ✅ ÚNICO: Este mensaje debe ser diferente a cualquier otro
7. ✅ LÍMITE: Máximo 400 caracteres
8. ❌ NO incluyas explicaciones, solo el mensaje final

Genera SOLO el mensaje personalizado final (sin explicaciones, sin prefijos, sin comillas).`;

            const aiResponse = await generateBotResponse({
              personality: personalityData,
              userMessage: greetingPrompt,
              userId: actualUserId,
              history: [],
              mediaType: null,
              mediaContent: null,
              context: `Generando mensaje para commenter ${commenter.username}`
            });

            if (aiResponse?.trim()) {
              finalMessage = aiResponse.trim();
              aiGenerated = true;
              aiGeneratedCount++;
              console.log(`✅ [BULK-COMMENTERS] Mensaje generado: "${finalMessage.substring(0, 60)}..."`);
            }
          } catch (aiError) {
            console.log(`⚠️ Error IA: ${aiError.message}`);
          }
        }

        const sendResult = await igSendMessage(commenter.username, finalMessage, actualUserId);
        
        if (sendResult.success) {
          sentCount++;
          results.push({ username: commenter.username, status: 'sent', ai_generated: aiGenerated });
          
          // Guardar en historial
          if (!igService.conversationHistory) igService.conversationHistory = new Map();
          let history = igService.conversationHistory.get(commenter.username) || [];
          history.push({ role: 'assistant', content: finalMessage, timestamp: Date.now() });
          igService.conversationHistory.set(commenter.username, history.slice(-50));
        } else {
          failedCount++;
          results.push({ username: commenter.username, status: 'failed', error: sendResult.error });
          if (sendResult.error?.includes('No hay sesión activa')) break;
        }
      } catch (error) {
        failedCount++;
        results.push({ username: commenter.username, status: 'failed', error: error.message });
        if (error.message?.includes('No hay sesión activa')) break;
      }

      if (i < commentsResult.comments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, parseInt(delay)));
      }
    }

    res.json({
      success: true,
      message: `${sentCount} enviados (${aiGeneratedCount} con IA), ${failedCount} fallidos`,
      sent_count: sentCount,
      ai_generated_count: aiGeneratedCount,
      failed_count: failedCount,
      results
    });

  } catch (error) {
    console.error('❌ [BULK-COMMENTERS] Error:', error.message);
    res.json({ success: false, error: error.message, sent_count: 0, failed_count: 0 });
  }
});

// ⭐ MIDDLEWARE DE DEBUG - Capturar TODAS las peticiones a /api/instagram/login ANTES del endpoint
app.use((req, res, next) => {
  if (req.path === '/api/instagram/login' && req.method === 'POST') {
    console.log('');
    console.log('🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯');
    console.log('🚨🚨🚨 MIDDLEWARE INTERCEPTOR: Petición POST a /api/instagram/login detectada 🚨🚨🚨');
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log(`   IP: ${req.ip || req.connection?.remoteAddress || 'unknown'}`);
    console.log(`   URL completa: ${req.originalUrl || req.url}`);
    console.log(`   Body parseado: ${JSON.stringify(req.body) ? 'SÍ' : 'NO'}`);
    console.log(`   Headers auth: ${req.headers.authorization ? 'PRESENTE' : 'NO'}`);
    console.log('🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯');
    console.log('');
  }
  next();
});

// Endpoint de login real de Instagram (ANTES de middlewares de autenticación)
app.post('/api/instagram/login', async (req, res) => {
  // ⭐ LOG INMEDIATO - Capturar TODO desde el principio
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔐 [LOGIN] ⚡ ENDPOINT DE LOGIN DE INSTAGRAM LLAMADO ⚡');
  console.log(`📅 Hora: ${new Date().toISOString()}`);
  console.log(`🌐 IP: ${req.ip || req.connection?.remoteAddress || 'unknown'}`);
  console.log(`📝 Method: ${req.method}`);
  console.log(`🛣️  Path: ${req.path || req.url}`);
  console.log(`📦 Headers recibidos:`, {
    'content-type': req.headers['content-type'],
    'authorization': req.headers['authorization'] ? 'PRESENTE' : 'NO PRESENTE',
    'user-agent': req.headers['user-agent']?.substring(0, 80) || 'NO',
    'origin': req.headers['origin'] || 'NO',
    'referer': req.headers['referer'] || 'NO'
  });
  console.log(`📨 Body recibido:`, {
    username: req.body?.username ? 'PRESENTE' : 'NO PRESENTE',
    password: req.body?.password ? 'PRESENTE (***)' : 'NO PRESENTE',
    userId: req.body?.userId || 'NO EN BODY'
  });
  console.log('═══════════════════════════════════════════════════════════════');
  
  const { username, password } = req.body;
  
  // Validar credenciales
  if (!username || !password) {
    console.log(`❌ [LOGIN] Credenciales faltantes - username: ${!!username}, password: ${!!password}`);
    return res.status(400).json({
      success: false,
      error: 'Username y password son requeridos'
    });
  }
  
  try {
    // Obtener userId del token o del body
    let userId = req.body.userId;
    console.log(`🔍 [LOGIN] userId inicial del body: ${userId || 'NO PRESENTE'}`);
    
    // Si no viene en el body, intentar obtener del token JWT
    if (!userId) {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          // Intentar decodificar el token para obtener userId
          const { validateJwt } = await import('./config/jwt.js');
          try {
            const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
            if (decoded && decoded.userId) {
              userId = decoded.userId;
            } else if (decoded && decoded.sub) {
              userId = decoded.sub;
            } else if (decoded && decoded.user?.id) {
              userId = decoded.user.id;
            }
          } catch (jwtError) {
            console.log('⚠️ [LOGIN] No se pudo validar JWT, usando userId del body si está disponible');
          }
        }
      } catch (error) {
        console.log('⚠️ [LOGIN] Error obteniendo userId del token:', error.message);
      }
    }
    
    // Si aún no hay userId, usar un fallback (no ideal pero necesario para compatibilidad)
    if (!userId) {
      // Intentar obtener de req.user si está disponible (después del middleware)
      userId = req.user?.userId || req.user?.id || req.user?.sub;
    }
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId es requerido. Por favor proporciona el userId en el body o usa un token de autenticación válido.'
      });
    }
    
    console.log(`🔍 [LOGIN] Validando credenciales para usuario: ${username} (userId: ${userId})`);
    
    // Importar el servicio de Instagram
    console.log(`📦 [LOGIN] Importando servicio de Instagram...`);
    const { getOrCreateIGSession } = await import('./services/instagramService.js');
    console.log(`✅ [LOGIN] Servicio de Instagram importado correctamente`);
    
    console.log('🔄 [LOGIN] Iniciando sesión real en Instagram...');
    
    // ⭐ Extraer información REAL del dispositivo del cliente en tiempo real
    function getRealClientIP(req) {
      // Prioridad de headers para obtener la IP real (más confiables primero)
      let ip = null;
      let source = null;
      
      // 1. Cloudflare (más confiable - no se puede falsificar)
      if (req.headers['cf-connecting-ip']) {
        ip = req.headers['cf-connecting-ip'];
        source = 'Cloudflare (cf-connecting-ip)';
      }
      // 2. Cloudflare Enterprise
      else if (req.headers['true-client-ip']) {
        ip = req.headers['true-client-ip'];
        source = 'Cloudflare Enterprise (true-client-ip)';
      }
      // 3. Nginx (confiable si está configurado correctamente)
      else if (req.headers['x-real-ip']) {
        ip = req.headers['x-real-ip'];
        source = 'Nginx (x-real-ip)';
      }
      // 4. X-Forwarded-For (puede tener múltiples IPs, tomar la primera)
      else if (req.headers['x-forwarded-for']) {
        const forwardedFor = req.headers['x-forwarded-for'];
        // Tomar la primera IP de la cadena (cliente real)
        ip = forwardedFor.split(',')[0].trim();
        source = 'Proxy Chain (x-forwarded-for - primera IP)';
      }
      // 5. Apache
      else if (req.headers['x-client-ip']) {
        ip = req.headers['x-client-ip'];
        source = 'Apache (x-client-ip)';
      }
      // 6. Forwarded header (RFC 7239)
      else if (req.headers['forwarded']) {
        const forwarded = req.headers['forwarded'];
        const forMatch = forwarded.match(/for=([^;,\s]+)/i);
        if (forMatch) {
          ip = forMatch[1].replace(/[\[\]"]/g, ''); // Limpiar brackets y comillas
          source = 'RFC 7239 (forwarded header)';
        }
      }
      // 7. Conexión directa (sin proxy)
      else if (req.connection?.remoteAddress) {
        ip = req.connection.remoteAddress;
        source = 'Conexión directa (connection.remoteAddress)';
      }
      // 8. Socket
      else if (req.socket?.remoteAddress) {
        ip = req.socket.remoteAddress;
        source = 'Socket (socket.remoteAddress)';
      }
      // 9. Express (después de trust proxy)
      else if (req.ip) {
        ip = req.ip;
        source = 'Express (req.ip)';
      }
      // 10. Fallback
      else {
        ip = 'unknown';
        source = 'No detectado';
      }
      
      // Limpiar IPv6 localhost
      if (ip === '::1' || ip === '::ffff:127.0.0.1') {
        ip = '127.0.0.1';
        source += ' (convertido de IPv6 localhost)';
      }
      
      // Remover prefijo IPv6 si existe
      ip = ip.replace('::ffff:', '');
      
      // Log para debugging
      if (ip !== '127.0.0.1' && ip !== 'unknown') {
        console.log(`📍 [IP DETECTION] IP real detectada: ${ip} (fuente: ${source})`);
      } else if (ip === 'unknown') {
        console.warn(`⚠️ [IP DETECTION] No se pudo detectar IP real del cliente`);
        console.warn(`   Headers disponibles:`, {
          'cf-connecting-ip': req.headers['cf-connecting-ip'],
          'x-real-ip': req.headers['x-real-ip'],
          'x-forwarded-for': req.headers['x-forwarded-for'],
          'x-client-ip': req.headers['x-client-ip'],
          'req.ip': req.ip
        });
      }
      
      return ip;
    }
    
    const clientIP = getRealClientIP(req);
    const userAgent = req.headers['user-agent'] || req.headers['User-Agent'] || '';
    const timezoneOffset = req.headers['x-timezone-offset'] || null;
    const timezone = req.headers['x-timezone'] || null;
    const country = req.headers['cf-ipcountry'] || req.headers['x-country'] || null;
    const city = req.headers['cf-ipcity'] || req.headers['x-city'] || null;
    
    // Debug: Verificar headers recibidos
    console.log(`🔍 [DEBUG] Headers recibidos:`);
    console.log(`   User-Agent: ${userAgent ? userAgent.substring(0, 100) : 'NO ENCONTRADO'}`);
    console.log(`   Accept-Language: ${req.headers['accept-language'] || 'NO ENCONTRADO'}`);
    console.log(`   IP detectada: ${clientIP}`);
    
    const deviceHeaders = {
      'user-agent': userAgent,
      'accept-language': req.headers['accept-language'] || 'es-ES,es;q=0.9',
      'accept-encoding': req.headers['accept-encoding'] || 'gzip, deflate, br',
      'sec-ch-ua': req.headers['sec-ch-ua'] || '',
      'sec-ch-ua-platform': req.headers['sec-ch-ua-platform'] || '',
      'sec-ch-ua-mobile': req.headers['sec-ch-ua-mobile'] || '',
      'timezone-offset': timezoneOffset,
      'timezone': timezone,
      'country': country,
      'city': city,
      'timestamp': Date.now().toString()
    };
    
    console.log(`🌍 Login REAL - IP: ${clientIP}${country ? `, País: ${country}` : ''}, Device: ${userAgent ? userAgent.substring(0, 80) : 'NO DETECTADO'}...`);
    console.log(`📱 DeviceHeaders configurado: ${deviceHeaders['user-agent'] ? 'SÍ' : 'NO'}`);
    
    // Crear sesión de Instagram con el userId del usuario
    const session = await getOrCreateIGSession(userId);
    
    // Hacer login real en Instagram con dispositivo, hora y ubicación REALES
    const loginResult = await session.login({ 
      username, 
      password, 
      clientIP, 
      deviceHeaders 
    });
    
    // ⭐ VERIFICAR SI REQUIERE 2FA PRIMERO
    if (loginResult.twoFA_required === true || loginResult.status === '2FA_REQUIRED') {
      console.log(`🔐 [LOGIN] 2FA requerido para ${username}`);
      return res.status(200).json({
        success: false,
        status: '2FA_REQUIRED',
        twoFA_required: true,
        message: loginResult.message || 'Instagram requiere código de verificación. Puedes usar el código de tu app authenticator, SMS o email.',
        username: loginResult.username || username,
        via: loginResult.via || 'sms',
        availableMethods: loginResult.availableMethods || ['sms', 'email', 'app'],
        verification_method: loginResult.verification_method || '1'
      });
    }
    
    // Verificar si requiere recuperación de cuenta
    if (loginResult.recovery_required === true) {
      console.log(`📧 [LOGIN] Recuperación de cuenta requerida para ${username}`);
      return res.status(200).json({
        success: false,
        challenge: false,
        recovery_required: true,
        message: loginResult.message || 'Instagram requiere recuperación de cuenta',
        error: loginResult.error || 'Recuperación de cuenta requerida',
        username: username
      });
    }
    
    // Verificar si el login fue bloqueado como sospechoso
    if (loginResult.suspicious_login_blocked === true) {
      console.log(`🚨 [LOGIN] Login bloqueado como sospechoso para ${username}`);
      return res.status(200).json({
        success: false,
        challenge: false,
        suspicious_login_blocked: true,
        message: loginResult.message || 'Instagram bloqueó el login como sospechoso',
        error: loginResult.error || 'Login bloqueado como sospechoso',
        username: username
      });
    }
    
    // Verificar si hay un challenge
    if (loginResult.challenge === true) {
      console.log(`⚠️ [LOGIN] Challenge detectado para ${username}: ${loginResult.message}`);
      return res.status(200).json({
        success: false,
        challenge: true,
        needs_code: loginResult.needs_code || false,
        message: loginResult.message,
        needsUserAction: loginResult.needsUserAction || true,
        needsManualRetry: loginResult.needsManualRetry !== undefined ? loginResult.needsManualRetry : !loginResult.needs_code,
        autoRetry: loginResult.autoRetry || false,
        autoRetryIn: loginResult.autoRetryIn || null,
        is_new_account: loginResult.is_new_account || false,
        retryInstructions: loginResult.retryInstructions || 'Verifica en Instagram y reintenta el login.',
        challengeId: loginResult.challengeId || null,
        username: username
      });
    }
    
    if (loginResult.success) {
      console.log(`✅ [LOGIN] Login real exitoso en Instagram para: ${username} (userId: ${userId})`);
      
      // IMPORTANTE: NO auto-activar bot después de login
      // El bot SOLO se activará cuando:
      // 1. El usuario seleccione una personalidad desde el frontend
      // 2. El usuario active la IA Global desde el frontend
      // Esto asegura que el bot use la personalidad seleccionada por el usuario
      console.log(`ℹ️ [LOGIN] Login exitoso. El bot NO se activa automáticamente.`);
      console.log(`   📋 Para activar el bot:`);
      console.log(`   1. Selecciona una personalidad desde el frontend`);
      console.log(`   2. Activa la IA Global desde el frontend`);
      console.log(`   3. El bot comenzará a funcionar con la personalidad seleccionada`);
      
      res.json({ 
        success: true, 
        message: 'Login real exitoso en Instagram', 
        restored: loginResult.restored || false, 
        username: username, 
        connected: true,
        userId: userId
      });
    } else {
      console.log(`❌ Login fallido para usuario: ${username} - ${loginResult.error || loginResult.message || 'Error desconocido'}`);
      res.status(200).json({ 
        success: false, 
        error: loginResult.error || loginResult.message || 'Error en login de Instagram',
        username: username
      });
    }
  } catch (error) {
    console.error(`❌ [LOGIN] Error en login de Instagram: ${error.message}`);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno en login de Instagram: ' + error.message 
    });
  }
});

// Endpoint para completar login con código 2FA
app.post('/api/instagram/2fa', async (req, res) => {
  console.log('🔐 [2FA] Endpoint de 2FA llamado');
  const { code } = req.body;
  
  // Validar código
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Código de verificación es requerido'
    });
  }
  
  // Limpiar código (solo números)
  const cleanCode = code.trim().replace(/\D/g, '');
  if (cleanCode.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Código de verificación inválido (debe contener solo números)'
    });
  }
  
  try {
    // Obtener userId del token o del body
    let userId = req.body.userId;
    
    // Si no viene en el body, intentar obtener del token JWT
    if (!userId) {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const { validateJwt } = await import('./config/jwt.js');
          try {
            const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
            if (decoded && decoded.userId) {
              userId = decoded.userId;
            } else if (decoded && decoded.sub) {
              userId = decoded.sub;
            } else if (decoded && decoded.user?.id) {
              userId = decoded.user.id;
            }
          } catch (jwtError) {
            console.log('⚠️ [2FA] No se pudo validar JWT, usando userId del body si está disponible');
          }
        }
      } catch (error) {
        console.log('⚠️ [2FA] Error obteniendo userId del token:', error.message);
      }
    }
    
    // Si aún no hay userId, usar un fallback
    if (!userId) {
      userId = req.user?.userId || req.user?.id || req.user?.sub;
    }
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId es requerido. Por favor proporciona el userId en el body o usa un token de autenticación válido.'
      });
    }
    
    console.log(`🔐 [2FA] Completando login 2FA para usuario ${userId} con código: ${cleanCode.substring(0, 2)}****`);
    
    // Importar el servicio de Instagram
    const { getOrCreateIGSession, pending2FA } = await import('./services/instagramService.js');
    
    // Verificar que hay un 2FA pendiente
    const pending = pending2FA.get(userId);
    if (!pending) {
      console.log(`❌ [2FA] No hay un login con 2FA pendiente para usuario ${userId}`);
      return res.status(400).json({
        success: false,
        error: 'No hay un login con 2FA pendiente para este usuario',
        message: 'Por favor, intenta hacer login nuevamente primero'
      });
    }
    
    // Crear o obtener sesión de Instagram
    const session = await getOrCreateIGSession(userId);
    
    // Completar login con código 2FA
    const result = await session.completeTwoFactorLogin(cleanCode);
    
    if (result.success) {
      console.log(`✅ [2FA] Login 2FA exitoso para usuario ${userId}, Instagram: ${result.username}`);
      res.json({
        success: true,
        status: 'LOGGED',
        message: 'Login exitoso con código 2FA',
        username: result.username,
        igUserId: result.igUserId,
        twoFA_completed: true
      });
    } else {
      console.log(`❌ [2FA] Error completando login 2FA: ${result.error || result.message}`);
      res.status(400).json({
        success: false,
        status: result.status || '2FA_FAILED',
        error: result.error || 'Error completando login 2FA',
        message: result.message || 'El código de verificación es incorrecto o ha expirado'
      });
    }
  } catch (error) {
    console.error(`❌ [2FA] Error en endpoint de 2FA: ${error.message}`);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Error interno completando login 2FA: ' + error.message
    });
  }
});

// Endpoint de activación del bot de Instagram (ANTES de middlewares de autenticación)
app.post('/api/instagram/bot/activate', async (req, res) => {
  console.log('🤖 [BOT] Endpoint de activación del bot llamado');
  const { username, password, personalityId, userId } = req.body;
  
  // Usar userId del frontend o generar uno por defecto
  const actualUserId = userId || 'a123ccc0-7ee7-45da-92dc-52059c7e21c8';
  
  // Validar datos
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username y password son requeridos'
    });
  }
  
  try {
    // Importar el servicio de Instagram Bot
    const { activateBotForUser } = await import('./services/instagramBotService.js');
    
    console.log('🤖 [BOT] Activando bot real de Instagram...');
    
    // Activar bot real con personalidad
    const botResult = await activateBotForUser(actualUserId, {
      username: username,
      password: password
    }, personalityId || 872);
    
    if (botResult) {
      console.log('✅ [BOT] Bot real activado exitosamente para:', username);
      console.log('🤖 [BOT] Sistema de respuestas automáticas iniciado');
      console.log('🎭 [BOT] Personalidad configurada:', personalityId || 872);
      
      res.json({
        success: true,
        message: 'Bot real activado exitosamente - Sistema de respuestas automáticas iniciado',
        username: username,
        status: {
          isActive: true,
          hasService: true,
          hasPersonality: true,
          personalityId: personalityId || 872
        }
      });
    } else {
      console.log('❌ [BOT] Error activando bot real');
      res.status(500).json({
        success: false,
        error: 'Error activando bot real'
      });
    }
  } catch (error) {
    console.error('❌ [BOT] Error en activación del bot:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error interno activando bot: ' + error.message
    });
  }
});

// Endpoint para activar/desactivar bot desde frontend
app.post('/api/instagram/bot/toggle', async (req, res) => {
  console.log('🤖 [BOT] Endpoint de toggle del bot llamado');
  console.log('📥 [BOT] Body recibido:', JSON.stringify(req.body, null, 2));
  const { enabled, personalityId, userId } = req.body;
  
  let actualUserId = userId;
  
  // Si no viene userId en el body, intentar obtenerlo del token
  if (!actualUserId) {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const { validateJwt } = await import('./config/jwt.js');
        try {
          const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
          if (decoded) {
            actualUserId = decoded.userId || decoded.sub || decoded.user?.id;
            console.log(`🔍 [BOT] userId obtenido del token: ${actualUserId}`);
          }
        } catch (jwtError) {
          console.log(`⚠️ [BOT] No se pudo validar JWT`);
        }
      }
    } catch (error) {
      console.log(`⚠️ [BOT] Error obteniendo userId del token: ${error.message}`);
    }
  }
  
  if (!actualUserId) {
    return res.status(400).json({
      success: false,
      error: 'userId es requerido. Por favor proporciona el userId en el body o usa un token de autenticación válido.',
      userId: null
    });
  }
  
  if (!personalityId && enabled) {
    return res.status(400).json({
      success: false,
      error: 'personalityId es requerido para activar el bot. Por favor selecciona una personalidad.',
      userId: actualUserId
    });
  }
  
  console.log(`🔍 [BOT] userId final: ${actualUserId}`);
  console.log(`🎭 [BOT] personalityId: ${personalityId || 'no especificada'}`);
  
  try {
    const { activateBotForUser, deactivateBotForUser, startGlobalMonitoring, stopGlobalMonitoring } = await import('./services/instagramBotService.js');
    
    if (enabled) {
      // Activar bot
      console.log('🚀 [BOT] Activando bot desde frontend para usuario:', actualUserId);
      
      // Primero hacer login si no hay sesión
      const { getOrCreateIGSession } = await import('./services/instagramService.js');
      const session = await getOrCreateIGSession(actualUserId);
      
      if (!session.logged) {
        // Intentar con userId real si no hay sesión con el userId específico
        const defaultSession = await getOrCreateIGSession(actualUserId);
        if (!defaultSession.logged) {
          return res.status(400).json({
            success: false,
            error: 'No hay sesión activa de Instagram. Debe hacer login primero.'
          });
        }
        // Usar la sesión por defecto
        session.username = defaultSession.username;
        session.logged = true;
      }
      
      // Activar bot con personalidad
      // Intentar obtener credenciales desde variables de entorno o usar las del login
      const botPassword = process.env.IG_PASSWORD || 'Dios2025';
      
      const botResult = await activateBotForUser(actualUserId, {
        username: session.username,
        password: botPassword
      }, personalityId);
      
      // Dar tiempo para que el bot se inicialice completamente
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (botResult) {
        // Asegurar que el monitoreo global esté iniciado
        try {
          await startGlobalMonitoring();
          console.log('✅ [BOT] Monitoreo global iniciado/verificado');
        } catch (monitorError) {
          console.log(`⚠️ [BOT] Error iniciando monitoreo global: ${monitorError.message}`);
        }
        
        console.log('✅ [BOT] Bot activado desde frontend para usuario:', actualUserId);
        console.log(`🎭 [BOT] Personalidad ID: ${personalityId}`);
        
        // Verificar que el bot está realmente activo
        const { default: instagramBotService } = await import('./services/instagramBotService.js');
        const status = instagramBotService.getBotStatusForUser(actualUserId);
        console.log(`📊 [BOT] Estado del bot:`, {
          isActive: status.isActive,
          hasService: status.hasService,
          hasPersonality: status.hasPersonality,
          personalityName: status.personalityData?.nombre
        });
        
        res.json({
          success: true,
          message: 'Bot activado exitosamente',
          active: true,
          personalityId: personalityId || 872,
          userId: actualUserId,
          status: status
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Error activando bot'
        });
      }
    } else {
      // Desactivar bot
      console.log('🛑 [BOT] Desactivando bot desde frontend para usuario:', actualUserId);
      
      await deactivateBotForUser(actualUserId);
      
      console.log('✅ [BOT] Bot desactivado desde frontend para usuario:', actualUserId);
      res.json({
        success: true,
        message: 'Bot desactivado exitosamente',
        active: false,
        userId: actualUserId
      });
    }
  } catch (error) {
    console.error('❌ [BOT] Error en toggle:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error interno: ' + error.message
    });
  }
});

// Endpoint para obtener personalidades del usuario autenticado (ANTES de middlewares)
app.get('/api/instagram/personalities', async (req, res) => {
  console.log('🎭 [PERSONALITIES] Endpoint de personalidades llamado');
  
  try {
    // Obtener el token del header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token de autorización requerido',
        personalities: []
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Decodificar el token JWT para obtener el userId
    const { supabaseAdmin } = await import('./config/db.js');
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      console.error('❌ [PERSONALITIES] Error de autenticación:', authError);
      return res.status(401).json({
        success: false,
        error: 'Token inválido o expirado',
        personalities: []
      });
    }
    
    const userId = user.id;
    console.log(`🎭 [PERSONALITIES] Obteniendo personalidades para usuario: ${userId}`);
    
    // Obtener solo las personalidades del usuario autenticado
    const { data: personalities, error } = await supabaseAdmin
      .from('personalities')
      .select('*')
      .eq('users_id', userId)
      .order('id', { ascending: true });
    
    if (error) {
      console.error('❌ [PERSONALITIES] Error obteniendo personalidades:', error);
      return res.status(500).json({
        success: false,
        error: 'Error obteniendo personalidades',
        personalities: []
      });
    }
    
    console.log(`✅ [PERSONALITIES] ${personalities?.length || 0} personalidades encontradas para usuario ${userId}`);
    
    res.json({
      success: true,
      personalities: personalities || [],
      count: personalities?.length || 0,
      userId: userId,
      message: `Personalidades del usuario obtenidas exitosamente`
    });
    
  } catch (error) {
    console.error('❌ [PERSONALITIES] Error interno:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error interno obteniendo personalidades',
      personalities: []
    });
  }
});

// Endpoint para activar/desactivar IA Global desde frontend (ANTES de middlewares)
app.post('/api/instagram/global-ai/toggle', async (req, res) => {
  console.log('🤖 [GLOBAL-AI] Endpoint de toggle de IA Global llamado');
  console.log('📥 [GLOBAL-AI] Body recibido:', JSON.stringify(req.body, null, 2));
  const { enabled, personalityId, userId } = req.body;
  
  try {
    const { activateBotForUser, deactivateBotForUser, startGlobalMonitoring, stopGlobalMonitoring } = await import('./services/instagramBotService.js');
    
    if (enabled) {
      console.log('🚀 [GLOBAL-AI] Activando IA Global...');
      
      // Obtener userId del body, token, o default
      let actualUserId = userId;
      
      // Si no viene en el body, intentar obtener del token
      if (!actualUserId) {
        try {
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const { validateJwt } = await import('./config/jwt.js');
            try {
              const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
              if (decoded) {
                actualUserId = decoded.userId || decoded.sub || decoded.user?.id;
                console.log(`🔍 [GLOBAL-AI] userId obtenido del token: ${actualUserId}`);
              }
            } catch (jwtError) {
              console.log(`⚠️ [GLOBAL-AI] No se pudo obtener userId del token`);
            }
          }
        } catch (error) {
          console.log(`⚠️ [GLOBAL-AI] Error obteniendo userId: ${error.message}`);
        }
      }
      
      // NO usar userId por defecto - requerir que venga del frontend o token
      if (!actualUserId) {
        return res.status(400).json({
          success: false,
          error: 'userId es requerido. Por favor proporciona el userId en el body o usa un token de autenticación válido.',
          userId: null
        });
      }
      
      console.log(`🔍 [GLOBAL-AI] userId final a usar: ${actualUserId}`);
      
      if (!personalityId) {
        return res.status(400).json({
          success: false,
          error: 'personalityId es requerido para activar la IA Global. Por favor selecciona una personalidad.',
          userId: actualUserId
        });
      }
      
      console.log(`🎭 [GLOBAL-AI] personalityId: ${personalityId}`);
      
      // Verificar si hay sesión de Instagram
      const { getOrCreateIGSession } = await import('./services/instagramService.js');
      const session = await getOrCreateIGSession(actualUserId);
      
      console.log(`\n🎯 [GLOBAL-AI] ============================================`);
      console.log(`🎯 [GLOBAL-AI] PROCESO DE ACTIVACIÓN DE IA GLOBAL`);
      console.log(`🎯 [GLOBAL-AI] ============================================`);
      console.log(`   Usuario ID: ${actualUserId}`);
      console.log(`   Personalidad ID: ${personalityId}`);
      console.log(`   La personalidad debe estar seleccionada desde el frontend`);
      console.log(`🎯 [GLOBAL-AI] ============================================\n`);
      
      console.log(`📋 [GLOBAL-AI] Verificando sesión de Instagram...`);
      console.log(`   - logged: ${session.logged}`);
      console.log(`   - username: ${session.username || 'N/A'}`);
      console.log(`   - igUserId: ${session.igUserId || 'N/A'}\n`);
      
      if (!session.logged) {
        console.log(`❌ [GLOBAL-AI] ERROR: No hay sesión activa de Instagram`);
        console.log(`   Pasos requeridos:`);
        console.log(`   1. Haz login en Instagram primero`);
        console.log(`   2. Selecciona una personalidad desde el frontend`);
        console.log(`   3. Activa la IA Global desde el frontend\n`);
        return res.status(400).json({
          success: false,
          error: 'No hay sesión activa de Instagram. Debe hacer login primero.',
          userId: actualUserId,
          steps: [
            '1. Haz login en Instagram',
            '2. Selecciona una personalidad desde el frontend',
            '3. Activa la IA Global desde el frontend'
          ]
        });
      }
      
      console.log(`✅ [GLOBAL-AI] Sesión de Instagram válida`);
      console.log(`   Username: ${session.username}`);
      console.log(`   IG User ID: ${session.igUserId}\n`);
      
      console.log(`🔧 [GLOBAL-AI] Iniciando activación del bot...`);
      console.log(`🎭 [GLOBAL-AI] Personalidad seleccionada: ${personalityId}`);
      console.log(`   El bot usará esta personalidad para todas las respuestas\n`);
      
      console.log(`🔧 [GLOBAL-AI] Llamando activateBotForUser con:`);
      console.log(`   - userId: ${actualUserId}`);
      console.log(`   - username: ${session.username}`);
      console.log(`   - personalityId: ${personalityId}`);
      
      const botResult = await activateBotForUser(actualUserId, {
        username: session.username,
        password: process.env.IG_PASSWORD || 'Dios2025'
      }, personalityId);
      
      console.log(`🔍 [GLOBAL-AI] Resultado de activación: ${botResult}`);
      console.log(`   Tipo de resultado: ${typeof botResult}`);
      
      // Dar tiempo para que el bot se inicialice completamente
      console.log(`⏳ [GLOBAL-AI] Esperando 2 segundos para inicialización...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (botResult) {
        // Verificar estado del bot ANTES de iniciar monitoreo
        const { default: instagramBotService } = await import('./services/instagramBotService.js');
        const botStatusBefore = instagramBotService.getBotStatusForUser(actualUserId);
        console.log(`📊 [GLOBAL-AI] Estado del bot ANTES de monitoreo:`, {
          isActive: botStatusBefore.isActive,
          hasService: botStatusBefore.hasService,
          hasPersonality: botStatusBefore.hasPersonality,
          personalityName: botStatusBefore.personalityData?.nombre
        });
        
        // Asegurar que el monitoreo global esté iniciado
        try {
          await startGlobalMonitoring();
          console.log('✅ [GLOBAL-AI] Monitoreo global iniciado/verificado');
          
          // Verificar estado global
          const globalStatus = instagramBotService.getGlobalStatus();
          console.log(`📊 [GLOBAL-AI] Estado global:`, globalStatus);
        } catch (monitorError) {
          console.error(`❌ [GLOBAL-AI] Error iniciando monitoreo global: ${monitorError.message}`);
          console.error(monitorError);
        }
        
        // Verificar estado final del bot
        const status = instagramBotService.getBotStatusForUser(actualUserId);
        console.log(`📊 [GLOBAL-AI] Estado final del bot:`, {
          isActive: status.isActive,
          hasService: status.hasService,
          hasPersonality: status.hasPersonality,
          personalityName: status.personalityData?.nombre,
          personalityId: status.personalityData?.id
        });
        
        console.log('✅ [GLOBAL-AI] IA Global activada exitosamente');
        
        // Verificar que el bot realmente esté en el Map de bots activos
        const botDataInMap = instagramBotService.activeBots.get(actualUserId);
        if (botDataInMap) {
          console.log(`✅ [GLOBAL-AI] Bot confirmado en activeBots Map para ${actualUserId}`);
          console.log(`   Bot está corriendo: ${botDataInMap.isRunning}`);
          console.log(`   Personalidad: "${botDataInMap.personalityData?.nombre}" (ID: ${botDataInMap.personalityData?.id})`);
        } else {
          console.log(`⚠️ [GLOBAL-AI] Bot NO encontrado en activeBots Map para ${actualUserId}`);
          console.log(`   Bots activos en el Map:`, Array.from(instagramBotService.activeBots.keys()));
        }
        
        console.log('✅ [GLOBAL-AI] IA Global activada exitosamente');
        
        res.json({
          success: true,
          message: 'IA Global activada exitosamente',
          active: true,
          personalityId: personalityId,
          userId: actualUserId,
          status: status,
          globalStatus: instagramBotService.getGlobalStatus()
        });
      } else {
        console.log(`❌ [GLOBAL-AI] Error: botResult es ${botResult} (esperado: true)`);
        console.log(`   Tipo: ${typeof botResult}`);
        
        // Intentar obtener más información del error
        const { default: instagramBotService } = await import('./services/instagramBotService.js');
        const errorStatus = instagramBotService.getBotStatusForUser(actualUserId);
        console.log(`📊 [GLOBAL-AI] Estado del bot después del error:`, errorStatus);
        
        res.status(500).json({
          success: false,
          error: 'Error activando IA Global. El bot no se pudo inicializar correctamente.',
          userId: actualUserId,
          botResult: botResult,
          debug: {
            hasActiveBots: instagramBotService.activeBots.size > 0,
            activeBots: Array.from(instagramBotService.activeBots.keys()),
            sessionLogged: session.logged,
            sessionUsername: session.username
          }
        });
      }
    } else {
      console.log('🛑 [GLOBAL-AI] Desactivando IA Global...');
      
      // Obtener userId dinámicamente
      let actualUserId = userId;
          if (!actualUserId) {
            try {
              const authHeader = req.headers.authorization;
              if (authHeader && authHeader.startsWith('Bearer ')) {
                const { validateJwt } = await import('./config/jwt.js');
                try {
                  const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
                  if (decoded) {
                    actualUserId = decoded.userId || decoded.sub || decoded.user?.id;
                  }
                } catch (jwtError) {
                  console.log(`⚠️ [GLOBAL-AI] No se pudo validar JWT`);
                }
              }
            } catch (error) {
              console.log(`⚠️ [GLOBAL-AI] Error obteniendo userId: ${error.message}`);
            }
          }
          
          if (!actualUserId) {
            return res.status(400).json({
              success: false,
              error: 'userId es requerido para desactivar la IA Global.',
              userId: null
            });
          }
          
          await deactivateBotForUser(actualUserId);
      
      console.log('✅ [GLOBAL-AI] IA Global desactivada');
      res.json({
        success: true,
        message: 'IA Global desactivada exitosamente',
        active: false,
        userId: actualUserId
      });
    }
  } catch (error) {
    console.error('❌ [GLOBAL-AI] Error en toggle:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error interno: ' + error.message
    });
  }
});

// Endpoint para actualizar personalidad del bot activo (ANTES de middlewares)
app.post('/api/instagram/bot/update-personality', async (req, res) => {
  console.log('🎭 [BOT-PERSONALITY] Endpoint de actualización de personalidad llamado');
  const { personalityId, userId } = req.body;
  
  if (!personalityId) {
    return res.status(400).json({
      success: false,
      error: 'personalityId es requerido',
      message: 'Debe proporcionar el ID de la personalidad'
    });
  }
  
  try {
    const { default: instagramBotService } = await import('./services/instagramBotService.js');
    
    // Usar userId del frontend o generar uno por defecto
    const actualUserId = userId || 'a123ccc0-7ee7-45da-92dc-52059c7e21c8';
    
    console.log(`🎭 [BOT-PERSONALITY] Actualizando personalidad a ID ${personalityId} para usuario ${actualUserId}`);
    
    // Verificar si hay bots activos
    const globalStatus = instagramBotService.getGlobalStatus();
    console.log(`ℹ️ [BOT-PERSONALITY] Estado global:`, globalStatus);
    
    // Actualizar personalidad del bot activo
    const updateResult = await instagramBotService.updateBotPersonality(actualUserId, personalityId);
    
    if (updateResult) {
      console.log(`✅ [BOT-PERSONALITY] Personalidad actualizada exitosamente a ID ${personalityId}`);
      res.json({
        success: true,
        message: 'Personalidad actualizada exitosamente',
        personalityId: personalityId,
        userId: actualUserId
      });
    } else {
      console.log(`❌ [BOT-PERSONALITY] Error actualizando personalidad a ID ${personalityId}`);
      res.status(400).json({
        success: false,
        error: 'Bot no está activo o personalidad no válida',
        message: 'El bot de Instagram no está activo para este usuario. Debe activar el bot primero.',
        debug: {
          userId: actualUserId,
          personalityId: personalityId,
          globalStatus: globalStatus
        }
      });
    }
  } catch (error) {
    console.error('❌ [BOT-PERSONALITY] Error interno:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error interno: ' + error.message,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para verificar bots activos (ANTES de middlewares)
app.get('/api/instagram/bot/active-bots', async (req, res) => {
  console.log('🤖 [ACTIVE-BOTS] Endpoint de bots activos llamado');
  
  try {
    const { default: instagramBotService } = await import('./services/instagramBotService.js');
    
    // Obtener estado global
    const globalStatus = instagramBotService.getGlobalStatus();
    
    // Obtener información de bots activos
    const activeBots = [];
    for (const [userId, botData] of instagramBotService.activeBots) {
      activeBots.push({
        userId: userId,
        isRunning: botData.isRunning,
        personality: botData.personalityData?.nombre || 'Sin personalidad',
        personalityId: botData.personalityData?.id || null,
        messagesSent: botData.processedMessages?.size || 0,
        lastActivity: botData.lastResponseTime || null
      });
    }
    
    res.json({
      success: true,
      globalStatus: globalStatus,
      activeBots: activeBots,
      totalBots: activeBots.length,
      message: `${activeBots.length} bots activos encontrados`
    });
    
  } catch (error) {
    console.error('❌ [ACTIVE-BOTS] Error interno:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error interno: ' + error.message,
      activeBots: []
    });
  }
});

// 3) Middlewares de seguridad y dominio (CON BYPASS para webhook)
app.use(domainSecurityMiddleware);
app.use(customDomainRoutingMiddleware);
app.use(authMiddleware);
app.use(centralizeAuthMiddleware);
app.use(noCacheMiddleware);
app.use(contentTypeMiddleware);

// MIDDLEWARE CRÍTICO: Prevenir que el backend sirva código frontend crudo
app.use((req, res, next) => {
  // BYPASS webhook de Stripe
  const p = req.path || req.originalUrl || '';
  if (p === '/api/stripe/webhook' || p.startsWith('/api/stripe/webhook')) {
    return next();
  }

  // Log para debugging geográfico
  const country = req.get('cf-ipcountry') || req.get('x-forwarded-for') || 'unknown';
  const userAgent = req.get('user-agent') || '';
  
  // Log eliminado para evitar spam
  
  // Si es app.uniclick.io y NO es una ruta de API, es una ruta de frontend
  if (req.get('host') === 'app.uniclick.io' && !req.path.startsWith('/api/')) {
    console.log(`⚠️ Frontend route intercepted: ${req.path} from ${country}`);
    
    // Asegurar headers correctos
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('X-Content-Type-Options', 'nosniff');
    
    // Si es un navegador real, devolver HTML básico que redirija
    if (userAgent.includes('Mozilla') || userAgent.includes('Chrome') || userAgent.includes('Safari')) {
      console.log(`🔄 Serving HTML redirect for frontend route from ${country}`);
      return res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>Uniclick - Cargando...</title>
          <meta http-equiv="refresh" content="0; url=https://app.uniclick.io${req.path}">
          <script>
            window.location.href = "https://app.uniclick.io${req.path}";
          </script>
        </head>
        <body>
          <p>Redirigiendo a la aplicación...</p>
          <p>Si no eres redirigido automáticamente, <a href="https://app.uniclick.io${req.path}">haz clic aquí</a>.</p>
        </body>
        </html>
      `);
    }
  }
  
  next();
});

app.post('/api/saveCalendarToken', saveCalendarToken);
//app.post('/api/verify-google-token', verifyGoogleTokenAndCreateEvent);

// Rutas específicas para archivos con headers apropiados (antes del static)
app.use('/uploads', fileRoutes);
// Fallback para archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Sesión
app.use(session({
  secret: ENV_CONFIG.SESSION_SECRET || 'fallback-secret-for-dev-only',
  resave: false,
  saveUninitialized: false,
  name: 'uniclick_session',
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: ENV_CONFIG.NODE_ENV === 'production',
    sameSite: ENV_CONFIG.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    domain: ENV_CONFIG.NODE_ENV === 'development' ? undefined : (ENV_CONFIG.COOKIE_DOMAIN || '.uniclick.io'),
    path: '/'
  }
}));

// =============================================
// RUTAS
// =============================================
// RAW parser para webhooks de Stripe (antes que body-parser)
// CORS duplicado eliminado - se maneja en el CORS global anterior

app.get('/webchat.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'webchat.js'))
});

// Health check endpoint for AWS Load Balancer
app.get('/', (req, res) => {
  res.status(200).send('Alive and healthy - Uniclick API Backend');
});

// ✅ Ruta para health check de AWS (ROBUSTO)
app.get('/health', (req, res) => {
  try {
    // Health check simple y rápido
    const healthData = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid
    };
    
    res.status(200).json(healthData);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ Health check adicional súper simple
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// ✅ Health check para verificar que las rutas básicas funcionan
app.get('/status', (req, res) => {
  res.status(200).json({
    service: 'uniclick-api',
    status: 'healthy',
    port: process.env.PORT || 5001,
    timestamp: Date.now()
  });
});

app.use('/api', health);

// REQUERIMIENTO I: Healthcheck con APP_ENV
app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    env: process.env.APP_ENV || 'development',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// LEGACY: Rutas deprecated comentadas - no usar en producción
// app.use('/api/stripe-legacy', stripeRoutes); // ❌ DISABLED: Legacy routes disabled for production

// 🆕 NUEVO SISTEMA DE BILLING con Stripe
// CORS específico solo para /api/billing
const allowed = new Set(
  [
    process.env.FRONTEND_URL,
    'https://uniclick.io',
    'https://www.uniclick.io',
    'https://app.uniclick.io',
    'http://localhost:3000',
    'http://localhost:3001',   // 👈 Next puede usar 3001
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ].filter(Boolean)
);

const corsOptions = {
  origin(origin, callback) {
    // Permite requests sin Origin (SSR/curl)
    if (!origin) return callback(null, true);
    // Permite solo http(s) en allowlist
    if (/^https?:\/\//i.test(origin) && allowed.has(origin)) return callback(null, true);
    // Silencia extensiones u otros esquemas (no error, sin CORS)
    if (!/^https?:\/\//i.test(origin) || origin.startsWith('chrome-extension://')) return callback(null, false);
    // http(s) no permitido -> bloquear sin error
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};

// Preflight específico para /api/billing
app.options('/api/billing/*', cors(corsOptions));
// CORS solo en /api/billing
app.use('/api/billing', cors(corsOptions), billingRouter);

app.use('/api/affiliate/status', affiliateStatusRoutes);
app.use('/api/affiliate/connect', affiliateConnectRoutes);

// Rutas "propias"
app.use('/api/ai', ai);
app.use('/api/websites', websitesRoutes);
app.use('/api/configuracion-chatPersonal', configuracionChatRoutes)
app.use('/api/personalities', personalityRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api', googleCalendarRoutes); // <-- NUEVO: Rutas de Google Calendar
app.use('/api', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/configuracion-chat', configuracionChatRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/webchat-config', webchatConfigRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/dominio', dominioRoutes); // <-- NUEVO: Rutas de dominios
app.use('/api', customDomainsRoutes); // <-- NUEVO: Rutas de dominios personalizados

// NUEVO: Ruta catch-all SOLO para dominios personalizados
// Debe ir DESPUÉS de todas las rutas /api/ pero ANTES de otras rutas
app.use('*', async (req, res, next) => {
  // Solo procesar si es un dominio personalizado detectado por el middleware
  if (req.isCustomDomain) {
    console.log(`🎯 Ruta catch-all para dominio personalizado: ${req.originalHost}${req.path}`);
    
    // Importar y llamar directamente a la función
    const { getWebsiteByCustomDomain } = await import('./controllers/websitesController.js');
    return getWebsiteByCustomDomain(req, res);
  }
  
  next();
});

app.use('/api/WebchatChats', webchatChatsRoutes);
app.use('/api/contador', contadorRoutes);
app.use('/api/dealcar', dealcarRoutes);
app.use('/api', feedbackRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/leads', leadsRoutes);  // Asegúrate de que la ruta sea correcta
app.use('/api/contacts', contactsRoutes); // Rutas para importar archivos de contactos
app.use('/api/leads', leadsImportRoutes); // Rutas para importar leads (se monta en /api/leads también)
app.use('/api/leads', leadsBulkRoutes); // Rutas para envío masivo de leads

app.use('/api/telegram', telegramRoutes); // Asegúrate de que la ruta sea correcta

app.use('/api/instagram', instagramRoutes); // <-- NUEVO: Rutas de Instagram
// Rutas de integración y configuración de usuario
 // Asegúrate de que la ruta sea correcta
app.use('/api/integrations', IntegracionesInstaladasRoutes);
app.use('/api', userSettingsRoutes);
// app.use('/api/user', userRoutes); // <-- COMENTADO: Rutas de usuario y planes (se implementará después)

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Ruta que recibe el archivo y lo procesa
app.post('/api/transcribe-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se ha enviado un archivo de audio.' });
    }

    console.log('Archivo recibido:', req.file); // Para verificar que el archivo se recibió correctamente

    // Llamar a la función que procesa el archivo de audio y obtener la transcripción
    const transcription = await transcribeAudioBuffer(req.file.buffer);  // Pasa el buffer del archivo recibido

    res.json({ transcription });
  } catch (error) {
    console.error('Error al procesar el archivo de audio:', error);
    res.status(500).json({ message: 'Error al procesar el archivo de audio.', error: error.message });
  }
});


// Método para transcribir el audio con Whisper


// ----- AÑADE AQUÍ TUS RUTAS DE userSettingsRoutes -----
// ------------------------------------------------------

// Rutas de testing para subdominios
import testRoutes from './routes/testRoutes.js';
app.use('/api/test', testRoutes);

// Servir estáticos
app.use(express.static(path.join(__dirname, 'public')));

// justo después de app.use(express.static(...))
app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view', 'stripe-resolution', 'success.html'));
});
app.get('/cancel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view', 'stripe-resolution', 'cancel.html'));
});

app.get('/public/stripe.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stripe.html'));
});

app.use('/api/sessions', sessionsRoutes);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================================
// SOCKET.IO
// =============================================
const server = http.createServer(app);

// Configuración de CORS para Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,      // <-- Aquí igual, NO '*'
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  }
});

// Configuración básica de Socket.IO
io.on('connection', (socket) => {
  console.log(`👤 Usuario conectado: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`👋 Usuario desconectado: ${socket.id}`);
  });

  // Eventos personalizados aquí
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`🏠 Usuario ${socket.id} se unió a la sala: ${room}`);
  });

  socket.on('leave-room', (room) => {
    socket.leave(room);
    console.log(`🚪 Usuario ${socket.id} salió de la sala: ${room}`);
  });
});

// Configurar el servicio de WhatsApp con Socket.IO
import { configureSocket as configureWhatsAppSocket } from './services/whatsappService.js';
configureWhatsAppSocket(io);

// Configurar el servicio de Instagram con Socket.IO
import { configureIGIO, restoreAllSavedSessions } from './services/instagramService.js';
configureIGIO(io);

// Restaurar todas las sesiones guardadas de Instagram al iniciar el servidor
restoreAllSavedSessions().catch(error => {
  console.error('❌ Error restaurando sesiones de Instagram:', error.message);
});

// Hacer io disponible globalmente
app.set('io', io);

// =============================================
// BASE DE DATOS
// =============================================
    import pool from './config/db.js';

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('Conexión exitosa a la base de datos!');
    client.release();
  } catch (err) {
    console.error('Error de conexión:', err);
  }
}

// =============================================
// INICIAR SERVIDOR
// =============================================
server.listen(Number(ENV_CONFIG.PORT), '0.0.0.0', async () => {
  console.clear();

  console.log('\x1b[36m%s\x1b[0m', `
██╗   ██╗███╗   ██╗██╗ ██████╗██╗     ██╗ ██████╗██╗  ██╗
██║   ██║████╗  ██║██║██╔════╝██║     ██║██╔════╝██║ ██╔╝
██║   ██║██╔██╗ ██║██║██║     ██║     ██║██║     █████╔╝ 
██║   ██║██║╚██╗██║██║██║     ██║     ██║██║     ██╔═██╗ 
╚██████╔╝██║ ╚████║██║╚██████╗███████╗██║╚██████╗██║  ██╗
 ╚═════╝ ╚═╝  ╚═══╝╚═╝ ╚═════╝╚══════╝╚═╝ ╚═════╝╚═╝  ╚═╝
  `);

  console.log('\x1b[32m%s\x1b[0m', '✅ Sistema operativo:', process.platform);
  console.log('\x1b[32m%s\x1b[0m', '✅ Versión Node.js:', process.version);
  console.log('\x1b[32m%s\x1b[0m', '✅ Entorno:', ENV_CONFIG.NODE_ENV.toUpperCase());
  console.log('\x1b[32m%s\x1b[0m', '✅ Hora de inicio:', new Date().toLocaleString());
  console.log('\x1b[32m%s\x1b[0m', '🔗 URL Backend:', ENV_CONFIG.BACKEND_URL);
  console.log('\x1b[32m%s\x1b[0m', '🌐 URL Frontend:', ENV_CONFIG.FRONTEND_URL);
  console.log('\x1b[32m%s\x1b[0m', '📡 Socket.IO:', `ws://localhost:${ENV_CONFIG.PORT}`);

  try {
    const client = await pool.connect();
    const info = await client.query('SELECT version(), current_database(), current_user');
    console.log('\x1b[32m%s\x1b[0m', '\n🔌 Conexión a Base de Datos:');
    console.log('   ▸ Versión PostgreSQL:', info.rows[0].version.split(',')[0]);
    console.log('   ▸ Base de datos:', info.rows[0].current_database);
    console.log('   ▸ Usuario:', info.rows[0].current_user);
    client.release();
  } catch (err) {
    console.log('\x1b[31m%s\x1b[0m', '\n⚠️ Error de conexión a DB (el servidor continuará):');
    console.error('   ▸', err.message);
    console.log('   ▸ Verifica las variables de entorno: DATABASE_URL, SUPABASE_URL');
    // NO hacer exit - permitir que el servidor arranque para debugging
  }

  console.log('\x1b[36m%s\x1b[0m', '\n🔍 Verificación de servicios:');
  console.log(
    '   ▸ OpenAI:',
    ENV_CONFIG.OPENAI_API_KEY ? '\x1b[32mConfigurado\x1b[0m' : '\x1b[31mNo configurado\x1b[0m'
  );
  console.log(
    '   ▸ Google Auth:',
    ENV_CONFIG.GOOGLE_CLIENT_ID ? '\x1b[32mConfigurado\x1b[0m' : '\x1b[31mNo configurado\x1b[0m'
  );
  console.log('   ▸ WhatsApp Web:', '\x1b[32mListo\x1b[0m');

  // Ejecutar diagnóstico de producción si está en producción o hay problemas
  if (ENV_CONFIG.NODE_ENV === 'production' || !ENV_CONFIG.OPENAI_API_KEY) {
    try {
      const { runProductionDiagnostics } = await import('./utils/productionDiagnostics.js');
      const diagnostics = await runProductionDiagnostics();

      if (!diagnostics.success) {
        console.log('\x1b[31m%s\x1b[0m', '\n🚨 ATENCIÓN: Se encontraron problemas críticos');
        console.log('\x1b[31m%s\x1b[0m', '   El procesamiento de medios puede no funcionar correctamente');
      }
    } catch (diagError) {
      console.log('\x1b[33m%s\x1b[0m', '\n⚠️ No se pudo ejecutar el diagnóstico:', diagError.message);
    }
  }

  console.log('\x1b[36m%s\x1b[0m', `\n🚀 Servidor listo en ${ENV_CONFIG.BACKEND_URL}`);
  console.log('\x1b[90m%s\x1b[0m', '   Presiona CTRL+C para detener\n');
  
  // AUTO-ACTIVAR BOT SI HAY SESIÓN ACTIVA
  try {
    console.log('\x1b[36m%s\x1b[0m', '🤖 Verificando sesiones activas de Instagram para auto-activar bot...');
    
    const { getOrCreateIGSession } = await import('./services/instagramService.js');
    
    // Importar el módulo completo
    const instagramBotServiceModule = await import('./services/instagramBotService.js');
    const instagramBotService = instagramBotServiceModule.default;
    
    // Verificar que el módulo se cargó correctamente
    if (!instagramBotService || !instagramBotService.activateBotForUser) {
      console.log(`\x1b[33m%s\x1b[0m`, `⚠️ Error: instagramBotService no está disponible correctamente`);
      console.log(`   Tipo: ${typeof instagramBotService}`);
      console.log(`   Tiene activateBotForUser: ${!!instagramBotService?.activateBotForUser}`);
    } else {
      // NO auto-activar bot al iniciar - el usuario debe activarlo desde el frontend
      // con su cuenta y personalidad seleccionada
      console.log(`\x1b[33m%s\x1b[0m`, `ℹ️ El bot NO se auto-activa al iniciar el servidor.`);
      console.log(`\x1b[36m%s\x1b[0m`, `   💡 Para activar el bot:`);
      console.log(`   1. Haz login en Instagram desde el frontend (se usará tu cuenta)`);
      console.log(`   2. Selecciona la personalidad que deseas usar`);
      console.log(`   3. Activa la IA desde el frontend`);
      console.log(`   El bot usará la cuenta con la que hiciste login y la personalidad que selecciones.\n`);
    }
  } catch (autoActivateError) {
    console.log(`\x1b[33m%s\x1b[0m`, `⚠️ Error en auto-activación del bot: ${autoActivateError.message}`);
    console.log(`   El bot se puede activar manualmente desde el frontend.`);
  }
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  console.error('Excepción no capturada:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesa rechazada no manejada en:', promise, 'razón:', reason);
});

// Cleanup al cerrar
process.on('SIGTERM', () => {
  console.log('Señal SIGTERM recibida, cerrando servidor...');
  server.close(() => {
    console.log('Servidor cerrado.');
    process.exit(0);
  });
});

export { io }; // Export io for other modules
export default server;
