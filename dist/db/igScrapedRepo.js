import supabaseAdmin from './supabase.js';

const TABLE = 'ig_scraped_followers';

export async function saveScrapedFollowers(tenantId, targetUsername, targetPk, followers) {
  if (!followers || followers.length === 0) return { saved: 0 };

  const rows = followers.map(f => ({
    tenant_id: tenantId,
    target_username: targetUsername,
    target_pk: targetPk || null,
    follower_pk: f.pk || f.id || '',
    follower_username: f.username || '',
    follower_full_name: f.full_name || '',
    is_private: f.is_private || false,
    is_verified: f.is_verified || false,
    profile_pic_url: f.profile_pic_url || null,
  }));

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(rows, {
      onConflict: 'tenant_id,target_username,follower_pk',
      ignoreDuplicates: true,
    })
    .select('id');

  if (error) {
    console.error('[igScrapedRepo] saveScrapedFollowers error:', error.message);
    return { saved: 0, error: error.message };
  }

  return { saved: data?.length || rows.length };
}

export async function getScrapedFollowers(tenantId, targetUsername, limit = 100) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('target_username', targetUsername)
    .order('scraped_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[igScrapedRepo] getScrapedFollowers error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getScrapedTargets(tenantId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('target_username, target_pk')
    .eq('tenant_id', tenantId)
    .order('scraped_at', { ascending: false });

  if (error) {
    console.error('[igScrapedRepo] getScrapedTargets error:', error.message);
    return [];
  }

  const unique = new Map();
  for (const row of data ?? []) {
    if (!unique.has(row.target_username)) {
      unique.set(row.target_username, row);
    }
  }
  return [...unique.values()];
}
