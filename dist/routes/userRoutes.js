import express from 'express';
import { validateJwt } from '../config/jwt.js';
import {
    checkUploadLimits,
    getAllPlans,
    getUserPlan,
    getUserUsageStats
} from '../controllers/userController.js';

const router = express.Router();

// Get user's current plan with limits and features
router.get('/plan', validateJwt, getUserPlan);

// Get all available plans (for upgrade UI)
router.get('/plans', getAllPlans);

// Check if user can upload video with current plan
router.post('/check-upload-limits', validateJwt, checkUploadLimits);

// Get user's current usage statistics
router.get('/usage', validateJwt, getUserUsageStats);

export default router; 