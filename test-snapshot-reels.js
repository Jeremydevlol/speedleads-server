import axios from 'axios';

const BD_API_TOKEN = '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const SNAPSHOT_ID = 'sd_mlznaiocpvtiva2ie'; // El ID del scraper de Reels

async function fetchReelsSnapshot() {
  console.log(`📥 Descargando Snapshot de Reels: ${SNAPSHOT_ID}...`);
  try {
    const response = await axios.get(
      `https://api.brightdata.com/datasets/v3/snapshot/${SNAPSHOT_ID}?format=json`,
      { headers: { 'Authorization': `Bearer ${BD_API_TOKEN}` } }
    );
    
    let data = response.data;
    if (typeof data === 'string') {
        data = data.trim().split('\n').map(line => JSON.parse(line));
    }
    
    console.log(`✅ ¡Éxito! Recuperados datos de Reels.`);
    
    // Muestra algunos Reels
    data.slice(0, 3).forEach((r, idx) => {
        console.log(`\n🎬 Reel #${idx + 1} de la cuenta: @${r.owner_username || r.account}`);
        if (r.caption) console.log(`   📝 Description: ${r.caption.substring(0, 80).replace(/\n/g, ' ')}...`);
        console.log(`   👁️  Plays (Views): ${r.video_view_count || r.views || 'N/A'}`);
        console.log(`   ❤️  Likes: ${r.likes || 'N/A'}`);
        console.log(`   💬 Comentarios: ${r.comments || 'N/A'}`);
        if (r.duration) console.log(`   ⏱️  Duración: ${r.video_duration || r.duration} seg`);
        if (r.music) console.log(`   🎵 Audio: ${r.music}`);
        console.log(`   🔗 URL: ${r.url || r.input?.url}`);
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo snapshot:', error.response?.data || error.message);
  }
}

fetchReelsSnapshot();
