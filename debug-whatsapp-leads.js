#!/usr/bin/env node

// debug-whatsapp-leads.js
// Script para diagnosticar por qué no aparecen los contactos WhatsApp en leads

import pool from './dist/config/db.js'

const USER_ID = '8ab8810d-6344-4de7-9965-38233f32671a'

async function debugConversations() {
  console.log('\n🔍 1) Verificando conversaciones WhatsApp existentes...')
  
  try {
    const { rows } = await pool.query(
      `select external_id, contact_name, contact_photo_url, started_at, tenant
         from public.conversations_new
        where user_id = $1
        order by started_at desc`,
      [USER_ID]
    )
    
    console.log(`📊 Total conversaciones: ${rows.length}`)
    
    if (rows.length === 0) {
      console.log('❌ No hay conversaciones en la BD')
      console.log('💡 Solución: Conectar WhatsApp y tener al menos una conversación')
      return false
    }
    
    console.log('\n📋 Conversaciones encontradas:')
    rows.forEach((row, idx) => {
      const isWhatsApp = row.external_id && row.external_id.includes('@s.whatsapp.net')
      const isGroup = row.external_id && row.external_id.includes('@g.us')
      
      console.log(`   ${idx + 1}. ${row.contact_name || 'Sin nombre'}`)
      console.log(`      JID: ${row.external_id || 'Sin JID'}`)
      console.log(`      Tenant: ${row.tenant || 'Sin tenant'}`)
      console.log(`      Tipo: ${isWhatsApp ? '✅ WhatsApp Individual' : isGroup ? '👥 Grupo WhatsApp' : '❓ Otro'}`)
      console.log('')
    })
    
    // Filtrar solo WhatsApp individuales
    const whatsappContacts = rows.filter(row => 
      row.external_id && 
      row.external_id.includes('@s.whatsapp.net') && 
      !row.external_id.includes('@g.us')
    )
    
    console.log(`✅ Contactos WhatsApp individuales: ${whatsappContacts.length}`)
    
    return whatsappContacts.length > 0
    
  } catch (error) {
    console.error('❌ Error consultando conversaciones:', error.message)
    return false
  }
}

async function debugLeads() {
  console.log('\n🔍 2) Verificando leads existentes...')
  
  try {
    const { rows } = await pool.query(
      `select id, name, conversation_id, column_id, phone, message, created_at
         from public.leads_contacts
        where user_id = $1
        order by created_at desc`,
      [USER_ID]
    )
    
    console.log(`📊 Total leads: ${rows.length}`)
    
    if (rows.length === 0) {
      console.log('❌ No hay leads en la BD')
      console.log('💡 Solución: Ejecutar sincronización de WhatsApp o importar contactos')
      return false
    }
    
    console.log('\n📋 Leads encontrados:')
    rows.forEach((row, idx) => {
      const hasWhatsApp = row.conversation_id && row.conversation_id.includes('@s.whatsapp.net')
      
      console.log(`   ${idx + 1}. ${row.name || 'Sin nombre'}`)
      console.log(`      ID: ${row.id}`)
      console.log(`      Conversation ID: ${row.conversation_id || 'Sin vincular'}`)
      console.log(`      Column ID: ${row.column_id}`)
      console.log(`      Phone: ${row.phone || 'Sin teléfono'}`)
      console.log(`      Tipo: ${hasWhatsApp ? '✅ WhatsApp' : '📞 Otro'}`)
      console.log('')
    })
    
    return true
    
  } catch (error) {
    console.error('❌ Error consultando leads:', error.message)
    return false
  }
}

