/**
 * Prueba: Enviar DMs a 10 seguidores de Cristiano Ronaldo (o Messi si falla)
 * Comportamiento humano: mensajes variados, delays, anti-bot.
 *
 * 1. Arranca backend: NODE_ENV=development npm run start
 * 2. Ejecuta: node test-dm-cristiano.js
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.BACKEND_URL || 'http://localhost:5001';
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer development-token'
};

// Mensajes variados para que no parezca bot (cada uno diferente)
const MESSAGES = [
  '¡Hola! ¿Qué tal tu día? 😊',
  'Hey! ¿Cómo va todo hoy? 🙌',
  '¡Buenas! ¿Qué tal va la semana?',
  'Hola, ¿cómo estás? ✨',
  'Hey! ¿Todo bien por ahí? 😄',
  '¡Hola! ¿Qué tal? 👋',
  'Buenas, ¿cómo va?',
  'Hey, ¿qué tal tu día? 😊',
  '¡Hola! ¿Cómo va todo? 🙌',
  'Hola, ¿qué tal? 👋'
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function tryWithAccount(targetUsername) {
  console.log(`\n📋 Scrapeando seguidores de @${targetUsername}...`);
  const scrapeRes = await fetch(`${BASE}/api/instagram/private/scrape-followers/${targetUsername}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      scraperUsername: 'nfnn404',
      scraperPassword: 'Dios2090.',
      limit: 50
    })
  });
  const scrapeData = await scrapeRes.json();

  if (!scrapeData.success) {
    console.error(`❌ Scraper falló para @${targetUsername}:`, scrapeData.error);
    return false;
  }
  console.log(`   ✅ ${scrapeData.total} seguidores extraídos`);

  console.log('\n🔐 Login con Private API...');
  const loginRes = await fetch(`${BASE}/api/instagram/private/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: 'nfnn404', password: 'Dios2090.' })
  });
  const loginData = await loginRes.json();

  if (!loginData.success) {
    console.error('❌ Login falló:', loginData.error);
    return false;
  }
  console.log('   ✅ Login OK');

  console.log('\n📥 Obteniendo 10 seguidores desde BD...');
  const followersRes = await fetch(`${BASE}/api/instagram/private/followers/${targetUsername}?limit=10`, { headers });
  const followersData = await followersRes.json();

  if (!followersData.followers?.length) {
    console.error('❌ No hay seguidores en BD');
    return false;
  }

  const recipients = followersData.followers.slice(0, 10).map((f, i) => ({
    username: f.username,
    message: MESSAGES[i] || MESSAGES[0]
  }));

  console.log('   Destinatarios:', recipients.map(r => '@' + r.username).join(', '));
  console.log('\n📤 Enviando 10 DMs (mensajes variados, delays humanos)...');

  const bulkRes = await fetch(`${BASE}/api/instagram/private/bulk-send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipients })
  });
  const bulkData = await bulkRes.json();

  if (bulkData.sent !== undefined) {
    console.log(`\n   ✅ Enviados: ${bulkData.sent} | Fallidos: ${bulkData.failed}`);
    if (bulkData.results?.length) {
      bulkData.results.forEach((r, i) => {
        console.log(`   ${r.success ? '✅' : '❌'} @${r.username}: ${r.error || 'OK'}`);
      });
    }
    return bulkData.sent > 0;
  }
  console.error('❌ Error bulk-send:', bulkData);
  return false;
}

async function run() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  PRUEBA: 10 DMs a seguidores de Cristiano Ronaldo');
  console.log('  Si falla → intentar con Messi');
  console.log('  Anti-bot: mensajes variados, delays humanos');
  console.log('═══════════════════════════════════════════════════════');

  const success = await tryWithAccount('cristiano');
  if (!success) {
    console.log('\n⚠️ Falló con @cristiano. Intentando con @leomessi...');
    await sleep(5000);
    await tryWithAccount('leomessi');
  }

  console.log('\n═══════════════════════════════════════════════════════');
}

run().catch(e => console.error('❌', e.message));
