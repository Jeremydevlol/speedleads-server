import express from 'express'
import { getAccountStatus } from '../controllers/affiliateController.js'

const router = express.Router()

// GET /status/:authUid
router.get('/:authUid', getAccountStatus)

export default router
