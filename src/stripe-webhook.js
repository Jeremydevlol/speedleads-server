// src/stripe-webhook.js
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

// Supabase con Service Role (escritura garantizada)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// -------- Helpers ------------------------------------------------------------

const normalize = (x) => (x || '').trim().toLowerCase();

// Evita reasignar un customer_id entre usuarios
async function upsertCustomer({ userId, customerId, email }) {
  const { error } = await supabase
    .from('billing.stripe_customers')
    .insert({ user_id: userId, customer_id: customerId, email })
    .onConflict('customer_id')
    .update({ email })
    .filter('user_id', 'eq', userId); // ⚠️ solo actualiza si es el mismo usuario

  if (error) throw new Error(`upsertCustomer: ${error.message}`);
}

function extractPriceInfo(sub) {
  const item = sub?.items?.data?.[0] || {};
  const price = item.price || item.plan || {};
  const interval =
    price?.recurring?.interval ?? price?.interval ?? null;
  const currency = price?.currency ?? null;

  let unit_amount_cents = null;
  if (typeof price?.unit_amount === 'number') unit_amount_cents = price.unit_amount;
  else if (price?.unit_amount_decimal) unit_amount_cents = Math.round(parseFloat(price.unit_amount_decimal));
  else if (typeof price?.amount === 'number') unit_amount_cents = price.amount;

  const plan_name = price?.nickname ?? (interval === 'year' ? 'Pro Anual' : 'Pro Mensual');
  const price_id = price?.id ?? null;

  return { interval, currency, unit_amount_cents, plan_name, price_id };
}

async function upsertSubscription(sub) {
  const { interval, currency, unit_amount_cents, plan_name, price_id } = extractPriceInfo(sub);

  // current_period_end: usa trial_end si faltara
  const cpeUnix = sub?.current_period_end || sub?.trial_end || null;
  const current_period_end = cpeUnix ? new Date(cpeUnix * 1000).toISOString() : null;

  const payload = {
    subscription_id: sub.id,
    customer_id: sub.customer,
    status: sub.status,
    current_period_end,
    price_id,
    interval,
    currency,
    unit_amount_cents,
    plan_name,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('billing.stripe_subscriptions')
    .insert(payload)
    .onConflict('subscription_id')
    .update(payload);

  if (error) throw new Error(`upsertSubscription: ${error.message}`);
}

async function findUserId({ clientReferenceId, email }) {
  // 1) si viene del checkout con client_reference_id => úsalo
  if (clientReferenceId) return clientReferenceId;

  // 2) fallback por email (perfiles o auth)
  let userId = null;

  // intenta en tu perfil público
  let { data: p1 } = await supabase
    .from('profilesusers')                 // <-- si tu tabla se llama distinto, ajusta aquí
    .select('user_id')
    .ilike('email', email)
    .maybeSingle();
  if (p1?.user_id) return p1.user_id;

  // como último recurso, busca en auth.users via admin (si quisieras)
  // (requiere supabase-js con admin; aquí omitimos para mantener simple)

  return userId;
}

// -------- Handler ------------------------------------------------------------

export const stripeWebhookRaw = [
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];

    // intenta validar con el secreto LIVE, si falla prueba con el de la CLI
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET_LIVE);
    } catch (e1) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET_CLI);
      } catch (e2) {
        console.error('❌ Webhook signature failed', { live: e1.message, cli: e2.message });
        return res.status(400).send('signature failed');
      }
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;

          const clientReferenceId = session?.client_reference_id || session?.metadata?.user_id || null;
          const email = normalize(session?.customer_details?.email || session?.customer_email || '');

          // resuelve userId
          const userId = await findUserId({ clientReferenceId, email });
          if (!userId) {
            console.warn('⚠️ No se pudo resolver userId en checkout.session.completed', { email, clientReferenceId });
            break; // no rompemos el webhook; solo log
          }

          const customerId = session.customer;
          await upsertCustomer({ userId, customerId, email });

          // sub puede venir vacío; recupérala si la tienes
          if (session.subscription) {
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            await upsertSubscription(sub);
          }
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object;

          // intenta resolver userId por metadata o customer.email expandido
          let userId = sub?.metadata?.user_id || null;

          if (!userId) {
            // opcional: puedes hacer expand si no llegó
            // const subFull = await stripe.subscriptions.retrieve(sub.id, { expand: ['customer'] });
            // const email = normalize(subFull?.customer?.email);
            // const maybeUser = await findUserId({ email });
            // userId = maybeUser || null;
          }

          if (sub.customer && userId) {
            // asegura mapeo (no reasignar)
            // email opcional si lo conoces
            await upsertCustomer({ userId, customerId: sub.customer, email: null });
          }

          // guarda/actualiza suscripción
          await upsertSubscription(sub);
          break;
        }

        case 'invoice.paid': {
          // opcional: garantizar que la sub está al día
          const inv = event.data.object;
          if (inv.subscription) {
            const sub = await stripe.subscriptions.retrieve(inv.subscription);
            await upsertSubscription(sub);
          }
          break;
        }

        default:
          // otros eventos: no acción
          break;
      }

      return res.status(200).send('[OK]');
    } catch (err) {
      console.error('❌ Webhook error handler:', err);
      // responde 200 para que Stripe no reintente infinitamente si fue un fallo de datos no críticos
      return res.status(200).send('[OK]');
    }
  }
];