/**
 * Prueba interna: Bright Data scrapers desde el frontend (sin login).
 * 1. Frontend proxy → Backend
 * 2. Fallback: Backend directo si frontend falla
 *
 * Uso: node scripts/test-brightdata-frontend.js [username]
 * Ej: node scripts/test-brightdata-frontend.js elchantyy
 */

const FRONTEND = process.env.TEST_FRONTEND_URL || 'http://localhost:3000';
const BACKEND = process.env.TEST_BACKEND_URL || 'http://localhost:5001';
const USERNAME = process.argv[2] || 'elchantyy';

async function run() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  PRUEBA BRIGHT DATA (desde frontend, sin login)');
  console.log(`  Usuario: @${USERNAME}`);
  console.log(`  Frontend: ${FRONTEND} → Backend: ${BACKEND}`);
  console.log('══════════════════════════════════════════════════════════\n');

  const url = `/api/instagram/brightdata/profile/${encodeURIComponent(USERNAME)}`;
  const altUrl = `/api/brightdata/profile/${encodeURIComponent(USERNAME)}`;

  // 1. Vía frontend (proxy)
  console.log('1️⃣ GET Frontend' + url);
  try {
    const res = await fetch(`${FRONTEND}${url}`);
    const data = await res.json();
    console.log(`   Status: ${res.status}`, data.success ? '✅' : '❌');
    if (data.success && data.data) {
      const p = data.data;
      console.log(`   @${p.account || p.username} | ${p.followers?.toLocaleString() || 0} seguidores`);
      if (p.biography) console.log(`   Bio: ${p.biography.substring(0, 80)}...`);
      console.log('\n══════════════════════════════════════════════════════════');
      console.log('  FIN (éxito vía frontend)');
      console.log('══════════════════════════════════════════════════════════\n');
      return;
    }
    if (!data.success) console.log('   ', data.error || JSON.stringify(data).slice(0, 150));
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 2. Fallback: Backend directo
  console.log('\n2️⃣ GET Backend' + altUrl + ' (fallback)');
  try {
    const res = await fetch(`${BACKEND}${altUrl}`);
    const data = await res.json();
    console.log(`   Status: ${res.status}`, data.success ? '✅' : '❌');
    if (data.success && data.data) {
      const p = data.data;
      console.log(`   @${p.account || p.username} | ${p.followers?.toLocaleString() || 0} seguidores`);
    } else {
      console.log('   ', data.error || JSON.stringify(data).slice(0, 150));
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  FIN');
  console.log('══════════════════════════════════════════════════════════\n');
}

run().catch(console.error);
