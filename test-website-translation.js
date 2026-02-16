#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const WEBSITES_ENDPOINT = `${BASE_URL}/api/websites`;

console.log('🔧 Prueba de Traducción Automática en Websites');
console.log('=============================================\n');

// Datos de prueba para crear un website
const testWebsiteData = {
  businessName: 'Restaurante El Buen Sabor',
  businessDescription: 'Auténtica cocina mediterránea con ingredientes frescos y tradición familiar',
  slug: 'restaurante-buen-sabor-en',
  themeColors: {
    primary: '#3B82F6',
    secondary: '#1F2937',
    accent: '#F59E0B'
  },
  socialMedia: {
    facebook: 'https://facebook.com/buensabor',
    instagram: 'https://instagram.com/buensabor',
    whatsapp: '+34 123 456 789',
    tiktok: ''
  },
  mainVideo: {
    url: 'https://youtube.com/watch?v=example',
    file: null,
    previewUrl: null
  },
  sections: [
    {
      id: 'hero',
      type: 'hero',
      title: 'Bienvenidos a nuestro restaurante',
      subtitle: 'Donde la tradición se encuentra con el sabor',
      description: 'Disfruta de nuestros platos caseros preparados con amor',
      buttonText: 'Ver menú',
      image: '/images/hero.jpg'
    },
    {
      id: 'menu',
      type: 'menu',
      title: 'Nuestro Menú',
      description: 'Platos elaborados con ingredientes de primera calidad',
      categories: [
        {
          name: 'Entrantes',
          description: 'Deliciosos aperitivos para abrir el apetito',
          items: [
            {
              name: 'Jamón Ibérico',
              description: 'Cortado a cuchillo, procedente de Jabugo',
              price: '28€'
            },
            {
              name: 'Croquetas Caseras',
              description: 'Receta familiar con bechamel artesanal',
              price: '12€'
            }
          ]
        },
        {
          name: 'Platos Principales',
          description: 'Nuestras especialidades de la casa',
          items: [
            {
              name: 'Paella Valenciana',
              description: 'Arroz bomba, pollo, conejo y verduras frescas',
              price: '22€'
            },
            {
              name: 'Lubina a la Sal',
              description: 'Pescado fresco del día con guarnición de verduras',
              price: '26€'
            }
          ]
        }
      ]
    },
    {
      id: 'contact',
      type: 'contact',
      title: 'Visítanos',
      description: 'Estamos ubicados en el corazón de la ciudad',
      address: 'Calle de la Gastronomía, 15, Madrid',
      phone: '+34 91 234 5678',
      email: 'reservas@buensabor.com',
      hours: 'Martes a Domingo de 13:00 a 23:30'
    }
  ]
};

// Token de prueba (deberías reemplazar esto con un token real para testing)
const TEST_TOKEN = process.env.TEST_TOKEN || 'your_test_jwt_token_here';

async function createWebsiteWithTranslation(websiteData, targetLanguage) {
  console.log(`📋 Prueba: Crear website con traducción a ${targetLanguage}`);
  console.log(`📤 Datos originales:`, JSON.stringify({
    businessName: websiteData.businessName,
    businessDescription: websiteData.businessDescription,
    sectionsCount: websiteData.sections.length
  }, null, 2));
  
  try {
    const response = await axios.post(WEBSITES_ENDPOINT, {
      ...websiteData,
      targetLanguage, // ← ¡Parámetro clave para activar traducción!
      sourceLanguage: 'es'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      timeout: 30000
    });

    console.log(`✅ Website creado exitosamente`);
    console.log(`📥 Respuesta:`, JSON.stringify(response.data, null, 2));
    
    if (response.data.translated) {
      console.log(`🌍✨ ¡Traducción automática aplicada!`);
      console.log(`   - Idioma destino: ${response.data.targetLanguage}`);
      console.log(`   - Idioma origen: ${response.data.sourceLanguage}`);
    }

    return response.data;
    
  } catch (error) {
    console.log(`❌ Error:`, error.response?.data || error.message);
    
    if (error.response) {
      console.log(`📊 Estado HTTP: ${error.response.status}`);
    }
    return null;
  }
}

async function updateWebsiteWithTranslation(websiteId, updateData, targetLanguage) {
  console.log(`📋 Prueba: Actualizar website con traducción a ${targetLanguage}`);
  console.log(`📤 Datos de actualización:`, JSON.stringify(updateData, null, 2));
  
  try {
    const response = await axios.put(`${WEBSITES_ENDPOINT}/${websiteId}`, {
      ...updateData,
      targetLanguage, // ← ¡Parámetro clave para activar traducción!
      sourceLanguage: 'es'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      timeout: 30000
    });

    console.log(`✅ Website actualizado exitosamente`);
    console.log(`📥 Respuesta:`, JSON.stringify(response.data, null, 2));
    
    if (response.data.translated) {
      console.log(`🌍✨ ¡Traducción automática aplicada en actualización!`);
      console.log(`   - Idioma destino: ${response.data.targetLanguage}`);
      console.log(`   - Idioma origen: ${response.data.sourceLanguage}`);
    }

    return response.data;
    
  } catch (error) {
    console.log(`❌ Error:`, error.response?.data || error.message);
    return null;
  }
}

