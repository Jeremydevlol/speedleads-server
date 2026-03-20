/**
 * Debug: obtener primer post/reel de un usuario con sesión
 * Uso: node scripts/test-get-media.js readytoblessd
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const TARGET = process.argv[2] || 'readytoblessd';

async function main() {
  const userId = 'test-media-' + Date.now();
  const {
    privateApiLogin,
    privateApiGetFirstMediaFromUser,
    privateApiLogout,
  } = await import('../src/services/instagramPrivateApi.service.js');

  const login = await privateApiLogin(userId, 'nfnn404', process.env.IG_TEST_PASSWORD || 'Dios2090.');
  if (!login.success) {
    console.error('Login failed:', login.error);
    return;
  }
  console.log('Logged in. Fetching media for @' + TARGET + '...\n');

  const media = await privateApiGetFirstMediaFromUser(userId, TARGET);
  console.log('Result:', JSON.stringify(media, null, 2));

  await privateApiLogout(userId);
}

main().catch(console.error);
