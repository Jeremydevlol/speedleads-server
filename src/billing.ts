// src/billing.ts
import { createClient } from '@supabase/supabase-js';
import bodyParser from 'body-parser';
import express, { Request, Response } from 'express';
import Stripe from 'stripe';

const router = express.Router();

// --- Stripe y Supabase ---
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ---------- Helpers ----------
async function linkUserToStripeCustomer(userId: string, stripeCustomerId: string, email?: string | null) {
  await supabase
    .from('billing.billing_customers')
    .upsert(
      { user_id: userId, email: email ?? null, stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
}

async function upsertSubscriptionFromStripe(sub: Stripe.Subscription, userId: string) {
  const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id!;
  const priceId = sub.items.data[0]?.price?.id ?? null;

  // plan_id por price_id
  let planId: string | null = null;
  if (priceId) {
    const { data: plan } = await supabase
      .from('billing.billing_plans')
      .select('id')
      .eq('stripe_price_id', priceId)
      .maybeSingle();
    planId = plan?.id ?? null;
  }

  // customer interno
  const { data: existing } = await supabase
    .from('billing.billing_customers')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  let billingCustomerId = existing?.id ?? null;
  if (!billingCustomerId) {
    const { data: inserted } = await supabase
      .from('billing.billing_customers')
      .insert({
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .maybeSingle();
    billingCustomerId = inserted?.id ?? null;
  }
  if (!billingCustomerId) return;

  const payload = {
    user_id: userId,
    customer_id: billingCustomerId,
    plan_id: planId,
    stripe_subscription_id: sub.id,
    status: sub.status as any,
    current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
    current_period_end:   sub.current_period_end   ? new Date(sub.current_period_end   * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    trial_end:   sub.trial_end   ? new Date(sub.trial_end   * 1000).toISOString() : null,
    updated_at: new Date().toISOString()
  };

  await supabase.from('billing.billing_subscriptions').upsert(payload, { onConflict: 'customer_id' });
}

async function recordInvoiceFromStripe(inv: Stripe.Invoice) {
  const stripeCustomerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
  if (!stripeCustomerId) return;

  const { data: c } = await supabase
    .from('billing.billing_customers')
    .select('id,user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();
  if (!c) return;

  const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id;
  let internalSubId: string | null = null;
  if (subId) {
    const { data: s } = await supabase
      .from('billing.billing_subscriptions')
      .select('id')
      .eq('stripe_subscription_id', subId)
      .maybeSingle();
    internalSubId = s?.id ?? null;
  }

  await supabase.from('billing.billing_invoices').upsert(
    {
      user_id: c.user_id,
      customer_id: c.id,
      subscription_id: internalSubId,
      stripe_invoice_id: inv.id,
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      invoice_pdf: inv.invoice_pdf ?? null,
      status: inv.status ?? null,
      currency: inv.currency ?? null,
      amount_due_cents: inv.amount_due ?? null,
      amount_paid_cents: inv.amount_paid ?? null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'stripe_invoice_id' }
  );
}

// ---------- Webhook (RAW body) ----------
const webhookHandler = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('❌ Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // En producción, ignora eventos de modo test (por si llegan por error)
  if (process.env.APP_ENV === 'production' && !event.livemode) {
    return res.json({ received: true });
  }

  // Idempotencia
  const { data: exists } = await supabase
    .from('billing.billing_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();
  if (exists) return res.json({ received: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || null;
        const stripeCustomerId =
          typeof session.customer === 'string' ? session.customer : session.customer?.id;

        if (userId && stripeCustomerId) {
          await linkUserToStripeCustomer(userId, stripeCustomerId, session.customer_details?.email ?? null);
        }

        if (session.mode === 'subscription' && session.subscription && userId) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string,
            { expand: ['items.data.price'] }
          );
          await upsertSubscriptionFromStripe(sub, userId);

          // Guardar plink_... en el plan, si vino en la Session y aún no está
          const priceId = sub.items.data[0]?.price?.id;
          const plinkId = typeof session.payment_link === 'string' ? session.payment_link : null;
          if (priceId && plinkId) {
            await supabase
              .from('billing.billing_plans')
              .update({ stripe_payment_link_id: plinkId, updated_at: new Date().toISOString() })
              .eq('stripe_price_id', priceId)
              .is('stripe_payment_link_id', null);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

        const { data: c } = await supabase
          .from('billing.billing_customers')
          .select('user_id')
          .eq('stripe_customer_id', stripeCustomerId!)
          .maybeSingle();

        const userId = c?.user_id;
        if (userId) {
          await upsertSubscriptionFromStripe(sub, userId);
        }
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        await recordInvoiceFromStripe(inv);
        break;
      }
    }
  } catch (err) {
    console.error('❌ Error handling event', event.type, err);
  } finally {
    await supabase.from('billing.billing_events').insert({
      stripe_event_id: event.id,
      type: event.type,
      payload: event as any
    });
  }

  res.json({ received: true });
};

// ---------- Portal del Cliente ----------
router.post('/portal', express.json(), async (req: Request, res: Response) => {
  try {
    const { userId, returnUrl } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId requerido' });

    const { data: existing } = await supabase
      .from('billing.billing_customers')
      .select('stripe_customer_id, email')
      .eq('user_id', userId)
      .maybeSingle();

    let stripeCustomerId = existing?.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: existing?.email ?? undefined,
        metadata: { user_id: userId }
      });
      stripeCustomerId = customer.id;
      await linkUserToStripeCustomer(userId, stripeCustomerId, existing?.email ?? null);
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId!,
      return_url: returnUrl || `${process.env.FRONTEND_URL}/account`
    });

    res.json({ url: portal.url });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- Opcional: estado de mi suscripción ----------
router.get('/me', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });

  const { data, error } = await supabase
    .from('billing.my_subscription')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ subscription: data });
});

// ---------- Exportaciones ----------
export const stripeWebhookRaw = [
  bodyParser.raw({ type: 'application/json' }),
  webhookHandler
] as const;

export default router;




