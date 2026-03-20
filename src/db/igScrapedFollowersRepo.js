/**
 * Repositorio para seguidores de Instagram scrapeados.
 * La sesión Private API lee de aquí en lugar de llamar getFollowers.
 */
import { supabaseAdmin } from './supabase.js';

export async function saveFollowers(userId, targetUsername, followers) {
  if (!followers?.length) return { inserted: 0 };
  let inserted = 0;
  for (const f of followers) {
    const username = f.username || f.follower_username;
    if (!username) continue;
    const { error } = await supabaseAdmin
      .from('ig_scraped_followers')
      .upsert(
        {
          user_id: userId,
          target_username: targetUsername,
          follower_username: username,
          follower_pk: f.pk || f.follower_pk || null,
          full_name: f.full_name || null,
          profile_pic_url: f.profile_pic_url || null
        },
        { onConflict: 'user_id,target_username,follower_username' }
      );
    if (!error) inserted++;
  }
  return { inserted, total: followers.length };
}

export async function getFollowersFromDb(userId, targetUsername, limit = 100) {
  const { data, error } = await supabaseAdmin
    .from('ig_scraped_followers')
    .select('follower_username, follower_pk, full_name, profile_pic_url')
    .eq('user_id', userId)
    .eq('target_username', targetUsername)
    .order('scraped_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data || []).map(r => ({
    username: r.follower_username,
    pk: r.follower_pk,
    full_name: r.full_name || '',
    profile_pic_url: r.profile_pic_url
  }));
}

export async function hasCachedFollowers(userId, targetUsername, maxAgeHours = 24) {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('ig_scraped_followers')
    .select('follower_username')
    .eq('user_id', userId)
    .eq('target_username', targetUsername)
    .gte('scraped_at', cutoff)
    .limit(1);

  return !error && data && data.length > 0;
}
