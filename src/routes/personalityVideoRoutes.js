import express from 'express';
import { 
  validateVideoUrl, 
  getVideoInfo, 
  validateVideoUrlsMiddleware 
} from '../controllers/personalityControllerExtended.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Middleware de autenticación para todas las rutas
router.use(authenticateToken);

/**
 * POST /api/personalities/validate-video-url
 * Valida si una URL de video es soportada
 * Body: { url: string }
 */
router.post('/validate-video-url', validateVideoUrl);

/**
 * POST /api/personalities/video-info
 * Obtiene información de una URL de video sin descargarla
 * Body: { url: string }
 */
router.post('/video-info', getVideoInfo);

/**
 * Middleware para validar URLs de video en requests
 * Se puede usar en otras rutas que manejen media
 */
router.use('/instructions', validateVideoUrlsMiddleware);

export default router;
