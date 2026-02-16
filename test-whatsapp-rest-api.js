#!/usr/bin/env node

/**
 * Script de prueba para la API REST de envío de mensajes WhatsApp
 * 
 * Uso:
 * 1. Asegúrate de que el backend esté corriendo
 * 2. Configura tu JWT token
 * 3. Ejecuta: node test-whatsapp-rest-api.js
 */

import fetch from 'node-fetch';

// Configuración
const BACKEND_URL = 'http://localhost:5001';
const JWT_TOKEN = 'tu-jwt-token-aqui'; // Reemplaza con tu token real

// Casos de prueba
const testCases = [
  {
    name: 'Número español sin prefijo',
    phoneNumber: '612345678',
    message: '¡Hola! Mensaje de prueba a número español 🇪🇸',
    defaultCountry: '34'
  },
  {
    name: 'Número con prefijo internacional',
    phoneNumber: '+34612345678',
    message: '¡Hola! Mensaje con prefijo internacional 🌍',
    defaultCountry: '34'
  },
  {
    name: 'Número ya en formato JID',
    phoneNumber: '34612345678@s.whatsapp.net',
    message: '¡Hola! Mensaje a JID directo 📱',
    defaultCountry: '34'
  },
  {
    name: 'Mensaje con adjunto simulado',
    phoneNumber: '612345678',
    message: 'Mensaje con adjunto de prueba',
    defaultCountry: '34',
    attachments: [{
      data: 'dGVzdCBkYXRh', // "test data" en base64
      mimeType: 'application/pdf',
      fileName: 'test.pdf'
    }]
  },
  {
    name: 'Número mexicano',
    phoneNumber: '5215512345678',
    message: '¡Hola! Mensaje a número mexicano 🇲🇽',
    defaultCountry: '52'
  }
];

async function testSendMessage(testCase) {
  console.log(`\n📱 Probando: ${testCase.name}`);
  console.log(`   Número: ${testCase.phoneNumber}`);
  console.log(`   Mensaje: ${testCase.message}`);
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/whatsapp/send_message_to_number`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phoneNumber: testCase.phoneNumber,
        textContent: testCase.message,
        defaultCountry: testCase.defaultCountry,
        senderType: 'you',
        attachments: testCase.attachments || []
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('   ✅ Éxito:');
      console.log('      JID normalizado:', result.data.normalizedJid);
      console.log('      ID Conversación:', result.data.conversationId);
      console.log('      ID Mensaje:', result.data.messageId);
    } else {
      console.log('   ❌ Error:', result.message);
    }
    
    return result.success;
    
  } catch (error) {
    console.log('   ❌ Error de red:', error.message);
    return false;
  }
}

async function testRateLimit() {
  console.log('\n🚦 Probando rate limiting...');
  
  const promises = [];
  for (let i = 0; i < 35; i++) { // Más del límite de 30
    promises.push(
      fetch(`${BACKEND_URL}/api/whatsapp/send_message_to_number`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber: '612345678',
          textContent: `Mensaje de rate limit test #${i + 1}`,
          defaultCountry: '34'
        })
      }).then(r => r.json())
    );
  }
  
  const results = await Promise.all(promises);
  const successful = results.filter(r => r.success).length;
  const rateLimited = results.filter(r => !r.success && r.message.includes('Rate limit')).length;
  
  console.log(`   ✅ Mensajes exitosos: ${successful}`);
  console.log(`   🚦 Bloqueados por rate limit: ${rateLimited}`);
  
  return rateLimited > 0; // Esperamos que algunos sean bloqueados
}

async function runTests() {
  console.log('🚀 Iniciando pruebas de API REST para WhatsApp\n');
  console.log('⚠️  IMPORTANTE: Asegúrate de configurar JWT_TOKEN antes de ejecutar\n');
  
  if (JWT_TOKEN === 'tu-jwt-token-aqui') {
    console.log('❌ ERROR: Configura tu JWT_TOKEN en el script');
    process.exit(1);
  }
  
  let successCount = 0;
  
  // Probar casos de normalización de números
  for (const testCase of testCases) {
    const success = await testSendMessage(testCase);
    if (success) successCount++;
    
    // Esperar un poco entre pruebas
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Probar rate limiting
  console.log('\n' + '='.repeat(50));
  const rateLimitWorked = await testRateLimit();
  
  // Resumen
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMEN DE PRUEBAS:');
  console.log(`   Casos de prueba exitosos: ${successCount}/${testCases.length}`);
  console.log(`   Rate limiting funcionando: ${rateLimitWorked ? '✅' : '❌'}`);
  
  if (successCount === testCases.length && rateLimitWorked) {
    console.log('\n🎉 ¡Todas las pruebas pasaron exitosamente!');
  } else {
    console.log('\n⚠️  Algunas pruebas fallaron. Revisa la configuración.');
  }
}

// Ejecutar pruebas
runTests().catch(error => {
  console.error('❌ Error ejecutando pruebas:', error);
  process.exit(1);
});
