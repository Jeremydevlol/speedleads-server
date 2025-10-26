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
      console.log(`✅ CORS allow in development: ${origin}`);
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
      console.log(`✅ CORS allow subdomain: ${origin}`);
      return callback(null, true);
    }

    // 🌐 ADICIONAL: Permitir cualquier subdominio de uniclick.io para websites
    if (origin && origin.match(/^https?:\/\/[a-zA-Z0-9-]+\.uniclick\.io(:\d+)?$/)) {
      console.log(`✅ CORS allow website subdomain: ${origin}`);
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
    const { igSendMessage } = await import('./services/instagramService.js');
    
    console.log(`📤 [SEND] Enviando mensaje a ${username}: "${message}"`);
    
    // Enviar mensaje real a Instagram
    const result = await igSendMessage(username, message);
    
    if (result.success) {
      console.log(`✅ [SEND] Mensaje enviado exitosamente a ${username}`);
      res.json({
        success: true,
        message: 'Mensaje enviado exitosamente',
        recipient: username,
        sent_message: message,
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
      
      // Enviar mensaje al usuario encontrado
      const sendResult = await igSendMessage(user.username, message);
      
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
        
        const sendResult = await igSendMessage(username, message);
        
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

// Endpoint para enviar mensajes masivos a seguidores (ANTES de middlewares de autenticación)
app.post('/api/instagram/bulk-send-followers', async (req, res) => {
  console.log('📤👥 [BULK-FOLLOWERS] Endpoint de envío masivo a seguidores llamado');
  const { target_username, message, limit = 50, delay = 2000 } = req.body;

  if (!target_username || !message) {
    return res.status(400).json({
      success: false,
      error: 'target_username y message son requeridos',
      message: 'Debe proporcionar el username de la cuenta objetivo y el mensaje'
    });
  }

  try {
    const { igGetFollowers, igSendMessage } = await import('./services/instagramService.js');

    console.log(`👥 [BULK-FOLLOWERS] Obteniendo seguidores de ${target_username}...`);

    // Primero obtener los seguidores
    const followersResult = await igGetFollowers(target_username, parseInt(limit));

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

    let sentCount = 0;
    let failedCount = 0;
    const results = [];

    // Enviar mensajes a cada seguidor con delay
    for (let i = 0; i < followersResult.followers.length; i++) {
      const follower = followersResult.followers[i];
      
      try {
        console.log(`📤 [BULK-FOLLOWERS] Enviando mensaje ${i + 1}/${followersResult.followers.length} a ${follower.username}...`);
        
        const sendResult = await igSendMessage(follower.username, message);
        
        if (sendResult.success) {
          sentCount++;
          results.push({
            username: follower.username,
            full_name: follower.full_name,
            status: 'sent',
            timestamp: new Date().toISOString()
          });
          console.log(`✅ [BULK-FOLLOWERS] Mensaje enviado a ${follower.username}`);
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
      }

      // Delay entre mensajes para evitar rate limiting
      if (i < followersResult.followers.length - 1) {
        console.log(`⏳ [BULK-FOLLOWERS] Esperando ${delay}ms antes del siguiente mensaje...`);
        await new Promise(resolve => setTimeout(resolve, parseInt(delay)));
      }
    }

    console.log(`✅ [BULK-FOLLOWERS] Envío masivo completado: ${sentCount} enviados, ${failedCount} fallidos`);

    res.json({
      success: true,
      message: `Envío masivo completado: ${sentCount} mensajes enviados, ${failedCount} fallidos`,
      target_username,
      sent_count: sentCount,
      failed_count: failedCount,
      total_followers: followersResult.followers.length,
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

// Endpoint de login real de Instagram (ANTES de middlewares de autenticación)
app.post('/api/instagram/login', async (req, res) => {
  console.log('🔐 [LOGIN] Endpoint de login de Instagram llamado');
  const { username, password } = req.body;
  
  // Validar credenciales
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username y password son requeridos'
    });
  }
  
  try {
    // Importar el servicio de Instagram
    const { getOrCreateIGSession } = await import('./services/instagramService.js');
    
    console.log('🔄 [LOGIN] Iniciando sesión real en Instagram...');
    
    // Crear sesión de Instagram
    const session = await getOrCreateIGSession('a123ccc0-7ee7-45da-92dc-52059c7e21c8');
    
    // Hacer login real en Instagram
    const loginResult = await session.login({ username, password });
    
    if (loginResult.success) {
      console.log('✅ [LOGIN] Login real exitoso en Instagram para:', username);
      res.json({ 
        success: true, 
        message: 'Login real exitoso en Instagram', 
        restored: false, 
        username: username, 
        connected: true,
        sessionId: 'a123ccc0-7ee7-45da-92dc-52059c7e21c8'
      });
    } else {
      console.log('❌ [LOGIN] Error en login real de Instagram:', loginResult.error);
      res.status(401).json({ 
        success: false, 
        error: loginResult.error || 'Error en login de Instagram' 
      });
    }
  } catch (error) {
    console.error('❌ [LOGIN] Error en login de Instagram:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno en login de Instagram: ' + error.message 
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
  const { enabled, personalityId, userId } = req.body;
  
  // Usar userId del frontend o generar uno por defecto
  const actualUserId = userId || 'a123ccc0-7ee7-45da-92dc-52059c7e21c8';
  
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
      const botResult = await activateBotForUser(actualUserId, {
        username: session.username,
        password: 'Dios2025' // Usar la contraseña real
      }, personalityId || 872);
      
      if (botResult) {
        console.log('✅ [BOT] Bot activado desde frontend para usuario:', actualUserId);
        res.json({
          success: true,
          message: 'Bot activado exitosamente',
          active: true,
          personalityId: personalityId || 872,
          userId: actualUserId
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
  const { enabled, personalityId, userId } = req.body;
  
  try {
    const { activateBotForUser, deactivateBotForUser, startGlobalMonitoring, stopGlobalMonitoring } = await import('./services/instagramBotService.js');
    
    if (enabled) {
      console.log('🚀 [GLOBAL-AI] Activando IA Global...');
      
      // Usar userId del frontend o generar uno por defecto
      const actualUserId = userId || 'a123ccc0-7ee7-45da-92dc-52059c7e21c8';
      
      // Verificar si hay sesión de Instagram
      const { getOrCreateIGSession } = await import('./services/instagramService.js');
      const session = await getOrCreateIGSession(actualUserId);
      
      if (!session.logged) {
        return res.status(400).json({
          success: false,
          error: 'No hay sesión activa de Instagram. Debe hacer login primero.'
        });
      }
      
      // Activar bot con personalidad
      const botResult = await activateBotForUser(actualUserId, {
        username: session.username,
        password: 'Dios2025'
      }, personalityId || 872); // Usar personalidad por defecto del usuario actual
      
      if (botResult) {
        console.log('✅ [GLOBAL-AI] IA Global activada');
        res.json({
          success: true,
          message: 'IA Global activada exitosamente',
          active: true,
          personalityId: personalityId || 872,
          userId: actualUserId
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Error activando IA Global'
        });
      }
    } else {
      console.log('🛑 [GLOBAL-AI] Desactivando IA Global...');
      
      const actualUserId = userId || 'a123ccc0-7ee7-45da-92dc-52059c7e21c8';
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
  
  console.log(`🌍 Request from ${country}: ${req.method} ${req.path} | UA: ${userAgent.substring(0, 50)}...`);
  
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
import { configureIGIO } from './services/instagramService.js';
configureIGIO(io);

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
