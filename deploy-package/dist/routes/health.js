import { Router } from 'express';
const router = Router();

// Health check básico
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Nuevo endpoint para diagnóstico geográfico
router.get('/geo-debug', (req, res) => {
  const headers = req.headers;
  const geo = {
    // Headers de CloudFront
    country: headers['cf-ipcountry'] || 'unknown',
    region: headers['cf-region'] || 'unknown',
    city: headers['cf-city'] || 'unknown',
    
    // Headers generales
    userAgent: headers['user-agent'] || 'unknown',
    acceptLanguage: headers['accept-language'] || 'unknown',
    acceptEncoding: headers['accept-encoding'] || 'unknown',
    
    // Headers de proxy/CDN
    xForwardedFor: headers['x-forwarded-for'] || 'unknown',
    xRealIp: headers['x-real-ip'] || 'unknown',
    
    // Headers de CloudFront específicos
    cfRay: headers['cf-ray'] || 'unknown',
    cfVisitor: headers['cf-visitor'] || 'unknown',
    cfConnectingIp: headers['cf-connecting-ip'] || 'unknown',
    
    // Información del servidor
    serverTime: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'unknown',
    cookieDomain: process.env.COOKIE_DOMAIN || 'unknown'
  };
  
  console.log('🌍 Diagnostic request from:', geo.country, '| User-Agent:', geo.userAgent?.substring(0, 100));
  
  res.json({
    status: 'OK',
    message: 'Geo diagnostic info',
    data: geo,
    allHeaders: headers
  });
});

export default router;
