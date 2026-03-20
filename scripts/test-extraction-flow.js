/**
 * Test interno: Flujo de extracción de leads (scrape-from-commenters + GET followers)
 * Uso: node scripts/test-extraction-flow.js [username] [userId]
 * Ej: node scripts/test-extraction-flow.js readytoblessd 96754cf7-5784-47f1-9fa8-0fc59122fe13
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const TARGET = process.argv[2] || 'readytoblessd';
const USER_ID = process.argv[3] || process.env.TEST_USER_ID || '96754cf7-5784-47f1-9fa8-0fc59122fe13';
const BASE = process.env.TEST_BACKEND_URL || process.env.API_URL || 'http://localhost:5001';

async function run() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  TEST: Flujo de extracción de leads (sin login IG)');
  console.log(`  Target: @${TARGET} | userId: ${USER_ID}`);
  console.log(`  Backend: ${BASE}`);
  console.log('══════════════════════════════════════════════════════════\n');

  const headers = {
    'Content-Type': 'application/json',
    'x-user-id': USER_ID,
    'user_id': USER_ID,
  };
  if (process.env.NODE_ENV === 'development' && process.env.JWT_DEV) {
    headers['Authorization'] = `Bearer ${process.env.JWT_DEV}`;
  }

  try {
    // 1) Scrape (comentaristas → BD)
    console.log('1️⃣ POST /scrape-from-commenters/:username');
    const scrapeRes = await fetch(
      `${BASE}/api/instagram/private/scrape-from-commenters/${encodeURIComponent(TARGET)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ limit: 20 }),
      }
    );
    const scrapeData = await scrapeRes.json();
    console.log(`   Status: ${scrapeRes.status}`, scrapeData.success ? '✅' : '❌');
    if (scrapeData.success) {
      console.log(`   Total: ${scrapeData.total || 0} | Inserted: ${scrapeData.inserted || 0}`);
    } else {
      console.log('   Error:', scrapeData.error);
      process.exit(1);
    }

    // 2) GET followers (leer desde BD)
    console.log('\n2️⃣ GET /followers/:username');
    const getRes = await fetch(
      `${BASE}/api/instagram/private/followers/${encodeURIComponent(TARGET)}?limit=50`,
      { method: 'GET', headers }
    );
    const getData = await getRes.json();
    console.log(`   Status: ${getRes.status}`, getData.success ? '✅' : '❌');
    if (getData.success) {
      const followers = getData.followers || [];
      console.log(`   Seguidores en BD: ${followers.length}`);
      if (followers.length > 0) {
        console.log(`   Primeros 3:`, followers.slice(0, 3).map((f) => ({
          username: f.username,
          full_name: f.full_name?.slice(0, 20),
        })));
      }
    } else {
      console.log('   Error:', getData.error);
    }

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  FIN (éxito)');
    console.log('══════════════════════════════════════════════════════════\n');
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

run();
