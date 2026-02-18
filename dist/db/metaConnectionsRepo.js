/**
 * Repositorio para meta_connections (onboarding / conexión por tenant).
 * Supabase con service role.
 */
import { supabaseAdmin } from './supabase.js';

/**
 * Obtiene la conexión Meta activa para un tenant (por tenant_id).
 * @param {string} tenantId
 * @returns {Promise<{ tenant_id, ig_business_id, access_token, auto_reply_enabled, status } | null>}
 */
export async function getConnectionByTenantId(tenantId) {
  if (!tenantId) return null;
  const { data, error } = await supabaseAdmin
    .from('meta_connections')
    .select('tenant_id, ig_business_id, access_token, auto_reply_enabled, status, estado')
    .eq('tenant_id', String(tenantId))
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[metaConnectionsRepo] getConnectionByTenantId error:', error.message);
    return null;
  }
  const active = data?.status === 'active' || data?.estado === 'active';
  if (data && (data.status !== undefined || data.estado !== undefined) && !active) return null;
  return data ?? null;
}

/**
 * Obtiene la conexión por tenant_id sin filtrar por status (para actualizar).
 * @param {string} tenantId
 */
export async function getConnectionByTenantIdAnyStatus(tenantId) {
  if (!tenantId) return null;
  const { data, error } = await supabaseAdmin
    .from('meta_connections')
    .select('tenant_id, ig_business_id, access_token, auto_reply_enabled, status, estado')
    .eq('tenant_id', String(tenantId))
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[metaConnectionsRepo] getConnectionByTenantIdAnyStatus error:', error.message);
    return null;
  }
  return data ?? null;
}

/**
 * Upsert de meta_connections por (tenant_id, ig_business_id).
 * @param {object} p - { tenant_id, ig_business_id, access_token, status?, auto_reply_enabled? }
 */
export async function upsertConnection(p) {
  const {
    tenant_id,
    ig_business_id,
    access_token,
    status = 'active',
    auto_reply_enabled = false
  } = p;
  const now = new Date().toISOString();
  const row = {
    tenant_id,
    ig_business_id,
    access_token,
    status,
    auto_reply_enabled: !!auto_reply_enabled,
    updated_at: now
  };
  const { error } = await supabaseAdmin
    .from('meta_connections')
    .upsert(row, {
      onConflict: 'tenant_id,ig_business_id',
      ignoreDuplicates: false
    });
  if (error) {
    console.error('[metaConnectionsRepo] upsertConnection error:', error.message);
    throw error;
  }
  return row;
}

/**
 * Actualiza auto_reply_enabled para el tenant (y su ig_business_id activo).
 * @param {string} tenantId
 * @param {boolean} enabled
 */
export async function updateAutoReply(tenantId, enabled) {
  if (!tenantId) throw new Error('tenant_id required');
  const conn = await getConnectionByTenantIdAnyStatus(tenantId);
  if (!conn || !conn.ig_business_id) {
    throw new Error('No meta connection found for tenant');
  }
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('meta_connections')
    .update({ auto_reply_enabled: !!enabled, updated_at: now })
    .eq('tenant_id', tenantId)
    .eq('ig_business_id', conn.ig_business_id);
  if (error) {
    console.error('[metaConnectionsRepo] updateAutoReply error:', error.message);
    throw error;
  }
  return { ...conn, auto_reply_enabled: !!enabled };
}
