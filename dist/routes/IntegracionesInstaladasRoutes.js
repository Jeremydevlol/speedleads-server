import express from 'express';
import { validateJwt } from '../config/jwt.js'; // <-- AGREGADO: Importar middleware de autenticación
import { createIntegration, deleteIntegration, getInstalledIntegrations } from '../controllers/IntegracionesInstaladasController.js';

const router = express.Router();

// Aplicar autenticación a todas las rutas de integraciones
router.use(validateJwt);  // <-- AGREGADO: Middleware de autenticación

// Ruta para crear una nueva integración
router.post('/create', express.json(), createIntegration);  // Corregido
// Ruta para comprobar si una integración ya está instalada

router.post('/check-installed', getInstalledIntegrations);

router.post('/delete', express.json(), deleteIntegration);  // Nueva ruta para eliminar la integración

export default router;
