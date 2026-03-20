/**
 * AGENTE DE PROSPECCIÓN IA
 * 1. Extrae seguidores de una cuenta objetivo usando Private API
 * 2. Scrapea los detalles con Bright Data
 * 3. Analiza y filtra con OpenAI
 */
import dotenv from 'dotenv';
dotenv.config();

// Sobrescribir variables temporalmente para la prueba
process.env.IG_PROXY_URL = '';
// Si no tienes OPENAI_API_KEY en .env, dará error en la parte de IA, pero lo manejaré
const OPENAI_KEY = process.env.OPENAI_API_KEY;

import { IgApiClient } from 'instagram-private-api';
import { analyzeProfileAI, scrapeProfiles } from './src/services/aiProspector.service.js';

const IG_USERNAME = 'nfnn404';
const IG_PASSWORD = 'Dios2090.';
const TARGET_ACCOUNT = 'joelolbejo187'; // Cuenta competencia
const MAX_TO_SCRAPE = 20; // Cuántos seguidores vamos a analizar

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runAgent() {
  console.log(`\n🤖 AGENTE IA: INICIANDO BÚSQUEDA EN @${TARGET_ACCOUNT}`);
  console.log('═════════════════════════════════════════════════════════');
  
  // ==========================================
  // PASO 1: EXTRAER SEGUIDORES
  // ==========================================
  console.log(`\n[PASO 1] 🕵️ Extrayendo ${MAX_TO_SCRAPE} seguidores de @${TARGET_ACCOUNT} usando tu cuenta...`);
  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);
  
  try { await ig.simulate.preLoginFlow(); } catch(e) {}
  await ig.account.login(IG_USERNAME, IG_PASSWORD);
  try { await ig.simulate.postLoginFlow(); } catch(e) {}
  
  const targetId = await ig.user.getIdByUsername(TARGET_ACCOUNT);
  const followersFeed = ig.feed.accountFollowers(targetId);
  const items = await followersFeed.items();
  
  // Tomamos una cantidad específica al azar
  const selectedFollowers = items.sort(() => Math.random() - 0.5).slice(0, MAX_TO_SCRAPE);
  const urlsToScrape = selectedFollowers.map(u => `https://www.instagram.com/${u.username}/`);
  
  console.log(`   ✅ Extraídos ${urlsToScrape.length} seguidores con éxito.`);
  console.log(`   ${urlsToScrape.map(u => u.split('/')[3]).join(', ')}`);

  // ==========================================
  // PASO 2: SCRAPEO CON BRIGHT DATA
  // ==========================================
  console.log(`\n[PASO 2] ⚡ Enviando perfiles a Bright Data (Scraper)...`);
  const startTime = Date.now();
  
  let scrapedData;
  try {
    // LLama al servicio de Scraper
    scrapedData = await scrapeProfiles(urlsToScrape);
    const secs = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Bright Data a veces devuelve objetos vacíos o string con \n
    if (typeof scrapedData === 'string') {
        // En tu log apareció como NDJSON (múltiples JSONs separados por \n)
        scrapedData = scrapedData.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    }
    
    console.log(`   ✅ Completado en ${secs} segundos. (${scrapedData.length} perfiles recuperados)`);
  } catch (e) {
    console.error(`   ❌ Error en Bright Data:`, e.message);
    return;
  }

  // ==========================================
  // PASO 3: IA - EVALUACIÓN
  // ==========================================
  console.log(`\n[PASO 3] 🧠 Analizando perfiles con OpenAI...`);
  if (!OPENAI_KEY) {
      console.log('   ⚠️ No se encontró OPENAI_API_KEY en el .env');
      console.log('   Mostrando primeros 3 perfiles scrapeados como demo:\n');
      console.log(scrapedData.slice(0, 3).map(p => ({
          username: p.username || p.account,
          name: p.full_name || p.profile_name,
          bio: p.biography,
          followers: p.followers
      })));
      return;
  }

  const qualifiedLeads = [];
  const rejectedLeads = [];
  
  for (const profile of scrapedData) {
      const username = profile.username || profile.account;
      if (!username) continue;

      const aiResult = await analyzeProfileAI(profile);
      
      if (aiResult.success) {
          const res = aiResult.analysis;
          if (res.isTarget) {
              qualifiedLeads.push({ username, reason: res.reason, niche: res.niche });
              console.log(`   ✅ CALIFICADO : @${username}\n      Nicho: ${res.niche}\n      Motivo: ${res.reason}`);
          } else {
              rejectedLeads.push(username);
              console.log(`   ❌ RECHAZADO  : @${username} (${res.reason})`);
          }
      } else {
          console.log(`   ⚠️ Error IA evaluando @${username}: ${aiResult.error}`);
      }
  }

  console.log('\n═════════════════════════════════════════════════════════');
  console.log('  📊 RESUMEN FINAL DEL AGENTE');
  console.log('═════════════════════════════════════════════════════════');
  console.log(`  Perfiles Analizados : ${scrapedData.length}`);
  console.log(`  🎯 LEADS CALIFICADOS: ${qualifiedLeads.length} de ${scrapedData.length}`);
  console.log(`  🗑️ Leads Basura    : ${rejectedLeads.length}`);
  
  if (qualifiedLeads.length > 0) {
      console.log('\n  🚀 PRÓXIMO PASO PARA EL BOT: Mandar DM 100% automático a estos:');
      console.log(`  ${qualifiedLeads.map(l => '@' + l.username).join(', ')}`);
  } else {
      console.log('\n  Ningún perfil cumplió con los súper estrictos criterios de negocio.');
  }
}

runAgent().catch(err => console.error('\n❌ Error global:', err.message));
