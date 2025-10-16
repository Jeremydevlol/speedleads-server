import express from 'express';
import { validateJwt } from '../config/jwt.js';
import {
    configureDomain,
    generateSSL,
    getDomainStatus,
    getUserDomains,
    verifyDomain
} from '../controllers/customDomainsController.js';

const router = express.Router();

// All custom domain routes require authentication
router.use(validateJwt);

// DNS Configuration Routes
router.post('/dns/configure', configureDomain);
router.post('/dns/verify', verifyDomain);
router.get('/dns/status/:domain', getDomainStatus);
router.get('/dns/domains', getUserDomains);

// SSL Management Routes  
router.post('/ssl/generate', generateSSL);

export default router; 