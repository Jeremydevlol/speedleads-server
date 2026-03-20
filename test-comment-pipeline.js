import axios from 'axios';
import dotenv from 'dotenv';
import { IgApiClient } from 'instagram-private-api';
import OpenAI from 'openai';

dotenv.config();
process.env.IG_PROXY_URL = ''; // Usamos nuestra IP/Proxy si está configurado

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BD_API_TOKEN = process.env.BD_SCRAPER_TOKEN || '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const DATASET_ID = 'gd_l1vikfch901nx3by4'; // Instagram Profiles

const IG_USERNAME = 'nfnn404';
const IG_PASSWORD = 'Dios2090.';
const TARGET_USERNAME = 'danieldtoro_oficial';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runCommentBot() {
  console.log(`\n🚀 INICIANDO AGENTE COMENTARISTA: Análisis, Like y Comentario a @${TARGET_USERNAME}`);
  console.log(`═════════════════════════════════════════════════════════`);

  // ==========================================
  // 1. Scrape con Bright Data
  // ==========================================
  console.log(`\n🔍 1. Leyendo los últimos posts de @${TARGET_USERNAME} via Bright Data...`);
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
        console.error("RAW Data from Bright Data:", JSON.stringify(data).substring(0, 500));
        throw new Error("No se encontraron posts para comentar.");
    }
    console.log(`   ✅ Extraído el perfil. Analizaremos su ÚLTIMO post para comentarlo.`);
  } catch (error) {
    console.error('❌ Error Bright Data:', error.response?.data || error.message);
    return;
  }

  // ==========================================
  // 2. Análisis con OpenAI para COMENTARIO PÚBLICO
  // ==========================================
  console.log(`\n🧠 2. La Inteligencia Artificial está redactando un comentario público...`);
  const lastPost = profileData.posts[0]; // Tomamos el primer post
  
  const prompt = `
    Eres un usuario real de Instagram navegando por tu feed.
    Tu objetivo es leer el caption de la última publicación de un prospecto y dejarle un COMENTARIO genuino, amigable y que llame un poco la atención (sin vender nada directamente en el comentario).
    
    Reglas para el comentario:
    1. Debe estar 100% relacionado con de lo que trata la publicación.
    2. Suena auténtico, como si fueras un colega o alguien muy interesado en el tema.
    3. Puede terminar con una pregunta breve o un buen deseo.
    4. Usa un par de emojis al final.
    5. MUY CORTO (máximo 15-20 palabras). A nadie le gusta leer testamentos en los comentarios.
    6. Devuelve SOLAMENTE el texto del comentario. Sin comillas ni explicaciones extra.
  `;

  const userInfo = `
    Username: @${TARGET_USERNAME}
    Caption del Post a comentar: "${lastPost.caption || 'Imagen sin texto'}"
  `;

  let commentText = "";
  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userInfo }
      ],
      temperature: 0.8,
    });
    commentText = aiResponse.choices[0].message.content.trim().replace(/^["'\\]+|["'\\]+$/g, '');
    console.log(`   💬 Comentario Generado:\n\n   👉 "${commentText}"\n`);
  } catch (e) {
    console.error('❌ Error OpenAI:', e.message);
    return;
  }

  // ==========================================
  // 3. Like y Comentario por Instagram Private API
  // ==========================================
  console.log(`🤖 3. Conectando a cuenta de IG para dar Like y COMENTAR...`);
  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);
  
  try {
    await ig.simulate.preLoginFlow();
    await ig.account.login(IG_USERNAME, IG_PASSWORD);
    try { await ig.simulate.postLoginFlow(); } catch(e){}
    console.log(`   ✅ Login OK en @${IG_USERNAME}`);
    
    // Buscar al usuario en la API de IG
    const targetId = await ig.user.getIdByUsername(TARGET_USERNAME);
    
    // Extraer los posts usando la API nativa de Instagram (para tener el ID multimedia exacto)
    console.log(`   🕵️ Extrayendo el feed real de la cuenta para obtener el Media ID...`);
    const userFeed = ig.feed.user(targetId);
    const items = await userFeed.items();
    
    if (items.length === 0) {
        console.log('❌ El usuario no tiene publicaciones accesibles.');
        return;
    }

    const latestIgPost = items[0]; // El post más reciente
    const mediaId = latestIgPost.id; // Formato requerido por IG (ej: 34156641_532321)
    
    console.log(`   ⏳ Simulando interés viendo el post (5 segundos)...`);
    await delay(5000);

    // DAR LIKE
    console.log(`   ❤️ Ejecutando Like a la publicación...`);
    await ig.media.like({
      mediaId: mediaId,
      moduleInfo: { module_name: 'profile', user_id: targetId },
      d: 1 // Double-tap like
    });
    console.log(`   ✅ LIKE enviado exitosamente.`);
    
    await delay(3000); // Pausa humana entre like y comentario

    // COMENTAR
    console.log(`   💬 Publicando el comentario...`);
    await ig.media.comment({
      mediaId: mediaId,
      text: commentText
    });
    console.log(`   ✅ ¡COMENTARIO PUBLICADO CON ÉXITO en el post de @${TARGET_USERNAME}! 🚀`);

  } catch (e) {
    console.error('❌ Error en Instagram Actions:', e.message);
  }
  
  console.log(`\n═════════════════════════════════════════════════════════`);
  console.log(` 🎉 FLUJO DE LIKE Y COMENTARIO COMPLETADO`);
  console.log(`═════════════════════════════════════════════════════════\n`);
}

runCommentBot();
