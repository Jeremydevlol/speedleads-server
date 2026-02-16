#!/usr/bin/env node

/**
 * Script de prueba para el sistema de envío masivo con IA y personalidad
 * Prueba el nuevo sistema que usa generateBotResponse y personalidades
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5001/api';
const JWT_TOKEN = 'tu-jwt-token-aqui'; // ⚠️ Reemplazar con un token válido

console.log('🚀 Probando Sistema de Envío Masivo con IA y Personalidad\n');

async function testGetPersonalities() {
  console.log('1️⃣ Obteniendo personalidades disponibles...');
  
  try {
    // Intentar obtener personalidades del usuario
    const response = await fetch(`${API_BASE}/personalities`, {
      headers: { 'Authorization': `Bearer ${JWT_TOKEN}` }
    });

    if (response.ok) {
      const result = await response.json();
      
      if (result.success && result.data && result.data.length > 0) {
        console.log('✅ Personalidades encontradas:');
        result.data.forEach((p, i) => {
          console.log(`   ${i + 1}. ${p.name} (ID: ${p.id})`);
          console.log(`      Descripción: ${p.description || 'Sin descripción'}`);
        });
        return result.data[0].id; // Retornar primera personalidad para pruebas
      } else {
        console.log('⚠️ No hay personalidades configuradas');
        return null;
      }
    } else {
      console.log('⚠️ No se pudieron obtener personalidades (endpoint podría no existir)');
      return null;
    }
  } catch (error) {
    console.log('⚠️ Error obteniendo personalidades:', error.message);
    return null;
  }
}

async function testBulkSendAIWithPersonality(columnId, personalityId) {
  console.log('\n2️⃣ Probando envío masivo con IA y personalidad específica...');
  
  try {
    const response = await fetch(`${API_BASE}/leads/bulk_send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        columnId: columnId,
        mode: 'ai',
        promptTemplate: 'Hola {{name}}! Soy tu asistente de ventas. He revisado tu consulta y quiero ofrecerte una solución personalizada. ¿Cuándo sería un buen momento para conversar?',
        personalityId: personalityId
      })
    });

    const result = await response.json();
    
    console.log(`📊 Status: ${response.status}`);
    
    if (result.success) {
      console.log('✅ Envío masivo con IA y personalidad completado:');
      console.log(`   🤖 Enviados: ${result.sent}/${result.total}`);
      console.log(`   ❌ Fallidos: ${result.fail}`);
      console.log(`   💬 Mensaje: ${result.message}`);
      
      if (result.details && result.details.length > 0) {
        console.log('   📋 Ejemplos de mensajes generados:');
        result.details.filter(d => d.ok).slice(0, 3).forEach(detail => {
          console.log(`      🤖 ${detail.contactName}: "${detail.message}"`);
        });
        
        if (result.details.some(d => !d.ok)) {
          console.log('   ❌ Errores encontrados:');
          result.details.filter(d => !d.ok).slice(0, 2).forEach(detail => {
            console.log(`      ❌ ${detail.contactName}: ${detail.error}`);
          });
        }
      }
    } else {
      console.log('❌ Error en envío con IA:', result.message);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

async function testBulkSendAIWithoutPersonality(columnId) {
  console.log('\n3️⃣ Probando envío masivo con IA sin personalidad específica...');
  
  try {
    const response = await fetch(`${API_BASE}/leads/bulk_send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        columnId: columnId,
        mode: 'ai',
        promptTemplate: 'Escribe un mensaje de seguimiento profesional para {{name}}. Pregunta cómo puedes ayudarle y ofrece agendar una llamada.'
        // Sin personalityId - usará la personalidad por defecto
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Envío con personalidad por defecto:');
      console.log(`   🤖 Enviados: ${result.sent}/${result.total}`);
      
      if (result.details && result.details.length > 0) {
        const successDetails = result.details.filter(d => d.ok);
        if (successDetails.length > 0) {
          console.log(`   💬 Ejemplo: "${successDetails[0].message}"`);
        }
      }
    } else {
      console.log('❌ Error:', result.message);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

async function testTemplateVariables(columnId) {
  console.log('\n4️⃣ Probando variables en templates...');
  
  try {
    const response = await fetch(`${API_BASE}/leads/bulk_send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        columnId: columnId,
        mode: 'ai',
        promptTemplate: 'Genera un mensaje personalizado para {{name}}. El contacto se llama {{name}} y quiero que el mensaje sea único para esta persona específica.'
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Templates con variables funcionando:');
      console.log(`   📝 Procesados: ${result.total}`);
      
      if (result.details && result.details.length > 0) {
        console.log('   🎯 Ejemplos de personalización:');
        result.details.filter(d => d.ok).slice(0, 2).forEach(detail => {
          console.log(`      👤 ${detail.contactName}: "${detail.message}"`);
        });
      }
    } else {
      console.log('❌ Error:', result.message);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

async function testGetColumnsWithLeads() {
  console.log('\n0️⃣ Obteniendo columnas para pruebas...');
  
  try {
    const response = await fetch(`${API_BASE}/leads/columns_with_leads`, {
      headers: { 'Authorization': `Bearer ${JWT_TOKEN}` }
    });

    const result = await response.json();
    
    if (result.success && result.columns.length > 0) {
      const firstColumn = result.columns[0];
      console.log(`📂 Usando columna: ${firstColumn.title} (${firstColumn.leads.length} leads)`);
      
      if (firstColumn.leads.length > 0) {
        console.log('   📋 Leads disponibles:');
        firstColumn.leads.slice(0, 3).forEach((lead, i) => {
          console.log(`      ${i + 1}. ${lead.name} - ${lead.conversation_id ? '✅' : '❌'} WhatsApp`);
        });
      }
      
      return firstColumn.id;
    } else {
      console.log('❌ No hay columnas con leads disponibles');
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

// Ejecutar pruebas
async function runTests() {
  console.log('⚠️ IMPORTANTE: Asegúrate de tener JWT token válido y WhatsApp conectado\n');
  
  // 0. Obtener columna para pruebas
  const columnId = await testGetColumnsWithLeads();
  
  if (!columnId) {
    console.log('\n❌ No se puede continuar sin una columna válida');
    return;
  }
  
  // 1. Obtener personalidades
  const personalityId = await testGetPersonalities();
  
  // 2. Envío con personalidad específica
  if (personalityId) {
    await testBulkSendAIWithPersonality(columnId, personalityId);
  }
  
  // 3. Envío sin personalidad (usa por defecto)
  await testBulkSendAIWithoutPersonality(columnId);
  
  // 4. Test de variables en templates
  await testTemplateVariables(columnId);
  
  console.log('\n🎉 ¡Todas las pruebas completadas!');
  console.log('\n📋 Resumen del nuevo sistema:');
  console.log('   ✅ Usa generateBotResponse() para generar mensajes únicos');
  console.log('   ✅ Soporte para personalidades específicas o por defecto');
  console.log('   ✅ Historial de conversación como contexto');
  console.log('   ✅ Templates con variables {{name}} personalizables');
  console.log('   ✅ Envío como "ia" (aparece como asistente en WhatsApp)');
  console.log('   ✅ Fallback automático si IA no responde');
  console.log('   ✅ Logs detallados para debugging');
  console.log('\n🔧 Uso desde frontend:');
  console.log('   POST /api/leads/bulk_send');
  console.log('   {');
  console.log('     "columnId": "uuid-columna",');
  console.log('     "mode": "ai",');
  console.log('     "promptTemplate": "Mensaje para {{name}}...",');
  console.log('     "personalityId": "uuid-personalidad" // opcional');
  console.log('   }');
}

runTests().catch(console.error);
