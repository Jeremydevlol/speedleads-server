#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const TRANSLATE_ENDPOINT = `${BASE_URL}/api/ai/translate`;

console.log('🌍 Traducción de Website Completa');
console.log('=================================\n');

// Datos de ejemplo de una website completa (basada en las que vimos)
const sampleWebsite = {
  businessName: "Casa Oaxaca El Restaurante",
  businessDescription: "Auténtica cocina oaxaqueña con tradición familiar desde 1985. Sabores únicos que conectan con nuestras raíces mexicanas.",
  tagline: "Donde la tradición cobra vida",
  
  // Información de contacto
  contact: {
    address: "Calle de la Independencia 123, Centro Histórico, Oaxaca",
    phone: "+52 951 123 4567",
    email: "reservas@casaoaxaca.com",
    website: "https://casaoaxaca.com",
    hours: "Martes a Domingo de 13:00 a 22:00"
  },
  
  // Secciones del menú
  sections: [
    {
      title: "Entradas Tradicionales",
      description: "Pequeños placeres que abren el apetito",
      icon: "mdi:food-fork-drink",
      items: [
        {
          name: "Tlayudas Tradicionales",
          description: "Tortilla grande con frijoles, quesillo, cecina y salsa de chile de árbol",
          price: "85 pesos",
          category: "tradicional"
        },
        {
          name: "Memelas de Frijol",
          description: "Tortilla gruesa con frijoles refritos, quesillo y salsa verde",
          price: "45 pesos",
          category: "tradicional"
        },
        {
          name: "Quesadillas de Huitlacoche",
          description: "Tortillas rellenas de huitlacoche fresco con epazote",
          price: "65 pesos",
          category: "especialidad"
        }
      ]
    },
    {
      title: "Platos Principales",
      description: "Nuestras especialidades oaxaqueñas",
      items: [
        {
          name: "Mole Negro Tradicional",
          description: "Pollo bañado en mole negro oaxaqueño con arroz y tortillas",
          price: "120 pesos",
          servings: "Para 2 personas"
        },
        {
          name: "Tasajo con Nopales",
          description: "Carne de res seca con nopales, cebolla y chile de árbol",
          price: "95 pesos",
          servings: "Para 1 persona"
        },
        {
          name: "Enmoladas de Pollo",
          description: "Enchiladas de pollo bañadas en mole rojo con crema y queso",
          price: "110 pesos",
          servings: "Para 2 personas"
        }
      ]
    },
    {
      title: "Bebidas Tradicionales",
      description: "Bebidas auténticas de Oaxaca",
      items: [
        {
          name: "Chocolate Oaxaqueño",
          description: "Chocolate caliente con canela y agua, servido en jícara",
          price: "35 pesos"
        },
        {
          name: "Atole de Leche",
          description: "Bebida caliente de maíz con leche y canela",
          price: "25 pesos"
        },
        {
          name: "Agua de Horchata",
          description: "Refresco de arroz con canela y almendras",
          price: "30 pesos"
        }
      ]
    }
  ],
  
  // Características del restaurante
  features: [
    "Terraza con vista al zócalo",
    "Música en vivo los fines de semana",
    "Apto para grupos grandes",
    "Estacionamiento disponible",
    "Wifi gratuito",
    "Aceptamos tarjetas"
  ],
  
  // Redes sociales
  socialMedia: {
    facebook: "https://facebook.com/casaoaxaca",
    instagram: "https://instagram.com/casaoaxaca",
    whatsapp: "+52 951 123 4567"
  },
  
  // Información adicional
  about: {
    history: "Fundado en 1985 por la familia Martínez, Casa Oaxaca ha sido un referente de la cocina tradicional oaxaqueña en el centro histórico.",
    mission: "Preservar y compartir los sabores auténticos de Oaxaca, manteniendo viva la tradición culinaria familiar.",
    specialties: [
      "Moles tradicionales",
      "Tlayudas auténticas", 
      "Bebidas de chocolate",
      "Cocina de mercado"
    ]
  },
  
  // Metadatos técnicos (no se traducen)
  metadata: {
    cssClass: "restaurant-oaxaca-theme",
    theme: "warm-mexican-colors",
    version: "2.1.0",
    lastUpdated: "2025-01-28"
  }
};

