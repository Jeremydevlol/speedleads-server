import express from 'express';
import multer from 'multer';
import {
    generateAiText,
    generateMenuFromImage,
    generateSectionsWithIcons,
    translateContent,
} from '../controllers/aiController.js';

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const router = express.Router();

router.post('/gen-text', generateAiText);
router.post('/gen-sections', generateSectionsWithIcons);
router.post('/gen-menu-from-image', upload.single('menuImage'), generateMenuFromImage);
router.post('/translate', translateContent);

export default router;