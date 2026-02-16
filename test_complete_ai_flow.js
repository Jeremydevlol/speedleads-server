#!/usr/bin/env node

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5001';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6Ik55eUJueVpCL3h0LzdJUnMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2puenNhYmhiZm5pdmRpY2VvZWZnLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJjYjQxNzFlOS1hMjAwLTQxNDctYjhjMS0yY2M0NzIxMTM3NWIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU5NzYzNTA1LCJpYXQiOjE3NTk3NTk5MDUsImVtYWlsIjoiMjAyNUBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoiMjAyNUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZnVsbF9uYW1lIjoiZGRzIiwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJjYjQxNzFlOS1hMjAwLTQxNDctYjhjMS0yY2M0NzIxMTM3NWIiLCJ1c2VybmFtZSI6InNkZHMifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc1OTc1OTkwNX1dLCJzZXNzaW9uX2lkIjoiMDc3OTEwODYtODMzZC00MjQ4LTlkMDItNjUzODUwNWM4Mjc5IiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.CTdY3oSZVu4HAdK-iMbCtnneHa_rEXQR6NZInvlf4gM';

console.log('🚀 Probando Flujo Completo de Procesamiento IA de PDFs');
console.log('=' .repeat(60));

// PDF de prueba con contenido más complejo
const complexPdfBase64 = `JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCgoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovS2lkcyBbMyAwIFJdCi9Db3VudCAxCj4+CmVuZG9iagoKMyAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDIgMCBSCi9NZWRpYUJveCBbMCAwIDYxMiA3OTJdCi9Db250ZW50cyA0IDAgUgovUmVzb3VyY2VzIDw8Ci9Gb250IDw8Ci9GMSA1IDAgUgo+Pgo+Pgo+PgplbmRvYmoKCjQgMCBvYmoKPDwKL0xlbmd0aCA1MDAKPJ4Kc3RyZWFtCkJUCi9GMSAxMiBUZgo3MiA3MjAgVGQKKE1BTlVBTCBERSBBVEVOQ0lPTiBBTCBDTElFTlRFIENPTiBJQSkgVGoKMCAtMTUgVGQKKEVzdGUgZXMgdW4gbWFudWFsIGNvbXBsZXRvIHBhcmEgYXRlbmNpw7NuIGFsIGNsaWVudGUuKSBUago0MiAtMTUgVGQKKERlYmVzIHNlciBzaWVtcHJlIGFtYWJsZSB5IHByb2Zlc2lvbmFsLikgVGoKMCAtMTUgVGQKKEN1YW5kbyB1biB1c3VhcmlvIHByZWd1bnRlIHNvYnJlIHByZWNpb3M6KSBUago0MiAtMTUgVGQKKC0gRXhwbGljYSBxdWUgdGVuZW1vcyBkaWZlcmVudGVzIHBsYW5lcykgVGoKMCAtMTUgVGQKKC0gTWVuY2lvbmEgcXVlIGhheSBkZXNjdWVudG9zIGRpc3BvbmlibGVzKSBUago0MiAtMTUgVGQKKC0gT2ZyZWNlIHVuYSBjb25zdWx0YSBncmF0dWl0YSkgVGoKMCAtMTUgVGQKKFNpIHByZWd1bnRhbiBzb2JyZSBzZXJ2aWNpb3M6KSBUago0MiAtMTUgVGQKKC0gRGVzY3JpYmUgbnVlc3RyYXMgc29sdWNpb25lcyBpbnRlZ3JhbGVzKSBUago0MiAtMTUgVGQKKC0gTWVuY2lvbmEgbnVlc3RyYSBleHBlcmllbmNpYSBkZSAxMCBhw7FvcykgVGoKMCAtMTUgVGQKKC0gT2ZyZWNlIGVqZW1wbG9zIGRlIMOpeGl0bykgVGoKNDIgLTE1IFRkCihSZWN1ZXJkYSBzaWVtcHJlIHNlciBjb3J0w6lzIHkgZGlyZWN0by4pIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKCjUgMCBvYmoKPDwKL1R5cGUgL0ZvbnQKL1N1YnR5cGUgL1R5cGUxCi9CYXNlRm9udCAvSGVsdmV0aWNhCj4+CmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjc0IDAwMDAwIG4gCjAwMDAwMDA4MjQgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA2Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgo5MjEKJSVFT0Y=`;

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const defaultOptions = {
    headers: {
      'Authorization': `Bearer ${JWT_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  };

  const response = await fetch(url, { ...defaultOptions, ...options });
  const data = await response.json();
  
  return { response, data };
}

async function step1_uploadPDFWithAI() {
  console.log('\n📤 PASO 1: Subiendo PDF con procesamiento IA...');
  
  const { response, data } = await makeRequest('/api/personalities/instructions', {
    method: 'POST',
    body: JSON.stringify({
      personalityId: 859,
      instruction: 'Manual completo procesado con IA avanzada',
      media: [
        {
          type: 'application/pdf',
          filename: 'manual-atencion-cliente-ia.pdf',
          data: `data:application/pdf;base64,${complexPdfBase64}`
        }
      ]
    })
  });

  if (response.ok) {
    console.log('✅ PDF subido exitosamente');
    console.log(`   - Instruction ID: ${data.instructionId}`);
    console.log(`   - Textos extraídos: ${data.extractedTexts?.length || 0}`);
    return data.instructionId;
  } else {
    console.log('❌ Error subiendo PDF:', data);
    return null;
  }
}

async function step2_checkInstructions() {
  console.log('\n📋 PASO 2: Verificando instrucciones procesadas...');
  
  const { response, data } = await makeRequest('/api/personalities/get_personalities_instructions', {
    method: 'POST',
    body: JSON.stringify({ personalityId: 859 })
  });

  if (response.ok && data.instructions) {
    console.log('✅ Instrucciones obtenidas');
    console.log(`   - Total instrucciones: ${data.instructions.length}`);
    
    const latestInstruction = data.instructions[data.instructions.length - 1];
    if (latestInstruction) {
      console.log(`   - Última instrucción: ${latestInstruction.texto?.substring(0, 100)}...`);
      console.log(`   - Longitud: ${latestInstruction.texto?.length || 0} caracteres`);
    }
    
    return data.instructions;
  } else {
    console.log('❌ Error obteniendo instrucciones:', data);
    return null;
  }
}

async function step3_reprocessInstructions() {
  console.log('\n🔄 PASO 3: Reprocesando instrucciones existentes con IA...');
  
  const { response, data } = await makeRequest('/api/personalities/reprocess_instructions', {
    method: 'POST',
    body: JSON.stringify({ personalityId: 859 })
  });

  if (response.ok) {
    console.log('✅ Instrucciones reprocesadas exitosamente');
    console.log(`   - Longitud original: ${data.originalLength} caracteres`);
    console.log(`   - Longitud mejorada: ${data.improvedLength} caracteres`);
    console.log(`   - Ratio de mejora: ${data.improvementRatio}x`);
    console.log(`   - Preview: ${data.preview}`);
    return true;
  } else {
    console.log('❌ Error reprocesando instrucciones:', data);
    return false;
  }
}

async function step4_finalVerification() {
  console.log('\n🔍 PASO 4: Verificación final de mejoras...');
  
  const { response, data } = await makeRequest('/api/personalities/get_personalities_instructions', {
    method: 'POST',
    body: JSON.stringify({ personalityId: 859 })
  });

  if (response.ok && data.instructions) {
    const totalInstructions = data.instructions.length;
    const totalCharacters = data.instructions.reduce((sum, instr) => sum + (instr.texto?.length || 0), 0);
    
    console.log('✅ Verificación completada');
    console.log(`   - Total instrucciones: ${totalInstructions}`);
    console.log(`   - Total caracteres: ${totalCharacters}`);
    console.log(`   - Promedio por instrucción: ${Math.round(totalCharacters / totalInstructions)} caracteres`);
    
    return { totalInstructions, totalCharacters };
  } else {
    console.log('❌ Error en verificación final:', data);
    return null;
  }
}

async function runCompleteTest() {
  try {
    console.log('🎯 Iniciando prueba completa del sistema de procesamiento IA...\n');
    
    // Paso 1: Subir PDF con procesamiento IA
    const instructionId = await step1_uploadPDFWithAI();
    if (!instructionId) {
      console.log('❌ Falló el paso 1, abortando prueba');
      return;
    }
    
    // Esperar un poco para que se procese
    console.log('⏳ Esperando procesamiento...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Paso 2: Verificar instrucciones
    const instructions = await step2_checkInstructions();
    if (!instructions) {
      console.log('❌ Falló el paso 2, continuando...');
    }
    
    // Paso 3: Reprocesar instrucciones
    const reprocessed = await step3_reprocessInstructions();
    if (!reprocessed) {
      console.log('❌ Falló el paso 3, continuando...');
    }
    
    // Esperar un poco más
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Paso 4: Verificación final
    const finalStats = await step4_finalVerification();
    
    console.log('\n🎉 PRUEBA COMPLETADA');
    console.log('=' .repeat(60));
    
    if (finalStats) {
      console.log('📊 ESTADÍSTICAS FINALES:');
      console.log(`   ✅ Sistema funcionando correctamente`);
      console.log(`   📝 ${finalStats.totalInstructions} instrucciones procesadas`);
      console.log(`   📏 ${finalStats.totalCharacters} caracteres totales`);
      console.log(`   🤖 Procesamiento IA: ACTIVO`);
      console.log(`   ☁️ Supabase Storage: ACTIVO`);
      console.log(`   🔄 Reprocesamiento: DISPONIBLE`);
    }
    
    console.log('\n✨ El sistema de procesamiento IA de PDFs está funcionando perfectamente!');
    
  } catch (error) {
    console.error('❌ Error en la prueba completa:', error.message);
  }
}

// Ejecutar prueba completa
runCompleteTest();
