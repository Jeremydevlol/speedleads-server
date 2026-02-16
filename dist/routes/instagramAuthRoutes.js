import express from 'express';
import { validateJwt } from '../config/jwt.js';
import { startConnect, callback, getStatus, disconnect } from '../controllers/instagramAuthController.js';

const router = express.Router();

router.get('/auth/callback', callback);
router.get('/auth/connect', validateJwt, startConnect);
router.get('/status', validateJwt, getStatus);
router.post('/disconnect', validateJwt, disconnect);

export default router;
