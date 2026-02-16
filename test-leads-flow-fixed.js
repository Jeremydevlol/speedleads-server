#!/usr/bin/env node

// test-leads-flow-fixed.js
// Script para verificar el flujo completo de leads corregido

const BASE_URL = 'http://localhost:3000'
const USER_ID = '8ab8810d-6344-4de7-9965-38233f32671a'

const testContacts = [
  { name: 'Juan Pérez', phone: '34612345678' },
  { name: 'María García', phone: '620987654' },
  { name: 'Test Lead', phone: '+34611222333' }
]

async function testHealthCheck() {
  console.log('\n🔍 1) Verificando conexión de BD...')
  try {
    const response = await fetch(`${BASE_URL}/api/db/health`)
    const data = await response.json()
    
    if (data.success) {
      console.log('✅ Conexión BD OK:', data.test)
    } else {
      console.log('❌ Error BD:', data.error)
      return false
    }
  } catch (error) {
    console.log('❌ Error conectando:', error.message)
    return false
  }
  return true
}

async function testImportContacts() {
  console.log('\n📁 2) Importando contactos a leads...')
  try {
    const response = await fetch(`${BASE_URL}/api/leads/import_contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': USER_ID
      },
      body: JSON.stringify({ contacts: testContacts })
    })
    
    const data = await response.json()
    console.log('📊 Resultado:', data)
    
    if (data.success) {
      console.log(`✅ Leads creados: ${data.created}, omitidos: ${data.skipped}`)
      return data.columnId
    } else {
      console.log('❌ Error:', data.message)
      return null
    }
  } catch (error) {
    console.log('❌ Error:', error.message)
    return null
  }
}

async function testWhatsAppLinking() {
  console.log('\n📱 3) Vinculando leads con WhatsApp...')
  try {
    const response = await fetch(`${BASE_URL}/api/whatsapp/ensure_conversations_for_leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': USER_ID
      }
    })
    
    const data = await response.json()
    console.log('📊 Resultado:', data)
    
    if (data.success) {
      console.log(`✅ Conversaciones creadas: ${data.created}, actualizadas: ${data.updated}, fallos: ${data.fail}`)
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

async function runCompleteTest() {
  console.log('🚀 VERIFICACIÓN COMPLETA DEL FLUJO DE LEADS')
  console.log('=' .repeat(50))
  
  // 1. Verificar BD
  const healthOK = await testHealthCheck()
  if (!healthOK) {
    console.log('\n❌ FALLO: Conexión de BD no funciona')
    console.log('💡 Solución: Verificar .env.local y DATABASE_URL')
    return
  }
  
  // 2. Importar contactos
  const columnId = await testImportContacts()
  if (!columnId) {
    console.log('\n❌ FALLO: No se pudieron importar contactos')
    console.log('💡 Solución: Verificar tabla leads_contacts y permisos')
    return
  }
  
  // 3. Vincular WhatsApp
  const linkingOK = await testWhatsAppLinking()
  if (!linkingOK) {
    console.log('\n❌ FALLO: No se pudo vincular con WhatsApp')
    console.log('💡 Solución: Verificar tabla conversations_new')
    return
  }
  
  console.log('\n' + '=' .repeat(50))
  console.log('🎉 ¡FLUJO COMPLETO FUNCIONANDO!')
  console.log('✅ BD conectada')
  console.log('✅ Leads importados correctamente')
  console.log('✅ WhatsApp vinculado exitosamente')
  console.log('\n💡 Próximos pasos:')
  console.log('   1. Escanear QR de WhatsApp')
  console.log('   2. Probar envío masivo por columna')
  console.log('   3. Verificar sincronización en el frontend')
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  runCompleteTest().catch(console.error)
}

module.exports = { testHealthCheck, testImportContacts, testWhatsAppLinking }
