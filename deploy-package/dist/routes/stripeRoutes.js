// routes/stripeRoutes.js
import express from 'express'
import { validateJwt } from '../config/jwt.js'
import * as ctrl from '../controllers/stripeController.js'

const router = express.Router()

/**
 * Crea una sesión de Stripe Checkout (suscripción)
 * POST /api/stripe/create-checkout-session
 * Body: { authUid }
 */
router.post(
  '/create-checkout-session',
  validateJwt,
  ctrl.createCheckout
)

/**
 * Crea un Payment Link (opcional)
 * POST /api/stripe/create-payment-link
 * Body: { authUid, email }
 */
router.post(
  '/create-payment-link',
  validateJwt,
  ctrl.createPaymentLinkController
)

/**
 * Crea una sesión para el Stripe Billing Portal
 * POST /api/stripe/create-portal-session
 * Body: {}
 */
router.post(
  '/create-portal-session',
  validateJwt,
  ctrl.createPortalSession
)

/**
 * Cancela la suscripción activa del usuario
 * POST /api/stripe/cancel-subscription
 * Body: {}
 */
router.post(
  '/cancel-subscription',
  validateJwt,
  ctrl.cancelSubscription
)

/**
 * Webhook de Stripe
 * POST /api/stripe/webhook
 * Content-Type: application/json (raw)
 */
// router.post(
//   '/webhook',
//   express.raw({ type: 'application/json' }),
//   ctrl.webhookHandler
// )

export default router