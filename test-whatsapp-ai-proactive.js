#!/usr/bin/env node

/**
 * Script de prueba para envío proactivo de mensajes generados por IA
 * 
 * Uso:
 * 1. Asegúrate de que el backend esté corriendo
 * 2. Configura tu JWT token
 * 3. Ejecuta: node test-whatsapp-ai-proactive.js
 */

import fetch from 'node-fetch';
import io from 'socket.io-client';

// Configuración
const BACKEND_URL = 'http://localhost:5001';
const JWT_TOKEN = 'tu-jwt-token-aqui'; // Reemplaza con tu token real
const TEST_PHONE = '612345678'; // Número de prueba

// Casos de prueba para IA
const aiTestCases = [
  {
    name: 'Saludo inicial',
    prompt: 'Envía un saludo amigable como si fueras un asistente virtual que se presenta por primera vez',
    personalityId: null
  },
  {
    name: 'Recordatorio personalizado',
    prompt: 'Envía un recordatorio amigable sobre la importancia de mantenerse hidratado durante el día',
    personalityId: null
  },
  {
    name: 'Consejo motivacional',
    prompt: 'Comparte un consejo motivacional corto para empezar bien la semana',
    personalityId: null
  },
  {
    name: 'Pregunta de seguimiento',
    prompt: 'Pregunta de manera amigable cómo ha estado el usuario y si necesita ayuda con algo',
    personalityId: null
  }
];

async function testAIMessageREST(testCase) {
  console.log(`\n🤖 Probando IA REST: ${testCase.name}`);
  console.log(`   Prompt: ${testCase.prompt}`);
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/whatsapp/send_ai_message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phoneNumber: TEST_PHONE,
        prompt: testCase.prompt,
        defaultCountry: '34',
        personalityId: testCase.personalityId
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('   ✅ Éxito:');
      console.log('      Respuesta IA:', result.data.aiResponse.substring(0, 100) + '...');
      console.log('      Personalidad:', result.data.personalityUsed);
      console.log('      JID normalizado:', result.data.normalizedJid);
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

async function testAIMessageSocket() {
  return new Promise((resolve) => {
    console.log('\n🤖 Probando IA Socket.IO...');
    
    const socket = io(BACKEND_URL);
    let resolved = false;
    
    socket.on('connect', () => {
      console.log('   ✅ Conectado al servidor');
      
      // Unirse al room del usuario
      socket.emit('join', { token: JWT_TOKEN });
      
      // Enviar mensaje de IA
      socket.emit('send-ai-message', {
        token: JWT_TOKEN,
        to: TEST_PHONE,
        prompt: 'Envía un mensaje creativo y divertido como si fueras un asistente muy entusiasta',
        defaultCountry: '34'
      });
    });
    
    socket.on('ai-message-sent', (data) => {
      console.log('   ✅ Mensaje IA enviado exitosamente:');
      console.log('      Respuesta IA:', data.aiResponse.substring(0, 100) + '...');
      console.log('      Personalidad:', data.personalityUsed);
      console.log('      JID normalizado:', data.normalizedJid);
      console.log('      ID Mensaje:', data.messageId);
      
      if (!resolved) {
        resolved = true;
        socket.disconnect();
        resolve(true);
      }
    });
    
    socket.on('error', (error) => {
      console.log('   ❌ Error:', error);
      if (!resolved) {
        resolved = true;
        socket.disconnect();
        resolve(false);
      }
    });
    
    // Timeout de seguridad
    setTimeout(() => {
      if (!resolved) {
        console.log('   ⏰ Timeout en Socket.IO');
        resolved = true;
        socket.disconnect();
        resolve(false);
      }
    }, 30000);
  });
}

async function runAITests() {
  console.log('🤖 Iniciando pruebas de IA proactiva para WhatsApp\n');
  console.log('⚠️  IMPORTANTE: Asegúrate de configurar JWT_TOKEN antes de ejecutar\n');
  
  if (JWT_TOKEN === 'tu-jwt-token-aqui') {
    console.log('❌ ERROR: Configura tu JWT_TOKEN en el script');
    process.exit(1);
  }
  
  let successCount = 0;
  
  // Probar casos de IA con REST API
  for (const testCase of aiTestCases) {
    const success = await testAIMessageREST(testCase);
    if (success) successCount++;
    
    // Esperar entre pruebas para no saturar la IA
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Probar Socket.IO
  console.log('\n' + '='.repeat(50));
  const socketSuccess = await testAIMessageSocket();
  if (socketSuccess) successCount++;
  
  // Resumen
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMEN DE PRUEBAS IA:');
  console.log(`   Casos REST exitosos: ${successCount - (socketSuccess ? 1 : 0)}/${aiTestCases.length}`);
  console.log(`   Socket.IO exitoso: ${socketSuccess ? '✅' : '❌'}`);
  console.log(`   Total exitoso: ${successCount}/${aiTestCases.length + 1}`);
  
  if (successCount === aiTestCases.length + 1) {
    console.log('\n🎉 ¡Todas las pruebas de IA pasaron exitosamente!');
    console.log('🤖 La IA puede ahora enviar mensajes proactivos de forma inteligente');
  } else {
    console.log('\n⚠️  Algunas pruebas fallaron. Revisa la configuración y conexión de IA.');
  }
}

// Ejecutar pruebas
runAITests().catch(error => {
  console.error('❌ Error ejecutando pruebas de IA:', error);
  process.exit(1);
});
