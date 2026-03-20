import axios from 'axios';
import dotenv from 'dotenv';
import { IgApiClient } from 'instagram-private-api';
import OpenAI from 'openai';

dotenv.config();

// Override de proxy para seguridad
process.env.IG_PROXY_URL = '';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BD_API_TOKEN = process.env.BD_SCRAPER_TOKEN || '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const DATASET_ID = 'gd_l1vikfch901nx3by4'; // Instagram Profiles

const IG_USERNAME = 'nfnn404';
const IG_PASSWORD = 'Dios2090.';
const TARGET_USERNAME = 'iscastilow';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runOmniBot() {
  console.log(`\n🚀 INICIANDO OMNI-AGENTE: Like + Comentario + DM a @${TARGET_USERNAME}`);
  console.log(`═════════════════════════════════════════════════════════`);

  // ==========================================
  // 1. Scrape con Bright Data
  // ==========================================
  console.log(`\n🔍 1. Leyendo los últimos posts y perfil de @${TARGET_USERNAME} via Bright Data...`);
  let profileData;
  try {
    const response = await axios.post(
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${DATASET_ID}&notify=false&include_errors=true`,
      [{ url: `https://www.instagram.com/${TARGET_USERNAME}/` }],
      { headers: { 'Authorization': `Bearer ${BD_API_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 90000 }
    );
    
    let data = response.data;
    if (typeof data === 'string') {
        data = data.trim().split('\n').filter(Boolean).map(line => {
            try { return JSON.parse(line) } catch (e) { return null }
        }).filter(Boolean);
    }
    profileData = Array.isArray(data) ? data[0] : data;
    
    if (!profileData || !profileData.posts || profileData.posts.length === 0) {
        throw new Error("No se encontraron posts para analizar.");
    }
    console.log(`   ✅ Extraído: ${profileData.full_name}, Seguidores: ${profileData.followers}`);
  } catch (error) {
    console.error('❌ Error Bright Data:', error.response?.data || error.message);
    return;
  }

  // ==========================================
  // 2. Inteligencia Artificial (Prompt Doble)
  // ==========================================
  console.log(`\n🧠 2. La IA está generando el Comentario Público y el Mensaje Privado...`);
  const lastPost = profileData.posts[0]; // El post en el que comentaremos
  
  let recentPostsArray = 'Sin posts recientes';
  if (profileData.posts && profileData.posts.length > 0) {
     const topPosts = profileData.posts.slice(0, 5);
     recentPostsArray = topPosts.map((p, i) => `Post #${i+1}: "${p.caption?.substring(0, 150)}..."`).join('\n\n');
  }

  const prompt = `
    Eres un experto en relaciones B2B y prospección por Instagram (Agencia SpeedLeads).
    Analiza este perfil y sus posts. Debes generar DOS cosas en un JSON:
    
    1. "comentario_publico": Un comentario genuino y corto para DEJAR EN LA ÚLTIMA PUBLICACIÓN. Específico al tema del caption. Usa emojis, máximo 20 palabras. NO vendas nada aquí.
    2. "dm_privado": Un mensaje directo hiper-personalizado que hace referencia a su perfil o a uno de sus últimos posts. El segundo párrafo vende casualmente: "¿Tienes automatizado tu Instagram para responder al instante 24/7 y no perder leads? Te ayudaría con tu tráfico". Máximo 60-70 palabras, muy natural y humano.
    
    Devuelve ÚNICAMENTE un JSON válido con estas dos claves. Nada más.
  `;

  const userInfo = `
    Username: @${TARGET_USERNAME}
    Name: ${profileData.full_name}
    Bio: ${profileData.biography}
    ---
    Último post (Para el comentario público):
    "${lastPost.caption || 'Imagen sin texto'}"
    ---
    Posts recientes (Para contexto del DM privado):
    ${recentPostsArray}
  `;

  let aiResult = {};
  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userInfo }
      ],
      temperature: 0.8,
    });
    
    const content = aiResponse.choices[0].message.content;
    if (!content) throw new Error("La IA no devolvió contenido.");
    aiResult = JSON.parse(content.trim());
    console.log(`   📝 IA Generó:`);
    console.log(`      - Comentario: "${aiResult.comentario_publico}"`);
    console.log(`      - DM Privado: "${aiResult.dm_privado}"\n`);

  } catch (e) {
    console.error('❌ Error OpenAI:', e.message);
    return;
  }

  // ==========================================
  // 3. OMNI-EJECUCIÓN en Instagram
  // ==========================================
  console.log(`🤖 3. Conectando a cuenta de IG para ejecutar el Omni-Flujo...`);
  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);
  
  try {
    await ig.simulate.preLoginFlow();
    await ig.account.login(IG_USERNAME, IG_PASSWORD);
    try { await ig.simulate.postLoginFlow(); } catch(e){}
    console.log(`   ✅ Login OK en @${IG_USERNAME}`);
    
    const targetId = await ig.user.getIdByUsername(TARGET_USERNAME);
    
    // Obtener su feed para el Like y Comentario
    console.log(`   🕵️ Entrando al feed de @${TARGET_USERNAME}...`);
    const userFeed = ig.feed.user(targetId);
    const items = await userFeed.items();
    
    if (items.length > 0) {
        const latestIgPost = items[0];
        const mediaId = latestIgPost.id;
        
        console.log(`   ⏳ Simulando interés viendo el post (6s)...`);
        await delay(6000);

        // A) DAR LIKE
        console.log(`   ❤️ Dando Like al último post...`);
        await ig.media.like({ mediaId: mediaId, moduleInfo: { module_name: 'profile', user_id: targetId }, d: 1 });
        console.log(`   ✅ LIKE enviado.`);
        
        await delay(3000);

        // B) COMENTAR
        console.log(`   💬 Dejando el comentario orgánico...`);
        await ig.media.comment({ mediaId: mediaId, text: aiResult.comentario_publico });
        console.log(`   ✅ COMENTARIO publicado con éxito.`);
        
    } else {
        console.log('   ⚠️ El usuario no tiene posts o no son accesibles para Like/Comment.');
    }

    await delay(5000); // Pausa humana crítica antes del DM

    // C) ENVIAR DM PRIVADO
    console.log(`   📨 Preparando DM Privado...`);
    const thread = ig.entity.directThread([targetId.toString()]);
    await thread.broadcastText(aiResult.dm_privado);
    console.log(`   ✅ ¡BOMBA ENVIADA! Mensaje privado entregado a @${TARGET_USERNAME} 🚀`);

  } catch (e) {
    console.error('❌ Error en Instagram Actions:', e.message);
  }
  
  console.log(`\n═════════════════════════════════════════════════════════`);
  console.log(` 🎉 OMNI-FLUJO COMPLETADO (LIKE + COMENTARIO + DM)`);
  console.log(`═════════════════════════════════════════════════════════\n`);
}

runOmniBot();
