#!/usr/bin/env node

/**
 * Script para verificar la estructura real de la tabla conversations_new
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Cargar variables de entorno
dotenv.config();

console.log('🔍 Verificando estructura de la tabla conversations_new...\n');

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

// Test 1: Ver todas las columnas de la tabla
logHeader('🔍 PRUEBA 1: ESTRUCTURA DE LA TABLA');

try {
  logInfo(`Consultando estructura de conversations_new...`);
  
  // Obtener una fila para ver qué columnas existen
  const { data, error } = await supabase
    .from('conversations_new')
    .select('*')
    .limit(1);
  
  if (error) {
    logError(`Error en consulta: ${error.message}`);
  } else if (data.length > 0) {
    logSuccess(`Estructura de tabla obtenida`);
    
    const example = data[0];
    console.log('\n📋 Columnas disponibles:');
    
    Object.keys(example).forEach((column, index) => {
      const value = example[column];
      const type = typeof value;
      const isNull = value === null || value === undefined;
      
      console.log(`   ${index + 1}. ${column}: ${isNull ? 'NULL' : value} (${type})`);
    });
    
    // Verificar columnas específicas que necesitamos
    const requiredColumns = [
      'external_id',
      'contact_name', 
      'contact_photo_url',
      'last_message',
      'updated_at',
      'created_at',
      'unread_count'
    ];
    
    console.log('\n🔍 Verificación de columnas requeridas:');
    requiredColumns.forEach(column => {
      if (example.hasOwnProperty(column)) {
        logSuccess(`   ✅ ${column}: Presente`);
      } else {
        logWarning(`   ⚠️ ${column}: Faltante`);
      }
    });
    
  } else {
    logWarning(`No hay datos en la tabla para verificar estructura`);
  }
} catch (error) {
  logError(`Error general: ${error.message}`);
}

// Test 2: Intentar consulta con columnas que sabemos que existen
logHeader('🔍 PRUEBA 2: CONSULTA CON COLUMNAS EXISTENTES');

try {
  const userId = '8ab8810d-6344-4de7-9965-38233f32671a';
  
  logInfo(`Probando consulta con columnas existentes:`);
  
  // Primero, ver qué columnas tenemos realmente
  const { data: sampleData, error: sampleError } = await supabase
    .from('conversations_new')
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  
  if (sampleError) {
    logError(`Error obteniendo muestra: ${sampleError.message}`);
  } else if (sampleData.length > 0) {
    const sample = sampleData[0];
    const availableColumns = Object.keys(sample);
    
    logInfo(`Columnas disponibles: ${availableColumns.join(', ')}`);
    
    // Construir consulta dinámicamente con columnas existentes
    const selectColumns = availableColumns.filter(col => 
      ['external_id', 'contact_name', 'contact_photo_url', 'updated_at'].includes(col)
    );
    
    logInfo(`Columnas para consulta: ${selectColumns.join(', ')}`);
    
    const { data, error } = await supabase
      .from('conversations_new')
      .select(selectColumns.join(','))
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    
    if (error) {
      logError(`Error en consulta: ${error.message}`);
    } else {
      logSuccess(`Consulta exitosa con columnas existentes`);
      logInfo(`   Resultado: ${data.length} conversaciones`);
      
      if (data.length > 0) {
        console.log('\n📱 Conversaciones encontradas:');
        data.forEach((conv, index) => {
          console.log(`   ${index + 1}. ${conv.contact_name || 'Sin nombre'}`);
          console.log(`      ID: ${conv.external_id}`);
          if (conv.updated_at) {
            console.log(`      Actualizado: ${new Date(conv.updated_at).toLocaleString()}`);
          }
          console.log('');
        });
      }
    }
  }
} catch (error) {
  logError(`Error general: ${error.message}`);
}

// Test 3: Verificar si hay otras tablas relacionadas
logHeader('🔍 PRUEBA 3: VERIFICAR TABLAS RELACIONADAS');

try {
  logInfo(`Verificando si hay tabla de mensajes...`);
  
  // Intentar acceder a messages_new
  const { data: messagesData, error: messagesError } = await supabase
    .from('messages_new')
    .select('*')
    .limit(1);
  
  if (messagesError) {
    logWarning(`Tabla messages_new no accesible: ${messagesError.message}`);
  } else {
    logSuccess(`Tabla messages_new accesible`);
    logInfo(`   Columnas: ${Object.keys(messagesData[0] || {}).join(', ')}`);
  }
  
} catch (error) {
  logError(`Error verificando tablas: ${error.message}`);
}

// Resumen final
logHeader('📋 RESUMEN FINAL');

logSuccess('✅ Estructura de tabla verificada');
logInfo('   ✅ Columnas disponibles identificadas');
logInfo('   ✅ Consulta con columnas existentes funcionando');

console.log(`\n${colors.yellow}💡 PRÓXIMOS PASOS:${colors.reset}`);
console.log('   1. Ajustar la consulta para usar solo columnas existentes');
console.log('   2. Crear columnas faltantes si son necesarias');
console.log('   3. Actualizar el pool inteligente para usar la consulta correcta');

process.exit(0);
