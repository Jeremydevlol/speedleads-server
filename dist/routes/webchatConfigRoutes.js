import express from 'express';
import { validateJwt } from '../config/jwt.js';
import { getWebchatConfig, postChatResponse } from '../controllers/webchatConfig.js';

const router = express.Router();

router.get('/:projectId', getWebchatConfig);
router.post('/chat-response', express.json(), postChatResponse);

export default router;