async function translateWebsite(websiteData, targetLanguage, sourceLanguage = 'es') {
  console.log(`🌍 Traduciendo "${websiteData.businessName}" a ${targetLanguage}...\n`);
  
  try {
    const response = await axios.post(TRANSLATE_ENDPOINT, {
      texts: websiteData,
      targetLanguage,
      sourceLanguage
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000
    });

    if (response.data.success) {
      console.log(`✅ Traducción exitosa a ${targetLanguage}`);
      console.log(`📊 Estadísticas:`);
      console.log(`   - Textos traducidos: ${response.data.totalTextsTranslated || 'N/A'}`);
      console.log(`   - Textos omitidos: ${response.data.skippedTexts || 'N/A'}`);
      console.log(`   - Idioma origen: ${response.data.sourceLanguage}`);
      console.log(`   - Idioma destino: ${response.data.targetLanguage}\n`);
      
      return response.data;
    } else {
      console.log(`❌ Error en la traducción: ${response.data.error}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error de conexión:`, error.response?.data || error.message);
    return null;
  }
}

async function showTranslatedContent(translationResult, originalData) {
  if (!translationResult) {
    console.log('❌ No hay datos traducidos para mostrar');
    return;
  }

  // El servicio de traducción devuelve los datos en diferentes formatos
  const translated = translationResult.translatedData || translationResult.translations || translationResult;
  
  console.log('🎉 CONTENIDO TRADUCIDO:');
  console.log('======================\n');
  
  console.log(`🏪 ${translated.businessName || originalData.businessName}`);
  console.log(`📝 ${translated.businessDescription || originalData.businessDescription}`);
  console.log(`💬 ${translated.tagline || originalData.tagline}\n`);
  
  if (translated.contact) {
    console.log('📞 INFORMACIÓN DE CONTACTO:');
    console.log(`   📍 ${translated.contact.address || originalData.contact.address}`);
    console.log(`   📞 ${translated.contact.phone || originalData.contact.phone}`);
    console.log(`   ✉️  ${translated.contact.email || originalData.contact.email}`);
    console.log(`   🌐 ${translated.contact.website || originalData.contact.website}`);
    console.log(`   🕒 ${translated.contact.hours || originalData.contact.hours}\n`);
  }
  
  if (translated.sections && Array.isArray(translated.sections)) {
    console.log('🍽️  MENÚ TRADUCIDO:');
    translated.sections.forEach((section, index) => {
      console.log(`\n${index + 1}. ${section.title || originalData.sections[index]?.title}`);
      console.log(`   ${section.description || originalData.sections[index]?.description}`);
      
      if (section.items && Array.isArray(section.items)) {
        section.items.forEach((item, itemIndex) => {
          console.log(`   • ${item.name || originalData.sections[index]?.items[itemIndex]?.name}`);
          console.log(`     ${item.description || originalData.sections[index]?.items[itemIndex]?.description}`);
          console.log(`     💰 ${item.price || originalData.sections[index]?.items[itemIndex]?.price}`);
          if (item.servings) {
            console.log(`     👥 ${item.servings}`);
          }
        });
      }
    });
  }
  
  if (translated.features && Array.isArray(translated.features)) {
    console.log('\n✨ CARACTERÍSTICAS:');
    translated.features.forEach(feature => {
      console.log(`   • ${feature}`);
    });
  }
  
  if (translated.about) {
    console.log('\n📖 INFORMACIÓN ADICIONAL:');
    if (translated.about.history) {
      console.log(`   Historia: ${translated.about.history}`);
    }
    if (translated.about.mission) {
      console.log(`   Misión: ${translated.about.mission}`);
    }
    if (translated.about.specialties && Array.isArray(translated.about.specialties)) {
      console.log('   Especialidades:');
      translated.about.specialties.forEach(specialty => {
        console.log(`     • ${specialty}`);
      });
    }
  }
}

async function main() {
  console.log(`🎯 Servidor: ${BASE_URL}`);
  console.log(`🌐 Endpoint: ${TRANSLATE_ENDPOINT}\n`);
  
  // Probar conectividad
  try {
    const healthCheck = await axios.get(`${BASE_URL}/api/health`, { timeout: 5000 });
    console.log(`✅ Servidor disponible (Status: ${healthCheck.status})\n`);
  } catch (error) {
    console.log(`❌ Servidor no disponible: ${error.message}`);
    console.log(`   Verifica que el servidor esté corriendo en: ${BASE_URL}`);
    return;
  }
  
  // Idiomas a probar
  const languages = [
    { code: 'en', name: 'Inglés' },
    { code: 'fr', name: 'Francés' },
    { code: 'de', name: 'Alemán' },
    { code: 'zh', name: 'Chino' }
  ];
  
  console.log('🚀 Iniciando traducción de website completa...\n');
  
  for (const lang of languages) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🌍 TRADUCIENDO A ${lang.name.toUpperCase()} (${lang.code})`);
    console.log(`${'='.repeat(60)}`);
    
    const result = await translateWebsite(sampleWebsite, lang.code);
    
    if (result) {
      await showTranslatedContent(result, sampleWebsite);
    }
    
    // Pausa entre idiomas
    if (languages.indexOf(lang) < languages.length - 1) {
      console.log('\n⏳ Pausa entre traducciones...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n🎉 ¡Traducción de website completa finalizada!');
  console.log('\n💡 Este es un ejemplo de cómo se traduciría una website real');
  console.log('   Para traducir websites de tu base de datos, usa el endpoint:');
  console.log(`   POST ${BASE_URL}/api/websites/{id}/translate`);
}

// Ejecutar
main().catch(console.error);
