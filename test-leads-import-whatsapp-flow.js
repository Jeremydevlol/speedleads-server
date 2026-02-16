#!/usr/bin/env node

/**
 * Script de prueba para el flujo completo de importación de leads y vinculación WhatsApp
 * 1. Importar contactos SIN WhatsApp (solo como leads con phone)
 * 2. Vincular con WhatsApp (crear conversaciones y actualizar leads)
 */

import fetch from 'node-fetch';

// ⚠️ CONFIGURACIÓN - ACTUALIZAR CON TUS DATOS
const NEXTJS_BASE = 'http://localhost:3000/api'; // URL de tu app Next.js
const JWT_TOKEN = 'tu-jwt-token-aqui'; // ⚠️ Reemplazar con un token válido
const USER_ID = 'tu-user-id-aqui'; // ⚠️ Fallback user ID si no tienes token válido

console.log('🚀 Probando Flujo Completo: Leads → WhatsApp\n');

// Datos de prueba
const testContacts = [
  { name: 'Juan Pérez', phone: '+34612345678' },
  { name: 'María García', phone: '34687654321' },
  { name: 'Carlos López', phone: '612345679' },
  { name: '', phone: '+34611222333' }, // Sin nombre
  { name: 'Ana Martín', phone: '34655444333' }
];

async function step1_ImportContacts() {
  console.log('1️⃣ PASO 1: Importar contactos SIN WhatsApp...');
  console.log(`📋 Importando ${testContacts.length} contactos de prueba`);
  
  try {
    const response = await fetch(`${NEXTJS_BASE}/leads/import_contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'x-user-id': USER_ID // Header de fallback para autenticación
      },
      body: JSON.stringify({
        contacts: testContacts
      })
    });

    const result = await response.json();
    
    console.log(`📊 Status: ${response.status}`);
    
    if (result.success) {
      console.log('✅ Importación exitosa:');
      console.log(`   📥 Creados: ${result.created}`);
      console.log(`   ⚠️ Saltados: ${result.skipped}`);
      console.log(`   📊 Total: ${result.total}`);
      console.log(`   📂 Columna ID: ${result.columnId}`);
      console.log(`   💬 Mensaje: ${result.message}`);
      
      if (result.results && result.results.length > 0) {
        console.log('   📋 Ejemplos creados:');
        result.results.forEach(r => {
          if (r.status === 'created') {
            console.log(`      ✅ ${r.name} (${r.phone})`);
          } else if (r.status === 'error') {
            console.log(`      ❌ ${r.name} (${r.phone}): ${r.error}`);
          }
        });
      }
      
      return { success: true, columnId: result.columnId };
    } else {
      console.log('❌ Error en importación:', result.message);
      return { success: false };
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return { success: false };
  }
}

async function step2_LinkWithWhatsApp() {
  console.log('\n2️⃣ PASO 2: Vincular leads con WhatsApp...');
  console.log('🔗 Creando conversaciones y actualizando leads');
  
  try {
    const response = await fetch(`${NEXTJS_BASE}/whatsapp/ensure_conversations_for_leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'x-user-id': USER_ID // Header de fallback para autenticación
      },
      body: JSON.stringify({
        defaultCountry: '34' // España
      })
    });

    const result = await response.json();
    
    console.log(`📊 Status: ${response.status}`);
    
    if (result.success) {
      console.log('✅ Vinculación WhatsApp exitosa:');
      console.log(`   🆕 Conversaciones creadas: ${result.created}`);
      console.log(`   🔄 Leads actualizados: ${result.updated}`);
      console.log(`   ❌ Fallos: ${result.fail}`);
      console.log(`   📊 Total procesados: ${result.total}`);
      console.log(`   💬 Mensaje: ${result.message}`);
      
      if (result.results && result.results.length > 0) {
        console.log('   📋 Ejemplos vinculados:');
        result.results.forEach(r => {
          if (r.status === 'success') {
            console.log(`      ✅ ${r.name}: ${r.phone} → ${r.jid}`);
          } else if (r.status === 'error') {
            console.log(`      ❌ ${r.name} (${r.phone}): ${r.error}`);
          }
        });
      }
      
      return { success: true };
    } else {
      console.log('❌ Error en vinculación:', result.message);
      return { success: false };
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return { success: false };
  }
}

