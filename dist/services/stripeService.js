// services/stripeService.js

import pkg from 'pg'
import Stripe from 'stripe'
import { getProfileByAuthUid, supabaseAdmin } from '../config/db.js'

// (Opcional) si quieres usar el pool aquí para ciertas queries a tu BD:
const { Pool } = pkg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // O la que uses: process.env.SUPABASE_DB_URL
  ssl: { rejectUnauthorized: false },
})

// 1) Instancia principal de Stripe, con tu SECRET KEY y API version
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2022-11-15',
})

/**
 * DEPRECATED: Crea una sesión de Checkout para suscripción
 * ⚠️ NO USAR EN PRODUCCIÓN - Usar Payment Links en su lugar
 * @deprecated Use Payment Links instead of backend checkout sessions
 */
export async function createCheckoutSession(customerId) {
  throw new Error('❌ DEPRECATED: createCheckoutSession no debe usarse en producción. Usa Payment Links de Stripe en su lugar.');
  
  // Código comentado para evitar uso accidental
  /*
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: {
        price_id: process.env.STRIPE_PRICE_ID,
      },
    },
    success_url: `${process.env.FRONTEND_URL}/success`,
    cancel_url: `${process.env.FRONTEND_URL}/cancel`,
  })
  return session
  */
}

/**
 * Crea un Payment Link (opcional).
 * Aquí puedes generar un link de Stripe Payment Links
 * o algo similar. Ejemplo simplificado:
 */
export async function createPaymentLink({ authUid, email }) {
  // Este ejemplo crea un PaymentLink “fijo”. Ajusta según tu modelo de negocio.
  const link = await stripe.paymentLinks.create({
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      },
    ],
  })
  // Retorna el objeto link para que el controller pueda usar link.url
  return link
}

/**
 * Ejemplo para leer un PaymentLink guardado en tu DB. 
 * Ajusta o elimina si no lo usas.
 */
export async function getPaymentLink(authUid) {
  // Si tuvieras una tabla stripe_payment_links (auth_uid, payment_link),
  // harías algo como:
  /*
  const query = 'SELECT payment_link FROM stripe_payment_links WHERE auth_uid = $1'
  const { rows } = await pool.query(query, [authUid])
  if (rows.length > 0) {
    return rows[0].payment_link
  }
  return null
  */
  // Aquí, por defecto, devolvemos null
  return null
}

/**
 * Guarda (o actualiza) un subscriptionId en tu tabla local. Ejemplo:
 */
export async function saveSubscriptionId(authUid, subscriptionId) {
  try {
    const sql = `
      INSERT INTO stripe_subscriptions (auth_uid, subscription_id)
      VALUES ($1, $2)
      ON CONFLICT (auth_uid)
      DO UPDATE SET subscription_id = EXCLUDED.subscription_id
    `
    const result = await pool.query(sql, [authUid, subscriptionId])
    console.log('Resultado INSERT/UPDATE:', result.rowCount)
  } catch (err) {
    console.error('Error guardando subscriptionId:', err)
    throw new Error('No se pudo guardar el ID de suscripción.')
  }
}

/**
 * Lista suscripciones de un usuario, basándonos en su authUid y su stripe_customer_id
 */
