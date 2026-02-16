import { supabase } from '@/services/supabase';

export default async function handler(req, res) {
  if (req.method!=='POST') return res.status(405).end();
  const { affiliate_id, company_id, order_id } = req.body;
  const { error } = await supabase
    .from('referrals')
    .insert({ affiliate_id, company_id, order_id });
  if (error) return res.status(500).json({ message:error.message });
  res.status(200).json({ success:true });
}
