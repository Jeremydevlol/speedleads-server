#!/usr/bin/env node

/**
 * Script de prueba para el endpoint de mover leads
 * Prueba POST /api/leads/move con body
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5001/api';
const JWT_TOKEN = 'tu-jwt-token-aqui'; // ⚠️ Reemplazar con un token válido

console.log('🚀 Probando Endpoint de Mover Leads\n');

async function testMoveLeadWithBody() {
  console.log('1️⃣ Probando POST /api/leads/move con body...');
  
  try {
    const response = await fetch(`${API_BASE}/leads/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        leadId: "lead-uuid-aqui",
        targetColumnId: "column-uuid-aqui"
      })
    });

    const result = await response.json();
    
    console.log(`📊 Status: ${response.status}`);
    console.log(`📋 Response:`, result);
    
    if (result.success) {
      console.log('✅ Lead movido exitosamente:');
      console.log(`   🆔 Lead ID: ${result.lead.id}`);
      console.log(`   📂 Nueva columna: ${result.lead.column_id}`);
    } else {
      console.log('❌ Error moviendo lead:', result.message);
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

async function testGetColumnsWithLeads() {
  console.log('\n2️⃣ Obteniendo columnas con leads para referencias...');
  
  try {
    const response = await fetch(`${API_BASE}/leads/columns_with_leads`, {
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Columnas obtenidas:');
      result.columns.forEach(col => {
        console.log(`   📂 ${col.title} (ID: ${col.id})`);
        col.leads.forEach((lead, i) => {
          console.log(`      ${i + 1}. ${lead.name} (ID: ${lead.id})`);
        });
      });
      
      if (result.columns.length > 0 && result.columns[0].leads.length > 0) {
        const firstLead = result.columns[0].leads[0];
        const targetColumn = result.columns.length > 1 ? result.columns[1] : result.columns[0];
        
        console.log(`\n🎯 Ejemplo de uso:`);
        console.log(`   Lead a mover: ${firstLead.id} (${firstLead.name})`);
        console.log(`   Columna destino: ${targetColumn.id} (${targetColumn.title})`);
        console.log(`   
   fetch('/api/leads/move', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': 'Bearer YOUR_TOKEN'
     },
     body: JSON.stringify({
       leadId: "${firstLead.id}",
       targetColumnId: "${targetColumn.id}"
     })
   })`);
      }
    } else {
      console.log('❌ Error obteniendo columnas:', result.message);
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

async function testInvalidRequests() {
  console.log('\n3️⃣ Probando validaciones...');
  
  // Test sin leadId
  try {
    const response = await fetch(`${API_BASE}/leads/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        targetColumnId: "column-uuid"
      })
    });

    const result = await response.json();
    console.log(`📋 Sin leadId - Status: ${response.status}, Message: ${result.message}`);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  // Test sin targetColumnId
  try {
    const response = await fetch(`${API_BASE}/leads/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        leadId: "lead-uuid"
      })
    });

    const result = await response.json();
    console.log(`📋 Sin targetColumnId - Status: ${response.status}, Message: ${result.message}`);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

// Ejecutar pruebas
async function runTests() {
  console.log('⚠️ IMPORTANTE: Asegúrate de tener un JWT token válido en la variable JWT_TOKEN\n');
  
  await testGetColumnsWithLeads();
  await testMoveLeadWithBody();
  await testInvalidRequests();
  
  console.log('\n🎉 ¡Pruebas completadas!');
  console.log('\n📋 Resumen del endpoint:');
  console.log('   ✅ POST /api/leads/move');
  console.log('   ✅ Body: { leadId, targetColumnId }');
  console.log('   ✅ Headers: Authorization Bearer token');
  console.log('   ✅ Validación de usuario (user_id)');
  console.log('   ✅ Actualiza updated_at automáticamente');
  console.log('   ✅ Retorna { success: true, lead: { id, column_id } }');
}

runTests().catch(console.error);
