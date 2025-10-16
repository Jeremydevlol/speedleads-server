// routes/statisticsRoutes.js

import { Router } from 'express'
import contadorController from '../controllers/contadorController.js';

const router = Router();

// Ruta para obtener el total de usuarios
router.get('/all_users', contadorController.getTotalUsers);

// Ruta para obtener los usuarios registrados hoy
router.get('/all_users_per_day', contadorController.getUsersRegisteredToday);

export default router;
