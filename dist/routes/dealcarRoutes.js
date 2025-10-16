import express from 'express';
import { getDealcarStock, saveDealcarConfig } from '../controllers/dealcarController.js';
import { validateJwt } from '../config/jwt.js';

const router = express.Router();

// Ruta para guardar la configuración de DealCar
router.post('/save_config',validateJwt, saveDealcarConfig);
router.post('/getCoches',validateJwt, getDealcarStock);
export default router;