#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const TRANSLATE_ENDPOINT = `${BASE_URL}/api/ai/translate`;

console.log('🔧 Prueba del Endpoint de Traducción AUTOMÁTICA');
console.log('===============================================\n');

// Datos de prueba que muestran la detección automática
const testData = [
  {
    name: 'Traducir string simple',
    data: {
      texts: 'Hola, bienvenidos a nuestro restaurante',
      targetLanguage: 'en',
      sourceLanguage: 'es'
    }
  },
  {
    name: 'Auto-detectar contenido mixto (texto + números + URLs)',
    data: {
      texts: [
        'Menú del día',
        '25€',  // ← NO se traduce (precio)
        'https://mirestaurante.com',  // ← NO se traduce (URL)
        'info@restaurante.com',  // ← NO se traduce (email)
        'Platos principales',
        '123',  // ← NO se traduce (número)
        'Reservas disponibles'
      ],
      targetLanguage: 'en',
      sourceLanguage: 'es'
    }
  },
  {
    name: 'Website completo - TRADUCCIÓN AUTOMÁTICA',
    data: {
      texts: {
        // Información básica
        businessName: 'Restaurante La Paella Dorada',
        businessDescription: 'Auténtica cocina española con tradición familiar desde 1955',
        tagline: 'Sabores que conectan corazones',
        
        // Contacto (mezcla de texto y datos no traducibles)
        contact: {
          address: 'Calle de la Constitución, 42, Madrid',
          phone: '+34 91 234 5678',  // ← NO se traduce
          email: 'reservas@lapaella.es',  // ← NO se traduce
          website: 'https://lapaelladorada.com',  // ← NO se traduce
          hours: 'Lunes a Domingo de 13:00 a 23:30'
        },
        
        // Menú complejo
        menu: {
          sections: [
            {
              title: 'Entrantes y Tapas',
              description: 'Pequeños placeres para abrir el apetito',
              icon: 'mdi:food-fork-drink',  // ← NO se traduce (código)
              items: [
                {
                  name: 'Jamón Ibérico de Bellota',
                  description: 'Cortado a cuchillo, procedente de Jabugo',
                  price: '28€',  // ← NO se traduce
                  category: 'premium'
                },
                {
                  name: 'Croquetas de Pollo Caseras',
                  description: 'Receta familiar con bechamel artesanal',
                  price: '12€',
                  category: 'tradicional'
                }
              ]
            },
            {
              title: 'Arroces y Paellas',
              description: 'Nuestra especialidad, cocinada en paellera auténtica',
              items: [
                {
                  name: 'Paella Valenciana Original',
                  description: 'Pollo, conejo, judías verdes, garrofón y azafrán',
                  price: '18€',
                  servings: '2-3 personas'
                }
              ]
            }
          ]
        },
        
        // Información adicional
        features: [
          'Terraza con vistas al parque',
          'Wifi gratuito',  // ← Se traduce (aunque tenga "wifi")
          'Apto para celíacos',
          'Parking privado disponible'
        ],
        
        // Datos técnicos (no se traducen)
        metadata: {
          cssClass: 'restaurant-modern',  // ← NO se traduce (código CSS)
          theme: 'warm-colors',  // ← NO se traduce (código)
          version: '2.1.5'  // ← NO se traduce (versión)
        }
      },
      targetLanguage: 'en',
      sourceLanguage: 'es'
    }
  },
  {
    name: 'E-commerce completo - DETECCIÓN INTELIGENTE',
    data: {
      texts: {
        storeName: 'TechStore Madrid',
        slogan: 'Tecnología que transforma tu vida',
        products: [
          {
            id: 'PROD-001',  // ← NO se traduce (código)
            name: 'iPhone 15 Pro Max',
            description: 'El smartphone más avanzado con cámara profesional',
            price: '1199€',  // ← NO se traduce
            sku: 'APL-IPH15-PMAX-256',  // ← NO se traduce (SKU)
            url: '/products/iphone-15-pro-max',  // ← NO se traduce (URL)
            features: [
              'Pantalla Super Retina XDR de 6,7 pulgadas',
              'Chip A17 Pro ultrarrápido',
              'Sistema de cámaras Pro avanzado'
            ]
          }
        ],
        shipping: {
          freeShippingText: 'Envío gratuito en pedidos superiores a 50€',
          returnPolicy: 'Devoluciones gratis durante 30 días',
          trackingInfo: 'Seguimiento en tiempo real de tu pedido'
        }
      },
      targetLanguage: 'en'
    }
  },
  {
    name: 'Traducir a chino - CONTENIDO MIXTO',
    data: {
      texts: {
        welcome: '¡Bienvenidos a nuestra tienda!',
        price: '25€',  // ← NO se traduce
        email: 'contacto@tienda.com',  // ← NO se traduce
        special: 'Oferta especial del día',
        phone: '+34 123 456 789'  // ← NO se traduce
      },
      targetLanguage: 'zh',
      sourceLanguage: 'es'
    }
  },
  {
    name: 'Solo códigos y números - NO TRADUCIBLE',
    data: {
      texts: {
        version: '1.0.0',
        cssClass: 'btn-primary',
        apiEndpoint: '/api/v1/users',
        price: '50€',
        phone: '+1-555-123-4567'
      },
      targetLanguage: 'en'
    }
  }
];

