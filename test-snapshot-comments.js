import axios from 'axios';

const BD_API_TOKEN = '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const SNAPSHOT_ID = 'sd_mlznykqp7pamv21w0'; // El ID del scraper de Comentarios

async function fetchCommentsSnapshot() {
  console.log(`📥 Descargando Snapshot de Comentarios: ${SNAPSHOT_ID}...`);
  try {
    const response = await axios.get(
      `https://api.brightdata.com/datasets/v3/snapshot/${SNAPSHOT_ID}?format=json`,
      { headers: { 'Authorization': `Bearer ${BD_API_TOKEN}` } }
    );
    
    let data = response.data;
    if (typeof data === 'string') {
        data = data.trim().split('\n').map(line => JSON.parse(line));
    }
    
    // Bright Data Comments scraper sometimes returns an array of objects where each object is a post containing an array of comments,
    // or an array of comment objects directly. Let's inspect the structure.
    console.log(`✅ ¡Éxito! Datos recuperados. Procesando comentarios...`);
    
    let allComments = [];
    data.forEach(item => {
        if (item.comments && Array.isArray(item.comments)) {
            // Estructura agrupadora
            allComments = allComments.concat(item.comments);
        } else if (item.text || item.text_content) {
             // Es un comentario directo
             allComments.push(item);
        }
    });

    if (allComments.length === 0 && data.length > 0) {
        // Fallback: tratar cada elemento raiz como un comentario
        allComments = data;
    }
    
    console.log(`Total de comentarios extraídos: ${allComments.length}\n`);

    console.log(`\nRAW DEL PRIMER COMENTARIO:`, JSON.stringify(allComments[0], null, 2));

    // Mostrar los primeros 5
    allComments.slice(0, 5).forEach((c, idx) => {
        const username = c.comment_user || 'Usuario Anónimo';
        const text = c.comment || 'Sin texto';
        const likes = c.likes_number || 0;
        
        console.log(`🗣️  Comentario #${idx + 1} de @${username}`);
        console.log(`   💬 "${text.replace(/\\n/g, ' ')}"`);
        console.log(`   ❤️  Likes: ${likes}`);
        if(c.replies_number) console.log(`   🔁  Respuestas: ${c.replies_number}`);
        console.log(`-----------------------------------------------`);
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo snapshot:', error.response?.data || error.message);
  }
}

fetchCommentsSnapshot();
