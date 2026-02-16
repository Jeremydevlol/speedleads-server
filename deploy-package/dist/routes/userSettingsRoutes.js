// routes/userSettingsRoutes.js
import { Router } from 'express';
import { validateJwt } from '../config/jwt.js';
import {
    getUserSettings,
    setDefaultPersonality,
    setGlobalAI
} from '../controllers/userSettingsController.js';

const router = Router();

// GET  /api/user_settings
router.get(
  '/user_settings',
  validateJwt,
  getUserSettings
);

// PATCH /api/user_settings/global_ai
router.patch(
  '/user_settings/global_ai',
  validateJwt,
  setGlobalAI
);

// PATCH /api/user_settings/default_personality
router.patch(
  '/user_settings/default_personality',
  validateJwt,
  setDefaultPersonality
);

export default router;
