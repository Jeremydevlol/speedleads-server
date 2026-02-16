// routes/stripeRoutes.js - LEGACY (deprecated, usar billing.ts en su lugar)
import express from 'express'
import { validateJwt } from '../config/jwt.js'
import * as ctrl from '../controllers/stripeController.js'

const router = express.Router()

/**
 * LEGACY: Crea una sesión de Stripe Checkout (suscripción)
 * POST /api/stripe-legacy/create-checkout-session
 * Body: { authUid }
 * @deprecated Usar /api/billing en su lugar
 */
router.post(
  '/create-checkout-session-legacy',
  validateJwt,
  ctrl.createCheckout
)

/**
 * LEGACY: Crea un Payment Link (opcional)
 * POST /api/stripe-legacy/create-payment-link
 * Body: { authUid, email }
 * @deprecated Usar /api/billing en su lugar
 */
router.post(
  '/create-payment-link-legacy',
  validateJwt,
  ctrl.createPaymentLinkController
)

/**
 * LEGACY: Crea una sesión para el Stripe Billing Portal
 * POST /api/stripe-legacy/create-portal-session
 * Body: {}
 * @deprecated Usar /api/billing/portal en su lugar
 */
router.post(
  '/create-portal-session-legacy',
  validateJwt,
  ctrl.createPortalSession
)

/**
 * LEGACY: Cancela la suscripción activa del usuario
 * POST /api/stripe-legacy/cancel-subscription
 * Body: {}
 * @deprecated Usar /api/billing/portal en su lugar
 */
router.post(
  '/cancel-subscription-legacy',
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