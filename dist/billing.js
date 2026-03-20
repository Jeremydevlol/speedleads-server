// src/billing.js - Sistema de Billing con Webhook Stripe
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import Stripe from 'stripe';

const router = express.Router();

// --------- Supabase client con service role
const supabaseService = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// --------- Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

// --------- Helpers

// util: asegura que el customer existe en stripe_customers (sin tocar user_id aún)
async function ensureCustomerRow(customerId, emailMaybe) {
  let email = (emailMaybe || '').trim();
  if (!email) {
    try {
      const c = await stripe.customers.retrieve(customerId);
      email = (c?.email || '').trim();
    } catch {
      // no romper si no hay email todavía
    }
  }

  // Upsert SOLO por customer_id (sin tocar user_id aún)
  const { data, error } = await supabaseService
    .schema('billing')
    .from('stripe_customers')
    .upsert(
      { customer_id: customerId, email: email || null, updated_at: new Date().toISOString() },
      { onConflict: 'customer_id' }
    )
    .select();

  if (error) {
    console.error('❌ ensureCustomerRow error:', error);
    throw error;
  }
  console.log('✅ ensureCustomerRow ok:', data);
  return data;
}

// util: enlaza un user_id al customer actual (libera el user_id de otro customer si estaba ocupado)
async function linkUserToCustomer(userId, customerId, email) {
  // 1) Si existe OTRA fila con este user_id, liberarla primero
  const { data: existingByUser } = await supabaseService
    .schema('billing')
    .from('stripe_customers')
    .select('customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingByUser && existingByUser.customer_id !== customerId) {
    console.log('🔄 Liberando user_id de customer anterior:', existingByUser.customer_id);
    await supabaseService
      .schema('billing')
      .from('stripe_customers')
      .update({ user_id: null })
      .eq('user_id', userId);
  }

  // 2) Enlazar el user_id al customer actual (ya sin conflictos)
  const { data, error } = await supabaseService
    .schema('billing')
    .from('stripe_customers')
    .update({ user_id: userId, email: email || null, updated_at: new Date().toISOString() })
    .eq('customer_id', customerId)
    .select();

  if (error) {
    console.error('❌ linkUserToCustomer error:', error);
    throw error;
  }
  console.log('✅ linkUserToCustomer ok:', data);
  return data;
}

// util: saca info del precio desde objetos variables de Stripe
function extractPriceInfo(subscription) {
  try {
    const item = subscription?.items?.data?.[0] || {};
    const price = item?.price || item?.plan || {};
    const interval = price?.recurring?.interval ?? price?.interval ?? null;
    const currency = price?.currency ?? null;
    let unit_amount_cents = null;
    if (typeof price?.unit_amount === 'number') unit_amount_cents = price.unit_amount;
    else if (price?.unit_amount_decimal) unit_amount_cents = Math.round(parseFloat(price.unit_amount_decimal));
    else if (typeof price?.amount === 'number') unit_amount_cents = price.amount;
    const plan_name = price?.nickname ?? null;
    const price_id = price?.id ?? null;
    return { interval, currency, unit_amount_cents, plan_name, price_id };
  } catch (e) {
    return { interval: null, currency: null, unit_amount_cents: null, plan_name: null, price_id: null };
  }
}

async function upsertCustomer({ user_id, customer_id, email }) {
  if (!user_id || !customer_id) return;

  const payload = { user_id, customer_id };
  if (typeof email !== 'undefined') payload.email = email; // no mandes null
  payload.updated_at = new Date().toISOString();

  // Conflicto por user_id para mantener relación 1:1 usuario<->customer
  const { data, error } = await supabaseService
    .schema('billing')
    .from('stripe_customers')
    .upsert(payload, { onConflict: 'user_id' })
    .select();

  if (error) {
    console.error('❌ upsertCustomer error:', error);
    throw error;
  }
  console.log('✅ upsertCustomer ok:', data);
  return data;
}

async function upsertSubscriptionFromStripe(sub) {
  if (!sub?.id || !sub?.customer) return;

  const item = sub?.items?.data?.[0] || {};
  const price = item?.price || item?.plan || {};

  // info base
  const interval = price?.recurring?.interval ?? price?.interval ?? null;
  const currency = price?.currency ?? null;
  let unit_amount_cents = null;
  if (typeof price?.unit_amount === 'number') unit_amount_cents = price.unit_amount;
  else if (price?.unit_amount_decimal) unit_amount_cents = Math.round(parseFloat(price.unit_amount_decimal));
  else if (typeof price?.amount === 'number') unit_amount_cents = price.amount;

  // plan_name con fallback
  let plan_name = price?.nickname ?? null;
  if (!plan_name && price?.product) {
    try {
      const prod = await stripe.products.retrieve(price.product);
      plan_name = prod?.name ?? null;
    } catch {}
  }

  const current_period_end = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

  const { data, error } = await supabaseService
    .schema('billing')
    .from('stripe_subscriptions')
    .upsert({
      subscription_id: sub.id,
      customer_id: String(sub.customer),
      status: sub.status || null,
      current_period_end,
      price_id: price?.id ?? null,
      interval,
      currency,
      unit_amount_cents,
      plan_name,
      updated_at: new Date().toISOString()
    }, { onConflict: 'subscription_id' })
    .select();

  if (error) {
    console.error('❌ upsertSubscriptionFromStripe error:', error);
    throw error;
  }
  console.log('✅ upsertSubscription ok:', data);
  return data;
}

