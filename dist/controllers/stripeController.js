// controllers/stripeController.js

import {
  createBillingPortalSession,
  createCheckoutSession,
  createPaymentLink,
  getPaymentLink,
  stripe
} from '../services/stripeService.js';

import pool, {
  getCustomerByEmail,
  getProfileByAuthUid,
  supabaseAdmin,
  upsertProfile
} from '../config/db.js';

/**
 * POST /api/stripe/create-checkout-session
 */
export async function createCheckout(req, res) {
  const { authUid } = req.body;
  if (!authUid) {
    return res.status(400).json({ error: 'authUid es obligatorio' });
  }

  // 1) Ver si ya hay un PaymentLink guardado
  try {
    const existing = await getPaymentLink(authUid);
    if (existing) {
      return res.json({ url: existing });
    }
  } catch (err) {
    console.error('Error revisando payment link:', err);
    // Continuamos, quizás crearemos uno nuevo
  }

  // 2) Recuperar (o crear) el perfil en DB
  const profile = await getProfileByAuthUid(authUid);
  if (!profile) {
    return res.status(400).json({ error: 'Perfil no encontrado' });
  }
  // Verifica que al menos tenga un email
  if (!profile.email) {
    return res.status(400).json({ error: 'Este perfil no tiene email válido' });
  }

  // 3) Verificar o crear Customer en Stripe (con su email)
  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    // Aún no existe el customer, así que lo creamos con su email
    const customer = await stripe.customers.create({
      email: profile.email,          // <-- asocia su email
      metadata: { authUid }
    });
    customerId = customer.id;
    // guardamos en la DB
    await upsertProfile(authUid, { stripe_customer_id: customerId });
  } else {
    // Si ya existía, opcionalmente actualizar su email en Stripe (p.ej. si cambió)
    await stripe.customers.update(customerId, {
      email: profile.email
    });
  }

  // 4) Crear sesión de Checkout
  try {
    const session = await createCheckoutSession(customerId);
    const subscriptionId = session.subscription; // Puede ser null si la PRICE no es de tipo "recurring"

    // 5) Guardar en tu tabla local "checkout"
    await pool.query(
      `
      INSERT INTO public.checkout (customer, subscription)
      VALUES ($1, $2)
      ON CONFLICT (customer)
      DO UPDATE SET subscription = EXCLUDED.subscription
      `,
      [profile.email, subscriptionId]
    );

    return res.json({
      id: session.id,
      subscriptionId
    });
  } catch (err) {
    console.error('Error creando checkout:', err);
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
}
/**
 * POST /api/stripe/create-payment-link
 */
export async function createPaymentLinkController(req, res) {
  const { authUid, email } = req.body;
  if (!authUid || !email) {
    return res.status(400).json({ error: 'Faltan authUid o email' });
  }

  try {
    const link = await createPaymentLink({ authUid, email });
    return res.json({ url: link.url, email });
  } catch (err) {
    console.error('Error creando payment link:', err);
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
}

/**
 * POST /api/stripe/create-portal-session
 */
export async function createPortalSession(req, res) {
  // Validar JWT y extraer email
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  const {
    data: { user },
    error: errUser,
  } = await supabaseAdmin.auth.getUser(token);

  if (errUser || !user?.email) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  // Leer tu tabla foreign “customers”
  const cust = await getCustomerByEmail(user.email);
  if (!cust?.id) {
    return res.status(400).json({ error: 'No hay suscripción activa' });
  }

  // Crear sesión de Customer Portal
  try {
    const portalSession = await createBillingPortalSession(cust.id);
    return res.json({ url: portalSession.url });
  } catch (err) {
    console.error('Error creando portal session:', err);
    return res
      .status(500)
      .json({ error: 'Error interno al abrir portal' });
  }
}

/**
 * POST /api/stripe/cancel-subscription
 */
export async function cancelSubscription(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Validar JWT
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  const {
    data: { user },
    error: userErr,
  } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !user?.id) {
    return res.status(401).json({ error: 'Usuario no válido' });
  }

  // Recuperar stripe_customer_id desde tu tabla de perfiles
  const profile = await getProfileByAuthUid(user.id);
  if (!profile?.stripe_customer_id) {
    return res
      .status(400)
      .json({ error: 'No existe customer asociado al usuario' });
  }

  try {
    // Listar suscripciones activas
    const { data: subs } = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'active',
      limit: 1,
    });
    if (!subs.length) {
      return res
        .status(400)
        .json({ error: 'No hay suscripción activa' });
    }

    // Cancelar en Stripe
    await stripe.subscriptions.del(subs[0].id);

    // Limpiar tablas locales
    await pool.query(
      'DELETE FROM public.checkout WHERE subscription = $1',
      [subs[0].id]
    );
    await pool.query(
      'DELETE FROM public.profile_subscriptions WHERE subscription_id = $1',
      [subs[0].id]
    );

    // (Opcional) Desvincular customer del perfil
    await pool.query(
      'UPDATE public.stripe_profiles SET stripe_customer_id = NULL WHERE auth_uid = $1',
      [user.id]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('Error en cancelSubscription:', err);
    return res
      .status(500)
      .json({ error: err.message || 'Error interno del servidor' });
  }
}