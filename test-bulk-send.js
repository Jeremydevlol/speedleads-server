#!/usr/bin/env node

// test-bulk-send.js
// Script para probar el envío masivo de mensajes a leads

const BASE_URL = 'http://localhost:5001'
const USER_ID = '8ab8810d-6344-4de7-9965-38233f32671a'
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4YWI4ODEwZC02MzQ0LTRkZTctOTk2NS0zODIzM2YzMjY3MWEiLCJpYXQiOjE3NTY4MTIyNjh9.RkJ3OIlpgDgfEoxT_wB_wzBZbfWvGINFF43sq89QKnM'

async function getColumnsWithLeads() {
  console.log('\n📊 1) Obteniendo columnas disponibles...')
  
  try {
    const response = await fetch(`${BASE_URL}/api/leads/columns`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    })
    
    const data = await response.json()
    
    if (!data.success) {
      console.log('❌ Error obteniendo columnas:', data.message)
      return null
    }
    
    const columns = data.columns || []
    console.log(`📊 Total columnas: ${columns.length}`)
    
    if (columns.length === 0) {
      console.log('❌ No hay columnas disponibles')
      return null
    }
    
    console.log('\n📋 Columnas encontradas:')
    columns.forEach((col, idx) => {
      console.log(`   ${idx + 1}. ${col.title || 'Sin título'} (ID: ${col.id})`)
    })
    
    return columns
    
  } catch (error) {
    console.log('❌ Error:', error.message)
    return null
  }
}

async function testBulkSendManual(columnId) {
  console.log('\n📱 2) Probando envío masivo manual...')
  
  try {
    const response = await fetch(`${BASE_URL}/api/leads/bulk_send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        columnId: columnId,
        mode: 'manual',
        text: 'Hola {{name}}! 👋 Este es un mensaje de prueba desde el sistema de leads.',
        promptTemplate: null,
        personalityId: null
      })
    })
    
    console.log(`📊 Status HTTP: ${response.status}`)
    const data = await response.json()
    console.log('📊 Respuesta:', data)
    
    if (data.success) {
      console.log(`✅ Envío masivo manual exitoso:`)
      console.log(`   📤 Enviados: ${data.sent}`)
      console.log(`   ❌ Fallidos: ${data.fail}`)
      return true
    } else {
      console.log('❌ Error en envío masivo:', data.message)
      return false
    }
    
  } catch (error) {
    console.log('❌ Error ejecutando envío masivo:', error.message)
    return false
  }
}

async function testBulkSendAI(columnId) {
  console.log('\n🤖 3) Probando envío masivo con IA...')
  
  try {
    const response = await fetch(`${BASE_URL}/api/leads/bulk_send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        columnId: columnId,
        mode: 'ai',
        text: null,
        promptTemplate: 'Hola {{name}}, espero que tengas un excelente día. ¿Cómo puedo ayudarte hoy? 🚀',
        personalityId: 'default'
      })
    })
    
    console.log(`📊 Status HTTP: ${response.status}`)
    const data = await response.json()
    console.log('📊 Respuesta:', data)
    
    if (data.success) {
      console.log(`✅ Envío masivo IA exitoso:`)
      console.log(`   📤 Enviados: ${data.sent}`)
      console.log(`   ❌ Fallidos: ${data.fail}`)
      return true
    } else {
      console.log('❌ Error en envío masivo IA:', data.message)
      return false
    }
    
  } catch (error) {
    console.log('❌ Error ejecutando envío masivo IA:', error.message)
    return false
  }
}

async function testBulkSendEmpty(columnId) {
  console.log('\n📭 4) Probando envío a columna vacía...')
  
  // Usar un ID de columna que probablemente no tenga leads
  const emptyColumnId = '999999'
  
  try {
    const response = await fetch(`${BASE_URL}/api/leads/bulk_send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        columnId: emptyColumnId,
        mode: 'manual',
        text: 'Test message',
        promptTemplate: null,
        personalityId: null
      })
    })
    
    console.log(`📊 Status HTTP: ${response.status}`)
    const data = await response.json()
    console.log('📊 Respuesta:', data)
    
    if (response.status === 400 && data.message.includes('No hay leads')) {
      console.log('✅ Manejo correcto de columna vacía')
      return true
    } else {
      console.log('⚠️ Respuesta inesperada para columna vacía')
      return false
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message)
    return false
  }
}

async function runBulkSendTests() {
  console.log('🚀 VERIFICACIÓN DE ENVÍO MASIVO DE MENSAJES')
  console.log('=' .repeat(50))
  
  // 1. Obtener columnas disponibles
  const columns = await getColumnsWithLeads()
  if (!columns || columns.length === 0) {
    console.log('\n❌ FALLO: No hay columnas disponibles')
    console.log('💡 SOLUCIÓN:')
    console.log('   1. Crear columnas con sync_columns')
    console.log('   2. Importar leads o sincronizar WhatsApp')
    return
  }
  
  const firstColumnId = columns[0].id
  
  // 2. Probar envío manual
  const manualOK = await testBulkSendManual(firstColumnId)
  
  // 3. Probar envío con IA
  const aiOK = await testBulkSendAI(firstColumnId)
  
  // 4. Probar columna vacía
  const emptyOK = await testBulkSendEmpty(firstColumnId)
  
  console.log('\n' + '=' .repeat(50))
  console.log('📋 RESUMEN DE PRUEBAS:')
  console.log(`   📱 Envío manual: ${manualOK ? '✅ OK' : '❌ FALLO'}`)
  console.log(`   🤖 Envío IA: ${aiOK ? '✅ OK' : '❌ FALLO'}`)
  console.log(`   📭 Columna vacía: ${emptyOK ? '✅ OK' : '❌ FALLO'}`)
  
  if (manualOK && aiOK && emptyOK) {
    console.log('\n🎉 ¡TODAS LAS PRUEBAS PASARON!')
    console.log('✅ Sistema de envío masivo funcionando correctamente')
  } else {
    console.log('\n⚠️ ALGUNAS PRUEBAS FALLARON')
    console.log('💡 Verificar logs del servidor y conexión WhatsApp')
  }
  
  console.log('\n💡 Próximos pasos:')
  console.log('   1. Verificar mensajes enviados en WhatsApp')
  console.log('   2. Implementar en frontend con UI intuitiva')
  console.log('   3. Añadir más opciones de personalización')
}

// Ejecutar pruebas
runBulkSendTests().catch(console.error)
