/**
 * ENVÍO SEGURO: 8 DMs a seguidores de @joelbejo187
 * Delays más largos (45s-90s) para parecer más humano
 */
import dotenv from 'dotenv';
dotenv.config();
process.env.IG_PROXY_URL = '';

import { IgApiClient } from 'instagram-private-api';

const IG_USERNAME = 'nfnn404';
const IG_PASSWORD = 'Dios2090.';

const MESSAGES = [
  "¡Hola! ¿Qué tal tu día? 😊",
  "Hey! ¿Cómo va tu día? 🙌",
  "¡Hola! ¿Qué tal va todo hoy?",
  "Hey, ¿qué tal tu día? ✨",
  "Hola! ¿Cómo estás hoy? 😄",
  "¡Buenas! ¿Qué tal va tu día?",
  "Hey! ¿Todo bien hoy? 😊",
  "Hola, ¿cómo va tu día? 👋",
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);
  
  console.log('═══════════════════════════════════════════════');
  console.log('  ENVÍO SEGURO: 8 DMs a seguidores @cristiano');
  console.log('  Delays: 45-90 segundos entre mensajes');
  console.log('═══════════════════════════════════════════════\n');

  try { await ig.simulate.preLoginFlow(); } catch(e) {}
  
  console.log('🔐 Login...');
  const user = await ig.account.login(IG_USERNAME, IG_PASSWORD);
  console.log('✅ Login OK — @nfnn404\n');
  
  try { await ig.simulate.postLoginFlow(); } catch(e) {}
  
  // Esperar 10s antes de hacer nada (simular uso normal)
  console.log('⏳ Esperando 10s antes de empezar (simular uso normal)...');
  await delay(10000);

  // Simular ver el feed primero
  console.log('👀 Viendo timeline...');
  try { const feed = ig.feed.timeline(); await feed.items(); } catch(e) {}
  await delay(5000);

  // Extraer seguidores
  console.log('\n📋 Extrayendo seguidores de @cristiano...');
  const targetId = await ig.user.getIdByUsername('cristiano');
  const followersFeed = ig.feed.accountFollowers(targetId);
  const followers = await followersFeed.items();
  console.log(`   ${followers.length} seguidores encontrados`);
  
  const targets = followers.sort(() => Math.random() - 0.5).slice(0, 8);
  console.log(`   Seleccionados: ${targets.map(t => '@' + t.username).join(', ')}\n`);

  await delay(5000);

  let sent = 0, failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const msg = MESSAGES[i];
    
    console.log(`[${i+1}/8] @${target.username} — "${msg}"`);
    
    try {
      // Ver perfil del usuario (simular curiosidad)
      await ig.user.info(target.pk);
      const profileDelay = 3 + Math.random() * 5;
      console.log(`   👤 Viendo perfil (${profileDelay.toFixed(0)}s)...`);
      await delay(profileDelay * 1000);

      // Enviar DM
      const thread = ig.entity.directThread([target.pk.toString()]);
      await thread.broadcastText(msg);
      sent++;
      console.log(`   ✅ Enviado (${sent}/8)`);
      
      if (i < targets.length - 1) {
        // Delay largo: 45-90 segundos
        const delaySec = 45 + Math.random() * 45;
        console.log(`   ⏳ Esperando ${delaySec.toFixed(0)}s...\n`);
        await delay(delaySec * 1000);
        
        // Cada 3 mensajes: simular actividad extra
        if ((i + 1) % 3 === 0) {
          console.log('   👀 Simulando: revisar inbox...');
          try { await ig.feed.directInbox().items(); } catch(e) {}
          await delay(5000 + Math.random() * 5000);
        }
      }
    } catch(error) {
      failed++;
      console.log(`   ❌ Error: ${error.message?.substring(0, 100)}\n`);
      
      if (error.message?.includes('spam') || error.message?.includes('checkpoint') || error.message?.includes('feedback')) {
        console.log('🚨 Instagram detectó actividad. PARANDO.');
        break;
      }
      await delay(10000);
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  RESULTADO: ${sent}✅ enviados, ${failed}❌ fallidos`);
  console.log('═══════════════════════════════════════════════');
}

run().catch(err => console.error('❌', err.message));
