// middleware/domainSecurity.js

export const domainSecurityMiddleware = (req, res, next) => {
  // BYPASS webhook de Stripe
  const p = req.path || req.originalUrl || '';
  if (p === '/api/stripe/webhook' || p.startsWith('/api/stripe/webhook')) {
    return next();
  }

  const host = req.get('host');
  
  // Lista de dominios permitidos del sistema
  const allowedSystemDomains = [
    'uniclick.io',
    'app.uniclick.io',
    'api.uniclick.io',
    'auth.uniclick.io',
    'localhost:5001'
  ];
  
  // Verificar si es un subdominio de cliente
  if (host && host.includes('.uniclick.io') && !allowedSystemDomains.includes(host)) {
    // Es un subdominio de cliente
    req.isClientSubdomain = true;
    req.clientDomain = host.split('.')[0];
    
    console.log(`🏢 Cliente detectado: ${req.clientDomain} (${host})`);
  } else if (host && (host.includes('uniclick.io') || host.includes('localhost'))) {
    // Es un dominio del sistema
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
    '/api/instagram/diagnostic',  // <-- Endpoint de diagnóstico de Instagram
    '/api/instagram/search',      // <-- Endpoint de búsqueda de usuarios
    '/api/instagram/followers',   // <-- Endpoint de seguidores
    '/api/instagram/bot/active-bots', // <-- Endpoint de bots activos
  ]);

  // Rutas POST públicas (no requieren token)
  const PUBLIC_POST_PATHS = new Set([
    '/api/instagram/login',  // <-- Login de Instagram sin autenticación
    '/api/instagram/bot/activate',  // <-- Activación del bot sin autenticación
    '/api/instagram/send-message',  // <-- Envío de mensajes sin autenticación
    '/api/instagram/find-and-send',  // <-- Búsqueda y envío sin autenticación
    '/api/instagram/bulk-send-followers',  // <-- Envío masivo a seguidores sin autenticación
    '/api/instagram/import-leads',  // <-- Importación de leads sin autenticación
    '/api/instagram/bulk-send-list',  // <-- Envío masivo desde lista sin autenticación
    '/api/instagram/bot/update-personality',  // <-- Actualización de personalidad sin autenticación
    '/api/instagram/comments-send-ai',  // <-- Envío automático a comentaristas sin autenticación
  ]);

  // Rutas públicas con patrones (regex)
  const PUBLIC_PATH_PATTERNS = [
    /^\/api\/websites\/public\//,           // /api/websites/public/:username/:slug
    /^\/api\/websites\/public-by-slug\//,   // /api/websites/public-by-slug/:slug
    /^\/api\/websites\/find-username-by-slug/, // /api/websites/find-username-by-slug
    /^\/api\/websites\/custom-domain/,      // /api/websites/custom-domain
    /^\/api\/websites\/video\//,            // /api/websites/video/* (streaming público)
    /^\/api\/websites\/connection\//,       // /api/websites/connection/detect
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

  // 2.1) Permitir POST público en rutas allowlist
  if (method === 'POST' && PUBLIC_POST_PATHS.has(path)) {
    console.log(`✅ Ruta POST pública permitida: ${path}`);
    return next();
  }

  // 2.5) Permitir GET público en rutas con patrones
  if (method === 'GET' && PUBLIC_PATH_PATTERNS.some(pattern => pattern.test(path))) {
    console.log(`✅ Ruta pública permitida: ${path}`);
    return next();
  }

  // 3) Para otras rutas API, continuar con validación de token normal
  if (path.startsWith('/api/')) {
    return next();
  }

  // 4) Para rutas no-API, continuar con lógica de redirección
  return next();
};

// NUEVO: Middleware para redirección automática a app.uniclick.io
export const centralizeAuthMiddleware = async (req, res, next) => {
  // BYPASS webhook de Stripe
  const p = req.path || req.originalUrl || '';
  if (p === '/api/stripe/webhook' || p.startsWith('/api/stripe/webhook')) {
    return next();
  }

  const host = req.get('host');
  const path = req.path;
  
  // Solo actuar en subdominios que no sean del sistema
  if (!host || !host.includes('.uniclick.io') || host === 'app.uniclick.io' || host === 'api.uniclick.io' || host === 'auth.uniclick.io') {
    return next();
  }
  
  // Rutas sensibles que SIEMPRE deben ir a app.uniclick.io
  const sensitiveRoutes = [
    '/login', 
    '/dashboard', 
    '/account', 
    '/settings', 
    '/conversations', 
    '/personalities',
    '/profile',
    '/admin',
    '/billing',
    '/subscription'
  ];
  
  const isSensitiveRoute = sensitiveRoutes.some(route => path.startsWith(route));
  
  if (isSensitiveRoute) {
    const redirectUrl = `https://app.uniclick.io${path}`;
    console.log(`🔄 Redirección automática a app.uniclick.io: ${host}${path} -> ${redirectUrl}`);
    return res.redirect(302, redirectUrl);
  }
  
  // Para rutas de API, permitir que continúen (pueden ser necesarias para webchats, etc.)
  if (path.startsWith('/api/')) {
    return next();
  }
  
  // Para otras rutas, verificar si es una ruta de website (no de autenticación)
  // Si no es una ruta de website, redirigir a app.uniclick.io
  const isWebsiteRoute = path === '/' || path.startsWith('/website') || path.startsWith('/page');
  
  if (!isWebsiteRoute) {
    const redirectUrl = `https://app.uniclick.io${path}`;
    console.log(`🔄 Redirección de ruta no reconocida a app.uniclick.io: ${host}${path} -> ${redirectUrl}`);
    return res.redirect(302, redirectUrl);
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
  
  // Log eliminado para evitar spam
  
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
    
    // ✅ SOLO procesar si viene de domains.uniclick.io (evita ruido en desarrollo)
    if (host !== 'domains.uniclick.io') {
      return next();
    }
    
    const forwardedHost = req.get('x-forwarded-host');
    const originalHost = req.get('x-original-host');
    const cloudflareHost = req.get('cf-connecting-ip');
    
    // Logging detallado SOLO cuando es relevante
    console.log(`🔍 Custom Domain Debug:
      Host: ${host}
      X-Forwarded-Host: ${forwardedHost}
      X-Original-Host: ${originalHost}
      CF-Connecting-IP: ${cloudflareHost}
      User-Agent: ${req.get('user-agent')?.substring(0, 50)}...`);
    
    // Determinar el dominio original
    const targetHost = originalHost || forwardedHost || host;
    
    // Si es el mismo que domains.uniclick.io, no es un dominio personalizado
    if (targetHost === 'domains.uniclick.io') {
      console.log('🔄 Petición directa a domains.uniclick.io - no es dominio personalizado');
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