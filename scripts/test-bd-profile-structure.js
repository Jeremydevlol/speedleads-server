/**
 * Debug: ver estructura completa que devuelve Bright Data para un perfil
 * Uso: node scripts/test-bd-profile-structure.js readytoblessd
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const TARGET = process.argv[2] || 'readytoblessd';

async function main() {
  const { scrapeProfileByUsername, scrapeReels } = await import('../src/services/brightDataScraper.service.js');
  console.log(`\n📡 Scraping @${TARGET} (Profiles)...\n`);
  const profile = await scrapeProfileByUsername(TARGET);
  console.log('=== PROFILE RESPONSE (keys) ===');
  if (profile) {
    console.log('Keys:', Object.keys(profile));
    console.log('\nposts:', profile.posts ? `array[${profile.posts.length}]` : profile.posts);
    console.log('reels:', profile.reels ? `array[${profile.reels.length}]` : profile.reels);
    if (profile.posts?.[0]) console.log('\nposts[0]:', JSON.stringify(profile.posts[0], null, 2).slice(0, 500));
    if (profile.reels?.[0]) console.log('\nreels[0]:', JSON.stringify(profile.reels[0], null, 2).slice(0, 500));
    // Cualquier campo que parezca media
    const mediaKeys = Object.keys(profile).filter((k) => /media|post|reel|video/i.test(k));
    if (mediaKeys.length) console.log('\nMedia-like keys:', mediaKeys);
    console.log('\n=== FULL (truncated) ===');
    console.log(JSON.stringify(profile, null, 2).slice(0, 2000));
  } else {
    console.log('null');
  }

  // Probar Reels dataset con URL de perfil (por si acepta)
  console.log('\n📡 Probando Reels dataset con profile URL...');
  try {
    const reelPayload = [{ url: `https://www.instagram.com/${TARGET}/` }];
    const reelsRes = await scrapeReels([`https://www.instagram.com/${TARGET}/`]);
    console.log('Reels result:', reelsRes ? (Array.isArray(reelsRes) ? reelsRes.length : 1) : 0);
    if (reelsRes?.[0]) console.log('Reels[0] keys:', Object.keys(reelsRes[0]));
  } catch (e) {
    console.log('Reels error:', e.message);
  }
}

main().catch(console.error);
