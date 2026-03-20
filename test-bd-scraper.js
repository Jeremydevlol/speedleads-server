import axios from 'axios';

const BD_API_TOKEN = '1c5e0ade-7d2f-419f-b162-04cd30f0cc76'; // Token de la imagen
const DATASET_ID = 'gd_l1vikfch901nx3by4'; // ID de Instagram Profiles (de la imagen)

async function testBrightDataScraper() {
  console.log('🚀 Iniciando prueba de Scraper de Bright Data...');
  
  try {
    const response = await axios.post(
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${DATASET_ID}&notify=false&include_errors=true`,
      [
        { "url": "https://www.instagram.com/cristiano/" },
        { "url": "https://www.instagram.com/iscastilow/" }
      ],
      {
        headers: {
          'Authorization': `Bearer ${BD_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Respuesta de Bright Data:');
    
    // Bright Data puede devolver el array de datos directamente o un ID de snapshot
    if (Array.isArray(response.data)) {
      response.data.forEach(profile => {
        console.log(`\n👤 Perfil: ${profile.username || profile.url}`);
        console.log(`   Nombre: ${profile.full_name || 'N/A'}`);
        console.log(`   Seguidores: ${profile.followers || 'N/A'}`);
        console.log(`   Bio: ${profile.biography ? profile.biography.replace(/\n/g, ' ') : 'N/A'}`);
        console.log(`   Email público: ${profile.business_email || 'No'}`);
      });
    } else {
      console.log(JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.error('❌ Error llamando a Bright Data:', error.response?.data || error.message);
  }
}

testBrightDataScraper();
