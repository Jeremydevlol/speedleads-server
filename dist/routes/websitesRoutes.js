import express from 'express';
import multer from 'multer';
import { validateJwt } from '../config/jwt.js';
import {
    batchPreloadVideos,
    checkSlugAvailability,
    createWebsite,
    deleteWebsite,
    detectConnection,
    findUsernameBySlug,
    getPublicWebsiteBySlug,
    getPublicWebsiteBySlugOnly,
    getStorageStats,
    getVideoVersions,
    getWebsiteByCustomDomain,
    getWebsiteById,
    listWebsites,
    preloadVideo,
    publishWebsite,
    streamVideo,
    translateAllUserWebsites,
    translateExistingWebsite,
    unpublishWebsite,
    updateWebsite,
    uploadVideo
} from '../controllers/websitesController.js';

const router = express.Router();

// Test endpoint para verificar que las rutas funcionan
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Website routes working!', 
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /',
      'POST /',
      'GET /:id',
      'PUT /:id', 
      'DELETE /:id',
      'POST /upload-video'
    ]
  });
});

// Configure multer for video uploads
const storage = multer.memoryStorage();
const videoUpload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 1024 // 1GB max (1024MB)
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'video/mp4',
            'video/webm',
            'video/quicktime',
            'video/avi',
            'video/mov'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
        }
    }
});

// List user websites
router.get('/', validateJwt, listWebsites);

// Create new website
router.post('/', validateJwt, createWebsite);

// Check slug availability
router.get('/check-slug/:slug', validateJwt, checkSlugAvailability);

// Upload video with compression
router.post('/upload-video', validateJwt, videoUpload.single('video'), uploadVideo);

// TikTok-style video streaming endpoints
router.get('/video/stream/:videoId', streamVideo);
router.get('/video/preload/:videoId', preloadVideo);
router.get('/video/versions/:videoId', getVideoVersions);
router.post('/video/batch-preload', batchPreloadVideos); // 🚀 New batch preload endpoint
router.get('/connection/detect', detectConnection);

// Get storage statistics
router.get('/storage/stats', validateJwt, getStorageStats);

// Bulk translate all user websites
router.post('/translate-all', validateJwt, translateAllUserWebsites);

// Public retrieval by slug (no auth needed)
router.get('/public/:username/:slug', getPublicWebsiteBySlug);

// NUEVO: Public retrieval by slug only (no username required)
router.get('/public-by-slug/:slug', getPublicWebsiteBySlugOnly);

// Find username by slug (no auth needed)
router.get('/find-username-by-slug', findUsernameBySlug);

// Ruta pública para servir websites via custom domain (sin autenticación)
router.get('/custom-domain', getWebsiteByCustomDomain);

// Get specific website for editing
router.get('/:id', validateJwt, getWebsiteById);

// Update existing website
router.put('/:id', validateJwt, updateWebsite);

// Delete website
router.delete('/:id', validateJwt, deleteWebsite);

// Translate existing website
router.post('/:id/translate', validateJwt, translateExistingWebsite);

// Publish website
router.post('/:id/publish', validateJwt, publishWebsite);

// Unpublish website
router.post('/:id/unpublish', validateJwt, unpublishWebsite);

export default router;