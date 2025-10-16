import { stripe } from '@/services/stripeService';
import { supabase } from '@/services/supabase';

export default async function handler(req, res) {
  const affiliate_id = req.query.affiliate_id;
  if (!affiliate_id) return res.status(400).json({ message:'affiliate_id requerido' });

  const { data: pa, error } = await supabase
    .from('payment_accounts')
    .select('stripe_account_id')
    .eq('affiliate_id', affiliate_id)
    .single();
  if (error||!pa) return res.status(404).json({ message:'no encontrada' });

  const account = await stripe.accounts.retrieve(pa.stripe_account_id);
  res.status(200).json({ payouts_enabled: account.payouts_enabled });
}
