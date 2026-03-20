/**
 * Prueba flujo completo: Bright Data + OpenAI + Sesión
 *
 * - Like + comentar en post + DM por cada lead
 * - Siempre envía la cantidad solicitada: si 403, busca otro
 * - Devuelve la publicación en la que se comentó/dio like
 *
 * Uso: node scripts/test-fusion-full.js [target] [cantidad]
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const IG_USERNAME = 'nfnn404';
const IG_PASSWORD = process.env.IG_TEST_PASSWORD || 'Dios2090.';
const TARGET = process.argv[2] || 'uniclick.io';
const TARGET_DMS = parseInt(process.argv[3]) || 3;
const BD_RETRIES = 3;
const BATCH_SIZE = 15;
const DELAY_BETWEEN_DMS = 15000;
const DELAY_BETWEEN_ACTIONS = 5000;

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Obtener URL del post/reel desde Bright Data */
function getPostUrl(media, username) {
  if (media?.url) return media.url;
  if (media?.shortcode) {
    const type = media?.is_reel || media?.media_type === 'reel' ? 'reel' : 'p';
    return `https://www.instagram.com/${type}/${media.shortcode}/`;
  }
  return null;
}

/** Primer post o reel del perfil (Bright Data puede devolver posts, reels o ambos) */
function getFirstMedia(profile) {
  return profile?.posts?.[0] || profile?.reels?.[0] || null;
}

/** Obtener URL de media: BD (objeto con url/shortcode) o Private API ({ url }) */
function getMediaUrl(media) {
  if (!media) return null;
  if (media.url) return media.url;
  return getPostUrl(media, null);
}

/** Bright Data: enriquecer perfiles con reintentos */
async function enrichProfilesWithRetry(scrapeProfiles, usernames) {
  for (let attempt = 1; attempt <= BD_RETRIES; attempt++) {
    try {
      const urls = usernames.map((u) => `https://www.instagram.com/${u}/`);
      const raw = await scrapeProfiles(urls);
      const arr = Array.isArray(raw) ? raw : [raw];
      const valid = arr.filter((p) => p && (p.username || p.account) && !p.error);
      if (valid.length > 0) return valid;
      if (attempt < BD_RETRIES) {
        console.log(`   ⚠️ Bright Data devolvió 0 perfiles. Reintento ${attempt + 1}/${BD_RETRIES}...`);
        await delay(3000);
      }
    } catch (e) {
      console.log(`   ⚠️ Bright Data error: ${e.message}. Reintento ${attempt + 1}/${BD_RETRIES}...`);
      if (attempt < BD_RETRIES) await delay(3000);
    }
  }
  return usernames.map((u) => ({ username: u }));
}

