// src/services/affiliateService.js
import { stripe } from '../services/stripeService.js';

export const createStripeAccountLink = async (authUid, email) => {
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    metadata: { authUid }
  });

  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.FRONTEND_URL}/stripe-error`,
    return_url: `${process.env.FRONTEND_URL}/stripe-success`,
    type: 'account_onboarding',
  });

  return link.url;
};

export const getStripeAccountStatus = async (authUid) => {
  const accounts = await stripe.accounts.list({ limit: 100 });
  const found = accounts.data.find(acc => acc.metadata?.authUid === authUid);
  if (!found) throw new Error('Cuenta no encontrada');
  return found;
};
