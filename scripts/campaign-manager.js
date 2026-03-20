import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import { IgApiClient } from 'instagram-private-api';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
process.env.IG_PROXY_URL = ''; // Usamos Proxy si lo tienes en el servidor

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BD_API_TOKEN = process.env.BD_SCRAPER_TOKEN || '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const DATASET_ID = 'gd_l1vikfch901nx3by4'; 

const IG_USERNAME = 'nfnn404'; // Cambia esto por la cuenta que enviará
const IG_PASSWORD = 'Dios2090.';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, 'campaign_database.json');

// ==========================================
// 1. GESTOR DE BASE DE DATOS LOCAL
// ==========================================
function loadDB() {
    if (fs.existsSync(DB_FILE)) { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
    return { leads: {}, config: { dailyLimit: 50, currentDaySent: 0, lastSentDate: null } };
}

function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function randomDelay(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// 2. GESTOR DE SESIÓN INSTAGRAM
// ==========================================
async function loginInstagram(username, password) {
    console.log(`\n🔐 [Insta-Auth] Iniciando sesión en @${username}...`);
    const ig = new IgApiClient();
    ig.state.generateDevice(username);
    await ig.simulate.preLoginFlow();
    await ig.account.login(username, password);
    try { await ig.simulate.postLoginFlow(); } catch(e){}
    console.log(`   ✅ Login exitoso.`);
    return ig;
}

async function logoutInstagram(ig) {
    console.log(`\n🚪 [Insta-Auth] Cerrando sesión y limpiando datos...`);
    try {
        await ig.account.logout();
        console.log(`   ✅ Sesión cerrada correctamente.`);
    } catch (e) {
        console.log(`   ⚠️ No se pudo cerrar la sesión limpiamente: ${e.message}`);
    }
}

// ==========================================
// 3. EXTRACCIÓN MASIVA (La Mina)
// ==========================================
async function extractTargetFollowers(ig, targetAccount, maxExtract = 100) {
    const db = loadDB();
    console.log(`\n🕵️ [Fase 1] Extrayendo seguidores de @${targetAccount}...`);
    
    const targetId = await ig.user.getIdByUsername(targetAccount);
    const followersFeed = ig.feed.accountFollowers(targetId);
    let allUsernames = [];
    
    try {
        while (allUsernames.length < maxExtract) {
            const items = await followersFeed.items();
            if (items.length === 0) break;
            allUsernames.push(...items.map(i => i.username));
            console.log(`   ... paginando: llevamos ${allUsernames.length} seguidores extraídos.`);
            await randomDelay(2000, 4000); // 2-4 segundos entre páginas
        }
    } catch (e) {
        console.log(`   ⚠️ Límite de paginación alcanzado, nos quedamos con ${allUsernames.length}.`);
    }

    allUsernames = allUsernames.slice(0, maxExtract);
    const newTargetUsernames = allUsernames.filter(u => !db.leads[u]);
    
    if (newTargetUsernames.length === 0) {
        console.log(`   ✅ Todos los seguidores extraídos ya están en la base de datos.`);
        return;
    }

    console.log(`⚡ [Fase 1.5] Enviando ${newTargetUsernames.length} NUEVOS perfiles a Bright Data...`);
    
    // Scrape batches of 50
    for(let i = 0; i < newTargetUsernames.length; i += 50) {
        const batchUrls = newTargetUsernames.slice(i, i + 50).map(u => ({ url: `https://www.instagram.com/${u}/` }));
        console.log(`   -> Scrapeando lote de ${batchUrls.length} perfiles...`);
        
        try {
            const bdResponse = await axios.post(
              `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${DATASET_ID}&notify=false&include_errors=true`,
              batchUrls,
              { headers: { 'Authorization': `Bearer ${BD_API_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 120000 }
            );
            
            let data = bdResponse.data;
            if (typeof data === 'string') {
                data = data.trim().split('\n').filter(Boolean).map(line => { try { return JSON.parse(line) } catch (e) { return null } }).filter(Boolean);
            }
            if (!Array.isArray(data)) data = [data];

            for (const profile of data) {
                if (!profile) continue;
                const username = profile.username || profile.account;
                if (!username || db.leads[username]) continue;

                db.leads[username] = {
                    username: username,
                    name: profile.full_name || '',
                    bio: profile.biography || '',
                    posts: profile.posts || [],
                    status: 'pending',
                    history: [],
                    date_added: new Date().toISOString()
                };
            }
            saveDB(db);
        } catch (e) {
            console.error(`   ❌ Error Bright Data en este lote:`, e.message);
        }
    }
    console.log(`✅ Base de datos nutrida con éxito.\n`);
}

// ==========================================
// 4. GOTEO OMNI (Like + Comment + DM)
// ==========================================
async function runOmniDripCampaign(ig) {
    const db = loadDB();
    const today = new Date().toISOString().split('T')[0];

    // Reiniciar contadores diarios
    if (db.config.lastSentDate !== today) {
        db.config.currentDaySent = 0;
        db.config.lastSentDate = today;
        saveDB(db);
    }

    const pendingLeads = Object.keys(db.leads).filter(k => db.leads[k].status === 'pending');
    console.log(`\n🚀 [Fase 2] INICIANDO OMNI-AGENTE (Like -> Comentario -> DM)`);
    console.log(`📊 Leads Pendientes: ${pendingLeads.length}`);
    console.log(`📅 Acciones de hoy: ${db.config.currentDaySent} / ${db.config.dailyLimit}\n`);

    if (pendingLeads.length === 0) {
        console.log("✅ No hay leads pendientes.");
        return;
    }

    if (db.config.currentDaySent >= db.config.dailyLimit) {
        console.log(`🛑 Límite diario seguro de ${db.config.dailyLimit} interacciones alcanzado hoy.`);
        return;
    }

    const availableSlots = db.config.dailyLimit - db.config.currentDaySent;
    const batchSize = Math.min(availableSlots, 10); // Para esta prueba, usamos batch de 10
    const batch = pendingLeads.slice(0, batchSize);

    console.log(`🔄 Procesando Lote de ${batch.length} leads...\n`);

    for (let i = 0; i < batch.length; i++) {
        const leadKey = batch[i];
        const lead = db.leads[leadKey];

        console.log(`\n---------------------------------------------------------`);
        console.log(`👤 Prospecto: @${lead.username}`);
        
        const hasPosts = lead.posts && lead.posts.length > 0;
        const lastPostCaption = hasPosts ? lead.posts[0].caption || 'Imagen sin texto' : 'No tiene posts recientes';
        
        let recentPostsArray = [];
        if (hasPosts) {
            const topPosts = lead.posts.slice(0, 3);
            recentPostsArray = topPosts.map((p, j) => `Post #${j+1}: "${p.caption?.substring(0, 150)}..."`).join('\n\n');
        }

        const prompt = `
          Eres un experto en relaciones B2B (Agencia SpeedLeads). Genera un JSON con DOS cosas:
          
          1. "comentario_publico": Un comentario genuino para dejar en su última publicación basado en su caption. Breve, con emojis, sin ventas directas. (max 20 palabras). Si no tiene posts, devuelve un string vacío "".
          2. "dm_privado": Un DM casual vendiendo automatización de Instagram/WhatsApp. Haz referencia a algo de su bio o posts. Retoma el comentario si le dejaste uno. Termina con "¿Encajamos?". (max 60 palabras).
          
          Devuelve ÚNICAMENTE un JSON válido.
        `;

        const userInfo = `
          Name: ${lead.name}
          Bio: ${lead.bio}
          Último post para Comentar: "${lastPostCaption}"
          Para el DM privado (Contexto): ${recentPostsArray.length ? recentPostsArray : 'Sin posts'}
        `;

        let aiResult = { comentario_publico: "", dm_privado: "" };
        try {
            const aiResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              response_format: { type: "json_object" },
              messages: [ { role: "system", content: prompt }, { role: "user", content: userInfo } ],
              temperature: 0.8,
            });
            const content = aiResponse.choices[0].message.content;
            if(!content) throw new Error("Mensaje de IA vino vacío.");
            aiResult = JSON.parse(content.trim());
            console.log(`   📝 IA Generó:`);
            console.log(`      - Comentario: "${aiResult.comentario_publico}"`);
            console.log(`      - DM Privado: "${aiResult.dm_privado}"`);
        } catch (e) {
            console.error(`   ❌ Error IA: ${e.message}`);
            continue;
        }

        try {
            const targetId = await ig.user.getIdByUsername(lead.username);
            
            // 1. LIKE Y COMENTARIO (Si tiene posts)
            if (aiResult.comentario_publico && aiResult.comentario_publico !== "") {
                console.log(`   🕵️ Entrando al feed del usuario para dar Like/Comentar...`);
                const userFeed = ig.feed.user(targetId);
                const items = await userFeed.items();
                
                if (items.length > 0) {
                    const latestPostId = items[0].id;
                    await randomDelay(3000, 6000); // Viendo post

                    // Like
                    console.log(`   ❤️ Dando Like...`);
                    await ig.media.like({ mediaId: latestPostId, moduleInfo: { module_name: 'profile', user_id: targetId }, d: 1 });
                    
                    await randomDelay(2000, 4000);
                    
                    // Comment
                    console.log(`   💬 Comentando...`);
                    await ig.media.comment({ mediaId: latestPostId, text: aiResult.comentario_publico });
                    console.log(`   ✅ Like y Comentario exitosos.`);
                }
            } else {
                console.log(`   ⚠️ Sin posts públicos para comentar. Saltando a DM directo.`);
            }

            await randomDelay(4000, 7000); // Pausa human antes del DM

            // 2. DM PRIVADO
            console.log(`   📨 Enviando DM Privado...`);
            const thread = ig.entity.directThread([targetId.toString()]);
            await thread.broadcastText(aiResult.dm_privado);
            console.log(`   ✅ ¡Éxito! DM entregado a @${lead.username}`);
            
            // Actualizar DB
            lead.status = 'contacted';
            lead.history.push({ date: new Date().toISOString(), type: 'comment', message: aiResult.comentario_publico });
            lead.history.push({ date: new Date().toISOString(), type: 'dm', message: aiResult.dm_privado });
            db.config.currentDaySent++;
            saveDB(db);

        } catch (err) {
            console.error(`   ❌ Falló interacción entera con @${lead.username}:`, err.message);
            if (err.message.includes('403 Forbidden')) {
                console.log("\n‼️ Límite de acciones estrictas de IG alcanzado (403). Continuando con el siguiente por si se libera, pero ten precaución.");
                continue; // En vez de return, continuamos en la prueba para ver si alguno pasa
            }
        }
        
        // PAUSA ENTRE CAMPAÑAS DE CADA USUARIO (Para evitar detección de Bot)
        // En producción: entre 3 y 6 minutos. Para desarrollo usaré 15 - 25 segs.
        if (i < batch.length - 1) {
             const waitSeconds = Math.floor(Math.random() * (25 - 15 + 1)) + 15;
             console.log(`   ⏳ PAUSA HUMANA DE SEGURIDAD: ${(waitSeconds).toFixed(1)} segundos antes del siguiente lead...\n`);
             await randomDelay(waitSeconds * 1000, waitSeconds * 1000);
        }
    }
    console.log(`\n🏁 Goteo Omni completado por hoy.`);
}

// ==========================================
// 5. FLUJO MAESTRO
// ==========================================
async function main() {
    console.log(`\n👑 SPEEDLEADS IA: GESTOR OMNI DE CAMPAÑAS MASIVAS`);
    console.log(`=================================================`);
    
    // 1. Iniciamos sesión en la cuenta emisora
    const ig = await loginInstagram(IG_USERNAME, IG_PASSWORD);

    try {
        const targetAccount = process.argv[2] || 'danieldtoro_oficial';
        const extractLimit = parseInt(process.argv[3]) || 10;
        await extractTargetFollowers(ig, targetAccount, extractLimit);

        // 3. Ejecutamos el Omni Bot Inteligente
        await runOmniDripCampaign(ig);
    } catch (e) {
        console.error(`❌ Error fatal en la campaña: ${e.message}`);
    } finally {
        // 4. SIEMPRE cerrar la sesión limpiamente al final para no dejar tokens colgando y evitar flags
        await logoutInstagram(ig);
    }
}

main();
