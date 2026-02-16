// routes/dominioRoutes.js
import express from 'express';
import * as dominioController from '../controllers/dominioController.js';  // Cambiar a import

const router = express.Router();

// Ruta para crear un subdominio
// router.post('/create-subdomain', dominioController.createCnameRecord);
// router.post('/check-subdomain', dominioController.checkIfSubdomainExists);
export default router;
