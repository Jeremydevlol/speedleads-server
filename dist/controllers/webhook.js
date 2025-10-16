import { handleStripeEvent, webhookProcessor } from '../services/stripeService.js';
export const config = { api: { bodyParser: false } };

/**
 * POST /webhook/stripe
 */
export async function stripeHandler(req, res) {
  let event;
  try {
    event = await handleStripeEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('Error en firma de webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (!webhookProcessor[event.type]) {
    // console.warn(`Evento no manejado: ${event.type}`);
    return res.status(404).send(`Evento no manejado: ${event.type}`);
  }

  try {
    await webhookProcessor[event.type].handler(event);
    return res.json({ received: true });
  } catch (err) {
    console.error(`Error procesando evento ${event.type}:`, err);
    return res.status(500).send(`Error procesando evento: ${err.message}`);
  }
}
