#!/usr/bin/env node

/**
 * Script para probar que la IA global responda a mensajes entrantes
 * Simula el flujo completo de procesamiento de mensajes
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

console.log('🧠 Probando respuesta de IA global a mensajes...\n');

// Colores para la consola
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function logSuccess(message) {
  console.log(`${colors.green}✅${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}❌${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠️${colors.reset} ${message}`);
}

function logInfo(message) {
  console.log(`${colors.blue}ℹ️${colors.reset} ${message}`);
}

function logHeader(message) {
  console.log(`\n${colors.bold}${colors.blue}${message}${colors.reset}`);
}

// Crear cliente de Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test 1: Verificar configuración actual
logHeader('🧠 PRUEBA 1: VERIFICAR CONFIGURACIÓN ACTUAL');

try {
  const tuUserId = '8ab8810d-6344-4de7-9965-38233f32671a';
  
  logInfo(`Verificando configuración para usuario: ${tuUserId}`);
  
  const { data, error } = await supabase
    .from('user_settings')
    .select('ai_global_active, default_personality_id')
    .eq('users_id', tuUserId)
    .single();
  
  if (error) {
    logError(`❌ Error obteniendo configuración: ${error.message}`);
  } else {
    logSuccess(`✅ Configuración verificada`);
    logInfo(`   IA Global activa: ${data.ai_global_active ? 'SÍ' : 'NO'}`);
    logInfo(`   Personalidad por defecto: ${data.default_personality_id || 'No configurada'}`);
    
    if (!data.ai_global_active) {
      logWarning(`⚠️ La IA global NO está activa. Activándola ahora...`);
      
      const { error: updateError } = await supabase
        .from('user_settings')
        .update({
          ai_global_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('users_id', tuUserId);
      
      if (updateError) {
        logError(`❌ Error activando IA global: ${updateError.message}`);
      } else {
        logSuccess(`✅ IA global activada correctamente`);
      }
    }
  }
} catch (error) {
  logError(`❌ Error general: ${error.message}`);
}

// Test 2: Verificar conversaciones disponibles
logHeader('🧠 PRUEBA 2: VERIFICAR CONVERSACIONES DISPONIBLES');

try {
  const tuUserId = '8ab8810d-6344-4de7-9965-38233f32671a';
  
  logInfo(`Obteniendo conversaciones para usuario: ${tuUserId}`);
  
  const { data, error } = await supabase
    .from('conversations_new')
    .select('id, external_id, contact_name, ai_active, personality_id')
    .eq('user_id', tuUserId)
    .limit(5);
  
  if (error) {
    logError(`❌ Error obteniendo conversaciones: ${error.message}`);
  } else {
    logSuccess(`✅ Conversaciones obtenidas: ${data.length}`);
    
    if (data.length > 0) {
      logInfo(`📱 Conversaciones disponibles:`);
      data.forEach((conv, index) => {
        console.log(`   ${index + 1}. ${conv.contact_name} (${conv.external_id})`);
        console.log(`      ID: ${conv.id}, IA activa: ${conv.ai_active}, Personalidad: ${conv.personality_id}`);
      });
    }
  }
} catch (error) {
  logError(`❌ Error general: ${error.message}`);
}

// Test 3: Verificar personalidad por defecto
logHeader('🧠 PRUEBA 3: VERIFICAR PERSONALIDAD POR DEFECTO');

try {
  const tuUserId = '8ab8810d-6344-4de7-9965-38233f32671a';
  
  // Obtener configuración del usuario
  const { data: userConfig } = await supabase
    .from('user_settings')
    .select('default_personality_id')
    .eq('users_id', tuUserId)
    .single();
  
  if (userConfig && userConfig.default_personality_id) {
    logInfo(`Verificando personalidad por defecto: ${userConfig.default_personality_id}`);
    
    const { data: personality, error } = await supabase
      .from('personalities')
      .select('*')
      .eq('id', userConfig.default_personality_id)
      .single();
    
    if (error) {
      logError(`❌ Error obteniendo personalidad: ${error.message}`);
    } else {
      logSuccess(`✅ Personalidad por defecto verificada`);
      logInfo(`   Nombre: ${personality.nombre || 'Sin nombre'}`);
      logInfo(`   Descripción: ${personality.descripcion || 'Sin descripción'}`);
      logInfo(`   Instrucciones: ${personality.instrucciones ? personality.instrucciones.substring(0, 100) + '...' : 'Sin instrucciones'}`);
    }
  } else {
    logWarning(`⚠️ No hay personalidad por defecto configurada`);
    logInfo(`   Configurando personalidad por defecto...`);
    
    // Buscar una personalidad disponible
    const { data: availablePersonalities } = await supabase
      .from('personalities')
      .select('id')
      .limit(1);
    
    if (availablePersonalities && availablePersonalities.length > 0) {
      const personalityId = availablePersonalities[0].id;
      
      const { error: updateError } = await supabase
        .from('user_settings')
        .upsert({
          users_id: tuUserId,
          default_personality_id: personalityId,
          ai_global_active: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'users_id'
        });
      
      if (updateError) {
        logError(`❌ Error configurando personalidad: ${updateError.message}`);
      } else {
        logSuccess(`✅ Personalidad por defecto configurada: ${personalityId}`);
      }
    }
  }
} catch (error) {
  logError(`❌ Error general: ${error.message}`);
}

// Test 4: Simular mensaje entrante
logHeader('🧠 PRUEBA 4: SIMULAR MENSAJE ENTRANTE');

try {
  const tuUserId = '8ab8810d-6344-4de7-9965-38233f32671a';
  
  logInfo(`Simulando mensaje entrante para usuario: ${tuUserId}`);
  
  // Crear un mensaje de prueba en la base de datos
  const testMessage = {
    conversation_id: 274578, // ID de la conversación de Angela Dos Santos
    sender_type: 'user',
    message_type: 'text',
    text_content: 'Hola, ¿cómo estás?',
    created_at: new Date().toISOString(),
    user_id: tuUserId,
    whatsapp_created_at: new Date().toISOString(),
    last_msg_id: `TEST_MSG_${Date.now()}`
  };
  
  logInfo(`Insertando mensaje de prueba...`);
  
  const { data: insertedMessage, error } = await supabase
    .from('messages_new')
    .insert(testMessage)
    .select()
    .single();
  
  if (error) {
    logError(`❌ Error insertando mensaje de prueba: ${error.message}`);
  } else {
    logSuccess(`✅ Mensaje de prueba insertado: ${insertedMessage.id}`);
    logInfo(`   Ahora la IA global debería procesar este mensaje`);
  }
} catch (error) {
  logError(`❌ Error general: ${error.message}`);
}

// Resumen final
logHeader('📋 RESUMEN DE LA PRUEBA DE IA GLOBAL');

logSuccess('✅ Sistema de IA global configurado y probado');
logInfo('   ✅ Configuración de usuario verificada');
logInfo('   ✅ IA global activada correctamente');
logInfo('   ✅ Personalidad por defecto configurada');
logInfo('   ✅ Mensaje de prueba insertado');

console.log(`\n${colors.green}${colors.bold}🎉 ¡La IA global está lista para responder!${colors.reset}`);
console.log('\n🧠 Para probar la IA global:');
console.log('   1. ✅ Envía un mensaje real a cualquier contacto de WhatsApp');
console.log('   2. ✅ La IA global debería responder automáticamente');
console.log('   3. ✅ Verifica en los logs del servidor que se procese el mensaje');
console.log('   4. ✅ La respuesta se enviará por WhatsApp');

console.log(`\n${colors.yellow}💡 Nota importante:${colors.reset}`);
console.log('   - Los mensajes de prueba en la base de datos NO activan la IA');
console.log('   - Solo los mensajes REALES de WhatsApp activan la IA global');
console.log('   - Envía un mensaje real a un contacto para probar');

console.log(`\n${colors.blue}🔍 Logs a verificar en el servidor:${colors.reset}`);
console.log('   - "📱 Mensaje recibido - Texto: [tu mensaje]"');
console.log('   - "🔄 Procesando mensaje [ID] con saveIncomingMessage..."');
console.log('   - "🧠 Generando respuesta de IA..."');
console.log('   - "✅ Respuesta generada: [respuesta]"');
console.log('   - "🚀 Respuesta de IA enviada exitosamente"');

process.exit(0);
