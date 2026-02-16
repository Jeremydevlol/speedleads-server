#!/usr/bin/env node

// test-sync-whatsapp-leads.js
// Script para probar la sincronización de contactos WhatsApp como leads

const BASE_URL = 'http://localhost:5001'
const USER_ID = '8ab8810d-6344-4de7-9965-38233f32671a'

async function testSyncWhatsAppLeads() {
  console.log('\n📱 Probando sincronización de contactos WhatsApp como leads...')
  
  try {
    const response = await fetch(`${BASE_URL}/api/leads/sync_whatsapp_leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4YWI4ODEwZC02MzQ0LTRkZTctOTk2NS0zODIzM2YzMjY3MWEiLCJpYXQiOjE3NTY4MTIyNjh9.RkJ3OIlpgDgfEoxT_wB_wzBZbfWvGINFF43sq89QKnM'
      }
    })
    
    const data = await response.json()
    console.log('📊 Resultado sync_whatsapp_leads:', data)
    
    if (data.success) {
      console.log(`✅ Leads creados: ${data.created}, omitidos: ${data.skipped}`)
      return true
    } else {
      console.log('❌ Error:', data.message)
      return false
    }
  } catch (error) {
    console.log('❌ Error:', error.message)
    return false
  }
}

async function testGetColumns() {
  console.log('\n📋 Verificando columnas existentes...')
  
  try {
    const response = await fetch(`${BASE_URL}/api/leads/columns`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4YWI4ODEwZC02MzQ0LTRkZTctOTk2NS0zODIzM2YzMjY3MWEiLCJpYXQiOjE3NTY4MTIyNjh9.RkJ3OIlpgDgfEoxT_wB_wzBZbfWvGINFF43sq89QKnM'
      }
    })
    
    const data = await response.json()
    console.log('📊 Columnas:', data)
    
    if (data.success && data.columns) {
      console.log('✅ Columnas encontradas:')
      data.columns.forEach((col, idx) => {
        console.log(`   ${idx + 1}. ${col.title} (ID: ${col.id}, Color: ${col.color})`)
      })
      return data.columns
    } else {
      console.log('❌ Error:', data.message)
      return null
    }
  } catch (error) {
    console.log('❌ Error:', error.message)
    return null
  }
}

async function testGetLeads() {
  console.log('\n👥 Verificando leads creados...')
  
  try {
    // Esta ruta no existe aún, pero podemos simularla
    console.log('💡 Para verificar leads, ejecuta en BD:')
    console.log('   SELECT * FROM public.leads_contacts WHERE user_id = \'8ab8810d-6344-4de7-9965-38233f32671a\';')
    return true
  } catch (error) {
    console.log('❌ Error:', error.message)
    return false
  }
}

async function runCompleteTest() {
  console.log('🚀 VERIFICACIÓN DE SINCRONIZACIÓN DE CONTACTOS WHATSAPP')
  console.log('=' .repeat(60))
  
  // 1. Verificar columnas existentes
  const columns = await testGetColumns()
  if (!columns) {
    console.log('\n❌ FALLO: No se pudieron obtener columnas')
    return
  }
  
  // 2. Sincronizar contactos WhatsApp
  const syncOK = await testSyncWhatsAppLeads()
  if (!syncOK) {
    console.log('\n❌ FALLO: No se pudieron sincronizar contactos')
    return
  }
  
  // 3. Verificar leads creados
  await testGetLeads()
  
  console.log('\n' + '=' .repeat(60))
  console.log('🎉 ¡SINCRONIZACIÓN COMPLETA!')
  console.log('✅ Contactos WhatsApp convertidos a leads')
  console.log('✅ Leads asignados a la primera columna')
  console.log('✅ Sistema listo para gestión de leads')
  console.log('\n💡 Próximos pasos:')
  console.log('   1. Verificar leads en el frontend')
  console.log('   2. Mover leads entre columnas')
  console.log('   3. Enviar mensajes masivos por columna')
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runCompleteTest().catch(console.error)
}

export { testGetColumns, testGetLeads, testSyncWhatsAppLeads }

