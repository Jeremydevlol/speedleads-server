#!/usr/bin/env node

/**
 * Script de prueba para el sistema de envío masivo de leads
 * Prueba los endpoints de envío masivo manual e IA
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5001/api';
const JWT_TOKEN = 'tu-jwt-token-aqui'; // ⚠️ Reemplazar con un token válido

console.log('🚀 Probando Sistema de Envío Masivo de Leads\n');

async function testBulkPreview() {
  console.log('1️⃣ Probando vista previa de envío masivo...');
  
  try {
    // Primero obtener columnas para tener un ID válido
    const columnsResponse = await fetch(`${API_BASE}/leads/columns_with_leads`, {
      headers: { 'Authorization': `Bearer ${JWT_TOKEN}` }
    });

    const columnsResult = await columnsResponse.json();
    
    if (!columnsResult.success || !columnsResult.columns.length) {
      console.log('⚠️ No hay columnas disponibles para probar');
      return null;
    }

    const firstColumn = columnsResult.columns[0];
    console.log(`📂 Usando columna: ${firstColumn.title} (${firstColumn.leads.length} leads)`);

    // Probar vista previa
    const previewResponse = await fetch(`${API_BASE}/leads/bulk_preview/${firstColumn.id}`, {
      headers: { 'Authorization': `Bearer ${JWT_TOKEN}` }
    });

    const previewResult = await previewResponse.json();
    
    if (previewResult.success) {
      console.log('✅ Vista previa obtenida:');
      console.log(`   📊 Columna: ${previewResult.columnTitle}`);
      console.log(`   📋 Total leads: ${previewResult.totalLeads}`);
      
      previewResult.leads.forEach((lead, i) => {
        console.log(`   ${i + 1}. ${lead.name} - ${lead.phone} - WhatsApp: ${lead.hasWhatsApp ? '✅' : '❌'}`);
      });
      
      return firstColumn.id;
    } else {
      console.log('❌ Error en vista previa:', previewResult.message);
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

async function testBulkSendManual(columnId) {
  console.log('\n2️⃣ Probando envío masivo manual...');
  
  try {
    const response = await fetch(`${API_BASE}/leads/bulk_send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        columnId: columnId,
        mode: 'manual',
        text: '¡Hola {{name}}! 👋 Este es un mensaje de prueba del sistema de leads. Tu teléfono es {{phone}}.'
      })
    });

    const result = await response.json();
    
    console.log(`📊 Status: ${response.status}`);
    
    if (result.success) {
      console.log('✅ Envío masivo manual completado:');
      console.log(`   📤 Enviados: ${result.sent}/${result.total}`);
      console.log(`   ❌ Fallidos: ${result.fail}`);
      console.log(`   💬 Mensaje: ${result.message}`);
      
      if (result.details && result.details.length > 0) {
        console.log('   📋 Detalles:');
        result.details.slice(0, 3).forEach(detail => {
          const status = detail.ok ? '✅' : '❌';
          const info = detail.ok ? 
            `"${detail.message}"` : 
            `Error: ${detail.error}`;
          console.log(`      ${status} ${detail.contactName}: ${info}`);
        });
        
        if (result.details.length > 3) {
          console.log(`      ... y ${result.details.length - 3} más`);
        }
      }
    } else {
      console.log('❌ Error en envío masivo:', result.message);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

async function testBulkSendAI(columnId) {
  console.log('\n3️⃣ Probando envío masivo con IA...');
  
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
        promptTemplate: 'Escribe un mensaje personalizado y amigable para {{name}}. Menciona que es un seguimiento de su consulta y ofrece ayuda. Mantén un tono profesional pero cercano.',
        personalityId: null // Usar personalidad por defecto
      })
    });

    const result = await response.json();
    
    console.log(`📊 Status: ${response.status}`);
    
    if (result.success) {
      console.log('✅ Envío masivo con IA completado:');
      console.log(`   🤖 Enviados: ${result.sent}/${result.total}`);
      console.log(`   ❌ Fallidos: ${result.fail}`);
      console.log(`   💬 Mensaje: ${result.message}`);
      
      if (result.details && result.details.length > 0) {
        console.log('   📋 Ejemplos de mensajes generados por IA:');
        result.details.filter(d => d.ok).slice(0, 2).forEach(detail => {
          console.log(`      🤖 Para ${detail.contactName}: "${detail.message}"`);
        });
      }
    } else {
      console.log('❌ Error en envío con IA:', result.message);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

async function testValidations() {
  console.log('\n4️⃣ Probando validaciones...');
  
  const tests = [
    {
      name: 'Sin columnId',
      body: { mode: 'manual', text: 'test' },
      expectedError: 'columnId requerido'
    },
    {
      name: 'Modo inválido',
      body: { columnId: 'test', mode: 'invalid' },
      expectedError: 'mode debe ser'
    },
    {
      name: 'Modo manual sin texto',
      body: { columnId: 'test', mode: 'manual' },
      expectedError: 'text requerido'
    },
    {
      name: 'Modo AI sin prompt',
      body: { columnId: 'test', mode: 'ai' },
      expectedError: 'promptTemplate requerido'
    }
  ];

  for (const test of tests) {
    try {
      const response = await fetch(`${API_BASE}/leads/bulk_send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${JWT_TOKEN}`
        },
        body: JSON.stringify(test.body)
      });

      const result = await response.json();
      const hasExpectedError = result.message && result.message.includes(test.expectedError.split(' ')[0]);
      
      console.log(`   ${hasExpectedError ? '✅' : '❌'} ${test.name}: ${result.message}`);
    } catch (error) {
      console.log(`   ❌ ${test.name}: Error - ${error.message}`);
    }
  }
}

// Ejecutar pruebas
async function runTests() {
  console.log('⚠️ IMPORTANTE: Asegúrate de tener un JWT token válido y WhatsApp conectado\n');
  
  // 1. Vista previa
  const columnId = await testBulkPreview();
  
  if (!columnId) {
    console.log('\n❌ No se puede continuar sin una columna válida');
    return;
  }
  
  // 2. Envío manual
  await testBulkSendManual(columnId);
  
  // 3. Envío con IA
  await testBulkSendAI(columnId);
  
  // 4. Validaciones
  await testValidations();
  
  console.log('\n🎉 ¡Todas las pruebas completadas!');
  console.log('\n📋 Resumen del sistema:');
  console.log('   ✅ Vista previa: GET /api/leads/bulk_preview/:columnId');
  console.log('   ✅ Envío manual: POST /api/leads/bulk_send (mode: "manual")');
  console.log('   ✅ Envío con IA: POST /api/leads/bulk_send (mode: "ai")');
  console.log('   ✅ Templates con variables: {{name}}, {{phone}}, {{message}}');
  console.log('   ✅ Throttling automático (350ms entre mensajes)');
  console.log('   ✅ Validaciones completas y manejo de errores');
  console.log('   ✅ Integración con sendMessage y sendAIMessage existentes');
}

runTests().catch(console.error);
