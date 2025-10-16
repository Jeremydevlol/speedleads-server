import express from 'express'
import {
  handleCreateConnectAccount,
  handleGetConnectStatus,
  registerReferral, // si existe
} from '../controllers/affiliateController.js'

const router = express.Router()

router.post('/connect', handleCreateConnectAccount)
router.get('/status/:authUid', handleGetConnectStatus)
router.post('/referral', registerReferral)

export default router
