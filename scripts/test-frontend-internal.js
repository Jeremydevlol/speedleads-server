/**
 * Prueba completa interna: simula TODO el flujo del frontend al backend SIN auth real.
 * 1. Login IG → 2. Agent interact (lanza campaña) → 3. Poll hasta completar
 * Usa development-token (aceptado en NODE_ENV=development).
 *
 * Uso: node scripts/test-frontend-internal.js [target] [limit]
 * Ej: node scripts/test-frontend-internal.js readytoblessd 2
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE = process.env.TEST_BACKEND_URL || 'http://localhost:5001';
const DEV_TOKEN = 'development-token';
const DEV_USER_ID = '96754cf7-5784-47f1-9fa8-0fc59122fe13';

const TARGET = process.argv[2] || 'readytoblessd';
const LIMIT = parseInt(process.argv[3]) || 2;

const IG_USER = process.env.IG_TEST_USERNAME || process.env.IG_USERNAME || 'nfnn404';
const IG_PASS = process.env.IG_TEST_PASSWORD || process.env.IG_PASSWORD || 'Dios2090.';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${DEV_TOKEN}`,
  'x-user-id': DEV_USER_ID,
  'user_id': DEV_USER_ID,
};

async function run() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  PRUEBA COMPLETA INTERNA (frontend → backend, sin auth real)');
  console.log(`  Target: @${TARGET} | DMs a enviar: ${LIMIT}`);
  console.log(`  Backend: ${BASE}`);
  console.log(`  Cuenta IG: @${IG_USER}`);
  console.log('══════════════════════════════════════════════════════════\n');

  // 1. Status inicial
  console.log('1️⃣ GET /api/instagram/private/status');
  let statusRes = await fetch(`${BASE}/api/instagram/private/status`, { headers });
  let statusData = await statusRes.json();
  console.log(`   Status: ${statusRes.status} | Logged: ${statusData?.data?.logged || false} | User: ${statusData?.data?.username || '-'}`);

  // 2. Login IG si no hay sesión
  if (!statusData?.data?.logged) {
    console.log('\n2️⃣ POST /api/instagram/private/login (iniciando sesión IG...)');
    const loginRes = await fetch(`${BASE}/api/instagram/private/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: IG_USER, password: IG_PASS }),
    });
    const loginData = await loginRes.json();
    if (loginData.needs_2fa || loginData.twoFA_required) {
      console.log('   ⚠️ Requiere 2FA. Ingresa el código manualmente o usa otro método.');
      process.exit(1);
    }
    if (!loginData.success) {
      console.log(`   ❌ Login fallido: ${loginData.error || loginData.message}`);
      process.exit(1);
    }
    console.log(`   ✅ Login OK: @${loginData.username || IG_USER}`);
    await new Promise((r) => setTimeout(r, 3000));
  } else {
    console.log('\n2️⃣ Sesión IG ya activa, omitiendo login.');
  }

  // 3. Agent interact (lanza campaña)
  console.log('\n3️⃣ POST /api/instagram/private/agent/interact');
  const interactRes = await fetch(`${BASE}/api/instagram/private/agent/interact`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ targetUsername: TARGET, limit: LIMIT }),
  });
  const interactData = await interactRes.json();
  if (!interactRes.ok || !interactData.success) {
    console.log(`   ❌ Error: ${interactData.error || 'Error desconocido'}`);
    process.exit(1);
  }
  console.log(`   ✅ Campaña iniciada: ${interactData.campaignId || '-'}`);
  console.log(`   ${interactData.message || '-'}`);

  // 4. Poll agent status hasta completar
  console.log('\n4️⃣ Polling GET /api/instagram/private/agent/status (cada 6s)');
  const maxPolls = 60; // ~6 min
  let lastLogLen = 0;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const pollRes = await fetch(`${BASE}/api/instagram/private/agent/status`, { headers });
    const pollData = await pollRes.json();
    if (!pollData.success) continue;

    const sent = pollData.sent || 0;
    const log = pollData.log || [];
    const active = pollData.active;

    // Mostrar nuevos logs
    if (log.length > lastLogLen) {
      for (let j = lastLogLen; j < log.length; j++) {
        console.log(`   📋 ${log[j]}`);
      }
      lastLogLen = log.length;
    }

    console.log(`   [${i + 1}/${maxPolls}] active=${active} sent=${sent}`);

    if (!active) {
      console.log('\n   ✅ Campaña finalizada.');
      if (pollData.results?.length) {
        console.log('\n   📊 Resultados:');
        pollData.results.forEach((r, idx) => {
          console.log(`      ${idx + 1}. @${r.username}${r.postUrl ? ` → ${r.postUrl}` : ''}`);
        });
      }
      console.log(`\n   📈 Total DMs enviados: ${sent}`);
      break;
    }
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  FIN PRUEBA COMPLETA');
  console.log('══════════════════════════════════════════════════════════\n');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
