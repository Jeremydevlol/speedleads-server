// middleware/domainSecurity.js

export const domainSecurityMiddleware = (req, res, next) => {
  // BYPASS webhook de Stripe
  const p = req.path || req.originalUrl || '';
  if (p === '/api/stripe/webhook' || p.startsWith('/api/stripe/webhook')) {
    return next();
  }

  const host = req.get('host');
  
  const allowedSystemDomains = [
    'speedleads.io',
    'app.speedleads.io',
    'api.speedleads.io',
    'auth.speedleads.io',
    'speedleads.app',
    'www.speedleads.app',
    'localhost:5001'
  ];

  if (host && host.includes('.speedleads.io') && !allowedSystemDomains.includes(host)) {
    req.isClientSubdomain = true;
    req.clientDomain = host.split('.')[0];
    console.log(`🏢 Cliente detectado: ${req.clientDomain} (${host})`);
  } else if (host && (host.includes('speedleads.io') || host.includes('speedleads.app') || host.includes('localhost'))) {
    req.isSystemDomain = true;
    console.log(`🔧 Dominio del sistema: ${host}`);
  }
  
  // Headers de seguridad para cookies
  res.header('Access-Control-Allow-Credentials', 'true');
  
  next();
};

// NUEVO: Middleware para manejar rutas públicas y silenciar ruido
export const authMiddleware = async (req, res, next) => {
  const path = req.path || req.originalUrl || '';
  const method = req.method || 'GET';

  // 🚨 BYPASS CRÍTICO: Webhook de Stripe debe pasar sin validación
  if (path === '/api/stripe/webhook') return next();

  // Rutas GET públicas (no requieren token)
  const PUBLIC_GET_PATHS = new Set([
    '/api/billing/plans',   // <-- NECESARIO para que el front pinte los planes
    '/api/health', '/health', '/status', '/ping',
    '/api/instagram/auth/callback',   // OAuth callback Facebook/Meta
    '/api/instagram/graph/callback', // OAuth callback Graph API
    '/auth/meta/callback',            // OAuth callback Meta (Facebook/Instagram) — sin JWT
  ]);

  // Rutas públicas con patrones (regex)
  const PUBLIC_PATH_PATTERNS = [
    /^\/api\/websites\/public\//,           // /api/websites/public/:username/:slug
    /^\/api\/websites\/public-by-slug\//,   // /api/websites/public-by-slug/:slug
    /^\/api\/websites\/find-username-by-slug/, // /api/websites/find-username-by-slug
    /^\/api\/websites\/custom-domain/,      // /api/websites/custom-domain
    /^\/api\/websites\/video\//,            // /api/websites/video/* (streaming público)
    /^\/api\/websites\/connection\//,       // /api/websites/connection/detect
    /^\/api\/instagram\/brightdata\//,      // Bright Data scrapers (sin login)
    /^\/api\/brightdata\//,                 // Bright Data alternativo
  ];

  // Rutas ruidosas a silenciar (IPFS/extensiones)
  const NOISY_PREFIXES = ['/api/v0/swarm'];

  // 1) Silenciar ruido: 404 sin log
  if (NOISY_PREFIXES.some(p => path.startsWith(p))) {
    return res.status(404).end();
  }

  // 2) Permitir GET público en rutas allowlist
  if (method === 'GET' && PUBLIC_GET_PATHS.has(path)) {
    return next();
  }

  // 2.5) Permitir GET público en rutas con patrones
  if (method === 'GET' && PUBLIC_PATH_PATTERNS.some(pattern => pattern.test(path))) {
    console.log(`✅ Ruta pública permitida: ${path}`);
    return next();
  }

  // 2.6) Bright Data scrapers: sin auth (GET y POST)
  if (path.startsWith('/api/instagram/brightdata/') || path.startsWith('/api/brightdata/')) {
    return next();
  }

  // 3) Para otras rutas API, continuar con validación de token normal
  if (path.startsWith('/api/')) {
    return next();
  }

  // 4) Para rutas no-API, continuar con lógica de redirección
  return next();
};

// Redirección automática a app SpeedLeads (www.speedleads.app / app.speedleads.io)
const APP_REDIRECT_BASE = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.speedleads.app';

