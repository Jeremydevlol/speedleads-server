import express from 'express';
import { validateJwt } from '../config/jwt.js';
import {getAllWebchatSessions} from '../controllers/webchatChatsController.js';
import {getWebchatMessagesBySession} from '../controllers/webchatChatsController.js';
const router = express.Router();

router.get('/all', getAllWebchatSessions);
router.get('/', getWebchatMessagesBySession);

export default router;

