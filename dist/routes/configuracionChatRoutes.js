import express from 'express';  // Usar import en lugar de require
 import { crearConfiguracion, obtenerConfiguracionPorUsuario } from '../controllers/configuracionChatController.js';  // Importar con ES6
 import { validateJwt } from '../config/jwt.js';
 
 const router = express.Router();
 
 router.post('/saveConfiguration',validateJwt, crearConfiguracion);
 router.get('/userConfiguration',validateJwt, obtenerConfiguracionPorUsuario);
 
 export default router;  // Exportar el router como 'default'