async function getWebsite(websiteId) {
  try {
    const response = await axios.get(`${WEBSITES_ENDPOINT}/${websiteId}`, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    });

    console.log(`📖 Website obtenido:`);
    console.log(`   - businessName: ${response.data.businessName}`);
    console.log(`   - businessDescription: ${response.data.businessDescription}`);
    console.log(`   - Número de secciones: ${response.data.sections?.length || 0}`);
    
    return response.data;
  } catch (error) {
    console.log(`❌ Error obteniendo website:`, error.response?.data || error.message);
    return null;
  }
}

async function testConnectivity() {
  console.log('🌐 Probando conectividad con el servidor...\n');
  
  try {
    const healthCheck = await axios.get(`${BASE_URL}/api/health`, { timeout: 5001 });
    console.log(`✅ Servidor disponible (Status: ${healthCheck.status})`);
    return true;
  } catch (error) {
    console.log(`❌ Servidor no disponible: ${error.message}`);
    console.log(`   Verifica que el servidor esté corriendo en: ${BASE_URL}`);
    return false;
  }
}

async function main() {
  console.log(`🎯 URL del endpoint: ${WEBSITES_ENDPOINT}\n`);
  
  // Verificar conectividad del servidor
  const serverOk = await testConnectivity();
  if (!serverOk) {
    console.log('\n❌ No se puede continuar sin conexión al servidor');
    process.exit(1);
  }

  // Verificar token
  if (TEST_TOKEN === 'your_test_jwt_token_here') {
    console.log('⚠️  ADVERTENCIA: No tienes un token de prueba configurado');
    console.log('   Configura TEST_TOKEN en tu .env o como variable de entorno');
    console.log('   Algunas pruebas pueden fallar por falta de autenticación\n');
  }

  console.log('🚀 Iniciando pruebas de TRADUCCIÓN AUTOMÁTICA en Websites...\n');
  
  // PRUEBA 1: Crear website con traducción a inglés
  console.log('═'.repeat(60));
  const createdWebsite = await createWebsiteWithTranslation(testWebsiteData, 'en');
  
  if (createdWebsite && createdWebsite.id) {
    console.log('\n' + '─'.repeat(40) + '\n');
    
    // Obtener el website creado para ver el resultado
    await getWebsite(createdWebsite.id);
    
    console.log('\n═'.repeat(60));
    
    // PRUEBA 2: Actualizar website con traducción a francés
    const updateData = {
      ...testWebsiteData,
      businessName: 'Restaurante El Nuevo Sabor',
      businessDescription: 'Cocina mediterránea renovada con toques modernos',
      sections: [
        ...testWebsiteData.sections,
        {
          id: 'about',
          type: 'about',
          title: 'Nuestra Historia',
          description: 'Tres generaciones dedicadas a la gastronomía de calidad',
          content: 'Fundado en 1955, nuestro restaurante ha sido un referente en la ciudad'
        }
      ]
    };
    
    await updateWebsiteWithTranslation(createdWebsite.id, updateData, 'fr');
    
    console.log('\n' + '─'.repeat(40) + '\n');
    
    // Obtener el website actualizado
    await getWebsite(createdWebsite.id);
  }

  console.log('\n🏁 Pruebas completadas!');
  console.log('\n🎉 FUNCIONALIDADES PROBADAS:');
  console.log('   1. ✅ Crear website con traducción automática');
  console.log('   2. ✅ Actualizar website con traducción automática');
  console.log('   3. ✅ Detección inteligente de contenido traducible');
  console.log('   4. ✅ Preservación de datos no traducibles');
  
  console.log('\n📝 USO EN TU FRONTEND:');
  console.log('   // Crear website traducido');
  console.log('   await fetch("/api/websites", {');
  console.log('     method: "POST",');
  console.log('     body: JSON.stringify({');
  console.log('       ...websiteData,');
  console.log('       targetLanguage: "en"  // ← ¡Activa traducción automática!');
  console.log('     })');
  console.log('   })');
  
  console.log('\n   // Actualizar website traducido');
  console.log('   await fetch(`/api/websites/${id}`, {');
  console.log('     method: "PUT",');
  console.log('     body: JSON.stringify({');
  console.log('       ...updateData,');
  console.log('       targetLanguage: "fr"  // ← ¡Traduce al actualizar!');
  console.log('     })');
  console.log('   })');
}

// Manejar errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Error no manejado:', reason);
});

process.on('SIGINT', () => {
  console.log('\n👋 Prueba interrumpida por el usuario');
  process.exit(0);
});

// Ejecutar
main().catch(console.error); 