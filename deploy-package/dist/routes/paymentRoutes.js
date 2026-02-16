// dist/routes/paymentRoutes.js
import { Router } from 'express';
import { validateJwt } from '../config/jwt.js';
import { checkUserPaid } from '../controllers/paymentController.js';
const router = Router();

// GET /api/payment/status
router.get('/status',validateJwt, checkUserPaid);

export default router;