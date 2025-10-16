#!/usr/bin/env node

/**
 * Script de prueba para verificar que todas las queries SQL funcionen correctamente
 * Este script prueba las queries principales del sistema de WhatsApp
 */

import pool from './dist/config/db.js';

console.log('🧪 Probando queries de la base de datos...\n');

// Función para probar una query
async function testQuery(name, query, params = []) {
  try {
    console.log(`🔍 Probando: ${name}`);
    console.log(`   Query: ${query.substring(0, 80)}...`);
    console.log(`   Params: [${params.join(', ')}]`);
    
    const result = await pool.query(query, params);
    
    console.log(`   ✅ Éxito: ${result.rows.length} filas`);
    if (result.rows.length > 0) {
      console.log(`   📊 Primera fila:`, result.rows[0]);
    }
    console.log('');
    
    return { success: true, rows: result.rows };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    console.log(`   🔍 Código: ${error.code}`);
    console.log(`   📍 Detalle: ${error.detail || 'N/A'}`);
    console.log('');
    
    return { success: false, error: error.message };
  }
}

// Función para probar queries de conversaciones
async function testConversationQueries() {
  console.log('📋 PROBANDO QUERIES DE CONVERSACIONES\n');
  
  const testUserId = 'test-user-id';
  const testExternalId = '1234567890@s.whatsapp.net';
  const testWaUserId = '1234567890';
  
  // Query 1: Seleccionar conversación existente
  await testQuery(
    'Seleccionar conversación existente',
    `SELECT id, wa_user_id, ai_active, personality_id, no_ac_ai
     FROM conversations_new
     WHERE external_id = $1 
       AND user_id = $2 
       AND wa_user_id = $3
     LIMIT 1`,
    [testExternalId, testUserId, testWaUserId]
  );
  
  // Query 2: Seleccionar conversación por external_id y user_id
  await testQuery(
    'Seleccionar conversación por external_id y user_id',
    `SELECT external_id, last_msg_time
     FROM conversations_new
     WHERE external_id = $1 
       AND user_id = $2
     LIMIT 1`,
    [testExternalId, testUserId]
  );
  
  // Query 3: Seleccionar conversación para envío de mensaje
  await testQuery(
    'Seleccionar conversación para envío de mensaje',
    `SELECT id
     FROM conversations_new
     WHERE external_id = $1
       AND user_id = $2
     LIMIT 1`,
    [testExternalId, testUserId]
  );
  
  // Query 4: Seleccionar conversación para obtener mensajes
  await testQuery(
    'Seleccionar conversación para obtener mensajes',
    `SELECT id FROM conversations_new
     WHERE external_id = $1
       AND user_id = $2
     LIMIT 1`,
    [testExternalId, testUserId]
  );
}

// Función para probar queries de mensajes
async function testMessageQueries() {
  console.log('💬 PROBANDO QUERIES DE MENSAJES\n');
  
  const testConvId = 'test-conv-id';
  const testUserId = 'test-user-id';
  const testLastMsgId = 'test-msg-id';
  
  // Query 1: Verificar mensaje existente
  await testQuery(
    'Verificar mensaje existente',
    `SELECT id FROM messages_new 
     WHERE conversation_id = $1 
       AND last_msg_id = $2
     LIMIT 1`,
    [testConvId, testLastMsgId]
  );
  
  // Query 2: Obtener mensajes de conversación
  await testQuery(
    'Obtener mensajes de conversación',
    `SELECT id,
            sender_type,
            message_type,
            text_content AS body,
            EXTRACT(EPOCH FROM whatsapp_created_at)::BIGINT AS timestamp
     FROM messages_new
     WHERE conversation_id = $1
       AND user_id = $2
     ORDER BY whatsapp_created_at ASC
     LIMIT 5`,
    [testConvId, testUserId]
  );
  
  // Query 3: Contar mensajes del usuario
  await testQuery(
    'Contar mensajes del usuario',
    `SELECT COUNT(*) AS user_message_count
     FROM messages_new
     WHERE conversation_id = $1
       AND user_id = $2
       AND sender_type = 'user'
       AND created_at > NOW() - INTERVAL '1 week'`,
    [testConvId, testUserId]
  );
  
  // Query 4: Contar mensajes de IA
  await testQuery(
    'Contar mensajes de IA',
    `SELECT COUNT(*) AS ai_message_count
     FROM messages_new
     WHERE conversation_id = $1
       AND user_id = $2
       AND sender_type = 'ia'
       AND created_at > NOW() - INTERVAL '1 week'`,
    [testConvId, testUserId]
  );
}