export const centralizeAuthMiddleware = async (req, res, next) => {
  const p = req.path || req.originalUrl || '';
  if (p === '/api/stripe/webhook' || p.startsWith('/api/stripe/webhook')) return next();

  const host = req.get('host');
  const path = req.path;

  if (!host || (!host.includes('.speedleads.io') && !host.includes('.speedleads.app')) || host === 'app.speedleads.io' || host === 'api.speedleads.io' || host === 'auth.speedleads.io' || host === 'www.speedleads.app' || host === 'speedleads.app') {
    return next();
  }

  const sensitiveRoutes = ['/login', '/dashboard', '/account', '/settings', '/conversations', '/personalities', '/profile', '/admin', '/billing', '/subscription'];
  if (sensitiveRoutes.some(route => path.startsWith(route))) {
    const redirectUrl = `${APP_REDIRECT_BASE}${path}`;
    return res.redirect(302, redirectUrl);
  }
  if (path.startsWith('/api/')) return next();

  const isWebsiteRoute = path === '/' || path.startsWith('/website') || path.startsWith('/page');
  if (!isWebsiteRoute) {
    return res.redirect(302, `${APP_REDIRECT_BASE}${path}`);
  }
  next();
};

// Middleware para evitar cache en rutas de autenticación
export const noCacheMiddleware = (req, res, next) => {
  // BYPASS webhook de Stripe
  const p = req.path || req.originalUrl || '';
  if (p === '/api/stripe/webhook' || p.startsWith('/api/stripe/webhook')) {
    return next();
  }

  if (req.path.startsWith('/api/auth') || 
      req.path.startsWith('/api/user') || 
      req.path.startsWith('/api/login') ||
      req.path.startsWith('/api/sessions')) {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }
  next();
};

// Nuevo middleware para asegurar content-type correcto
export const contentTypeMiddleware = (req, res, next) => {
  // BYPASS webhook de Stripe
  const p = req.path || req.originalUrl || '';
  if (p === '/api/stripe/webhook' || p.startsWith('/api/stripe/webhook')) {
    return next();
  }

  const userAgent = req.get('user-agent') || '';
  const acceptLanguage = req.get('accept-language') || '';
  const country = req.get('cf-ipcountry') || req.get('x-forwarded-for') || '';
  
  // Log específico para debugging geográfico
  console.log(`🌍 Request desde: ${country} | User-Agent: ${userAgent.substring(0, 50)}...`);
  
  // Asegurar headers correctos para archivos estáticos
  if (req.path.endsWith('.js')) {
    res.set('Content-Type', 'application/javascript; charset=utf-8');
  } else if (req.path.endsWith('.css')) {
    res.set('Content-Type', 'text/css; charset=utf-8');
  } else if (req.path.endsWith('.html')) {
    res.set('Content-Type', 'text/html; charset=utf-8');
  }
  
  // Headers adicionales para prevenir problemas de encoding
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  
  next();
}; 

// NUEVO: Middleware para routing de dominios personalizados
export const customDomainRoutingMiddleware = async (req, res, next) => {
  // BYPASS webhook de Stripe
  const p = req.path || req.originalUrl || '';
  if (p === '/api/stripe/webhook' || p.startsWith('/api/stripe/webhook')) {
    return next();
  }

  try {
    const host = req.get('host');
    
    if (host !== 'domains.speedleads.io') {
      return next();
    }

    const forwardedHost = req.get('x-forwarded-host');
    const originalHost = req.get('x-original-host');
    const targetHost = originalHost || forwardedHost || host;

    if (targetHost === 'domains.speedleads.io') {
      return next();
    }
    
    // Buscar si el dominio original está en custom_domains
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { data: customDomain, error } = await supabase
      .from('custom_domains')
      .select(`
        *,
        websites (
          id,
          business_name,
          slug,
          user_id,
          is_published
        )
      `)
      .eq('domain', targetHost)
      .eq('status', 'active')
      .single();
    
    if (error || !customDomain) {
      console.log(`🌐 Dominio personalizado no encontrado: ${targetHost} (Error: ${error?.message || 'No data'})`);
      return next();
    }
    
    if (!customDomain.websites || !customDomain.websites.is_published) {
      console.log(`🚫 Website no publicado para dominio: ${targetHost}`);
      return res.status(404).json({ 
        error: 'Website no disponible' 
      });
    }
    
    // Agregar información del dominio personalizado al request
    req.isCustomDomain = true;
    req.customDomain = customDomain;
    req.website = customDomain.websites;
    req.originalHost = targetHost;
    
    console.log(`🎯 Dominio personalizado detectado: ${targetHost} → Website: ${customDomain.websites.business_name} (${customDomain.websites.slug})`);
    
    next();
    
  } catch (error) {
    console.error('⚠️ Error en customDomainRoutingMiddleware:', error);
    next();
  }
}; 