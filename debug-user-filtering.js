#!/usr/bin/env node

/**
 * Script para diagnosticar el problema de filtrado por usuario
 * Verifica que solo se muestren contactos de UNA cuenta específica
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

console.log('🔍 Diagnosticando filtrado por usuario...\n');

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

// Test 1: Verificar TODAS las conversaciones en la base
logHeader('🔍 PRUEBA 1: VERIFICAR TODAS LAS CONVERSACIONES EN LA BASE');

try {
  logInfo(`Obteniendo TODAS las conversaciones de la base de datos`);
  
  const { data, error } = await supabase
    .from('conversations_new')
    .select(`
      id,
      external_id,
      contact_name,
      user_id,
      started_at,
      updated_at
    `)
    .order('updated_at', { ascending: false });
  
  if (error) {
    logError(`Error en consulta: ${error.message}`);
  } else {
    logWarning(`⚠️ TOTAL de conversaciones en la base: ${data.length}`);
    
    // Agrupar por user_id para ver cuántas hay por usuario
    const userCounts = {};
    data.forEach(conv => {
      const userId = conv.user_id;
      userCounts[userId] = (userCounts[userId] || 0) + 1;
    });
    
    logInfo(`📊 Distribución por usuario:`);
    Object.entries(userCounts).forEach(([userId, count]) => {
      console.log(`   Usuario ${userId}: ${count} conversaciones`);
    });
    
    // Mostrar algunos ejemplos
    if (data.length > 0) {
      logInfo(`📱 Ejemplos de conversaciones:`);
      data.slice(0, 5).forEach((conv, index) => {
        console.log(`   ${index + 1}. ${conv.contact_name} (${conv.external_id || 'Sin ID'})`);
        console.log(`      User ID: ${conv.user_id}`);
        console.log(`      Actualizado: ${conv.updated_at || conv.started_at}`);
      });
    }
  }
} catch (error) {
  logError(`Error general: ${error.message}`);
}

// Test 2: Verificar conversaciones de TU usuario específico
logHeader('🔍 PRUEBA 2: VERIFICAR CONVERSACIONES DE TU USUARIO');

try {
  const tuUserId = '8ab8810d-6344-4de7-9965-38233f32671a';
  
  logInfo(`Obteniendo conversaciones SOLO de tu usuario: ${tuUserId}`);
  
  const { data, error } = await supabase
    .from('conversations_new')
    .select(`
      id,
      external_id,
      contact_name,
      user_id,
      started_at,
      updated_at
    `)
    .eq('user_id', tuUserId)
    .order('updated_at', { ascending: false });
  
  if (error) {
    logError(`Error en consulta: ${error.message}`);
  } else {
    logSuccess(`✅ Conversaciones de TU usuario: ${data.length}`);
    
    if (data.length > 0) {
      logInfo(`📱 Tus conversaciones:`);
      data.slice(0, 5).forEach((conv, index) => {
        console.log(`   ${index + 1}. ${conv.contact_name} (${conv.external_id || 'Sin ID'})`);
        console.log(`      User ID: ${conv.user_id}`);
        console.log(`      Actualizado: ${conv.updated_at || conv.started_at}`);
      });
    }
  }
} catch (error) {
  logError(`Error general: ${error.message}`);
}

// Test 3: Verificar si hay conversaciones con user_id NULL o vacío
logHeader('🔍 PRUEBA 3: VERIFICAR CONVERSACIONES SIN USER_ID');

try {
  logInfo(`Verificando conversaciones con user_id NULL o vacío`);
  
  const { data, error } = await supabase
    .from('conversations_new')
    .select(`
      id,
      external_id,
      contact_name,
      user_id,
      started_at,
      updated_at
    `)
    .or('user_id.is.null,user_id.eq.')
    .order('updated_at', { ascending: false });
  
  if (error) {
    logError(`Error en consulta: ${error.message}`);
  } else {
    if (data.length > 0) {
      logWarning(`⚠️ Encontradas ${data.length} conversaciones SIN user_id válido`);
      data.slice(0, 3).forEach((conv, index) => {
        console.log(`   ${index + 1}. ${conv.contact_name} (${conv.external_id || 'Sin ID'})`);
        console.log(`      User ID: ${conv.user_id || 'NULL'}`);
        console.log(`      Actualizado: ${conv.updated_at || conv.started_at}`);
      });
    } else {
      logSuccess(`✅ No hay conversaciones sin user_id válido`);
    }
  }
} catch (error) {
  logError(`Error general: ${error.message}`);
}

// Test 4: Simular exactamente la consulta del sistema
logHeader('🔍 PRUEBA 4: SIMULAR CONSULTA DEL SISTEMA');

try {
  const tuUserId = '8ab8810d-6344-4de7-9965-38233f32671a';
  
  logInfo(`Simulando la consulta exacta que hace el sistema`);
  logInfo(`   User ID: ${tuUserId}`);
  
  // Simular exactamente la consulta del pool
  const { data, error } = await supabase
    .from('conversations_new')
    .select(`
      external_id,
      contact_name,
      contact_photo_url,
      started_at,
      updated_at,
      last_read_at,
      wa_user_id,
      ai_active,
      last_msg_id,
      last_msg_time
    `)
    .eq('user_id', tuUserId)
    .order('updated_at', { ascending: false });
  
  if (error) {
    logError(`Error en consulta: ${error.message}`);
  } else {
    logSuccess(`✅ Consulta del sistema exitosa: ${data.length} conversaciones`);
    
    if (data.length > 0) {
      logInfo(`📱 Resultado del sistema:`);
      data.slice(0, 3).forEach((conv, index) => {
        console.log(`   ${index + 1}. ${conv.contact_name} (${conv.external_id || 'Sin ID'})`);
        console.log(`      Último mensaje: ${conv.last_msg_id || 'Sin mensajes'}`);
        console.log(`      Actualizado: ${conv.updated_at || conv.started_at}`);
      });
    }
  }
} catch (error) {
  logError(`Error general: ${error.message}`);
}

// Resumen final
logHeader('📋 DIAGNÓSTICO FINAL');

logInfo('🔍 Problema identificado:');
logInfo('   El sistema está mostrando conversaciones de TODOS los usuarios');
logInfo('   en lugar de filtrar solo por tu user_id específico');

logInfo('💡 Solución:');
logInfo('   1. Verificar que el filtro .eq("user_id", userId) esté funcionando');
logInfo('   2. Asegurar que el userId se pase correctamente en los parámetros');
logInfo('   3. Verificar que no haya conversaciones con user_id NULL');

console.log(`\n${colors.yellow}💡 Para ver los cambios:${colors.reset}`);
console.log('   1. Reinicia el servidor de WhatsApp');
console.log('   2. Verifica que solo se muestren tus contactos');
console.log('   3. Si sigue mostrando todos, revisa los logs del filtro');

process.exit(0);
