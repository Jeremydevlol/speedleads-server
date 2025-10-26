#!/usr/bin/env node

/**
 * Script de monitoreo y diagnóstico para el sistema de personalidades
 * Uso: node diagnostic-monitor.js [userId] [personalityId]
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TOKEN = process.env.TEST_TOKEN; // Token JWT para testing

async function runDiagnostic() {
  console.log('🔍 INICIANDO DIAGNÓSTICO DEL SISTEMA');
  console.log('=====================================\n');

  // 1. Verificar variables de entorno críticas
  console.log('1. ✅ VARIABLES DE ENTORNO:');
  console.log(`   - BASE_URL: ${BASE_URL}`);
  console.log(`   - OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ PRESENTE' : '❌ FALTANTE'}`);
  console.log(`   - DEEPSEEK_API_KEY: ${process.env.DEEPSEEK_API_KEY ? '✅ PRESENTE' : '❌ FALTANTE'}`);
  console.log(`   - DATABASE_URL: ${process.env.DATABASE_URL ? '✅ PRESENTE' : '❌ FALTANTE'}`);
  console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'no definido'}\n`);

  if (!TEST_TOKEN) {
    console.log('❌ TEST_TOKEN no definido. Agregue un JWT válido en las variables de entorno para continuar.');
    process.exit(1);
  }

  try {
    // 2. Diagnóstico del sistema via API
    console.log('2. 🔍 DIAGNÓSTICO DEL SISTEMA:');
    const diagnosticResponse = await fetch(`${BASE_URL}/api/personalities/system-diagnostic`, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!diagnosticResponse.ok) {
      throw new Error(`Error en diagnóstico: ${diagnosticResponse.status} ${diagnosticResponse.statusText}`);
    }

    const diagnostic = await diagnosticResponse.json();
    
    if (diagnostic.success) {
      const data = diagnostic.diagnostic;
      
      console.log(`   - Timestamp: ${data.timestamp}`);
      console.log(`   - Environment: ${data.environment}`);
      console.log(`   - User ID: ${data.userId}`);
      
      console.log('\n   📊 Base de datos:');
      if (data.database.connected) {
        console.log(`     ✅ Conectada (${data.database.personalityCount} personalidades)`);
        console.log(`     🕒 Hora servidor: ${data.database.currentTime}`);
      } else {
        console.log(`     ❌ Error: ${data.database.error}`);
      }
      
      console.log('\n   👥 Personalidades:');
      if (Array.isArray(data.personalities)) {
        data.personalities.forEach(p => {
          console.log(`     - ${p.nombre} (ID: ${p.id}, Categoría: ${p.category}, Instrucciones: ${p.instructionLength} chars)`);
        });
      } else {
        console.log(`     ❌ Error: ${data.personalities.error}`);
      }
      
      console.log('\n   📝 Instrucciones adicionales:');
      if (Array.isArray(data.instructions)) {
        data.instructions.forEach(i => {
          console.log(`     - Personalidad ${i.personalityId}: ${i.count} instrucciones (${i.totalLength} chars total)`);
        });
      } else {
        console.log(`     ❌ Error: ${data.instructions.error}`);
      }
    } else {
      console.log(`   ❌ Error en diagnóstico: ${diagnostic.message}`);
    }

    // 3. Test básico de respuesta de IA
    console.log('\n3. 🤖 TEST DE RESPUESTA DE IA:');
    
    // Obtener primera personalidad disponible
    const personalitiesResponse = await fetch(`${BASE_URL}/api/personalities/all`, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (personalitiesResponse.ok) {
      const personalitiesData = await personalitiesResponse.json();
      
      if (personalitiesData.success && personalitiesData.personalidades.length > 0) {
        const testPersonality = personalitiesData.personalidades[0];
        console.log(`   📋 Probando personalidad: ${testPersonality.nombre} (ID: ${testPersonality.id})`);
        
        // Test de respuesta
        const testResponse = await fetch(`${BASE_URL}/api/personalities/test-context`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TEST_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            personalityId: testPersonality.id,
            message: 'Hola, esto es una prueba del sistema de diagnóstico'
          })
        });

        if (testResponse.ok) {
          const testData = await testResponse.json();
          if (testData.success) {
            console.log(`   ✅ Respuesta exitosa: "${testData.message.substring(0, 100)}..."`);
          } else {
            console.log(`   ❌ Error en respuesta: ${testData.message}`);
          }
        } else {
          console.log(`   ❌ Error HTTP en test: ${testResponse.status} ${testResponse.statusText}`);
        }
      } else {
        console.log('   ⚠️ No hay personalidades disponibles para probar');
      }
    } else {
      console.log(`   ❌ Error obteniendo personalidades: ${personalitiesResponse.status}`);
    }

  } catch (error) {
    console.error('\n❌ ERROR EN DIAGNÓSTICO:', error.message);
    console.error('Stack:', error.stack);
  }

  console.log('\n🏁 DIAGNÓSTICO COMPLETADO');
  console.log('========================\n');
}

// Ejecutar diagnóstico
if (import.meta.url === `file://${process.argv[1]}`) {
  runDiagnostic().catch(console.error);
}

export default runDiagnostic; 