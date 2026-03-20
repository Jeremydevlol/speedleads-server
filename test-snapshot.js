import axios from 'axios';

const BD_API_TOKEN = '1c5e0ade-7d2f-419f-b162-04cd30f0cc76'; // El token que vimos
const SNAPSHOT_ID = 'sd_mlzmi3car17g1myhe'; 

async function fetchSnapshot() {
  console.log(`📥 Descargando Snapshot de Bright Data: ${SNAPSHOT_ID}...`);
  try {
    const response = await axios.get(
      `https://api.brightdata.com/datasets/v3/snapshot/${SNAPSHOT_ID}?format=json`,
      {
        headers: {
          'Authorization': `Bearer ${BD_API_TOKEN}`
        }
      }
    );
    
    let data = response.data;
    // Si viene en formato NDJSON (cada línea un JSON):
    if (typeof data === 'string') {
        data = data.trim().split('\n').map(line => JSON.parse(line));
    }
    
    console.log(`✅ ¡Éxito! Recuperados ${data.length} perfiles.`);
    
    // Muestra los primeros 3 para confirmar
    data.slice(0, 3).forEach(p => {
        console.log(`\n👤 @${p.username || p.account || p.url.split('/')[3]}`);
        console.log(`   Followers: ${p.followers}`);
        console.log(`   Bio: ${p.biography ? p.biography.replace(/\\n/g, ' ').substring(0, 60) + '...' : 'Sin bio'}`);
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo snapshot:', error.response?.data || error.message);
  }
}

fetchSnapshot();
