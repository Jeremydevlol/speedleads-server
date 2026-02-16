import express from 'express';
import { forceValidateJwt, validateJwt } from '../config/jwt.js';
import { clearCache, debugAuth, forceLoginCheck, getUser, googleAuth, login, register, updateProfile } from '../controllers/authController.js';

const router = express.Router();

// Rutas de autenticación
router.post('/register', register);
router.post('/login', login);
router.post('/google-auth', googleAuth);

// NUEVO: Force login para usuarios con problemas de relogin (sin middleware de auth)
router.post('/force-login', forceLoginCheck);

// Limpiar caché para solucionar problemas de Service Worker (sin middleware de auth)
router.get('/clear-cache', clearCache);

// Debug de autenticación (sin middleware de auth)
router.get('/debug', debugAuth);

// Rutas protegidas
router.get('/user', validateJwt, getUser);
router.put('/user/update_profile', validateJwt, updateProfile);
router.post('/user/update_profile', validateJwt, updateProfile); // También aceptar POST por compatibilidad

// Test route con validación forzada
router.get('/user-force', forceValidateJwt, getUser);

router.get('/user', validateJwt, (req, res) => {
    // TypeScript ahora sabe que 'req.user' es un objeto de tipo 'User'
    if (req.user) {
        res.json(req.user); // Devuelve los datos del usuario
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
});

export default router;