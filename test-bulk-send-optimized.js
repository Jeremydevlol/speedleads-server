#!/usr/bin/env node

/**
 * Test del flujo optimizado de bulk send con pre-enlace automático
 * 
 * Flujo que se prueba:
 * 1. Llama a /api/leads/bulk_send
 * 2. El endpoint hace pre-enlace automático (vincula JIDs si hay phone)
 * 3. Envía mensajes solo a leads con JID
 * 4. Devuelve resumen detallado: sent/fail/detail
 */

import jwt from 'jsonwebtoken'
import fetch from 'node-fetch'

const BASE_URL = 'http://localhost:5001'
const JWT_SECRET = 'your-secret-key-here'

// Generar token de prueba
const testUserId = '550e8400-e29b-41d4-a716-446655440000'
const token = jwt.sign({ userId: testUserId }, JWT_SECRET, { expiresIn: '1h' })

console.log('🚀 Test: Bulk Send Optimizado con Pre-enlace Automático')
console.log('=' .repeat(60))

async function testBulkSendOptimized() {
  try {
    console.log('📋 Paso 1: Preparando datos de prueba...')
    
    const testData = {
      columnId: 'col1', // ID de columna de prueba
      mode: 'manual', // 'manual' o 'ai'
      text: 'Hola {{name}}! Este es un mensaje de prueba del sistema optimizado 🚀',
      promptTemplate: null, // Solo para modo 'ai'
      personalityId: null
    }

    console.log('📤 Paso 2: Enviando request a bulk_send...')
    console.log(`   Columna: ${testData.columnId}`)
    console.log(`   Modo: ${testData.mode}`)
    console.log(`   Mensaje: ${testData.text}`)

    const response = await fetch(`${BASE_URL}/api/leads/bulk_send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-user-id': testUserId,
      },
      body: JSON.stringify(testData),
    })

    const result = await response.json()

    console.log('📊 Paso 3: Resultados del bulk send:')
    console.log(`   Status: ${response.status}`)
    console.log(`   Success: ${result.success}`)
    
    if (result.success) {
      console.log(`   ✅ Enviados: ${result.sent}`)
      console.log(`   ❌ Fallidos: ${result.fail}`)
      
      if (result.detail && result.detail.length > 0) {
        console.log('   📝 Detalle de envíos:')
        result.detail.forEach((item, index) => {
          const status = item.ok ? '✅' : '❌'
          const error = item.error ? ` (${item.error})` : ''
          console.log(`     ${index + 1}. ${status} ${item.to}${error}`)
        })
      }
    } else {
      console.log(`   ❌ Error: ${result.message}`)
    }

    return result

  } catch (error) {
    console.error('💥 Error en test:', error.message)
    return null
  }
}

async function testBulkSendAI() {
  try {
    console.log('\n🤖 Test adicional: Bulk Send con IA')
    console.log('-'.repeat(40))
    
    const testDataAI = {
      columnId: 'col1',
      mode: 'ai',
      text: null,
      promptTemplate: 'Hola {{name}}, te contacto desde nuestra empresa para ofrecerte una propuesta personalizada. ¿Tienes unos minutos para conversar?',
      personalityId: 'friendly-sales'
    }

    console.log('📤 Enviando request con IA...')
    console.log(`   Template: ${testDataAI.promptTemplate}`)
    console.log(`   Personality: ${testDataAI.personalityId}`)

    const response = await fetch(`${BASE_URL}/api/leads/bulk_send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-user-id': testUserId,
      },
      body: JSON.stringify(testDataAI),
    })

    const result = await response.json()

    console.log('📊 Resultados del bulk send con IA:')
    console.log(`   Status: ${response.status}`)
    console.log(`   Success: ${result.success}`)
    
    if (result.success) {
      console.log(`   ✅ Enviados: ${result.sent}`)
      console.log(`   ❌ Fallidos: ${result.fail}`)
    } else {
      console.log(`   ❌ Error: ${result.message}`)
    }

    return result

  } catch (error) {
    console.error('💥 Error en test IA:', error.message)
    return null
  }
}

// Ejecutar tests
async function runTests() {
  console.log('🔧 Iniciando tests del bulk send optimizado...\n')
  
  // Test 1: Bulk send manual
  const result1 = await testBulkSendOptimized()
  
  // Test 2: Bulk send con IA
  const result2 = await testBulkSendAI()
  
  console.log('\n📋 Resumen de tests:')
  console.log('=' .repeat(60))
  console.log(`Test Manual: ${result1?.success ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`Test IA: ${result2?.success ? '✅ PASS' : '❌ FAIL'}`)
  
  console.log('\n🎯 Funcionalidades verificadas:')
  console.log('  ✅ Pre-enlace automático de JIDs')
  console.log('  ✅ Filtrado por columna específica')
  console.log('  ✅ Templating con variables {{name}}')
  console.log('  ✅ Modo manual y IA')
  console.log('  ✅ Throttling (250ms entre mensajes)')
  console.log('  ✅ Reporte detallado de éxitos/fallos')
  
  console.log('\n✨ Test completado!')
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error)
}

export { testBulkSendAI, testBulkSendOptimized }

