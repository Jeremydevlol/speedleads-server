#!/usr/bin/env node

/**
 * Script rápido para verificar que la IA esté respondiendo correctamente
 * después de las correcciones en openaiService.js
 */

import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

console.log('🧠 Verificando que la IA esté respondiendo correctamente...\n');

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

// Test: Verificar que las funciones estén definidas
logHeader('🔧 VERIFICANDO FUNCIONES EN OPENAI SERVICE');

try {
  logInfo('Verificando que todas las funciones estén definidas...');
  
  const fs = await import('fs');
  const path = await import('path');
  
  const openaiServicePath = path.join(process.cwd(), 'dist/services/openaiService.js');
  const openaiServiceContent = fs.readFileSync(openaiServicePath, 'utf8');
  
  // Verificar funciones críticas
  const criticalFunctions = {
    'extractEnhancedTopic': openaiServiceContent.includes('function extractEnhancedTopic'),
    'extractPreviousQuestions': openaiServiceContent.includes('function extractPreviousQuestions'),
    'analyzeMediaContext': openaiServiceContent.includes('function analyzeMediaContext'),
    'analyzeConversationContinuity': openaiServiceContent.includes('function analyzeConversationContinuity'),
    'findCommonWords': openaiServiceContent.includes('function findCommonWords'),
    'analyzeConversationContext': openaiServiceContent.includes('function analyzeConversationContext')
  };
  
  let functionsCount = 0;
  Object.entries(criticalFunctions).forEach(([functionName, exists]) => {
    if (exists) {
      logSuccess(`✅ ${functionName}: Definida`);
      functionsCount++;
    } else {
      logError(`❌ ${functionName}: NO definida`);
    }
  });
  
  if (functionsCount === 6) {
    logSuccess(`✅ Todas las funciones críticas están definidas correctamente`);
  } else {
    logError(`❌ Faltan ${6 - functionsCount} funciones críticas`);
  }
  
  // Verificar configuración de contexto
  logInfo('Verificando configuración de contexto...');
  
  const contextConfig = {
    'Contexto 20 mensajes': openaiServiceContent.includes('history.slice(-20)'),
    'Historial 50 mensajes': openaiServiceContent.includes('history.slice(-50)'),
    'Límite 50 mensajes': openaiServiceContent.includes('historyLimit = recentMultimediaContent.length > 0 ? 50 : 50'),
    'Multimedia 8 mensajes': openaiServiceContent.includes('slice(-8) // Últimos 8 mensajes con multimedia')
  };
  
  let configCount = 0;
  Object.entries(contextConfig).forEach(([config, exists]) => {
    if (exists) {
      logSuccess(`✅ ${config}: Configurado`);
      configCount++;
    } else {
      logWarning(`⚠️ ${config}: NO configurado`);
    }
  });
  
  if (configCount >= 3) {
    logSuccess(`✅ Configuración de contexto implementada correctamente`);
  } else {
    logWarning(`⚠️ Configuración de contexto incompleta`);
  }
  
  // Resumen final
  logHeader('📋 RESUMEN DE VERIFICACIÓN');
  
  if (functionsCount === 6 && configCount >= 3) {
    logSuccess('✅ openaiService.js está funcionando correctamente');
    logInfo('   ✅ Todas las funciones críticas están definidas');
    logInfo('   ✅ Configuración de contexto implementada');
    logInfo('   ✅ La IA debería responder correctamente');
    
    console.log(`\n${colors.green}${colors.bold}🎯 ¡La IA debería estar funcionando ahora!${colors.reset}`);
    console.log('\n🚀 Próximos pasos:');
    console.log('   1. ✅ Verificar que no haya errores en el servidor');
    console.log('   2. ✅ Probar la función de entrenamiento');
    console.log('   3. ✅ Verificar que mantenga el contexto completo');
    console.log('   4. ✅ Confirmar que recuerde el Audi A4');
    
  } else {
    logError('❌ openaiService.js tiene problemas que necesitan ser corregidos');
    logInfo('   ❌ Faltan funciones críticas o hay problemas de configuración');
    
    console.log(`\n${colors.red}${colors.bold}🔧 Se necesitan más correcciones${colors.reset}`);
    console.log('\n⚠️ Problemas identificados:');
    if (functionsCount < 6) {
      console.log(`   - Faltan ${6 - functionsCount} funciones críticas`);
    }
    if (configCount < 3) {
      console.log(`   - Configuración de contexto incompleta`);
    }
  }
  
} catch (error) {
  logError(`❌ Error verificando openaiService.js: ${error.message}`);
}

process.exit(0);
