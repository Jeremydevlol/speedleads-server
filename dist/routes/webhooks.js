import express from 'express'
import { stripeHandler } from '../controllers/webhook.js'
const router = express.Router()

// IMPORTANTE: usar raw body parser aquí para validar firma de Stripe
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  stripeHandler
)

export default router
