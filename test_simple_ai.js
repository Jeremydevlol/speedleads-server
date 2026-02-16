#!/usr/bin/env node

import OpenAI from 'openai';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: '/Users/amosmendez/Desktop/Uniclcik.io/api/.env' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 25000,
  maxRetries: 1,
});

console.log('🧪 Probando procesamiento directo con OpenAI...');

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
    
    const personalityName = 'Amos';
    const personalityCategory = 'Business';
    
    const improvementPrompt = `Eres un experto en crear instrucciones para chatbots de IA. Tu tarea es tomar el texto extraído de un PDF y convertirlo en instrucciones claras, estructuradas y efectivas para un chatbot llamado "${personalityName}" de categoría "${personalityCategory}".

REQUISITOS CRÍTICOS:
- ✅ MANTÉN TODA la información del texto original - NO elimines nada importante
- ✅ ESTRUCTURA el contenido de manera clara y organizada
- ✅ CONVIERTE la información en instrucciones directas y accionables
- ✅ USA un lenguaje claro y profesional
- ✅ ORGANIZA por secciones lógicas si es necesario
- ✅ MANTÉN el contexto y los detalles específicos
- ✅ ADAPTA el tono a la categoría: ${personalityCategory}

CATEGORÍAS DE PERSONALIDAD:
- formal: Lenguaje profesional y respetuoso
- amigable: Tono cercano pero profesional
- familia: Tono cálido y familiar
- negocios: Enfoque empresarial y directo

FORMATO DE SALIDA:
Estructura las instrucciones de manera clara, usando:
- Párrafos bien organizados
- Listas cuando sea apropiado
- Secciones temáticas si el contenido lo requiere
- Instrucciones específicas sobre cómo responder
- Información clave que debe recordar

TEXTO ORIGINAL A PROCESAR:
${testText}

INSTRUCCIONES MEJORADAS:`;

    const messages = [
      { role: 'system', content: 'Eres un experto en optimización de instrucciones para chatbots. Tu objetivo es mejorar y estructurar instrucciones manteniendo toda la información original.' },
      { role: 'user', content: improvementPrompt }
    ];
    
    console.log('\n🤖 Procesando con OpenAI...');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      max_tokens: 2000,
      stream: false
    });
    
    const improvedInstructions = completion.choices[0].message.content.trim();
    
    console.log('\n✨ Instrucciones mejoradas:');
    console.log('=' .repeat(80));
    console.log(improvedInstructions);
    console.log('=' .repeat(80));
    
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
      console.log('✅ Excelente preservación de contenido');
    } else {
      console.log('⚠️ Posible pérdida de información');
    }
    
    console.log('\n🎉 ¡Prueba de procesamiento IA completada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
  }
}

// Ejecutar prueba
testAIProcessing();
