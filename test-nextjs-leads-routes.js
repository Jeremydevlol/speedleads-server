#!/usr/bin/env node

/**
 * Script de prueba para las rutas de Next.js de leads
 * Prueba la creación y movimiento de leads usando las nuevas rutas
 */

import fetch from 'node-fetch';

// ⚠️ CONFIGURACIÓN - ACTUALIZAR CON TUS DATOS
const NEXTJS_BASE = 'http://localhost:3000/api'; // URL de tu app Next.js
const JWT_TOKEN = 'tu-jwt-token-aqui'; // ⚠️ Reemplazar con un token válido

console.log('🚀 Probando Rutas de Next.js para Leads\n');

async function testCreateLead() {
  console.log('1️⃣ Probando creación de lead...');
  
  try {
    const response = await fetch(`${NEXTJS_BASE}/leads/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        name: 'Juan Pérez Test',
        message: 'Lead creado desde Next.js API',
        avatar_url: null,
        column_id: 'col1', // Formato "col1" que se resuelve automáticamente
        conversation_id: '34612345678@s.whatsapp.net'
      })
    });

    const result = await response.json();
    
    console.log(`📊 Status: ${response.status}`);
    
    if (result.success) {
      console.log('✅ Lead creado exitosamente:');
      console.log(`   ID: ${result.lead.id}`);
      console.log(`   Nombre: ${result.lead.name}`);
      console.log(`   Columna: ${result.lead.column_id}`);
      console.log(`   Conversación: ${result.lead.conversation_id}`);
      console.log(`   Creado: ${result.lead.created_at}`);
      return result.lead.id; // Retornar ID para pruebas posteriores
    } else {
      console.log('❌ Error creando lead:', result.message);
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

async function testCreateLeadWithUUID(columnId) {
  console.log('\n2️⃣ Probando creación de lead con UUID directo...');
  
  try {
    const response = await fetch(`${NEXTJS_BASE}/leads/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        name: 'María García Test',
        message: 'Lead con UUID directo',
        avatar_url: null,
        column_id: columnId, // UUID directo de columna
        conversation_id: '34687654321@s.whatsapp.net'
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Lead con UUID creado:');
      console.log(`   ID: ${result.lead.id}`);
      console.log(`   Nombre: ${result.lead.name}`);
      return result.lead.id;
    } else {
      console.log('❌ Error:', result.message);
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

async function testMoveLead(leadId, targetColumn) {
  console.log('\n3️⃣ Probando movimiento de lead...');
  
  try {
    const response = await fetch(`${NEXTJS_BASE}/leads/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        leadId: leadId,
        targetColumnId: targetColumn // Puede ser "col2", "col3", etc.
      })
    });

    const result = await response.json();
    
    console.log(`📊 Status: ${response.status}`);
    
    if (result.success) {
      console.log('✅ Lead movido exitosamente:');
      console.log(`   ID: ${result.lead.id}`);
      console.log(`   Nueva columna: ${result.lead.column_id}`);
      console.log(`   Actualizado: ${result.lead.updated_at}`);
      return true;
    } else {
      console.log('❌ Error moviendo lead:', result.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testMoveLeadWithUUID(leadId, targetColumnUUID) {
  console.log('\n4️⃣ Probando movimiento con UUID directo...');
  
  try {
    const response = await fetch(`${NEXTJS_BASE}/leads/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        leadId: leadId,
        targetColumnId: targetColumnUUID // UUID directo
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Lead movido con UUID:');
      console.log(`   Nueva columna: ${result.lead.column_id}`);
      return true;
    } else {
      console.log('❌ Error:', result.message);
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function getColumnsForTesting() {
  console.log('0️⃣ Obteniendo columnas para pruebas...');
  
  try {
    // Intentar obtener columnas desde el backend Express
    const response = await fetch('http://localhost:5001/api/leads/columns_with_leads', {
      headers: { 'Authorization': `Bearer ${JWT_TOKEN}` }
    });

    if (response.ok) {
      const result = await response.json();
      
      if (result.success && result.columns.length >= 2) {
        console.log(`📂 Columnas disponibles: ${result.columns.length}`);
        result.columns.slice(0, 3).forEach((col, i) => {
          console.log(`   ${i + 1}. ${col.title} (${col.leads.length} leads) - ID: ${col.id}`);
        });
        
        return {
          firstColumnId: result.columns[0].id,
          secondColumnId: result.columns[1]?.id || result.columns[0].id
        };
      }
    }
    
    console.log('⚠️ No se pudieron obtener columnas, usando valores por defecto');
    return { firstColumnId: 'col1', secondColumnId: 'col2' };
    
  } catch (error) {
    console.log('⚠️ Error obteniendo columnas:', error.message);
    return { firstColumnId: 'col1', secondColumnId: 'col2' };
  }
}

async function testErrorHandling() {
  console.log('\n5️⃣ Probando manejo de errores...');
  
  // Test sin token
  try {
    const response = await fetch(`${NEXTJS_BASE}/leads/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', column_id: 'col1' })
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

  // Test con datos incompletos
  try {
    const response = await fetch(`${NEXTJS_BASE}/leads/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({ leadId: 'test' }) // Falta targetColumnId
    });

    const result = await response.json();
    
    if (response.status === 400 && !result.success) {
      console.log('✅ Validación de datos correcta');
    } else {
      console.log('❌ Validación de datos incorrecta');
    }
  } catch (error) {
    console.log('⚠️ Error en test de validación:', error.message);
  }
}

// Ejecutar todas las pruebas
async function runTests() {
  console.log('⚠️ IMPORTANTE: Asegúrate de que Next.js esté corriendo en localhost:3000\n');
  console.log('⚠️ Y que tengas un JWT token válido configurado\n');
  
  // 0. Obtener columnas para pruebas
  const { firstColumnId, secondColumnId } = await getColumnsForTesting();
  
  // 1. Crear lead con formato "col1"
  const leadId1 = await testCreateLead();
  
  // 2. Crear lead con UUID directo
  const leadId2 = await testCreateLeadWithUUID(firstColumnId);
  
  // 3. Mover lead con formato "col2"
  if (leadId1) {
    await testMoveLead(leadId1, 'col2');
  }
  
  // 4. Mover lead con UUID directo
  if (leadId2) {
    await testMoveLeadWithUUID(leadId2, secondColumnId);
  }
  
  // 5. Probar manejo de errores
  await testErrorHandling();
  
  console.log('\n🎉 ¡Todas las pruebas completadas!');
  console.log('\n📋 Resumen de las rutas Next.js:');
  console.log('   ✅ POST /api/leads/create - Crea nuevos leads');
  console.log('   ✅ POST /api/leads/move - Mueve leads entre columnas');
  console.log('   ✅ Soporte para formatos "col1", "col2" y UUIDs directos');
  console.log('   ✅ Autenticación JWT');
  console.log('   ✅ Filtrado por user_id (seguridad)');
  console.log('   ✅ Logs detallados para debugging');
  console.log('   ✅ Manejo robusto de errores');
  
  console.log('\n🔧 Uso desde frontend:');
  console.log('   // Crear lead');
  console.log('   await fetch("/api/leads/create", {');
  console.log('     method: "POST",');
  console.log('     headers: { "Authorization": `Bearer ${token}` },');
  console.log('     body: JSON.stringify({ name, message, column_id: "col1" })');
  console.log('   })');
  console.log('');
  console.log('   // Mover lead');
  console.log('   await fetch("/api/leads/move", {');
  console.log('     method: "POST",');
  console.log('     headers: { "Authorization": `Bearer ${token}` },');
  console.log('     body: JSON.stringify({ leadId, targetColumnId: "col2" })');
  console.log('   })');
}

runTests().catch(console.error);
