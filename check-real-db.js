#!/usr/bin/env node

// check-real-db.js
// Verificar datos reales en la BD sin el sistema simulado

import pkg from 'pg'
const { Pool } = pkg

const USER_ID = '8ab8810d-6344-4de7-9965-38233f32671a'

// Cargar variables de entorno
import dotenv from 'dotenv'
dotenv.config()

// Crear conexión directa sin el sistema simulado
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function checkRealConversations() {
  console.log('\n🔍 Verificando conversaciones REALES en BD...')
  
  try {
    const { rows } = await pool.query(`
      SELECT external_id, contact_name, contact_photo_url, started_at, tenant, ai_active
      FROM public.conversations_new
      WHERE user_id = $1
      ORDER BY started_at DESC
    `, [USER_ID])
    
    console.log(`📊 Total conversaciones REALES: ${rows.length}`)
    
    if (rows.length === 0) {
      console.log('❌ No hay conversaciones en la BD real')
      return []
    }
    
    console.log('\n📋 Conversaciones encontradas:')
    const whatsappChats = []
    
    rows.forEach((row, idx) => {
      const isWhatsApp = row.external_id && row.external_id.includes('@s.whatsapp.net')
      const isGroup = row.external_id && row.external_id.includes('@g.us')
      
      console.log(`   ${idx + 1}. ${row.contact_name || 'Sin nombre'}`)
      console.log(`      JID: ${row.external_id || 'Sin JID'}`)
      console.log(`      Tenant: ${row.tenant || 'Sin tenant'}`)
      console.log(`      Tipo: ${isWhatsApp ? '✅ WhatsApp Individual' : isGroup ? '👥 Grupo' : '❓ Otro'}`)
      console.log('')
      
      if (isWhatsApp && !isGroup) {
        whatsappChats.push(row)
      }
    })
    
    console.log(`✅ Contactos WhatsApp individuales REALES: ${whatsappChats.length}`)
    return whatsappChats
    
  } catch (error) {
    console.error('❌ Error consultando BD real:', error.message)
    return []
  }
}

async function checkRealLeads() {
  console.log('\n👥 Verificando leads REALES en BD...')
  
  try {
    const { rows } = await pool.query(`
      SELECT id, name, conversation_id, column_id, phone, message, created_at
      FROM public.leads_contacts
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [USER_ID])
    
    console.log(`📊 Total leads REALES: ${rows.length}`)
    
    if (rows.length === 0) {
      console.log('❌ No hay leads en la BD real')
      return []
    }
    
    console.log('\n📋 Leads encontrados:')
    rows.forEach((row, idx) => {
      const hasWhatsApp = row.conversation_id && row.conversation_id.includes('@s.whatsapp.net')
      
      console.log(`   ${idx + 1}. ${row.name || 'Sin nombre'}`)
      console.log(`      ID: ${row.id}`)
      console.log(`      Conversation ID: ${row.conversation_id || 'Sin vincular'}`)
      console.log(`      Column ID: ${row.column_id}`)
      console.log(`      Tipo: ${hasWhatsApp ? '✅ WhatsApp' : '📞 Otro'}`)
      console.log('')
    })
    
    return rows
    
  } catch (error) {
    console.error('❌ Error consultando leads reales:', error.message)
    return []
  }
}

async function checkRealColumns() {
  console.log('\n📊 Verificando columnas REALES en BD...')
  
  try {
    const { rows } = await pool.query(`
      SELECT id, title, color, created_at
      FROM public.leads
      WHERE user_id = $1
      ORDER BY id ASC
    `, [USER_ID])
    
    console.log(`📊 Total columnas REALES: ${rows.length}`)
    
    if (rows.length === 0) {
      console.log('❌ No hay columnas en la BD real')
      return []
    }
    
    console.log('\n📋 Columnas encontradas:')
    rows.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.title} (ID: ${row.id}, Color: ${row.color})`)
    })
    
    return rows
    
  } catch (error) {
    console.error('❌ Error consultando columnas reales:', error.message)
    return []
  }
}

async function runRealCheck() {
  console.log('🔍 VERIFICACIÓN DE BASE DE DATOS REAL')
  console.log('=' .repeat(50))
  
  // 1. Verificar conversaciones reales
  const conversations = await checkRealConversations()
  
  // 2. Verificar leads reales
  const leads = await checkRealLeads()
  
  // 3. Verificar columnas reales
  const columns = await checkRealColumns()
  
  console.log('\n' + '=' .repeat(50))
  console.log('📋 RESUMEN DE DATOS REALES:')
  console.log(`   📱 Conversaciones WhatsApp: ${conversations.length}`)
  console.log(`   👥 Leads existentes: ${leads.length}`)
  console.log(`   📊 Columnas disponibles: ${columns.length}`)
  
  if (conversations.length > 0 && columns.length > 0) {
    console.log('\n✅ DATOS DISPONIBLES PARA SINCRONIZAR')
    console.log('💡 PROBLEMA: El sistema simulado no está leyendo los datos reales')
    console.log('💡 SOLUCIÓN: Usar conexión directa a BD en lugar del sistema simulado')
  } else if (conversations.length === 0) {
    console.log('\n❌ NO HAY CONVERSACIONES WHATSAPP REALES')
    console.log('💡 Verificar que WhatsApp esté realmente conectado y guardando en BD')
  } else if (columns.length === 0) {
    console.log('\n❌ NO HAY COLUMNAS REALES')
    console.log('💡 Crear columnas primero')
  }
  
  await pool.end()
}

// Ejecutar verificación
runRealCheck().catch(console.error)
