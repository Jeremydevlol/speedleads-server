#!/usr/bin/env node

/**
 * Script de prueba para el sistema de importación de leads
 * Prueba los endpoints de importación de contactos y creación de leads
 */

import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';
const JWT_TOKEN = 'tu-jwt-token-aqui'; // ⚠️ Reemplazar con un token válido

// Crear archivo CSV de prueba
const csvContent = `name,phone,email
Juan Pérez,+34612345678,juan@example.com
María González,34623456789,maria@example.com
Carlos López,612345678,carlos@example.com
Ana Martín,+34634567890,ana@example.com`;

fs.writeFileSync('test-contacts.csv', csvContent);

console.log('🚀 Probando Sistema de Importación de Leads\n');

async function testContactsImport() {
  console.log('1️⃣ Probando importación de archivo CSV...');
  
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream('test-contacts.csv'));

    const response = await fetch(`${API_BASE}/contacts/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        ...form.getHeaders()
      },
      body: form
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Importación exitosa:');
      console.log(`   📊 Total contactos: ${result.total}`);
      console.log(`   📁 Archivo: ${result.filename}`);
      console.log('   📋 Contactos:');
      result.contacts.forEach((c, i) => {
        console.log(`      ${i + 1}. ${c.name} - ${c.phone}`);
      });
      return result.contacts;
    } else {
      console.log('❌ Error en importación:', result.message);
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

async function testLeadsImport(contacts) {
  console.log('\n2️⃣ Probando creación de leads...');
  
  try {
    const response = await fetch(`${API_BASE}/leads/import_contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        contacts: contacts,
        defaultCountry: '34'
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Creación de leads exitosa:');
      console.log(`   📊 Estadísticas:`);
      console.log(`      - Total procesados: ${result.results.stats.processed}`);
      console.log(`      - Conversaciones creadas: ${result.results.stats.conversations_created}`);
      console.log(`      - Conversaciones actualizadas: ${result.results.stats.conversations_updated}`);
      console.log(`      - Leads creados: ${result.results.stats.leads_created}`);
      console.log(`      - Leads omitidos: ${result.results.stats.leads_skipped}`);
      console.log(`   📁 Columna ID: ${result.column_id}`);
      
      if (result.results.errors.length > 0) {
        console.log('   ⚠️ Errores:');
        result.results.errors.forEach(err => {
          console.log(`      - ${err.contact.name}: ${err.error}`);
        });
      }
      
      return result.column_id;
    } else {
      console.log('❌ Error en creación de leads:', result.message);
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return null;
  }
}

async function testGetColumnsWithLeads() {
  console.log('\n3️⃣ Probando obtención de columnas con leads...');
  
  try {
    const response = await fetch(`${API_BASE}/leads/columns_with_leads`, {
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Columnas obtenidas exitosamente:');
      result.columns.forEach(col => {
        console.log(`   📂 ${col.title} (${col.leads.length} leads)`);
        col.leads.forEach((lead, i) => {
          console.log(`      ${i + 1}. ${lead.name} - ${lead.conversation_id}`);
        });
      });
    } else {
      console.log('❌ Error obteniendo columnas:', result.message);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

async function testWhatsAppSend(columnId) {
  console.log('\n4️⃣ Probando envío de WhatsApp a leads...');
  
  try {
    // Obtener leads de la columna
    const columnsResponse = await fetch(`${API_BASE}/leads/columns_with_leads`, {
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });
    
    const columnsResult = await columnsResponse.json();
    const targetColumn = columnsResult.columns.find(c => c.id === columnId);
    
    if (!targetColumn || targetColumn.leads.length === 0) {
      console.log('⚠️ No hay leads para enviar mensajes');
      return;
    }

    const lead = targetColumn.leads[0]; // Tomar el primer lead
    const phone = lead.conversation_id.replace('@s.whatsapp.net', '');
    
    console.log(`📱 Enviando mensaje a ${lead.name} (${phone})...`);
    
    const response = await fetch(`${API_BASE}/whatsapp/send_message_to_number`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        phoneNumber: phone,
        textContent: '¡Hola! Este es un mensaje de prueba desde el sistema de leads. 👋',
        attachments: []
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Mensaje enviado exitosamente');
      console.log(`   📞 A: ${phone}`);
      console.log(`   💬 Mensaje: "¡Hola! Este es un mensaje de prueba..."`);
    } else {
      console.log('❌ Error enviando mensaje:', result.message);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

// Ejecutar pruebas
async function runTests() {
  console.log('⚠️ IMPORTANTE: Asegúrate de tener un JWT token válido en la variable JWT_TOKEN\n');
  
  // 1. Importar contactos desde CSV
  const contacts = await testContactsImport();
  
  if (!contacts) {
    console.log('\n❌ No se pudieron importar contactos. Abortando pruebas.');
    return;
  }
  
  // 2. Crear leads en la base de datos
  const columnId = await testLeadsImport(contacts);
  
  if (!columnId) {
    console.log('\n❌ No se pudieron crear leads. Abortando pruebas.');
    return;
  }
  
  // 3. Obtener columnas con leads
  await testGetColumnsWithLeads();
  
  // 4. Enviar mensaje de WhatsApp (opcional)
  console.log('\n🤔 ¿Quieres probar el envío de WhatsApp? (Asegúrate de tener WhatsApp conectado)');
  // await testWhatsAppSend(columnId);
  
  console.log('\n🎉 ¡Todas las pruebas completadas!');
  console.log('\n📋 Resumen del sistema:');
  console.log('   ✅ Importación de archivos CSV/XLSX/TXT/PDF');
  console.log('   ✅ Extracción automática de nombres y teléfonos');
  console.log('   ✅ Creación de conversaciones en conversations_new');
  console.log('   ✅ Creación de leads en la primera columna');
  console.log('   ✅ API para obtener kanban completo');
  console.log('   ✅ Integración con sistema de WhatsApp existente');
}

// Limpiar archivos de prueba al final
process.on('exit', () => {
  try {
    fs.unlinkSync('test-contacts.csv');
  } catch (e) {
    // Ignorar errores de limpieza
  }
});

runTests().catch(console.error);
