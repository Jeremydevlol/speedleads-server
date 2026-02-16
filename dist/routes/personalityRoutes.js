import { Router } from 'express';
import multer from 'multer';
import { validateJwt } from '../config/jwt.js';
import personalityController from '../controllers/personalityController.js';
const router = Router();
 // Para manejar archivos subidos por el usuario



// Configurar multer para manejar la carga de archivos
const storage = multer.memoryStorage(); // Almacenamiento en memoria
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Limitar el tamaño del archivo a 10MB
  });
  

// Ruta para transcribir audio
router.post('/transcribe-audio',validateJwt, upload.single('audio'), personalityController.transcribeAudio);

// Rutas para personalidades "normales"
router.get('/all', validateJwt, personalityController.getAllPersonalities);
router.post('/create_personality', validateJwt, personalityController.createPersonality);
router.post('/edit_personality', validateJwt, personalityController.editPersonality);
router.post('/instructions', validateJwt, personalityController.sendInstruction);
router.post('/test-context', validateJwt, personalityController.testPersonalityContext);
router.get('/getbyid/:id', validateJwt, personalityController.getPersonalityById);
router.post('/delete/:id', validateJwt, personalityController.deletePersonalityById);
router.post('/get_personalities_instructions',validateJwt,personalityController.getPersonalityInstructions)
router.post('/update_personality_instruction',validateJwt,personalityController.updatePersonalityInstruction)
router.post('/delete_personality_instruction',validateJwt,personalityController.deletePersonalityInstruction)
router.post('/reprocess_instructions',validateJwt,personalityController.reprocessPersonalityInstructions)


// Ruta para obtener el saludo por ID
router.get('/:id/saludo', validateJwt, personalityController.getSaludoById);

// ---- NUEVAS RUTAS PARA PERSONALIDAD GLOBAL ----
router.post('/set_global', validateJwt, personalityController.setGlobalPersonality);
router.get('/get_global', validateJwt, personalityController.getGlobalPersonality);

// ---- RUTA DE DIAGNÓSTICO DEL SISTEMA ----
router.get('/system-diagnostic', validateJwt, personalityController.systemDiagnostic);

// ---- RUTA DE DEPURACIÓN PARA PROBLEMA DE TIPOS ----
router.get('/debug-userid-type', validateJwt, personalityController.debugUserIdType);

// ---- RUTAS PARA SOPORTE DE URLs DE VIDEO ----
router.post('/validate-video-url', validateJwt, personalityController.validateVideoUrl);
router.post('/video-info', validateJwt, personalityController.getVideoInfo);

export default router;
