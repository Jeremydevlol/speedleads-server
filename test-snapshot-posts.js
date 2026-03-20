import axios from 'axios';

const BD_API_TOKEN = '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const SNAPSHOT_ID = 'sd_mlzn5zp5m7rus8j3s'; // El nuevo ID del scraper de Posts

async function fetchPostsSnapshot() {
  console.log(`📥 Descargando Snapshot de Posts: ${SNAPSHOT_ID}...`);
  try {
    const response = await axios.get(
      `https://api.brightdata.com/datasets/v3/snapshot/${SNAPSHOT_ID}?format=json`,
      { headers: { 'Authorization': `Bearer ${BD_API_TOKEN}` } }
    );
    
    let data = response.data;
    if (typeof data === 'string') {
        data = data.trim().split('\n').map(line => JSON.parse(line));
    }
    
    console.log(`✅ ¡Éxito! Recuperados datos de Posts.`);
    
    // Muestra algunos posteos
    data.slice(0, 3).forEach((p, idx) => {
        console.log(`\n📸 Post #${idx + 1} del perfil: ${p.account || p.url}`);
        if (p.caption) console.log(`   📝 Caption: ${p.caption.substring(0, 80).replace(/\\n/g, ' ')}...`);
        if (p.likes) console.log(`   ❤️ Likes: ${p.likes}`);
        if (p.comments) console.log(`   💬 Comentarios: ${p.comments}`);
        if (p.url) console.log(`   🔗 URL: ${p.url}`);
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo snapshot:', error.response?.data || error.message);
  }
}

fetchPostsSnapshot();
