import axios from 'axios';
import dotenv from 'dotenv';
import OpenAI from 'openai';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const BD_API_TOKEN = process.env.BD_SCRAPER_TOKEN || '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const DATASET_ID = 'gd_l1vikfch901nx3by4'; // Instagram Profiles (que incluye posts recientes en su respuesta)

async function scrapeAndAnalyzeTarget(username) {
  console.log(`\n🔍 1. Scrapeando a @${username} con Bright Data...`);
  const startTime = Date.now();
  
  let profileData;
  try {
    const response = await axios.post(
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${DATASET_ID}&notify=false&include_errors=true`,
      [{ url: `https://www.instagram.com/${username}/` }],
      {
        headers: {
          'Authorization': `Bearer ${BD_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 90000
      }
    );
    
    let data = response.data;
    if (typeof data === 'string') {
        const lines = data.trim().split('\n').filter(Boolean);
        data = lines.map(line => {
          try { return JSON.parse(line) } catch (e) { return null }
        }).filter(Boolean);
    }
    
    // Asignar el primer objeto válido
    profileData = Array.isArray(data) ? data[0] : data;
    
    console.log(`✅ Scrapeo exitoso en ${((Date.now() - startTime)/1000).toFixed(1)} segundos.`);
    console.log(`   - Nombre: ${profileData.full_name}`);
    console.log(`   - Seguidores: ${profileData.followers}`);
    console.log(`   - Posts recientes extraídos: ${profileData.posts ? profileData.posts.length : 0}`);
    
  } catch(error) {
    console.error('❌ Error en Bright Data:', error.response?.data || error.message);
    return;
  }

  // Si no hay API key de OpenAI, abortamos
  if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️ Falta OPENAI_API_KEY en .env');
      return;
  }

  console.log(`\n🧠 2. Analizando perfil y posts con OpenAI...`);
  
  // Extraemos los captions de los últimos 3 posts para darle contexto a la IA
  let recentPosts = '';
  if (profileData.posts && profileData.posts.length > 0) {
      const topPosts = profileData.posts.slice(0, 3);
      recentPosts = topPosts.map((p, i) => `Post ${i+1} (Likes: ${p.likes}): ${p.caption}`).join('\n\n');
  }

  const systemPrompt = `
    Eres un experto en ventas B2B y prospección por Instagram (Cold DM) para una agencia de automatización con IA ("SpeedLeads").
    Tu objetivo es analizar un perfil objetivo (Biografía y últimos posts) y generar 2 opciones de Mensaje Directo (DM) HIPER PERSUASIVOS.
    
    Contexto de lo que vendemos (SpeedLeads):
    Ayudamos a creadores, coaches y negocios a automatizar su atención al cliente y ventas por DM usando Inteligencia Artificial, para que no pierdan clientes mientras duermen y ahorren tiempo.

    Reglas para los DMs:
    1. DEBEN ser casuales, no sonar a un "bot" o a una plantilla copiada. Usa lenguaje natural y directo.
    2. El primer párrafo DEBE ser un halago o comentario MUY ESPECÍFICO sobre su biografía o uno de sus posts recientes. Esto demuestra que investigamos.
    3. El segundo párrafo debe presentar nuestro valor de forma casual ("...me di cuenta de que con el tamaño de tu cuenta debes recibir muchos DMs, ¿ya estás usando IA para filtrar/cerrar ventas en automático?").
    4. Terminar con una pregunta cortita para abrir conversación ("Call to Action").
    5. No más de 3 párrafos cortos en total.
    
    Devuelve ÚNICAMENTE un JSON válido con este formato:
    {
      "analisis_perfil": "Resumen de a qué se dedica este prospecto y su estado actual",
      "opcion_1_gancho_por_bio": "Mensaje completo",
      "opcion_2_gancho_por_post": "Mensaje completo"
    }
  `;

  const userInfo = `
    Username: @${profileData.username || profileData.account}
    Name: ${profileData.full_name}
    Followers: ${profileData.followers}
    Bio: ${profileData.biography}
    Vende algo/link bio: ${profileData.external_url ? profileData.external_url[0] : 'No'}
    ---
    ÚLTIMOS POSTS DEL PROSPECTO:
    ${recentPosts}
  `;

  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o", // Usamos gpt-4o para mejor redacción
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInfo }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(aiResponse.choices[0].message.content);
    
    console.log(`\n═════════════════════════════════════════════════════════`);
    console.log(`🎯 ANÁLISIS DE LA IA PARA: @${username}`);
    console.log(`═════════════════════════════════════════════════════════`);
    console.log(`📊 Perfil: ${result.analisis_perfil}\n`);
    
    console.log(`✉️ OPCIÓN 1 (Basado en su Bio):`);
    console.log(`"${result.opcion_1_gancho_por_bio}"\n`);
    
    console.log(`✉️ OPCIÓN 2 (Basado en su último Post):`);
    console.log(`"${result.opcion_2_gancho_por_post}"`);
    console.log(`═════════════════════════════════════════════════════════`);

  } catch(e) {
    console.error('❌ Error de OpenAI:', e.message);
  }
}

scrapeAndAnalyzeTarget('danieldtoro_oficial');
