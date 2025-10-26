#!/usr/bin/env node

/**
 * Script mejorado para probar la conexión a la base de datos
 * Verifica tanto la conexión directa como la configuración
 */

import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

// Cargar variables de entorno
dotenv.config();

console.log('🔍 Probando conexión a la base de datos...\n');

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

// Verificar variables de entorno
logHeader('🔐 VERIFICACIÓN DE VARIABLES DE ENTORNO');

const requiredVars = [
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

let varsOk = 0;
for (const varName of requiredVars) {
  if (process.env[varName]) {
    logSuccess(`${varName} - Configurada`);
    varsOk++;
    
    // Mostrar URL sin contraseña
    if (varName.includes('DATABASE_URL') || varName.includes('SUPABASE_DB_URL')) {
      const url = process.env[varName];
      const safeUrl = url.replace(/:[^:@]*@/, ':****@');
      logInfo(`   URL: ${safeUrl}`);
    }
  } else {
    logWarning(`${varName} - No configurada`);
  }
}

console.log(`\n📊 Variables de entorno: ${varsOk}/${requiredVars.length}`);

// Probar conexión directa
logHeader('🔗 PRUEBA DE CONEXIÓN DIRECTA');

async function testDirectConnection() {
  try {
    const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    
    if (!connectionString) {
      logError('No hay URL de base de datos configurada');
      return false;
    }
    
    logInfo('Creando pool de conexión...');
    
    const pool = new Pool({
      connectionString: connectionString,
      ssl: { rejectUnauthorized: false },
      options: '-c search_path=public',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    
    logInfo('Probando conexión...');
    
    // Probar con timeout
    const testPromise = pool.query('SELECT 1 as test, version() as version, current_database() as db, current_user as user');
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout de conexión (10s)')), 10000)
    );
    
    const result = await Promise.race([testPromise, timeoutPromise]);
    
    logSuccess('Conexión exitosa!');
    logInfo(`   Test: ${result.rows[0].test}`);
    logInfo(`   Base de datos: ${result.rows[0].db}`);
    logInfo(`   Usuario: ${result.rows[0].user}`);
    logInfo(`   Versión: ${result.rows[0].version.split(' ')[0]}`);
    
    // Probar consulta más compleja
    logInfo('Probando consulta de tabla conversations_new...');
    const tableResult = await pool.query(`
      SELECT COUNT(*) as total_conversations 
      FROM information_schema.tables 
      WHERE table_name = 'conversations_new'
    `);
    
    if (tableResult.rows[0].total_conversations > 0) {
      logSuccess('Tabla conversations_new encontrada');
      
      // Contar conversaciones
      const convCount = await pool.query('SELECT COUNT(*) as count FROM conversations_new');
      logInfo(`   Total de conversaciones: ${convCount.rows[0].count}`);
      
      // Contar mensajes
      const msgCount = await pool.query('SELECT COUNT(*) as count FROM messages_new');
      logInfo(`   Total de mensajes: ${msgCount.rows[0].count}`);
      
    } else {
      logWarning('Tabla conversations_new no encontrada');
    }
    
    await pool.end();
    return true;
    
  } catch (error) {
    logError(`Error de conexión: ${error.message}`);
    
    if (error.message.includes('timeout')) {
      logWarning('💡 Sugerencia: Verificar conectividad de red');
    } else if (error.message.includes('authentication')) {
      logWarning('💡 Sugerencia: Verificar credenciales en .env');
    } else if (error.message.includes('connection')) {
      logWarning('💡 Sugerencia: Verificar que la BD esté accesible');
    } else if (error.message.includes('SSL')) {
      logWarning('💡 Sugerencia: Verificar configuración SSL');
    }
    
    return false;
  }
}

// Probar configuración del pool inteligente
logHeader('🧠 PRUEBA DEL POOL INTELIGENTE');

async function testSmartPool() {
  try {
    logInfo('Importando configuración de BD...');
    const { default: pool } = await import('./dist/config/db.js');
    
    logInfo('Probando consulta simple...');
    const result = await pool.query('SELECT 1 as test');
    
    if (result.rows && result.rows.length > 0) {
      logSuccess('Pool inteligente funcionando');
      logInfo(`   Resultado: ${result.rows[0].test}`);
    } else {
      logWarning('Pool inteligente devolvió resultado vacío');
    }
    
    return true;
    
  } catch (error) {
    logError(`Error con pool inteligente: ${error.message}`);
    return false;
  }
}

// Función principal
async function runTests() {
  try {
    // Probar conexión directa
    const directSuccess = await testDirectConnection();
    
    // Probar pool inteligente
    const smartSuccess = await testSmartPool();
    
    // Resumen
    logHeader('📋 RESUMEN DE PRUEBAS');
    
    if (directSuccess) {
      logSuccess('Conexión directa: FUNCIONA');
    } else {
      logError('Conexión directa: FALLA');
    }
    
    if (smartSuccess) {
      logSuccess('Pool inteligente: FUNCIONA');
    } else {
      logError('Pool inteligente: FALLA');
    }
    
    if (directSuccess && smartSuccess) {
      console.log(`\n${colors.green}${colors.bold}🎉 ¡Base de datos completamente funcional!${colors.reset}`);
      console.log('\n📱 Ahora puedes:');
      console.log('   1. Ejecutar el servidor de WhatsApp');
      console.log('   2. Los contactos se guardarán en la BD real');
      console.log('   3. Las consultas funcionarán correctamente');
    } else if (directSuccess) {
      console.log(`\n${colors.yellow}${colors.bold}⚠️  Conexión directa funciona pero pool inteligente falla${colors.reset}`);
      console.log('\n🔧 Necesitas:');
      console.log('   1. Revisar la configuración del pool inteligente');
      console.log('   2. Verificar que no haya errores de importación');
    } else {
      console.log(`\n${colors.red}${colors.bold}❌ Problemas de conexión a la base de datos${colors.reset}`);
      console.log('\n🔧 Necesitas:');
      console.log('   1. Verificar credenciales en .env');
      console.log('   2. Verificar conectividad de red');
      console.log('   3. Verificar que Supabase esté accesible');
    }
    
  } catch (error) {
    logError(`Error general en las pruebas: ${error.message}`);
  } finally {
    process.exit(0);
  }
}

// Ejecutar pruebas
runTests();
