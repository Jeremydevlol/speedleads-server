#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { processInstructionsWithAI } from './dist/services/openaiService.js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: '/Users/amosmendez/Desktop/Uniclcik.io/api/.env' });

console.log('🧪 Probando procesamiento de instrucciones con IA...');

const testText = `MANUAL DE INSTRUCCIONES PARA CHATBOT DE IA

Este es un manual detallado para el chatbot de IA.
Debes responder siempre de manera amigable y profesional.
Cuando un usuario pregunte sobre precios, debes explicar
que los precios varían según la configuración.
Si preguntan sobre servicios, debes mencionar
que ofrecemos soluciones integrales de marketing.
Recuerda siempre ser cortés y directo en tus respuestas.`;

async function testAIProcessing() {
  try {
    console.log('\n📄 Texto original:');
    console.log(testText);
    console.log(`\n📊 Longitud: ${testText.length} caracteres`);
    
    console.log('\n🤖 Procesando con IA...');
    
    const improvedInstructions = await processInstructionsWithAI(
      testText,
      'Amos', // Nombre de la personalidad
      'Business' // Categoría
    );
    
    console.log('\n✨ Instrucciones mejoradas:');
    console.log('=' .repeat(60));
    console.log(improvedInstructions);
    console.log('=' .repeat(60));
    
    console.log(`\n📈 Mejora: ${improvedInstructions.length} caracteres (${((improvedInstructions.length / testText.length) * 100).toFixed(1)}% del original)`);
    
    // Verificar que se mantiene la información
    const originalWords = testText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const improvedWords = improvedInstructions.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    const preservedWords = originalWords.filter(word => 
      improvedWords.some(iw => iw.includes(word) || word.includes(iw))
    );
    
    console.log(`\n🔍 Análisis de preservación de contenido:`);
    console.log(`   - Palabras originales importantes: ${originalWords.length}`);
    console.log(`   - Palabras preservadas: ${preservedWords.length}`);
    console.log(`   - Porcentaje preservado: ${((preservedWords.length / originalWords.length) * 100).toFixed(1)}%`);
    
    if (preservedWords.length / originalWords.length > 0.7) {
      console.log('✅ Buena preservación de contenido');
    } else {
      console.log('⚠️ Posible pérdida de información');
    }
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
  }
}

// Ejecutar prueba
testAIProcessing();