async function runFullFlow() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  FLUJO COMPLETO: @${TARGET} + ${TARGET_DMS} DMs a seguidores`);
  console.log('  (Si falla 403, busca otro hasta completar)');
  console.log('══════════════════════════════════════════════════════════\n');

  const userId = 'test-full-' + Date.now();
  const { scrapeProfileByUsername, scrapeProfiles } = await import('../src/services/brightDataScraper.service.js');
  const { analyzeProfileAI, generateCommentAndDMForProfile } = await import('../src/services/aiProspector.service.js');
  const {
    privateApiLogin,
    privateApiGetFollowersFromApi,
    privateApiSendDM,
    privateApiLikePost,
    privateApiCommentOnPost,
    privateApiGetFirstMediaFromUser,
    privateApiLogout,
  } = await import('../src/services/instagramPrivateApi.service.js');

  // ─── 1. BRIGHT DATA: Scrape target (con reintentos) ───────────────────
  let targetProfile = null;
  for (let attempt = 1; attempt <= BD_RETRIES; attempt++) {
    targetProfile = await scrapeProfileByUsername(TARGET);
    if (targetProfile && !targetProfile.error) break;
    console.log(`   ⚠️ Bright Data falló. Reintento ${attempt + 1}/${BD_RETRIES}...`);
    await delay(3000);
  }
  if (!targetProfile || targetProfile.error) {
    console.error('❌ No se pudo obtener perfil de @' + TARGET);
    return;
  }
  console.log(`📡 [1] ✅ @${targetProfile.username || targetProfile.account}`);

  // ─── 2. SESIÓN: Login (necesaria para obtener media si BD no la tiene) ─
  const loginResult = await privateApiLogin(userId, IG_USERNAME, IG_PASSWORD);
  if (loginResult.needs_2fa) {
    console.log('   ⚠️ Requiere 2FA.');
    return;
  }
  if (!loginResult.success) {
    console.error('❌ Login:', loginResult.error);
    return;
  }
  console.log('🔐 [2] ✅ Sesión activa');

  // ─── 3. Media del target: BD o sesión (posts/reels) ───────────────────
  let targetProfileForAi = targetProfile;
  let targetMedia = getFirstMedia(targetProfile);
  if (!targetMedia) {
    const sessionMedia = await privateApiGetFirstMediaFromUser(userId, TARGET);
    if (sessionMedia) {
      targetMedia = sessionMedia;
      targetProfileForAi = { ...targetProfile, posts: [{ caption: sessionMedia.caption, url: sessionMedia.url, likes: sessionMedia.likes }] };
      console.log(`   📌 Media de @${TARGET} obtenida por sesión: ${targetMedia.url}`);
    }
  }

  // ─── 4. OPENAI: Comentario + DM para target ───────────────────────────
  const aiTarget = await generateCommentAndDMForProfile(targetProfileForAi);
  const msgTarget = aiTarget.dm || 'Hola! Me encantó tu perfil ✨';
  const commentTarget = aiTarget.comment || '';

  // ─── 5. Like + comentar + DM a target ─────────────────────────────────
  const targetPostUrl = getMediaUrl(targetMedia);
  let targetPublication = null;

  if (targetPostUrl && commentTarget) {
    console.log(`\n❤️💬 [4a] Like + comentar en post/reel de @${TARGET}...`);
    const likeT = await privateApiLikePost(userId, targetPostUrl);
    const commentT = await privateApiCommentOnPost(userId, targetPostUrl, commentTarget);
    targetPublication = { url: targetPostUrl, caption: targetMedia?.caption?.substring(0, 100) || '', likes: targetMedia?.likes };
    console.log(likeT.success ? '   ✅ Like' : '   ❌ Like');
    console.log(commentT.success ? '   ✅ Comentario' : '   ❌ Comentario');
    await delay(DELAY_BETWEEN_ACTIONS);
  }

  console.log(`\n📤 [4b] DM a @${TARGET}...`);
  const dmTarget = await privateApiSendDM(userId, TARGET, msgTarget);
  console.log(dmTarget.success ? '   ✅ Enviado' : '   ❌ ' + dmTarget.error);
  if (targetPublication) console.log(`   📋 Publicación: ${targetPublication.url}`);
  await delay(5000);

  // ─── 5-8. Like + comentar + DM a seguidores (reemplazar si 403) ─────────
  let sentCount = 0;
  let offset = 0;
  const tried = new Set();
  const results = []; // { username, dm, like, comment, publication }

  console.log(`\n📤 [5-8] Like + comentar + DM a ${TARGET_DMS} seguidores...`);

  while (sentCount < TARGET_DMS) {
    const toFetch = Math.max(BATCH_SIZE, TARGET_DMS - sentCount + 5);
    const followersRes = await privateApiGetFollowersFromApi(userId, TARGET, toFetch, offset);
    if (!followersRes.success || !followersRes.usernames?.length) {
      console.log('   ⚠️ No hay más seguidores disponibles.');
      break;
    }

    const batch = followersRes.usernames.filter((u) => !tried.has(u));
    if (batch.length === 0) {
      console.log('   ⚠️ Todos los seguidores ya probados.');
      break;
    }

    offset += followersRes.usernames.length;

    // Bright Data: enriquecer con reintentos
    const profiles = await enrichProfilesWithRetry(scrapeProfiles, batch);
    if (profiles.length === 0) continue;

    for (const p of profiles) {
      if (sentCount >= TARGET_DMS) break;
      const uname = p.username || p.account;
      if (tried.has(uname)) continue;
      tried.add(uname);

      let lastMedia = getFirstMedia(p);
      if (!lastMedia) {
        const sessionMedia = await privateApiGetFirstMediaFromUser(userId, uname);
        if (sessionMedia) {
          lastMedia = sessionMedia;
          p = { ...p, posts: [{ caption: sessionMedia.caption, url: sessionMedia.url, likes: sessionMedia.likes }] };
        }
      }
      const aiResult = await generateCommentAndDMForProfile(p);
      const comment = aiResult.comment || '';
      const msg = aiResult.dm || 'Hola! Me encantó tu perfil ✨';
      const postUrl = getMediaUrl(lastMedia);
      const publication = postUrl
        ? { url: postUrl, caption: lastMedia?.caption?.substring(0, 100) || '', likes: lastMedia?.likes }
        : null;

      const result = { username: uname, dm: false, like: false, comment: false, publication };

      // 1. Like + comentar (si tiene post y comentario)
      if (postUrl && comment) {
        const likeRes = await privateApiLikePost(userId, postUrl);
        result.like = likeRes.success;
        if (likeRes.success) console.log(`   ❤️ Like en post de @${uname}`);
        await delay(DELAY_BETWEEN_ACTIONS);

        const commentRes = await privateApiCommentOnPost(userId, postUrl, comment);
        result.comment = commentRes.success;
        if (commentRes.success) console.log(`   💬 Comentario en post de @${uname}`);
        await delay(DELAY_BETWEEN_ACTIONS);
      }

      // 2. DM
      const dm = await privateApiSendDM(userId, uname, msg);
      result.dm = dm.success;

      if (dm.success) {
        sentCount++;
        result.publication = publication;
        results.push(result);
        console.log(`   ✅ [${sentCount}/${TARGET_DMS}] @${uname} | Publicación: ${publication?.url || 'N/A'}`);
      } else {
        const is403 = (dm.error || '').includes('403');
        console.log(`   ⏭️ @${uname} ${is403 ? '(403, busca otro)' : dm.error}`);
      }
      await delay(DELAY_BETWEEN_DMS);
    }
  }

  console.log(`\n   📊 Total enviados: ${sentCount}/${TARGET_DMS}`);
  if (results.length > 0) {
    console.log('\n   📋 Publicaciones en las que se interactuó:');
    results.forEach((r, i) => {
      console.log(`      ${i + 1}. @${r.username}: ${r.publication?.url || 'Sin post'} (like: ${r.like}, comment: ${r.comment})`);
    });
  }
  await privateApiLogout(userId);
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ✅ FLUJO COMPLETO FINALIZADO');
  console.log('══════════════════════════════════════════════════════════\n');
}

runFullFlow().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