async function step3_VerifyResults() {
  console.log('\n3️⃣ PASO 3: Verificar resultados...');
  
  try {
    // Intentar obtener las columnas con leads desde el backend Express
    const response = await fetch('http://localhost:5001/api/leads/columns_with_leads', {
      headers: { 'Authorization': `Bearer ${JWT_TOKEN}` }
    });

    if (response.ok) {
      const result = await response.json();
      
      if (result.success && result.columns.length > 0) {
        const firstColumn = result.columns[0];
        console.log(`📂 Columna: ${firstColumn.title}`);
        console.log(`📊 Total leads: ${firstColumn.leads.length}`);
        
        if (firstColumn.leads.length > 0) {
          console.log('   📋 Leads en la columna:');
          firstColumn.leads.slice(0, 5).forEach((lead, i) => {
            const hasWhatsApp = lead.conversation_id ? '✅' : '❌';
            console.log(`      ${i + 1}. ${lead.name} ${hasWhatsApp} WhatsApp: ${lead.conversation_id || 'Sin vincular'}`);
          });
          
          const withWhatsApp = firstColumn.leads.filter(l => l.conversation_id).length;
          const withoutWhatsApp = firstColumn.leads.filter(l => !l.conversation_id).length;
          
          console.log(`   📊 Resumen: ${withWhatsApp} con WhatsApp, ${withoutWhatsApp} sin WhatsApp`);
        }
        
        return { success: true };
      }
    }
    
    console.log('⚠️ No se pudieron verificar los resultados (endpoint no disponible)');
    return { success: true };
    
  } catch (error) {
    console.log('⚠️ Error verificando resultados:', error.message);
    return { success: true }; // No es crítico
  }
}

async function testErrorHandling() {
  console.log('\n4️⃣ PASO 4: Probar manejo de errores...');
  
  // Test sin token
  try {
    const response = await fetch(`${NEXTJS_BASE}/leads/import_contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: [{ name: 'Test', phone: '123456789' }] })
    });

    const result = await response.json();
    
    if (response.status === 401 && !result.success) {
      console.log('✅ Manejo de autenticación correcto');
    } else {
      console.log('❌ Manejo de autenticación incorrecto');
    }
  } catch (error) {
    console.log('⚠️ Error en test de autenticación:', error.message);
  }

  // Test con datos vacíos
  try {
    const response = await fetch(`${NEXTJS_BASE}/leads/import_contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({ contacts: [] }) // Array vacío
    });

    const result = await response.json();
    
    if (response.status === 400 && !result.success) {
      console.log('✅ Validación de datos vacíos correcta');
    } else {
      console.log('❌ Validación de datos vacíos incorrecta');
    }
  } catch (error) {
    console.log('⚠️ Error en test de validación:', error.message);
  }
}

// Ejecutar el flujo completo
async function runCompleteFlow() {
  console.log('⚠️ IMPORTANTE: Asegúrate de que Next.js esté corriendo en localhost:3000');
  console.log('⚠️ Y que tengas un JWT token válido configurado\n');
  
  // Paso 1: Importar contactos sin WhatsApp
  const step1Result = await step1_ImportContacts();
  
  if (!step1Result.success) {
    console.log('\n❌ No se puede continuar - Error en paso 1');
    return;
  }
  
  // Esperar un poco entre pasos
  console.log('\n⏳ Esperando 2 segundos antes del siguiente paso...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Paso 2: Vincular con WhatsApp
  const step2Result = await step2_LinkWithWhatsApp();
  
  if (!step2Result.success) {
    console.log('\n⚠️ Error en vinculación WhatsApp, pero continuando...');
  }
  
  // Paso 3: Verificar resultados
  await step3_VerifyResults();
  
  // Paso 4: Probar manejo de errores
  await testErrorHandling();
  
  console.log('\n🎉 ¡Flujo completo de pruebas terminado!');
  console.log('\n📋 Resumen del flujo implementado:');
  console.log('   1️⃣ Importar contactos → Crear leads con phone (sin WhatsApp)');
  console.log('   2️⃣ Escanear QR → Vincular leads con conversaciones WhatsApp');
  console.log('   3️⃣ Verificar → Leads ahora tienen conversation_id');
  console.log('\n✅ Características implementadas:');
  console.log('   🔒 Autenticación JWT obligatoria');
  console.log('   📱 Columna phone para teléfonos sin formato JID');
  console.log('   🔄 Conversión automática phone → JID al vincular');
  console.log('   🛡️ Índice único para evitar duplicados');
  console.log('   📝 Logs detallados para debugging');
  console.log('   🎯 Nombres se guardan correctamente');
  console.log('   ⚡ Manejo robusto de errores');
  
  console.log('\n🔧 Uso desde frontend:');
  console.log('   // 1. Importar archivo (crear leads sin WhatsApp)');
  console.log('   await fetch("/api/leads/import_contacts", {');
  console.log('     method: "POST",');
  console.log('     headers: { "Authorization": `Bearer ${token}` },');
  console.log('     body: JSON.stringify({ contacts: [{ name, phone }] })');
  console.log('   })');
  console.log('');
  console.log('   // 2. Después del QR (vincular con WhatsApp)');
  console.log('   await fetch("/api/whatsapp/ensure_conversations_for_leads", {');
  console.log('     method: "POST",');
  console.log('     headers: { "Authorization": `Bearer ${token}` },');
  console.log('     body: JSON.stringify({ defaultCountry: "34" })');
  console.log('   })');
}

runCompleteFlow().catch(console.error);
