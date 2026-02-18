/**
 * Repositorio Meta (Instagram) – Supabase con service role.
 * meta_connections, meta_conversations, meta_messages.
 */
import { supabaseAdmin } from './supabase.js';

/**
 * Busca la conexión Meta por ig_business_id (Page ID / recipient.id).
 * Fallback: intentar por entry.id si se pasa como segundo argumento.
 * @param {string} igBusinessId - recipient.id o entry.id del webhook
 * @returns {Promise<{ tenant_id: string, ig_business_id: string, access_token: string, auto_reply_enabled: boolean } | null>}
 */
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

/**
 * Upsert de conversación por (tenant_id, ig_business_id, sender_id).
 * @param {object} p - { tenant_id, ig_business_id, sender_id, last_message?, last_message_at? }
 */
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
      {
        onConflict: 'tenant_id,ig_business_id,sender_id',
        ignoreDuplicates: false
      }
    );
  if (error) {
    console.error('[metaRepo] upsertConversation error:', error.message);
    throw error;
  }
}

/**
 * Inserta un mensaje. Anti-duplicados: si ya existe (tenant_id, ig_business_id, sender_id, mid) no inserta.
 * @param {object} p - { tenant_id, ig_business_id, sender_id, direction: 'in'|'out', mid?, text?, raw? }
 * @returns {Promise<{ inserted: boolean, id?: string }>}
 */
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
    if (existing) {
      return { inserted: false };
    }
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

/** List conversations for a tenant (for frontend Instagram channel). */
export async function getConversationsByTenantId(tenantId) {
  if (!tenantId) return [];
  const { data, error } = await supabaseAdmin
    .from('meta_conversations')
    .select('ig_business_id, sender_id, last_message, last_message_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false });
  if (error) {
    console.error('[metaRepo] getConversationsByTenantId error:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Últimos N mensajes de la conversación para contexto IA (orden desc, limit).
 * @param {object} p - { tenant_id, ig_business_id, sender_id, limit?: number }
 * @returns {Promise<Array<{ direction, text, mid, raw, created_at }>>}
 */
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