// Función para realizar una prueba
async function runTest(test) {
  console.log(`📋 Prueba: ${test.name}`);
  console.log(`📤 Enviando:`, JSON.stringify(test.data, null, 2));
  
  try {
    const response = await axios.post(TRANSLATE_ENDPOINT, test.data, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000 // 30 segundos de timeout
    });

    console.log(`✅ Estado: ${response.status}`);
    console.log(`📥 Respuesta:`, JSON.stringify(response.data, null, 2));
    console.log(`⏱️  Idioma destino: ${response.data.targetLanguage}`);
    
    // Mostrar estadísticas si están disponibles
    if (response.data.translatableTexts !== undefined) {
      console.log(`📊 Estadísticas:`);
      console.log(`   - Textos traducibles: ${response.data.translatableTexts || 0}`);
      console.log(`   - Textos omitidos: ${response.data.skippedTexts || 0}`);
      console.log(`   - Total de textos: ${response.data.totalTexts || 0}`);
    }
    
  } catch (error) {
    console.log(`❌ Error:`, error.response?.data || error.message);
    
    if (error.response) {
      console.log(`📊 Estado HTTP: ${error.response.status}`);
      console.log(`📄 Headers:`, error.response.headers);
    }
  }
  
  console.log('\n' + '─'.repeat(60) + '\n');
}

// Función para verificar configuración
function checkConfiguration() {
  console.log('🔍 Verificando configuración...\n');
  
  const requiredEnvVars = {
    'BACKEND_URL': process.env.BACKEND_URL || BASE_URL,
    'GOOGLE_TRANSLATE_API_KEY': process.env.GOOGLE_TRANSLATE_API_KEY ? '✅ CONFIGURADA' : '❌ FALTANTE'
  };
  
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    console.log(`   ${key}: ${value}`);
  }
  
  console.log('\n');
  
  if (!process.env.GOOGLE_TRANSLATE_API_KEY) {
    console.log('⚠️  ADVERTENCIA: GOOGLE_TRANSLATE_API_KEY no está configurada');
    console.log('   Asegúrate de tener esta variable en tu archivo .env\n');
    return false;
  }
  
  return true;
}

// Función para probar conectividad
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

// Función principal
async function main() {
  console.log(`🎯 URL del endpoint: ${TRANSLATE_ENDPOINT}\n`);
  
  // Verificar configuración
  const configOk = checkConfiguration();
  
  // Probar conectividad
  const serverOk = await testConnectivity();
  
  if (!serverOk) {
    console.log('\n❌ No se puede continuar sin conexión al servidor');
    process.exit(1);
  }
  
  if (!configOk) {
    console.log('\n⚠️  Continuando sin GOOGLE_TRANSLATE_API_KEY (algunas pruebas fallarán)');
  }
  
  console.log('\n🚀 Iniciando pruebas de TRADUCCIÓN AUTOMÁTICA...\n');
  console.log('💡 El sistema ahora detecta automáticamente:');
  console.log('   ✅ Texto traducible (frases, palabras)');
  console.log('   ❌ Números, precios, URLs, emails, códigos CSS/HTML');
  console.log('   🎯 Solo traduce lo que realmente necesita traducción\n');
  
  // Ejecutar todas las pruebas
  for (const test of testData) {
    await runTest(test);
    
    // Pausa entre pruebas para no sobrecargar la API
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  console.log('🏁 Pruebas completadas!');
  console.log('\n🎉 RESUMEN DE CAPACIDADES AUTOMÁTICAS:');
  console.log('   1. ✅ Detecta automáticamente qué traducir y qué no');
  console.log('   2. ✅ Preserva números, precios, URLs, emails, códigos');
  console.log('   3. ✅ Funciona con cualquier estructura JSON');
  console.log('   4. ✅ No necesitas hardcodear qué campos traducir');
  console.log('   5. ✅ Optimiza costos traduciendo solo lo necesario');
  console.log('\n📝 Para usar en tu frontend:');
  console.log('   fetch("/api/ai/translate", {');
  console.log('     method: "POST",');
  console.log('     body: JSON.stringify({');
  console.log('       texts: cualquierEstructuraJSON,  // ← ¡Automático!');
  console.log('       targetLanguage: "en"');
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