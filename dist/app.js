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

// =============================================
// CONFIGURACIÓN DE VARIABLES DE ENTORNO
// =============================================
const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env');
try {
  const envConfig = dotenv.config({ path: envPath });
  if (envConfig.error) {
    throw new Error(`Error al cargar .env: ${envConfig.error.message}`);
  }
  console.log(`✅ Archivo .env cargado desde: ${envPath}`);
} catch (error) {
  process.exit(1);
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
    console.error('\n❌ ERROR: Variables de entorno faltantes:');
    console.error(missingVars.map(v => `  - ${v}`).join('\n'));
    if (ENV_CONFIG.NODE_ENV === 'production') {
      console.error('🚨 No se puede iniciar en producción sin estas variables');
      process.exit(1);
    }
    console.warn('⚠️  Iniciando en modo desarrollo con funcionalidad limitada\n');
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
    console.log('\x1b[31m%s\x1b[0m', '\n❌ Error de conexión a DB:');
    console.error('   ▸', err.message);
    process.exit(1);
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
