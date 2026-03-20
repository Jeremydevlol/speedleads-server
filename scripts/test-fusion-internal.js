/**
 * Prueba interna: Fusión Bright Data + Private API + OpenAI
 *
 * Flujo:
 * 1. Bright Data scrapers (sin sesión): perfil, posts, comentarios
 * 2. OpenAI procesa datos y genera mensaje personalizado
 * 3. Login con nfnn404 + proxy Bright Data
 * 4. Sesión ejecuta: enviar DM (solo acciones)
 *
 * Uso:
 *   node scripts/test-fusion-internal.js [username] [--dry-run]
 *   --dry-run  No envía DM real
 *
 * Nota: Si login falla con 402 (qe/sync), el proxy Bright Data puede bloquear
 * ese endpoint. Prueba sin proxy en dev: IG_PROXY_URL= node scripts/...
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// NO sobrescribir proxy — debe usarse Bright Data
// process.env.IG_PROXY_URL = '';

const IG_USERNAME = 'nfnn404';
const IG_PASSWORD = process.env.IG_TEST_PASSWORD || 'Dios2090.';
const TARGET_USERNAME = process.argv[2] || 'uniclick.io'; // Perfil a analizar
const TEST_MODE = process.argv.includes('--dry-run'); // No envía DM real

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTest() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  PRUEBA INTERNA: Bright Data + Private API + OpenAI');
  console.log('══════════════════════════════════════════════════════════\n');

  const userId = 'test-fusion-' + Date.now();

  // ─────────────────────────────────────────────────────────────────
  // 1. BRIGHT DATA — Scrapear perfil (sin sesión IG)
  // ─────────────────────────────────────────────────────────────────
  console.log('📡 [1/4] Scrapeando perfil con Bright Data (sin sesión)...');
  const { scrapeProfileByUsername } = await import('../src/services/brightDataScraper.service.js');
  const profile = await scrapeProfileByUsername(TARGET_USERNAME);

  if (!profile || profile.error) {
    console.error('❌ Error Bright Data:', profile?.error || 'No se obtuvo perfil');
    return;
  }
  console.log(`   ✅ Perfil: @${profile.username || profile.account}, ${profile.full_name}`);
  console.log(`   📊 Seguidores: ${profile.followers}, Posts: ${profile.posts?.length || 0}`);

  // ─────────────────────────────────────────────────────────────────
  // 2. OPENAI — Generar mensaje personalizado
  // ─────────────────────────────────────────────────────────────────
  console.log('\n🧠 [2/4] Procesando con OpenAI...');
  const { analyzeProfileAI } = await import('../src/services/aiProspector.service.js');
  const aiResult = await analyzeProfileAI(profile);

  if (!aiResult.success) {
    console.error('❌ Error OpenAI:', aiResult.error);
    return;
  }

  const greeting = aiResult.analysis?.customGreeting || 'Hola! Me encantó tu perfil ✨';
  console.log(`   ✅ Saludo IA: "${greeting}"`);

  // ─────────────────────────────────────────────────────────────────
  // 3. LOGIN — Con proxy Bright Data (obligatorio)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n🔐 [3/4] Login con proxy Bright Data...');
  const { privateApiLogin, privateApiGetStatus } = await import('../src/services/instagramPrivateApi.service.js');

  const loginResult = await privateApiLogin(userId, IG_USERNAME, IG_PASSWORD);

  if (loginResult.needs_2fa) {
    console.log('   ⚠️ Requiere 2FA. Ejecuta con código o usa cuenta sin 2FA.');
    return;
  }

  if (!loginResult.success) {
    console.error('❌ Login fallido:', loginResult.error);
    if (!process.env.IG_PROXY_URL) {
      console.log('   💡 Configura IG_PROXY_URL en .env con proxy Bright Data.');
    }
    return;
  }
  console.log(`   ✅ Sesión activa: @${loginResult.username}`);

  const status = await privateApiGetStatus(userId);
  console.log(`   📊 Proxy: ${status.hasProxy ? 'Sí' : 'No'}, DMs hoy: ${status.dailyStats?.sent || 0}/${status.dailyStats?.limit || 20}`);

  // ─────────────────────────────────────────────────────────────────
  // 4. SESIÓN — Enviar DM (solo acción)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n📤 [4/4] Enviando DM (sesión solo acciones)...');

  if (TEST_MODE) {
    console.log('   [DRY-RUN] No se envía DM real. Mensaje que se enviaría:');
    console.log(`   → @${TARGET_USERNAME}: "${greeting}"`);
    console.log('\n   Ejecuta sin --dry-run para enviar realmente.');
    return;
  }

  const { privateApiSendDM } = await import('../src/services/instagramPrivateApi.service.js');
  const dmResult = await privateApiSendDM(userId, TARGET_USERNAME, greeting);

  if (dmResult.success) {
    console.log(`   ✅ DM enviado a @${TARGET_USERNAME}`);
  } else {
    console.error('   ❌ Error DM:', dmResult.error);
  }

  // Logout
  const { privateApiLogout } = await import('../src/services/instagramPrivateApi.service.js');
  await privateApiLogout(userId);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ✅ PRUEBA COMPLETADA');
  console.log('══════════════════════════════════════════════════════════\n');
}

runTest().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
