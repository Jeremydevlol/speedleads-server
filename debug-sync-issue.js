#!/usr/bin/env node

// debug-sync-issue.js
// Diagnosticar por qué los contactos WhatsApp no se sincronizan a leads

const BASE_URL = 'http://localhost:5001'
const USER_ID = '8ab8810d-6344-4de7-9965-38233f32671a'
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4YWI4ODEwZC02MzQ0LTRkZTctOTk2NS0zODIzM2YzMjY3MWEiLCJpYXQiOjE3NTY4MTIyNjh9.RkJ3OIlpgDgfEoxT_wB_wzBZbfWvGINFF43sq89QKnM'

async function checkWhatsAppChats() {
  console.log('\n📱 1) Verificando chats de WhatsApp...')
  
  try {
    const response = await fetch(`${BASE_URL}/api/whatsapp/get_conversations`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    })
    
    const data = await response.json()
    
    if (!data.success) {
      console.log('❌ WhatsApp no conectado:', data.message)
      return null
    }
    
    const conversations = data.conversations || []
    console.log(`📊 Total chats: ${conversations.length}`)
    
    if (conversations.length === 0) {
      console.log('❌ No hay chats disponibles')
      return null
    }
    
    console.log('\n📋 Chats encontrados:')
    const whatsappChats = []
    
    conversations.forEach((chat, idx) => {
      const isWhatsApp = chat.external_id && chat.external_id.includes('@s.whatsapp.net')
      const isGroup = chat.external_id && chat.external_id.includes('@g.us')
      
      console.log(`   ${idx + 1}. ${chat.contact_name || 'Sin nombre'}`)
      console.log(`      JID: ${chat.external_id || 'Sin JID'}`)
      console.log(`      Tipo: ${isWhatsApp ? '✅ WhatsApp Individual' : isGroup ? '👥 Grupo' : '❓ Otro'}`)
      
      if (isWhatsApp && !isGroup) {
        whatsappChats.push(chat)
      }
    })
    
    console.log(`\n✅ Chats WhatsApp individuales: ${whatsappChats.length}`)
    return whatsappChats
    
  } catch (error) {
    console.log('❌ Error obteniendo chats:', error.message)
    return null
  }
}

async function checkExistingLeads() {
  console.log('\n👥 2) Verificando leads existentes...')
  
  try {
    // Usar la ruta que sabemos que funciona
    const response = await fetch(`${BASE_URL}/api/leads/columns`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    })
    
    const data = await response.json()
    
    if (!data.success) {
      console.log('❌ Error obteniendo leads:', data.message)
      return null
    }
    
    console.log(`📊 Columnas disponibles: ${data.columns?.length || 0}`)
    
    if (data.columns && data.columns.length > 0) {
      console.log('\n📋 Columnas:')
      data.columns.forEach((col, idx) => {
        console.log(`   ${idx + 1}. ${col.title} (ID: ${col.id})`)
      })
    }
    
    // Intentar obtener leads si hay una ruta disponible
    console.log('\n💡 Para ver leads, necesitamos una ruta específica o consulta BD directa')
    
    return data.columns
    
  } catch (error) {
    console.log('❌ Error:', error.message)
    return null
  }
}

async function testSyncRoute() {
  console.log('\n🔄 3) Probando ruta de sincronización...')
  
  try {
    const response = await fetch(`${BASE_URL}/api/leads/sync_whatsapp_leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      }
    })
    
    console.log(`📊 Status HTTP: ${response.status}`)
    
    if (response.status === 404) {
      console.log('❌ PROBLEMA: Ruta no existe en el servidor')
      console.log('💡 SOLUCIÓN: Reiniciar el servidor Express para cargar los cambios')
      return false
    }
    
    const data = await response.json()
    console.log('📊 Respuesta:', data)
    
    if (data.success) {
      console.log(`✅ Sincronización exitosa:`)
      console.log(`   ➕ Creados: ${data.created}`)
      console.log(`   ⏭️ Omitidos: ${data.skipped}`)
      return true
    } else {
      console.log('❌ Error en sincronización:', data.message)
      return false
    }
    
  } catch (error) {
    console.log('❌ Error ejecutando sincronización:', error.message)
    return false
  }
}

async function checkServerRoutes() {
  console.log('\n🔍 4) Verificando rutas disponibles del servidor...')
  
  const routesToTest = [
    '/api/leads/columns',
    '/api/leads/sync_columns', 
    '/api/leads/sync_whatsapp_leads'
  ]
  
  for (const route of routesToTest) {
    try {
      const response = await fetch(`${BASE_URL}${route}`, {
        method: route.includes('sync') ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TOKEN}`
        },
        body: route === '/api/leads/sync_columns' ? JSON.stringify({columns: [{title: 'Test', color: 'blue'}]}) : undefined
      })
      
      console.log(`   ${route}: ${response.status === 404 ? '❌ No existe' : '✅ Disponible'}`)
      
    } catch (error) {
      console.log(`   ${route}: ❌ Error`)
    }
  }
}

async function runDiagnosis() {
  console.log('🔍 DIAGNÓSTICO: CHATS WHATSAPP → LEADS')
  console.log('=' .repeat(50))
  
  // 1. Verificar chats WhatsApp
  const whatsappChats = await checkWhatsAppChats()
  
  // 2. Verificar leads existentes
  const columns = await checkExistingLeads()
  
  // 3. Verificar rutas del servidor
  await checkServerRoutes()
  
  // 4. Probar sincronización
  if (whatsappChats && whatsappChats.length > 0) {
    await testSyncRoute()
  }
  
  console.log('\n' + '=' .repeat(50))
  console.log('📋 DIAGNÓSTICO COMPLETO:')
  
  if (!whatsappChats || whatsappChats.length === 0) {
    console.log('❌ PROBLEMA: No hay chats WhatsApp individuales')
    console.log('💡 SOLUCIÓN: Tener conversaciones activas con contactos individuales')
  } else if (!columns || columns.length === 0) {
    console.log('❌ PROBLEMA: No hay columnas de leads')
    console.log('💡 SOLUCIÓN: Crear columnas primero con sync_columns')
  } else {
    console.log('✅ DATOS DISPONIBLES')
    console.log('💡 PRÓXIMO PASO:')
    console.log('   1. Reiniciar servidor Express si sync_whatsapp_leads da 404')
    console.log('   2. Ejecutar sincronización desde frontend')
    console.log('   3. Refrescar board de leads')
  }
}

// Ejecutar diagnóstico
runDiagnosis().catch(console.error)
