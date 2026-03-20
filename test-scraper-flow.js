/**
 * Prueba del flujo: Scraper → BD → Sesión envía DMs
 * 
 * 1. Ejecuta migración en Supabase SQL Editor (db/migrations/2025-02-23_ig_scraped_followers.sql)
 * 2. Arranca backend: npm run start (o NODE_ENV=development npm run start)
 * 3. Ejecuta: node test-scraper-flow.js
 * 
 * Usa: nfnn404 / Dios2090.
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.BACKEND_URL || 'http://localhost:5001';
const DEV_USER_ID = '96754cf7-5784-47f1-9fa8-0fc59122fe13'; // development-token user

const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer development-token'
};

async function run() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  PRUEBA: Scraper → BD → Sesión envía DMs');
  console.log('  Cuenta: nfnn404');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Scraper: extraer seguidores de joelolbejo187
  console.log('1️⃣ Ejecutando scraper de seguidores de @joelolbejo187...');
  const scrapeRes = await fetch(`${BASE}/api/instagram/private/scrape-followers/joelolbejo187`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      scraperUsername: 'nfnn404',
      scraperPassword: 'Dios2090.',
      limit: 50,
      headless: false  // Ver el navegador para debug
    })
  });
  const scrapeData = await scrapeRes.json();
  console.log('   Resultado scraper:', JSON.stringify(scrapeData, null, 2));
  if (!scrapeData.success) {
    console.error('❌ Scraper falló. Revisa credenciales y que la tabla ig_scraped_followers exista.');
    return;
  }

  // 2. Login con Private API
  console.log('\n2️⃣ Login con Private API (nfnn404)...');
  const loginRes = await fetch(`${BASE}/api/instagram/private/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: 'nfnn404', password: 'Dios2090.' })
  });
  const loginData = await loginRes.json();
  console.log('   Login:', loginData.success ? '✅ OK' : '❌ ' + (loginData.error || ''));
  if (!loginData.success) {
    console.error('   Detalle:', loginData);
    return;
  }

  // 3. Obtener seguidores desde BD (ya no usa Private API para extraer)
  console.log('\n3️⃣ Obteniendo seguidores desde BD...');
  const followersRes = await fetch(`${BASE}/api/instagram/private/followers/joelolbejo187?limit=10`, { headers });
  const followersData = await followersRes.json();
  console.log('   Seguidores en BD:', followersData.followers?.length || 0);
  if (followersData.followers?.length > 0) {
    console.log('   Primeros 3:', followersData.followers.slice(0, 3).map(f => '@' + f.username).join(', '));
  }

  // 4. (Opcional) Enviar 1 DM de prueba
  if (followersData.followers?.length > 0) {
    const target = followersData.followers[0].username;
    console.log(`\n4️⃣ ¿Enviar DM de prueba a @${target}? (comentado por seguridad)`);
    // const dmRes = await fetch(`${BASE}/api/instagram/private/send-dm`, {
    //   method: 'POST', headers,
    //   body: JSON.stringify({ recipientUsername: target, message: '¡Hola! Prueba desde SpeedLeads 😊' })
    // });
    // const dmData = await dmRes.json();
    // console.log('   DM:', dmData.success ? '✅ Enviado' : '❌ ' + (dmData.error || ''));
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ✅ Flujo completado. La sesión lee de BD, no extrae con API.');
  console.log('═══════════════════════════════════════════════════════');
}

run().catch(e => console.error('❌', e.message));
