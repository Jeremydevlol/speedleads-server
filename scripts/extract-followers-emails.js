/**
 * Extrae seguidores de una cuenta Instagram y sus emails.
 * Fuentes: bio, external_url, business_email, y scraping de URLs en bio.
 *
 * Uso: node scripts/extract-followers-emails.js [target] [limit]
 * Ej: node scripts/extract-followers-emails.js autoscout24es 200
 *
 * Variables .env: IG_PASSWORD o IG_TEST_PASSWORD (para nfnn404)
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const IG_USER = process.env.IG_TEST_USERNAME || process.env.IG_USERNAME || 'nfnn404';
const IG_PASS = process.env.IG_PASSWORD || process.env.IG_TEST_PASSWORD;
const DEV_USER_ID = '96754cf7-5784-47f1-9fa8-0fc59122fe13';

const TARGET = process.argv[2] || 'autoscout24es';
const LIMIT = parseInt(process.argv[3]) || 200;

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function extractEmails(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(EMAIL_REGEX);
  return [...new Set(matches || [])];
}

/** Obtiene external_url de un perfil (varios posibles nombres de campo) */
function getExternalUrl(p) {
  const url = p.external_url || p.external_links?.[0] || p.url || p.link || p.website || p.bio_links?.[0];
  if (typeof url === 'string' && url.startsWith('http')) return url;
  if (Array.isArray(p.external_links) && p.external_links[0]) return p.external_links[0];
  return null;
}

/** Scrapea una URL y extrae emails del HTML (Linktree, webs, etc.) */
async function scrapeEmailsFromUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpeedLeads/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    const html = await res.text();
    return extractEmails(html);
  } catch (e) {
    return [];
  }
}

async function run() {
  if (!IG_PASS) {
    console.error('❌ Falta IG_PASSWORD o IG_TEST_PASSWORD en .env');
    process.exit(1);
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  EXTRACCIÓN: seguidores + emails de @${TARGET}`);
  console.log(`  Cuenta scraper: @${IG_USER}`);
  console.log(`  Límite: ${LIMIT}`);
  console.log('══════════════════════════════════════════════════════════\n');

  const {
    privateApiLogin,
    privateApiGetStatus,
    privateApiGetFollowersFromApi,
  } = await import('../dist/services/instagramPrivateApi.service.js');
  const { scrapeProfiles } = await import('../dist/services/brightDataScraper.service.js');

  // 1. Login
  console.log('1️⃣ Login Instagram @' + IG_USER + '...');
  const loginResult = await privateApiLogin(DEV_USER_ID, IG_USER, IG_PASS);
  if (loginResult.needs_2fa || loginResult.twoFA_required) {
    console.error('❌ Requiere 2FA. Completa el login manualmente.');
    process.exit(1);
  }
  if (!loginResult.success) {
    console.error('❌ Login fallido:', loginResult.error);
    process.exit(1);
  }
  console.log('   ✅ Sesión activa\n');

  await new Promise((r) => setTimeout(r, 3000));

  // 2. Obtener usernames de seguidores
  console.log('2️⃣ Obteniendo seguidores de @' + TARGET + '...');
  const followersRes = await privateApiGetFollowersFromApi(DEV_USER_ID, TARGET, LIMIT, 0);
  if (!followersRes.success || !followersRes.usernames?.length) {
    console.error('❌ No se pudieron obtener seguidores:', followersRes.error || 'Sin datos');
    process.exit(1);
  }
  const usernames = followersRes.usernames;
  console.log(`   ✅ ${usernames.length} usernames obtenidos\n`);

  // 3. Enriquecer perfiles con Bright Data
  console.log('3️⃣ Enriqueciendo perfiles con Bright Data...');
  const urls = usernames.map((u) => `https://www.instagram.com/${u}/`);
  const profiles = await scrapeProfiles(urls);
  if (profiles[0]) console.log('   Campos de perfil (ejemplo):', Object.keys(profiles[0]).join(', '));

  // 4. Extraer emails: bio, business_email, external_url, y scraping de webs en bio
  const results = [];
  let emailsFound = 0;
  const withExtUrl = [];
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const username = p?.username || p?.account || usernames[i];
    if (!username || p?.error) continue;

    const emails = [];
    if (p.email_address && typeof p.email_address === 'string' && p.email_address.includes('@')) {
      emails.push(...extractEmails(p.email_address));
    }
    if (p.business_email) emails.push(...extractEmails(String(p.business_email)));
    if (p.biography) emails.push(...extractEmails(p.biography));
    if (p.bio) emails.push(...extractEmails(p.bio));
    const extUrl = getExternalUrl(p);
    if (extUrl && extUrl.includes('@')) emails.push(...extractEmails(extUrl));
    if (extUrl && !extUrl.includes('@')) withExtUrl.push({ username, url: extUrl });

    results.push({ username, full_name: p.full_name || '', followers: p.followers || p.follower_count, emails: [...new Set(emails)], biography: (p.biography || p.bio || '').substring(0, 200), external_url: extUrl });
    if (emails.length) emailsFound += emails.length;
  }

  // 5. Scrapear URLs externas (Linktree, webs) para extraer más emails
  if (withExtUrl.length > 0) {
    console.log(`4️⃣ Scrapeando ${withExtUrl.length} URLs en bio para buscar emails...`);
    for (let i = 0; i < withExtUrl.length; i++) {
      const { username, url } = withExtUrl[i];
      const found = await scrapeEmailsFromUrl(url);
      if (found.length) {
        const r = results.find((x) => x.username === username);
        if (r) {
          const before = r.emails.length;
          r.emails = [...new Set([...r.emails, ...found])];
          emailsFound += r.emails.length - before;
        }
      }
      if ((i + 1) % 10 === 0) console.log(`   Procesadas ${i + 1}/${withExtUrl.length} URLs...`);
      await new Promise((r) => setTimeout(r, 500)); // rate limit
    }
  }

  // 5. Guardar resultado
  const outputPath = path.join(process.cwd(), 'storage', `followers_emails_${TARGET}_${Date.now()}.json`);
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ target: TARGET, scraped_at: new Date().toISOString(), results }, null, 2));

  // 6. Resumen
  const withEmail = results.filter((r) => r.emails.length > 0);
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  RESULTADO');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Seguidores procesados: ${results.length}`);
  console.log(`  Con email encontrado: ${withEmail.length}`);
  console.log(`  Total emails: ${emailsFound}`);
  console.log(`  Guardado en: ${outputPath}`);
  console.log('══════════════════════════════════════════════════════════\n');

  if (withEmail.length > 0) {
    console.log('  Perfiles con email:');
    withEmail.slice(0, 20).forEach((r) => {
      console.log(`    @${r.username} → ${r.emails.join(', ')}`);
    });
    if (withEmail.length > 20) console.log(`    ... y ${withEmail.length - 20} más`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