async function debugColumns() {
  console.log('\n🔍 3) Verificando columnas existentes...')
  
  try {
    const { rows } = await pool.query(
      `select id, title, color, created_at
         from public.leads
        where user_id = $1
        order by id asc`,
      [USER_ID]
    )
    
    console.log(`📊 Total columnas: ${rows.length}`)
    
    if (rows.length === 0) {
      console.log('❌ No hay columnas en la BD')
      console.log('💡 Solución: Crear al menos una columna')
      return false
    }
    
    console.log('\n📋 Columnas encontradas:')
    rows.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.title} (ID: ${row.id}, Color: ${row.color})`)
    })
    
    return rows[0].id // Retornar ID de primera columna
    
  } catch (error) {
    console.error('❌ Error consultando columnas:', error.message)
    return false
  }
}

async function testSyncProcess() {
  console.log('\n🔄 4) Simulando proceso de sincronización...')
  
  try {
    // 1. Buscar conversaciones WhatsApp
    const { rows: convs } = await pool.query(
      `select external_id, contact_name, contact_photo_url
         from public.conversations_new
        where user_id = $1
          and external_id is not null
          and external_id not like '%@g.us'`,
      [USER_ID]
    )
    
    console.log(`📱 Conversaciones WhatsApp encontradas: ${convs.length}`)
    
    if (convs.length === 0) {
      console.log('❌ No hay conversaciones WhatsApp para sincronizar')
      return false
    }
    
    // 2. Verificar primera columna
    const r = await pool.query(
      `select id from public.leads where user_id=$1 order by id asc limit 1`,
      [USER_ID]
    )
    
    let columnId
    if (r.rows.length) {
      columnId = r.rows[0].id
      console.log(`✅ Usando columna existente: ${columnId}`)
    } else {
      console.log('⚠️ No hay columnas, se crearía una nueva')
      columnId = 'nueva'
    }
    
    // 3. Verificar cuántos ya existen como leads
    let wouldCreate = 0, wouldSkip = 0
    
    for (const c of convs) {
      const jid = c.external_id
      const name = (c.contact_name || '').toString().trim() || jid.split('@')[0]
      
      const exist = await pool.query(
        `select 1 from public.leads_contacts where user_id=$1 and conversation_id=$2 limit 1`,
        [USER_ID, jid]
      )
      
      if (exist.rows.length) {
        wouldSkip++
        console.log(`   ⏭️ Ya existe: ${name} (${jid})`)
      } else {
        wouldCreate++
        console.log(`   ➕ Se crearía: ${name} (${jid})`)
      }
    }
    
    console.log(`\n📊 Resultado simulado:`)
    console.log(`   ➕ Se crearían: ${wouldCreate} leads`)
    console.log(`   ⏭️ Se omitirían: ${wouldSkip} leads`)
    
    return wouldCreate > 0
    
  } catch (error) {
    console.error('❌ Error en simulación:', error.message)
    return false
  }
}

async function runDiagnostic() {
  console.log('🔍 DIAGNÓSTICO DE CONTACTOS WHATSAPP EN LEADS')
  console.log('=' .repeat(60))
  
  // 1. Verificar conversaciones
  const hasConversations = await debugConversations()
  
  // 2. Verificar leads
  const hasLeads = await debugLeads()
  
  // 3. Verificar columnas
  const columnId = await debugColumns()
  
  // 4. Simular sincronización
  if (hasConversations) {
    await testSyncProcess()
  }
  
  console.log('\n' + '=' .repeat(60))
  console.log('📋 RESUMEN DEL DIAGNÓSTICO:')
  
  if (!hasConversations) {
    console.log('❌ PROBLEMA: No hay conversaciones WhatsApp')
    console.log('💡 SOLUCIÓN:')
    console.log('   1. Conectar WhatsApp (escanear QR)')
    console.log('   2. Tener al menos una conversación activa')
    console.log('   3. Verificar que external_id contiene JID')
  } else if (!columnId) {
    console.log('❌ PROBLEMA: No hay columnas de leads')
    console.log('💡 SOLUCIÓN:')
    console.log('   1. Crear al menos una columna en el board')
    console.log('   2. O ejecutar sync_columns primero')
  } else {
    console.log('✅ DATOS DISPONIBLES: Listo para sincronizar')
    console.log('💡 SIGUIENTE PASO:')
    console.log('   1. Ejecutar /api/leads/sync_whatsapp_leads')
    console.log('   2. Verificar que el servidor esté actualizado')
    console.log('   3. Refrescar el frontend')
  }
}

// Ejecutar diagnóstico
runDiagnostic()
  .then(() => {
    console.log('\n🎉 Diagnóstico completado')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Error en diagnóstico:', error)
    process.exit(1)
  })
