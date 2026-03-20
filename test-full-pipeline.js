import axios from 'axios';
import dotenv from 'dotenv';
import { IgApiClient } from 'instagram-private-api';
import OpenAI from 'openai';

dotenv.config();

// Override de proxy para seguridad
process.env.IG_PROXY_URL = '';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BD_API_TOKEN = process.env.BD_SCRAPER_TOKEN || '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const DATASET_ID = 'gd_l1vikfch901nx3by4'; // Instagram Profiles (incluye posts recientes)

const IG_USERNAME = 'nfnn404';
const IG_PASSWORD = 'Dios2090.';
const TARGET_USERNAME = 'uniclick.io';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runSuperBot() {
  console.log(`\n🚀 INICIANDO AGENTE SUPREMO: Análisis y Disparo a @${TARGET_USERNAME}`);
  console.log(`═════════════════════════════════════════════════════════`);

  // ==========================================
  // 1. Scrape con Bright Data
  // ==========================================
  console.log(`\n🔍 1. Scrapeando Perfil y Posts de @${TARGET_USERNAME} via Bright Data...`);
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
    
    if (!profileData || !profileData.followers) {
        throw new Error("No se pudo obtener la data de Bright Data correctamente.");
    }
    console.log(`   ✅ Extraído: ${profileData.full_name}, Seguidores: ${profileData.followers}`);
  } catch (error) {
    console.error('❌ Error Bright Data:', error.response?.data || error.message);
    return;
  }

  // ==========================================
  // 2. Análisis con OpenAI (10 ÚLTIMAS PUBLICACIONES)
  // ==========================================
  console.log(`\n🧠 2. Analizando hasta 10 posts y generando el DM perfecto con Inteligencia Artificial...`);
  let recentPosts = '';
  if (profileData.posts && profileData.posts.length > 0) {
      // Tomamos hasta 10 posts en lugar de 3
      const topPosts = profileData.posts.slice(0, 10);
      recentPosts = topPosts.map((p, i) => `Post #${i+1} (Likes: ${p.likes}): "${p.caption?.substring(0, 150)}..."`).join('\n\n');
  }

  const prompt = `
    Eres un experto en ventas B2B y prospección por Instagram para una agencia (SpeedLeads).
    Tu objetivo es leer un perfil y sus ÚLTIMOS 10 POSTS.
    
    Reglas:
    1. Llama al usuario por su primer nombre sacado de su perfil o el nombre comercial de la marca.
    2. ELIGE CUIDADOSAMENTE 1 POST (el que te parezca más interesante o relevante de la lista de 10) y MENCIONALO en el primer párrafo como un comentario genuino. Hazle saber explícitamente qué te encantó de esa publicación específica para demostrar que no eres un bot genérico.
    3. El segundo párrafo mete la venta adaptada a su cuenta: "¿Tienes automatizado tu Instagram o WhatsApp para no perder clientes y responder al instante 24/7? Te ayudaría muchísimo con tu volumen de tráfico." (Usa tus propias palabras naturales y casuales).
    4. Termina con una pregunta corta: "¿Te encaja la idea? / ¿Hablamos un día de estos?".
    5. MUY CORTO Y 100% HUMANO (máximo 60-70 palabras en total). No uses lenguaje formal "estimado", "cordial saludo".
    6. Devuelve SOLAMENTE el texto listo para ser copiado y pegado en Instagram.
  `;

  const userInfo = `
    Username: @${profileData.username || profileData.account}
    Name: ${profileData.full_name}
    Bio: ${profileData.biography}
    Posts: ${recentPosts}
  `;

  let dmContent = "";
  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userInfo }
      ],
      temperature: 0.8,
    });
    dmContent = aiResponse.choices[0].message.content.trim();
    // Limpiar comillas extras si las puso
    dmContent = dmContent.replace(/^["'\\]+|["'\\]+$/g, '');
    console.log(`   💬 Mensaje IA Generado:\n\n   👉 "${dmContent}"\n`);
  } catch (e) {
    console.error('❌ Error OpenAI:', e.message);
    return;
  }

  // ==========================================
  // 3. Envío por Instagram
  // ==========================================
  console.log(`🤖 3. Conectando a cuenta de IG para el disparo...`);
  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);
  
  try {
    await ig.simulate.preLoginFlow();
    await ig.account.login(IG_USERNAME, IG_PASSWORD);
    try { await ig.simulate.postLoginFlow(); } catch(e){}
    console.log(`   ✅ Login OK en @${IG_USERNAME}`);
    
    const targetId = await ig.user.getIdByUsername(TARGET_USERNAME);
    console.log(`   🕵️ ID de @${TARGET_USERNAME}: ${targetId}`);
    
    await ig.user.info(targetId);
    console.log(`   ⏳ Simulando interés leyendo su perfil (7 segundos)...`);
    await delay(7000);

    const thread = ig.entity.directThread([targetId.toString()]);
    await thread.broadcastText(dmContent);
    console.log(`   ✅ ¡BOMBA ENVIADA! Mensaje entregado con éxito a @${TARGET_USERNAME} 🚀`);

  } catch (e) {
    console.error('❌ Error en Instagram:', e.message);
  }
  
  console.log(`\n═════════════════════════════════════════════════════════`);
  console.log(` 🎉 FLUJO DE AGENTE COMPLETADO CON ÉXITO`);
  console.log(`═════════════════════════════════════════════════════════\n`);
}

runSuperBot();
