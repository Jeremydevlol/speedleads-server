import express from 'express';
import { validateJwt } from '../config/jwt.js';
import { sendFeedback,upload } from '../controllers/feedbackController.js';
const router = express.Router();


// Ruta para enviar el feedback con archivos
router.post('/feedback', upload.array('files', 5), sendFeedback); // 'files' es el nombre del campo de archivo


export default router;