async function getUserIdByCustomerId(customer_id) {
  const { data } = await supabaseService
    .schema('billing')
    .from('stripe_customers')
    .select('user_id')
    .eq('customer_id', customer_id)
    .maybeSingle();

  return data?.user_id ?? null;
}

// --------- HANDLER WEBHOOK
export const stripeWebhookRaw = [
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    let event;
    const sig = req.headers['stripe-signature'];

    try {
      // 1) intenta con LIVE (endpoint del Dashboard)
      if (!process.env.STRIPE_WEBHOOK_SECRET_LIVE) throw new Error('LIVE whsec missing');
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET_LIVE);
    } catch (e1) {
      try {
        // 2) fallback al de la CLI (stripe listen)
        if (!process.env.STRIPE_WEBHOOK_SECRET_CLI) throw e1;
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET_CLI);
      } catch (e2) {
        console.error('❌ Webhook signature failed', { live: e1.message, cli: e2.message });
        return res.status(400).send('signature failed');
      }
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const s = event.data.object;
          const customerId = s.customer;
          let email = s.customer_details?.email || s.customer_email || null;
          let userId = s.client_reference_id || null;

          console.log('🛒 checkout.session.completed:', { sessionId: s.id, userId, customerId, email });

          // Fallback por email si no hay client_reference_id
          if (!userId && email) {
            const { data: profile } = await supabaseService
              .from('profilesusers')
              .select('id')
              .eq('email', email)
              .maybeSingle();

            userId = profile?.id || null;
            console.log('🔍 Fallback por email:', { email, foundUserId: userId });
          }

          // 1) Siempre asegurar que exista la fila del customer (sin user_id)
          await ensureCustomerRow(customerId, email || undefined);

          // 2) Si conocemos el usuario, enlazarlo al customer actual
          if (userId) {
            await linkUserToCustomer(userId, customerId, email);
          }

          // 3) Si la session trae subscription, la upserteas
          if (s.subscription) {
            const sub = await stripe.subscriptions.retrieve(s.subscription, {
              expand: ['items.data.price']
            });
            await upsertSubscriptionFromStripe(sub);
          }
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

          // Asegura fila del customer
          await ensureCustomerRow(customerId);

          // Si puedes extraer userId por tu lógica, enlázalo aquí también (opcional)
          // await linkUserToCustomer(userId, customerId);

          // Recupera la suscripción completa con expand (solo para created/updated)
          if (event.type !== 'customer.subscription.deleted') {
            const full = await stripe.subscriptions.retrieve(sub.id, {
              expand: ['items.data.price'],
            });
            await upsertSubscriptionFromStripe(full);
          } else {
            await upsertSubscriptionFromStripe(sub);
          }
          break;
        }
        case 'invoice.paid':
        case 'invoice.payment_succeeded': {
          // opcional: no hacemos nada de BBDD, ya lo cubre subscription.updated
          break;
        }
        case 'customer.created': {
          // Puede venir sin email → no forzar user_id aquí
          const cust = event.data.object;
          await ensureCustomerRow(cust.id, cust.email || undefined);
          break;
        }
        default:
          // ignora el resto
          break;
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(`❌ Error processing ${event.type}:`, err);
      return res.status(500).json({ error: 'internal_error' });
    }
  }
];

