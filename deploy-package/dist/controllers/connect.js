import { createExpressAccount, createOnboardingLink } from '@/services/stripeService';
import { supabase } from '@/services/supabase';

export default async function handler(req, res) {
  const { affiliate_id, email } = req.body;
  if (!affiliate_id||!email) return res.status(400).json({ message: 'falta affiliate_id o email' });

  // A) Leer existing payment_account
  const { data: pa, error: selErr } = await supabase
    .from('payment_accounts')
    .select('stripe_account_id')
    .eq('affiliate_id', affiliate_id)
    .single();
  if (selErr) return res.status(500).json({ message: selErr.message });

  let stripeAccountId = pa?.stripe_account_id;
  // B) Si no existe, crear y guardar
  if (!stripeAccountId) {
    const acct = await createExpressAccount(email);
    stripeAccountId = acct.id;
    const { error: insErr } = await supabase
      .from('payment_accounts')
      .insert({ affiliate_id, payment_method:'stripe', account_email:email, stripe_account_id:stripeAccountId });
    if (insErr) return res.status(500).json({ message: insErr.message });
  }

  // C) Generar y devolver link
  const link = await createOnboardingLink(stripeAccountId);
  res.status(200).json({ url: link.url });
}
