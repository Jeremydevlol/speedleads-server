/**
 * Prueba directa del scraper (sin HTTP) - API interna, sin navegador
 */
import dotenv from 'dotenv';
dotenv.config();

import { scrapeFollowersToDb } from './dist/services/instagramFollowersScraper.service.js';

const userId = '96754cf7-5784-47f1-9fa8-0fc59122fe13';

async function run() {
  console.log('Probando scraper (API interna, sin navegador)...\n');
  const result = await scrapeFollowersToDb(
    userId,
    'cristiano',
    'nfnn404',
    'Dios2090.',
    20
  );
  console.log('\nResultado:', JSON.stringify(result, null, 2));
}

run().catch(e => console.error('Error:', e.message));