// --------- ENDPOINT LECTURA /api/billing/me (usando REST)
export async function billingMeHandler(req, res) {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId requerido' });

  const { data, error } = await supabaseService
    .from('billing_my_subscription') // VISTA publica
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('❌ Error consultando billing_my_subscription:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
  return res.json({ ok: true, subscription: data || null });
}

// --------- RUTAS EXISTENTES

// ---------- Portal del Cliente ----------
router.post('/portal', express.json(), async (req, res) => {
  try {
    const { userId, returnUrl } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId requerido' });

    const { data: customerData } = await supabaseService
      .schema('billing')
      .from('stripe_customers')
      .select('customer_id, email')
      .eq('user_id', userId)
      .maybeSingle();

    let stripeCustomerId = customerData?.customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: customerData?.email ?? undefined,
        metadata: { user_id: userId }
      });
      stripeCustomerId = customer.id;
      
      // Guardar nuevo customer
      const { data: upsertData, error: upsertError } = await supabaseService
        .schema('billing')
        .from('stripe_customers')
        .upsert(
          { user_id: userId, customer_id: stripeCustomerId, email: customerData?.email ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'customer_id' }
        )
        .select();

      if (upsertError) {
        console.error('❌ /portal upsert customer error:', upsertError);
        throw upsertError;
      }
      console.log('✅ /portal upsert customer ok:', upsertData);
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl || `${process.env.FRONTEND_URL}/account`
    });

    res.json({ url: portal.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- Obtener planes disponibles (público) ----------
// ✅ /api/billing/plans: compat snake/camel + sin fallbacks /test-*
// OPTIMIZADO: Cache en memoria + headers de cache para respuesta instantánea
const PLANS_CACHE = (() => {
  const makePlan = (id, name, amount, linkEnv) => {
    const link = (linkEnv ?? '').trim() || null;
    return {
      id,
      name,
      amount_cents: amount,
      amountCents: amount,
      interval: 'month',
      currency: 'eur',
      payment_link: link,
      paymentLink: link,
    };
  };

  return [
    makePlan('pro_30',  'Pro Mensual 30',  3000,  process.env.STRIPE_LINK_PRO_MONTHLY),
    makePlan('pro_100', 'Pro Mensual 100', 10000, process.env.STRIPE_LINK_PRO_ANNUAL),
    makePlan('pro_200', 'Pro Mensual 200', 20000, process.env.STRIPE_PAYMENT_LINK_PLUS),
  ].filter(p => !!p.payment_link);
})();

router.get('/plans', (req, res) => {
  const startTime = Date.now();
  
  // Headers de cache agresivo (5 minutos)
  res.set({
    'Cache-Control': 'public, max-age=300, s-maxage=300',
    'Content-Type': 'application/json',
    'X-Response-Time': '0ms' // Se actualizará al final
  });

  const response = { ok: true, plans: PLANS_CACHE };
  const responseTime = Date.now() - startTime;
  
  res.set('X-Response-Time', `${responseTime}ms`);
  console.log(`✅ /api/billing/plans responded in ${responseTime}ms`);
  
  res.json(response);
});

// ---------- Estado de mi suscripción (usando vista pública con Supabase REST) ----------
router.get('/me', async (req, res) => {
  const userId = String(req.query.userId || '');
  if (!userId) return res.status(400).json({ ok: false, error: 'userId requerido' });

  try {
    const { data, error } = await supabaseService
      .from('billing_my_subscription')    // vista en schema public
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('❌ Error consultando billing_my_subscription:', error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    // API más "amigable" para el frontend
    if (data) {
      const isTrialing = data.status === 'trialing';
      const isActive   = data.status === 'active';
      const renewsAt   = data.current_period_end ? new Date(data.current_period_end) : null;

      return res.json({
        ok: true,
        subscription: {
          ...data,
          isTrialing,
          isActive,
          renewsAt,
          priceHuman: data.unit_amount_cents != null ? (data.unit_amount_cents / 100).toFixed(2) : null
        }
      });
    }
    
    return res.json({ ok: true, subscription: null });
  } catch (e) {
    console.error('❌ Error inesperado /me:', e);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

// ---------- Crear sesión de Checkout (reutilizando customer existente) ----------
router.post('/checkout', express.json(), async (req, res) => {
  try {
    const { price_id } = req.body;
    const user = req.user; // id, email desde tu middleware

    if (!price_id) {
      return res.status(400).json({ ok: false, error: 'price_id is required' });
    }

    // Buscar customer existente por user_id
    const { data: existing } = await supabaseService
      .schema('billing')
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user?.id)
      .limit(1)
      .maybeSingle();

    // Crear sesión de Checkout reutilizando customer si existe
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/profile-settings?success=1`,
      cancel_url: `${process.env.FRONTEND_URL}/profile-settings?canceled=1`,
      line_items: [{ price: price_id, quantity: 1 }],
      allow_promotion_codes: true,
      customer: existing?.customer_id ?? undefined, // <- ¡reutiliza si existe!
      customer_email: user?.email,               // fallback si no existe customer
      client_reference_id: user?.id,             // mapea userId ↔ customer
      automatic_tax: { enabled: true },
      metadata: { user_id: user?.id || '' }
    });

    console.log('✅ Checkout session created:', { 
      sessionId: session.id, 
      customerId: existing?.customer_id || 'new customer will be created',
      userId: user?.id,
      priceId: price_id,
      userEmail: user?.email
    });

    res.json({ ok: true, url: session.url });
  } catch (error) {
    console.error('❌ Error creating checkout session:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------- Exportaciones ----------
export default router;