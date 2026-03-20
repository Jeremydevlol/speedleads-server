import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import { IgApiClient } from 'instagram-private-api';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

process.env.IG_PROXY_URL = '';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BD_API_TOKEN = process.env.BD_SCRAPER_TOKEN || '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const DATASET_ID = 'gd_l1vikfch901nx3by4'; 

const IG_USERNAME = 'nfnn404';
const IG_PASSWORD = 'Dios2090.';
const TARGET_ACCOUNT_TO_SCRAPE = 'uniclick.io'; 
const NUM_MESSAGES = 8; 

// Archivo local para simular la Base de Datos de interacciones
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, 'interaction_history.json');

function loadHistory() {
    if (fs.existsSync(HISTORY_FILE)) {
        const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
        try { return JSON.parse(data); } catch(e) { return {}; }
    }
    return {};
}

function saveHistory(username, dmContent) {
    const history = loadHistory();
    if (!history[username]) history[username] = [];
    
    history[username].push({
        date: new Date().toISOString(),
        message: dmContent
    });
    
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

function randomDelay(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMassDMBot() {
  console.log(`\n🚀 INICIANDO MÁQUINA DE DMs MASIVOS CON MEMORIA`);
  console.log(`🎯 Objetivo: Robar ${NUM_MESSAGES} seguidores de @${TARGET_ACCOUNT_TO_SCRAPE}`);
  console.log(`═════════════════════════════════════════════════════════`);

  // Cargar memoria
  const chatHistory = loadHistory();
  const contactados = Object.keys(chatHistory).length;
  console.log(`\n🧠 Memoria cargada: Nuestro agente recuerda haber hablado con ${contactados} personas en el pasado.`);

  // 1. Extraer Seguidores
  console.log(`\n[PASO 1] 🕵️ Extrayendo lista de seguidores de @${TARGET_ACCOUNT_TO_SCRAPE}...`);
  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);
  
  try {
    await ig.simulate.preLoginFlow();
    await ig.account.login(IG_USERNAME, IG_PASSWORD);
    try { await ig.simulate.postLoginFlow(); } catch(e){}
    console.log(`   ✅ Login OK en cuenta emitente @${IG_USERNAME}`);

    const targetId = await ig.user.getIdByUsername(TARGET_ACCOUNT_TO_SCRAPE);
    const followersFeed = ig.feed.accountFollowers(targetId);
    let items = await followersFeed.items();
    
    items = items.slice(0, NUM_MESSAGES); 
    const usernames = items.map(i => i.username);
    const urlsToScrape = usernames.map(u => `https://www.instagram.com/${u}/`);
    console.log(`   ✅ Obtenidos ${urlsToScrape.length} seguidores: ${usernames.join(', ')}`);

    // 2. Bright Data Scraping
    console.log(`\n[PASO 2] ⚡ Extrayendo perfiles y posts (Bright Data)...`);
    const startTime = Date.now();
    
    let scrapedData = [];
    try {
        const bdResponse = await axios.post(
          `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${DATASET_ID}&notify=false&include_errors=true`,
          urlsToScrape.map(url => ({ url })),
          { headers: { 'Authorization': `Bearer ${BD_API_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 120000 }
        );
        
        let data = bdResponse.data;
        if (typeof data === 'string') {
            data = data.trim().split('\n').filter(Boolean).map(line => {
                try { return JSON.parse(line) } catch (e) { return null }
            }).filter(Boolean);
        }
        scrapedData = Array.isArray(data) ? data : [data];
    } catch(e) {
        console.error('❌ Error Bright Data:', e.message);
        return;
    }
    
    console.log(`   ✅ Completado. Listos para analizar los prospectos.`);

    // 3. Loop: IA + Contexto Histórico + Envío Seguro
    console.log(`\n[PASO 3] 🧠 Iniciando Bucle AI Inteligente (${scrapedData.length} Prospectos)...`);
    
    let dmEnviados = 0;
    for (let i = 0; i < scrapedData.length; i++) {
        const profile = scrapedData[i];
        const prospectUsername = profile.username || profile.account || usernames[i];
        
        console.log(`\n---------------------------------------------------------`);
        console.log(`👤 Prospecto #${i+1}: @${prospectUsername}`);
        
        // A. Cargar su Historial de Conversación
        const userPastInteractions = chatHistory[prospectUsername] || [];
        const hasHistory = userPastInteractions.length > 0;
        
        if (hasHistory) {
            console.log(`   📂 ¡Ojo! Ya hemos hablado con esta persona antes (${userPastInteractions.length} mensajes).`);
        } else {
            console.log(`   📂 Es un lead totalmente nuevo (Cold DM).`);
        }

        let historyContext = hasHistory 
            ? `¡IMPORTANTE! YA le has enviado mensajes a esta persona antes. \nHistorial de mensajes previos que tú le mandaste: \n${userPastInteractions.map((h, idx) => `Mensaje ${idx+1}: "${h.message}"`).join('\n')}\n\nREGLA ESTRICTA: NO te vuelvas a presentar. NO le envíes tu pitch base otra vez. Haz un SEGUIMIENTO (Follow-up) súper casual en 1 sola frase. Algo como: "¿Pudiste ver el mensaje anterior? Sigo a tu disposición" o un comentario de valor rápido basado en su perfil. Mantenlo cortísimo y humano.`
            : `Este es el PRIMER mensaje que le envías (Cold DM). \nRegla: El primer párrafo DEBE ser un comentario genuino sobre algo específico de sus últimos posts o de su biografía. El segundo párrafo vende casualmente: "¿Tienes automatizado tu Instagram para no perder clientes 24/7? Te ayudaría muchísimo con tu cuenta".`;
        
        let recentPosts = 'Sin posts recientes';
        if (profile.posts && profile.posts.length > 0) {
            const topPosts = profile.posts.slice(0, 3);
            recentPosts = topPosts.map((p, j) => `Post #${j+1}: "${p.caption?.substring(0, 100)}..."`).join('\n\n');
        }
        
        const prompt = `
          Eres un experto en relaciones comerciales (Inbound DM) de SpeedLeads (Agencia Automatización IA).
          Tu objetivo es leer este prospecto y escribir 1 solo MENSAJE DIRECTO casual respetando su historial de conversación contigo.
          
          Contexto de Estado:
          ${historyContext}
          
          Reglas Universales:
          1. Llama al usuario por su primer nombre de forma casual (siempre que sea posible).
          2. Termina con una pregunta muy corta para incitar la respuesta.
          3. MUY CORTO (máximo 40-60 palabras en TOTAL).
          4. Devuelve SOLAMENTE el texto listo para enviar. Sin comillas ni explicaciones extra.
        `;

        const userInfo = `
          Username: @${prospectUsername}
          Name: ${profile.full_name || 'Amigo'}
          Bio: ${profile.biography || ''}
          Posts: ${recentPosts}
        `;
        
        let dmContent = "";
        try {
            const aiResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [ { role: "system", content: prompt }, { role: "user", content: userInfo } ],
              temperature: 0.8,
            });
            const content = aiResponse.choices[0].message.content;
            if(!content) throw new Error("Mensaje vacío.");
            dmContent = content.trim().replace(/^["'\\]+|["'\\]+$/g, '');
            console.log(`   🧠 Mensaje IA Creado:\n      "${dmContent.replace(/\\n/g, ' ')}"`);
        } catch (e) {
            console.error(`   ❌ Error IA: ${e.message}`);
            continue;
        }
        
        // B. Enviar Mensaje y Guardar en Memoria
        console.log(`   📨 Preparando DM...`);
        try {
            const userId = await ig.user.getIdByUsername(prospectUsername);
            const thread = ig.entity.directThread([userId.toString()]);
            await thread.broadcastText(dmContent);
            console.log(`   ✅ ¡Éxito! Dm entregado a @${prospectUsername}`);
            
            // GUARDAR HISTORIAL
            saveHistory(prospectUsername, dmContent);
            console.log(`   💾 Memoria guardada (Interacción con @${prospectUsername} registrada).`);
            dmEnviados++;
        } catch (err) {
            console.error(`   ❌ Error IG al enviar a @${prospectUsername}: ${err.message}`);
        }
        
        // C. Delay Humano Seguro Anti-Ban
        if (i < scrapedData.length - 1) {
            const waitTime = Math.floor(Math.random() * (18000 - 12000 + 1)) + 12000;
            console.log(`   ⏳ Pausa Inteligente Anti-Spam: ${(waitTime/1000).toFixed(1)} segundos...`);
            await randomDelay(waitTime, waitTime);
        }
    }
    
    console.log(`\n═════════════════════════════════════════════════════════`);
    console.log(`   🎉 CAMPAÑA MASIVA INTELIGENTE FINALIZADA`);
    console.log(`   📊 ${dmEnviados} / ${scrapedData.length} DMs enviados y guardados en memoria.`);
    console.log(`═════════════════════════════════════════════════════════\n`);

  } catch (error) {
     console.error('\n❌ Error Crítico:', error.message);
  }
}

runMassDMBot();