export async function listUserSubscriptions(authUid) {
  // 1) Buscar el perfil local
  const profile = await getProfileByAuthUid(authUid)
  if (!profile || !profile.stripe_customer_id) {
    return []
  }
  // 2) Llamar a Stripe para listar suscripciones
  const subs = await stripe.subscriptions.list({
    customer: profile.stripe_customer_id,
    status: 'all', // 'active', 'canceled', etc.
    limit: 100,
  })
  return subs.data
}
export async function createBillingPortalSession(customerId) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.FRONTEND_URL}/profile-settings`   // p.ej. "http://localhost:3000/profile-settings"
  })
}
/**
 * Ejemplo de recuperar una suscripción por ID, si lo necesitaras
 */
export async function retrieveSubscription(subscriptionId) {
  return stripe.subscriptions.retrieve(subscriptionId)
}

/**
 * Ejemplo de manejar eventos de Webhook, si tuvieras un rawBody y signature
 */
export async function handleStripeEvent(rawBody, sig) {
  const event = stripe.webhooks.constructEvent(
    rawBody,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET
  )
  return event
}

/**
 * Create or update local customer that coming from Stripe webhook
 * 
 * @param any customer 
 * @returns 
 */
async function createOrUpdateCustomer(customer) {
  // comento porque por ahora lo hace la misma BD de Supabase en un wrapper

  // // 1) Buscar el perfil local
  // const customerLocal = await getCustomerById(customer.id);
  // if (!customerLocal) {
  //   console.log(`No existe un perfil local para el customer ${customer.id} ${customer.email} ${customer.name}`);
  //   // 2) Si no existe, creamos un nuevo perfil
  //   const res = await pool.query(
  //     'INSERT INTO public.customers (id, email, name) VALUES ($1, $2, $3)',
  //     [
  //       customer.id,
  //       customer.email,
  //       customer.name || null
  //     ]
  //   );
  //   if (res.error) {
  //     console.error('Error creando perfil:', res.error);
  //     throw new Error('No se pudo crear el perfil de cliente.');
  //   }
  //   return;
  // } else {
  //   console.log(`Perfil local encontrado para el customer ${customer.id}`);
  //   // 3) Si ya existe, actualizamos sus datos
  //   const res = await pool.query(
  //     'UPDATE public.customers SET email = $1, name = $2 WHERE id = $3',
  //     [
  //       customer.email,
  //       customer.name || null,
  //       customer.id,
  //     ]
  //   );
  //   if (res.error) {
  //     console.error('Error actualizando perfil:', res.error);
  //     throw new Error('No se pudo actualizar el perfil de cliente.');
  //   }
  return;
}

/**
 * Pay to affiliate when payment is successful
 * 
 * 
 */
async function payAffiliate(subscription) {
}

export const webhookProcessor = {
  // "account.updated": {
  //   handler: async (event) => {
  //     const acct = event.data.object;
  //     if (acct.payouts_enabled) {
  //       await supabaseAdmin
  //         .from('payment_accounts')
  //         .update({ is_verified: true })
  //         .eq('stripe_account_id', acct.id);
  //     }
  //   }
  // },
  "customer.created": {
    handler: async (event) => {
      const customer = event.data.object;
      return await createOrUpdateCustomer(customer);
    }
  },
  "customer.updated": {
    handler: async (event) => {
      const customer = event.data.object;
      // Aquí podrías actualizar tu perfil local si cambió el email, etc.
      return await createOrUpdateCustomer(customer);
    }
  },

  "payment_intent.succeeded": {
    handler: async (event) => {
      const pi = event.data.object;
      const orderId = pi.metadata.order_id || pi.id;
      const { data: ref } = await supabaseAdmin
        .from('referrals')
        .update({ status: 'qualified' })
        .eq('order_id', orderId)
        .eq('status', 'pending')
        .select('id, affiliate_id')
        .single();
      if (ref) {
        const { data: pa } = await supabaseAdmin
          .from('payment_accounts')
          .select('stripe_account_id')
          .eq('affiliate_id', ref.affiliate_id)
          .single();
        const transfer = await stripe.transfers.create({
          amount: 500, currency: 'eur',
          destination: pa.stripe_account_id,
          metadata: { referralId: ref.id }
        });
        await supabaseAdmin
          .from('referrals')
          .update({ status: 'paid', stripe_transfer_id: transfer.id })
          .eq('id', ref.id);
      }
    }
  },
  // Manejo de pago exitoso vía Invoice (p.ej. Payment Link directo a Price)
  "invoice.payment_succeeded": {
    handler: async (event) => {
      const invoice = event.data.object;
      const orderId = invoice.metadata?.order_id || invoice.id;
      const { data: ref } = await supabaseAdmin
        .from('referrals')
        .update({ status: 'qualified' })
        .eq('order_id', orderId)
        .eq('status', 'pending')
        .select('id, affiliate_id')
        .single();
      if (ref) {
        const { data: pa } = await supabaseAdmin
          .from('payment_accounts')
          .select('stripe_account_id')
          .eq('affiliate_id', ref.affiliate_id)
          .single();
        const transfer = await stripe.transfers.create({
          amount: 500,
          currency: 'eur',
          destination: pa.stripe_account_id,
          metadata: { referralId: ref.id }
        });
        await supabaseAdmin
          .from('referrals')
          .update({ status: 'paid', stripe_transfer_id: transfer.id })
          .eq('id', ref.id);
      }
    }
  },
  "checkout.session.completed": {
    handler: async (event) => {
      const session = event.data.object;
      const paidEmail = session.customer_details?.email;
      if (paidEmail) {
        // Actualiza tus tablas
        await pool.query(
          `
        INSERT INTO public.profile_subscriptions (auth_uid, subscription_id, created_at, updated_at)
        SELECT auth_uid, $1, NOW(), NOW()
          FROM public.stripe_profiles
          WHERE email = $2
        ON CONFLICT (auth_uid)
        DO UPDATE SET subscription_id = EXCLUDED.subscription_id, updated_at = NOW()
        `,
          [session.subscription, paidEmail]
        );
        console.log(`✅ Suscripción activada para ${paidEmail}`);
      }
    }
  }
};

// Alias invoice.paid al mismo handler de invoice.payment_succeeded
webhookProcessor['invoice.paid'] = webhookProcessor['invoice.payment_succeeded'];