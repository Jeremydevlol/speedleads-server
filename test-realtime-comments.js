import axios from 'axios';

const BD_API_TOKEN = '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const DATASET_PROFILES = 'gd_l1vikfch901nx3by4'; // Para obtener el último post de Daniel
const DATASET_COMMENTS = 'gd_ltppn085pokosxh13'; // Scraper de Comentarios

async function scrapeDanielToroComments() {
  const username = 'danieldtoro_oficial';
  console.log(`\n🔍 1. Buscando el último post de @${username}...`);
  
  try {
    // 1. Obtener el perfil para sacar el último post
    const profileResponse = await axios.post(
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${DATASET_PROFILES}&notify=false&include_errors=true`,
      [{ url: `https://www.instagram.com/${username}/` }],
      {
        headers: {
          'Authorization': `Bearer ${BD_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 90000
      }
    );

    let profileData = profileResponse.data;
    if (typeof profileData === 'string') {
        const lines = profileData.trim().split('\n').filter(Boolean);
        profileData = lines.map(line => {
          try { return JSON.parse(line) } catch(e) { return null }
        }).filter(Boolean)[0];
    } else if (Array.isArray(profileData)) {
      profileData = profileData[0];
    }

    if (!profileData || !profileData.posts || profileData.posts.length === 0) {
      console.log('❌ No se encontraron posts en este perfil.');
      return;
    }

    // Tomar el último post
    const lastPost = profileData.posts[0];
    const postUrl = lastPost.url;
    console.log(`   ✅ Último post encontrado: ${postUrl}`);
    console.log(`   📝 Caption: "${lastPost.caption?.substring(0, 50).replace(/\\n/g, ' ')}..."`);
    console.log(`   ❤️ Likes: ${lastPost.likes}, 💬 Comentarios: ${lastPost.comments}`);

    // 2. Extraer Comentarios de ese post específico
    console.log(`\n🕵️ 2. Extrayendo comentarios de ese post usando Bright Data...`);
    
    // Este request inicia un scrape EN TIEMPO REAL (Synchronous) para sacar los comentarios
    const commentsResponse = await axios.post(
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${DATASET_COMMENTS}&notify=false&include_errors=true`,
      [{ url: postUrl }],
      {
        headers: {
          'Authorization': `Bearer ${BD_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000 // Puede tardar un poco más extrayendo comentarios
      }
    );

    let commentsData = commentsResponse.data;
    if (typeof commentsData === 'string') {
        const lines = commentsData.trim().split('\n').filter(Boolean);
        commentsData = lines.map(line => {
          try { return JSON.parse(line) } catch(e) { return null }
        }).filter(Boolean);
    }
    
    // Bright Data puede agruparlos
    let allComments = [];
    if (Array.isArray(commentsData)) {
        commentsData.forEach(item => {
            if (item.comments && Array.isArray(item.comments)) {
                allComments = allComments.concat(item.comments);
            } else if (item.comment_user) {
                 allComments.push(item);
            }
        });
    }

    if(allComments.length === 0 && Array.isArray(commentsData)) {
        allComments = commentsData;
    }

    console.log(`   ✅ ¡Éxito! Recuperados ${allComments.length} comentarios de gente altamente interesada.\n`);

    console.log(`═════════════════════════════════════════════════════════`);
    console.log(` 💎 TOP 5 PROSPECTOS (Comentaristas) DE @${username}`);
    console.log(`═════════════════════════════════════════════════════════`);
    
    // Mostrar 5 y quitar a Daniel si se comentó a sí mismo
    const validLeads = allComments.filter(c => c.comment_user !== username);
    
    validLeads.slice(0, 5).forEach((c, idx) => {
        const author = c.comment_user || c.owner_username || 'Usuario Anónimo';
        const text = c.comment || c.text || 'Sin texto';
        const likes = c.likes_number || c.likes || 0;
        
        console.log(`🗣️ Lead #${idx + 1}: @${author}`);
        console.log(`   💬 Dijo: "${text.replace(/\\n/g, ' ')}"`);
        console.log(`   ❤️ Likes en su comentario: ${likes}`);
        console.log(`   🎯 Acción bot: EXTRAER PERFIL DE @${author} -> IA -> DM PERSONALIZADO`);
        console.log(`--------------------------------------------------------`);
    });

  } catch(error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
  }
}

scrapeDanielToroComments();
