import express from 'express'
import { createConnectAccount } from '../controllers/affiliateController.js'

const router = express.Router()

// POST /connect
router.post('/', createConnectAccount)

export default router
