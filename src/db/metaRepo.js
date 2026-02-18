/**
 * Repositorio Meta (Instagram) – Supabase con service role.
 * meta_connections, meta_conversations, meta_messages.
 */
import { supabaseAdmin } from './supabase.js';

export async function getConnectionByIgId(igBusinessId) {
  if (!igBusinessId) return null;
  const { data, error } = await supabaseAdmin
    .from('meta_connections')
    .select('tenant_id, ig_business_id, access_token, auto_reply_enabled, status, estado')
    .eq('ig_business_id', String(igBusinessId))
    .maybeSingle();
  if (error) {
    console.error('[metaRepo] getConnectionByIgId error:', error.message);
    return null;
  }
  const active = data?.status === 'active' || data?.estado === 'active';
  if (data && (data.status !== undefined || data.estado !== undefined) && !active) return null;
  return data ?? null;
}

export async function upsertConversation(p) {
  const { tenant_id, ig_business_id, sender_id, last_message, last_message_at } = p;
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('meta_conversations')
    .upsert(
      {
        tenant_id,
        ig_business_id,
        sender_id,
        last_message: last_message ?? null,
        last_message_at: last_message_at ?? now,
        updated_at: now
      },
      { onConflict: 'tenant_id,ig_business_id,sender_id', ignoreDuplicates: false }
    );
  if (error) {
    console.error('[metaRepo] upsertConversation error:', error.message);
    throw error;
  }
}

export async function insertMessage(p) {
  const { tenant_id, ig_business_id, sender_id, direction, mid, text, raw } = p;
  if (direction === 'in' && mid) {
    const { data: existing } = await supabaseAdmin
      .from('meta_messages')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('ig_business_id', ig_business_id)
      .eq('sender_id', sender_id)
      .eq('mid', mid)
      .limit(1)
      .maybeSingle();
    if (existing) return { inserted: false };
  }
  const { data, error } = await supabaseAdmin
    .from('meta_messages')
    .insert({
      tenant_id,
      ig_business_id,
      sender_id,
      direction,
      mid: mid ?? null,
      text: text ?? null,
      raw: raw ?? null
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return { inserted: false };
    console.error('[metaRepo] insertMessage error:', error.message);
    throw error;
  }
  return { inserted: true, id: data?.id };
}

export async function getRecentMessages(p) {
  const { tenant_id, ig_business_id, sender_id, limit = 20 } = p;
  const { data, error } = await supabaseAdmin
    .from('meta_messages')
    .select('direction, text, mid, raw, created_at')
    .eq('tenant_id', tenant_id)
    .eq('ig_business_id', ig_business_id)
    .eq('sender_id', sender_id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[metaRepo] getRecentMessages error:', error.message);
    return [];
  }
  return (data || []).reverse();
}
