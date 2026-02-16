// routes/testRoutes.js
import { Router } from 'express';
import { validateJwt } from '../config/jwt.js';
import { getUserIdFromToken } from '../controllers/authController.js';

const router = Router();

// Ruta para testing de cookies entre subdominios
router.get('/cookie-test', (req, res) => {
  const host = req.get('host');
  const cookies = req.cookies;
  const sessionData = req.session;
  
  return res.json({
    message: '🧪 Test de cookies entre subdominios',
    host: host,
    cookies: cookies,
    session: {
      id: req.sessionID,
      data: sessionData
    },
    headers: {
      origin: req.get('origin'),
      referer: req.get('referer'),
      userAgent: req.get('user-agent')
    },
    isClientSubdomain: req.isClientSubdomain,
    clientDomain: req.clientDomain,
    isSystemDomain: req.isSystemDomain
  });
});

// Ruta para testing de autenticación
router.get('/auth-test', validateJwt, (req, res) => {
  const userId = getUserIdFromToken(req);
  const host = req.get('host');
  
  return res.json({
    message: '🔐 Test de autenticación entre subdominios',
    host: host,
    userId: userId,
    tokenSource: req.cookies.auth_token ? 'cookie' : 'header',
    isClientSubdomain: req.isClientSubdomain,
    clientDomain: req.clientDomain,
    success: true
  });
});

// Ruta para simular login (solo para testing)
router.post('/test-login', (req, res) => {
  const { email = 'test@uniclick.io' } = req.body;
  const host = req.get('host');
  
  // Simular datos de usuario
  const testUser = {
    id: 'test-user-123',
    email: email,
    username: 'testuser',
    role: 'user'
  };
  
  // Configurar cookie del token para compartir entre subdominios
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    domain: process.env.NODE_ENV === 'development' ? undefined : (process.env.COOKIE_DOMAIN || '.uniclick.io'),
    path: '/'
  };

  // Simular token (en producción usarías JWT real)
  const testToken = 'test-token-' + Date.now();
  
  res.cookie('auth_token', testToken, cookieOptions);
  res.cookie('user_id', testUser.id, cookieOptions);
  
  // Guardar en sesión también
  req.session.userId = testUser.id;
  req.session.email = testUser.email;
  
  return res.json({
    message: '✅ Login de testing exitoso',
    host: host,
    user: testUser,
    token: testToken,
    cookiesSet: {
      auth_token: testToken,
      user_id: testUser.id,
      domain: cookieOptions.domain
    },
    instructions: {
      next: `Ahora ve a otro subdominio y haz GET a /api/test/cookie-test`,
      example: `http://ariel.uniclick.io:5001/api/test/cookie-test`
    }
  });
});

export default router; 