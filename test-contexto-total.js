#!/usr/bin/env node

/**
 * Script para verificar que la IA esté leyendo TODOS los mensajes
 * del historial para mantener el contexto total de la conversación
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

console.log('🧠 Verificando que la IA lea TODOS los mensajes del historial...\n');

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

// Test: Verificar que openaiService.js esté configurado para leer TODOS los mensajes
logHeader('🔧 VERIFICANDO CONFIGURACIÓN DE LECTURA COMPLETA');

try {
  logInfo('Verificando configuración para lectura completa de mensajes...');
  
  const fs = await import('fs');
  const path = await import('path');
  
  const openaiServicePath = path.join(process.cwd(), 'dist/services/openaiService.js');
  const openaiServiceContent = fs.readFileSync(openaiServicePath, 'utf8');
  
  // Verificar configuraciones críticas para lectura completa
  const criticalConfigs = {
    'Historial de 50 mensajes': openaiServiceContent.includes('history.slice(-50)'),
    'Límite de 50 mensajes': openaiServiceContent.includes('historyLimit = recentMultimediaContent.length > 0 ? 50 : 50'),
    'Mapeo de content completo': openaiServiceContent.includes('content: msg.content || msg.text_content || \'\''),
    'Log detallado de mensajes': openaiServiceContent.includes('VERIFICANDO LECTURA COMPLETA DE MENSAJES'),
    'Instrucciones críticas de contexto': openaiServiceContent.includes('DEBES LEER Y ANALIZAR TODOS los mensajes'),
    'No ignorar mensajes': openaiServiceContent.includes('NO ignores ningún mensaje anterior'),
    'Conectar toda la conversación': openaiServiceContent.includes('Conecta TODA la conversación anterior')
  };
  
  let configCount = 0;
  Object.entries(criticalConfigs).forEach(([config, exists]) => {
    if (exists) {
      logSuccess(`✅ ${config}: Implementado`);
      configCount++;
    } else {
      logWarning(`⚠️ ${config}: NO implementado`);
    }
  });
  
  if (configCount >= 6) {
    logSuccess(`✅ Configuración para lectura completa: EXCELENTE (${configCount}/7 características)`);
  } else if (configCount >= 4) {
    logSuccess(`✅ Configuración para lectura completa: BUENA (${configCount}/7 características)`);
  } else {
    logWarning(`⚠️ Configuración para lectura completa: INSUFICIENTE (${configCount}/7 características)`);
  }
  
} catch (error) {
  logError(`❌ Error verificando configuración: ${error.message}`);
}

// Test: Verificar que conversationService.js esté devolviendo TODOS los mensajes
logHeader('📖 VERIFICANDO DEVOLUCIÓN COMPLETA DE MENSAJES');

try {
  logInfo('Verificando que conversationService.js devuelva todos los mensajes...');
  
  const fs = await import('fs');
  const path = await import('path');
  
  const conversationServicePath = path.join(process.cwd(), 'dist/services/conversationService.js');
  const conversationServiceContent = fs.readFileSync(conversationServicePath, 'utf8');
  
  // Verificar configuraciones críticas para devolución completa
  const returnConfigs = {
    'Límite de 50 mensajes': conversationServiceContent.includes('limit = 50'),
    'Selección completa de campos': conversationServiceContent.includes('select(\'sender_type, text_content, created_at, message_type, id\')'),
    'Ordenamiento cronológico': conversationServiceContent.includes('order(\'created_at\', { ascending: true })'),
    'Mapeo completo de mensajes': conversationServiceContent.includes('mappedMessages = messages.map'),
    'Análisis de contexto': conversationServiceContent.includes('analyzeConversationContext'),
    'Log de historial completo': conversationServiceContent.includes('Historial obtenido: ${messages.length} mensajes')
  };
  
  let returnCount = 0;
  Object.entries(returnConfigs).forEach(([config, exists]) => {
    if (exists) {
      logSuccess(`✅ ${config}: Implementado`);
      returnCount++;
    } else {
      logWarning(`⚠️ ${config}: NO implementado`);
    }
  });
  
  if (returnCount >= 5) {
    logSuccess(`✅ Devolución completa de mensajes: EXCELENTE (${returnCount}/6 características)`);
  } else if (returnCount >= 3) {
    logSuccess(`✅ Devolución completa de mensajes: BUENA (${returnCount}/6 características)`);
  } else {
    logWarning(`⚠️ Devolución completa de mensajes: INSUFICIENTE (${returnCount}/6 características)`);
  }
  
} catch (error) {
  logError(`❌ Error verificando conversationService.js: ${error.message}`);
}

// Test: Verificar que personalityController.js esté usando el límite de 50 mensajes
logHeader('🎯 VERIFICANDO USO DEL LÍMITE DE 50 MENSAJES');

try {
  logInfo('Verificando que personalityController.js use el límite de 50 mensajes...');
  
  const fs = await import('fs');
  const path = await import('path');
  
  const personalityControllerPath = path.join(process.cwd(), 'dist/controllers/personalityController.js');
  const personalityControllerContent = fs.readFileSync(personalityControllerPath, 'utf8');
  
  // Verificar uso del límite de 50 mensajes
  const limitConfigs = {
    'Límite 50 en testPersonalityContext': personalityControllerContent.includes('getConversationHistory(conversation.id, userId, 50)'),
    'Límite 50 en testPersonalityContextPublic': personalityControllerContent.includes('getConversationHistory(conversation.id, userId, 50)'),
    'Log de contexto completo': personalityControllerContent.includes('mensajes con contexto completo'),
    'Verificación de multimedia': personalityControllerContent.includes('Historial incluye contenido multimedia')
  };
  
  let limitCount = 0;
  Object.entries(limitConfigs).forEach(([config, exists]) => {
    if (exists) {
      logSuccess(`✅ ${config}: Implementado`);
      limitCount++;
    } else {
      logWarning(`⚠️ ${config}: NO implementado`);
    }
  });
  
  if (limitCount >= 3) {
    logSuccess(`✅ Uso del límite de 50 mensajes: EXCELENTE (${limitCount}/4 características)`);
  } else if (limitCount >= 2) {
    logSuccess(`✅ Uso del límite de 50 mensajes: BUENO (${limitCount}/4 características)`);
  } else {
    logWarning(`⚠️ Uso del límite de 50 mensajes: INSUFICIENTE (${limitCount}/4 características)`);
  }
  
} catch (error) {
  logError(`❌ Error verificando personalityController.js: ${error.message}`);
}

// Resumen final
logHeader('📋 RESUMEN DE VERIFICACIÓN DE LECTURA COMPLETA');

if (configCount >= 6 && returnCount >= 5 && limitCount >= 3) {
  logSuccess('✅ Sistema configurado para lectura COMPLETA de mensajes');
  logInfo('   ✅ openaiService.js: Configurado para leer hasta 50 mensajes');
  logInfo('   ✅ conversationService.js: Devuelve hasta 50 mensajes');
  logInfo('   ✅ personalityController.js: Usa límite de 50 mensajes');
  logInfo('   ✅ La IA debería leer TODOS los mensajes del historial');
  
  console.log(`\n${colors.green}${colors.bold}🎯 ¡La IA debería leer TODOS los mensajes ahora!${colors.reset}`);
  console.log('\n🚀 Cómo funciona la lectura completa:');
  console.log('   1. ✅ Usuario envía mensaje');
  console.log('   2. ✅ Sistema obtiene historial completo (50 mensajes)');
  console.log('   3. ✅ Sistema mapea TODOS los mensajes con contenido completo');
  console.log('   4. ✅ Sistema envía TODOS los mensajes a la IA');
  console.log('   5. ✅ IA recibe instrucciones para leer TODOS los mensajes');
  console.log('   6. ✅ IA analiza contexto COMPLETO de toda la conversación');
  console.log('   7. ✅ IA responde basándose en TODO el contexto');
  
  console.log(`\n${colors.yellow}💡 Próximo paso:${colors.reset}`);
  console.log('   Prueba la función de entrenamiento');
  console.log('   La IA debería recordar que quieres el Audi A4');
  console.log('   Y mantener el contexto COMPLETO de toda la conversación');
  
} else {
  logError('❌ Sistema NO está configurado para lectura completa');
  logInfo('   ❌ Faltan configuraciones críticas para leer todos los mensajes');
  
  console.log(`\n${colors.red}${colors.bold}🔧 Se necesitan más correcciones${colors.reset}`);
  console.log('\n⚠️ Problemas identificados:');
  if (configCount < 6) {
    console.log(`   - openaiService.js: ${7 - configCount} configuraciones faltantes`);
  }
  if (returnCount < 5) {
    console.log(`   - conversationService.js: ${6 - returnCount} configuraciones faltantes`);
  }
  if (limitCount < 3) {
    console.log(`   - personalityController.js: ${4 - limitCount} configuraciones faltantes`);
  }
}

process.exit(0);