// Función para probar queries de contactos
async function testContactQueries() {
  console.log('👥 PROBANDO QUERIES DE CONTACTOS\n');
  
  const testUserId = 'test-user-id';
  
  // Query 1: Obtener contactos del usuario
  await testQuery(
    'Obtener contactos del usuario',
    `SELECT DISTINCT 
       c.external_id,
       c.contact_name,
       c.contact_photo_url,
       c.started_at,
       c.unread_count,
       c.last_message_at,
       COALESCE(
         (SELECT m.text_content 
          FROM messages_new m 
          WHERE m.conversation_id = c.id 
          ORDER BY m.created_at DESC 
          LIMIT 1), 
         'Sin mensajes'
       ) as last_message
     FROM conversations_new c
     WHERE c.user_id = $1 
       AND c.external_id NOT LIKE '%@g.us%'
     ORDER BY c.last_message_at DESC NULLS LAST, c.started_at DESC
     LIMIT 10`,
    [testUserId]
  );
}

// Función para probar queries de inserción (solo sintaxis)
async function testInsertQueries() {
  console.log('➕ PROBANDO QUERIES DE INSERCIÓN (solo sintaxis)\n');
  
  // Query 1: Insertar conversación
  await testQuery(
    'Insertar conversación (solo sintaxis)',
    `INSERT INTO conversations_new
     (external_id, contact_name, contact_photo_url, started_at, user_id, wa_user_id)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5)
     RETURNING id, ai_active, personality_id, no_ac_ai`,
    ['test-external-id', 'Test Contact', 'test-photo.jpg', 'test-user-id', 'test-wa-user-id']
  );
  
  // Query 2: Insertar mensaje
  await testQuery(
    'Insertar mensaje (solo sintaxis)',
    `INSERT INTO messages_new
     (conversation_id, sender_type, message_type, text_content, created_at, user_id, whatsapp_created_at, last_msg_id)
     VALUES ($1, $2, 'text', $3, CURRENT_TIMESTAMP, $4, $5, $6)
     RETURNING id`,
    ['test-conv-id', 'user', 'Test message', 'test-user-id', '2025-01-20T10:00:00Z', 'test-msg-id']
  );
}

// Función para probar queries de actualización (solo sintaxis)
async function testUpdateQueries() {
  console.log('🔄 PROBANDO QUERIES DE ACTUALIZACIÓN (solo sintaxis)\n');
  
  // Query 1: Actualizar conversación
  await testQuery(
    'Actualizar conversación (solo sintaxis)',
    `UPDATE conversations_new
     SET updated_at = NOW(),
         last_read_at = NOW()
     WHERE external_id = $1 
       AND user_id = $2`,
    ['test-external-id', 'test-user-id']
  );
  
  // Query 2: Actualizar mensaje
  await testQuery(
    'Actualizar mensaje (solo sintaxis)',
    `UPDATE messages_new
     SET text_content = $1,
         updated_at = NOW()
     WHERE id = $2 
       AND user_id = $3`,
    ['Updated message', 'test-msg-id', 'test-user-id']
  );
}

// Función principal
async function runAllTests() {
  try {
    console.log('🚀 Iniciando pruebas de queries...\n');
    
    // Probar queries de conversaciones
    await testConversationQueries();
    
    // Probar queries de mensajes
    await testMessageQueries();
    
    // Probar queries de contactos
    await testContactQueries();
    
    // Probar queries de inserción
    await testInsertQueries();
    
    // Probar queries de actualización
    await testUpdateQueries();
    
    console.log('✅ Todas las pruebas completadas');
    console.log('\n📊 Resumen:');
    console.log('   - Las queries que fallaron mostrarán errores arriba');
    console.log('   - Las queries exitosas mostrarán "✅ Éxito"');
    console.log('   - Revisa los errores para identificar problemas específicos');
    
  } catch (error) {
    console.error('❌ Error general en las pruebas:', error);
  } finally {
    // Cerrar conexión a la base de datos
    await pool.end();
    process.exit(0);
  }
}

// Ejecutar pruebas
runAllTests();
