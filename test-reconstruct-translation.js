#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const TRANSLATE_ENDPOINT = `${BASE_URL}/api/ai/translate`;

console.log('🌍 Traducción y Reconstrucción de Website');
console.log('========================================\n');

// Website completa para traducir
const completeWebsite = {
  businessName: "Casa Oaxaca El Restaurante",
  businessDescription: "Auténtica cocina oaxaqueña con tradición familiar desde 1985",
  tagline: "Donde la tradición cobra vida",
  
  contact: {
    address: "Calle de la Independencia 123, Centro Histórico, Oaxaca",
    phone: "+52 951 123 4567",
    email: "reservas@casaoaxaca.com",
    hours: "Martes a Domingo de 13:00 a 22:00"
  },
  
  sections: [
    {
      title: "Entradas Tradicionales",
      description: "Pequeños placeres que abren el apetito",
      items: [
        {
          name: "Tlayudas Tradicionales",
          description: "Tortilla grande con frijoles, quesillo, cecina y salsa de chile de árbol",
          price: "85 pesos"
        },
        {
          name: "Memelas de Frijol",
          description: "Tortilla gruesa con frijoles refritos, quesillo y salsa verde",
          price: "45 pesos"
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
          price: "120 pesos"
        },
        {
          name: "Tasajo con Nopales",
          description: "Carne de res seca con nopales, cebolla y chile de árbol",
          price: "95 pesos"
        }
      ]
    }
  ],
  
  features: [
    "Terraza con vista al zócalo",
    "Música en vivo los fines de semana",
    "Apto para grupos grandes",
    "Estacionamiento disponible"
  ]
};

// Función para reconstruir la estructura traducida
function reconstructTranslatedWebsite(originalData, translationDetails) {
  const translated = JSON.parse(JSON.stringify(originalData)); // Deep clone
  
  // Crear un mapa de traducciones para acceso rápido
  const translationMap = new Map();
  translationDetails.forEach(detail => {
    translationMap.set(detail.originalText, detail.translatedText);
  });
  
  // Función recursiva para aplicar traducciones
  function applyTranslations(obj, path = '') {
    if (typeof obj === 'string') {
      return translationMap.get(obj) || obj;
    } else if (Array.isArray(obj)) {
      return obj.map((item, index) => applyTranslations(item, `${path}[${index}]`));
    } else if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = applyTranslations(value, `${path}.${key}`);
      }
      return result;
    }
    return obj;
  }
  
  return applyTranslations(translated);
}

async function translateAndShow(websiteData, targetLanguage, languageName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🌍 TRADUCIENDO A ${languageName.toUpperCase()} (${targetLanguage})`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    const response = await axios.post(TRANSLATE_ENDPOINT, {
      texts: websiteData,
      targetLanguage,
      sourceLanguage: 'es'
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000
    });

    if (response.data.success) {
      console.log(`✅ Traducción exitosa!`);
      console.log(`📊 Textos traducidos: ${response.data.totalTextsTranslated}`);
      console.log(`📊 Textos omitidos: ${response.data.skippedTexts || 0}\n`);
      
      // Reconstruir la estructura traducida
      const translatedWebsite = reconstructTranslatedWebsite(websiteData, response.data.translationDetails);
      
      // Mostrar el resultado
      console.log('🎉 WEBSITE TRADUCIDA:');
      console.log('====================\n');
      
      console.log(`🏪 ${translatedWebsite.businessName}`);
      console.log(`📝 ${translatedWebsite.businessDescription}`);
      console.log(`💬 ${translatedWebsite.tagline}\n`);
      
      console.log('📞 CONTACTO:');
      console.log(`   📍 ${translatedWebsite.contact.address}`);
      console.log(`   📞 ${translatedWebsite.contact.phone}`);
      console.log(`   ✉️  ${translatedWebsite.contact.email}`);
      console.log(`   🕒 ${translatedWebsite.contact.hours}\n`);
      
      console.log('🍽️ MENÚ:');
      translatedWebsite.sections.forEach((section, index) => {
        console.log(`\n${index + 1}. ${section.title}`);
        console.log(`   ${section.description}`);
        section.items.forEach((item, itemIndex) => {
          console.log(`   • ${item.name}`);
          console.log(`     ${item.description}`);
          console.log(`     💰 ${item.price}`);
        });
      });
      
      console.log('\n✨ CARACTERÍSTICAS:');
      translatedWebsite.features.forEach(feature => {
        console.log(`   • ${feature}`);
      });
      
      return translatedWebsite;
    } else {
      console.log(`❌ Error: ${response.data.error}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error de conexión:`, error.response?.data || error.message);
    return null;
  }
}

async function main() {
  console.log(`🎯 Servidor: ${BASE_URL}`);
  
  // Probar conectividad
  try {
    const healthCheck = await axios.get(`${BASE_URL}/api/health`, { timeout: 5000 });
    console.log(`✅ Servidor disponible (Status: ${healthCheck.status})\n`);
  } catch (error) {
    console.log(`❌ Servidor no disponible: ${error.message}`);
    return;
  }
  
  // Idiomas a probar
  const languages = [
    { code: 'en', name: 'Inglés' },
    { code: 'fr', name: 'Francés' },
    { code: 'de', name: 'Alemán' }
  ];
  
  console.log('🚀 Iniciando traducción de website completa...\n');
  
  for (const lang of languages) {
    const result = await translateAndShow(completeWebsite, lang.code, lang.name);
    
    if (result) {
      console.log(`\n✅ Website traducida exitosamente a ${lang.name}!`);
    }
    
    // Pausa entre idiomas
    if (languages.indexOf(lang) < languages.length - 1) {
      console.log('\n⏳ Pausa entre traducciones...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n🎉 ¡Traducción de website completa finalizada!');
  console.log('\n💡 Este ejemplo muestra cómo:');
  console.log('   1. ✅ Se traduce el contenido automáticamente');
  console.log('   2. ✅ Se preserva la estructura original');
  console.log('   3. ✅ Se mantienen precios, emails, teléfonos sin traducir');
  console.log('   4. ✅ Se puede aplicar a cualquier website de tu base de datos');
}

// Ejecutar
main().catch(console.error);
