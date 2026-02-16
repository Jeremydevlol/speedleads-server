#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const TRANSLATE_ENDPOINT = `${BASE_URL}/api/ai/translate`;

console.log('🧪 Prueba Simple de Traducción de Website');
console.log('========================================\n');

// Website simple para probar
const simpleWebsite = {
  businessName: "Restaurante La Paella",
  businessDescription: "Auténtica cocina española con tradición familiar",
  tagline: "Sabores que conectan corazones",
  contact: {
    address: "Calle Mayor 123, Madrid",
    phone: "+34 91 123 4567",
    email: "info@lapaella.com"
  },
  menu: {
    title: "Nuestro Menú",
    items: [
      {
        name: "Paella Valenciana",
        description: "Arroz con pollo, conejo y verduras",
        price: "18€"
      },
      {
        name: "Tortilla Española",
        description: "Tortilla de patatas casera",
        price: "8€"
      }
    ]
  }
};

async function testTranslation() {
  console.log('📤 Enviando website para traducir...');
  console.log('📋 Datos originales:', JSON.stringify(simpleWebsite, null, 2));
  
  try {
    const response = await axios.post(TRANSLATE_ENDPOINT, {
      texts: simpleWebsite,
      targetLanguage: 'en',
      sourceLanguage: 'es'
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000
    });

    console.log('\n✅ Respuesta del servidor:');
    console.log('📊 Status:', response.status);
    console.log('📥 Datos completos:', JSON.stringify(response.data, null, 2));
    
    // Mostrar solo los datos traducidos de forma legible
    if (response.data.success && response.data.translatedData) {
      console.log('\n🎉 CONTENIDO TRADUCIDO:');
      console.log('======================');
      console.log('🏪 Nombre:', response.data.translatedData.businessName);
      console.log('📝 Descripción:', response.data.translatedData.businessDescription);
      console.log('💬 Tagline:', response.data.translatedData.tagline);
      
      if (response.data.translatedData.contact) {
        console.log('\n📞 Contacto:');
        console.log('   📍 Dirección:', response.data.translatedData.contact.address);
        console.log('   📞 Teléfono:', response.data.translatedData.contact.phone);
        console.log('   ✉️ Email:', response.data.translatedData.contact.email);
      }
      
      if (response.data.translatedData.menu) {
        console.log('\n🍽️ Menú:');
        console.log('   📋 Título:', response.data.translatedData.menu.title);
        if (response.data.translatedData.menu.items) {
          response.data.translatedData.menu.items.forEach((item, index) => {
            console.log(`   ${index + 1}. ${item.name}`);
            console.log(`      ${item.description}`);
            console.log(`      💰 ${item.price}`);
          });
        }
      }
    }
    
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }
}

// Ejecutar
testTranslation().catch(console.error);
