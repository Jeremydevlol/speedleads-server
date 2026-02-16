// Diagnóstico completo para producción
import { existsSync } from 'fs';
import { join } from 'path';

export async function runProductionDiagnostics() {
  console.log('\n🔍 === DIAGNÓSTICO DE PRODUCCIÓN ===\n');
  
  const issues = [];
  const warnings = [];
  
  // 1. Verificar variables de entorno críticas
  console.log('1. 📋 Verificando variables de entorno...');
  const requiredEnvVars = {
    'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
    'DEEPSEEK_API_KEY': process.env.DEEPSEEK_API_KEY,
    'GOOGLE_APPLICATION_CREDENTIALS': process.env.GOOGLE_APPLICATION_CREDENTIALS,
    'GOOGLE_PRIVATE_KEY': process.env.GOOGLE_PRIVATE_KEY,
    'GOOGLE_CLIENT_EMAIL': process.env.GOOGLE_CLIENT_EMAIL,
    'NODE_ENV': process.env.NODE_ENV
  };
  
  // Verificar archivos de credenciales primero para saber si GOOGLE_PRIVATE_KEY es realmente necesario
  const credentialPaths = [
    'dist/credentials/arched-router.json',
    'dist/credentials/brave-cistern-441722-a9-8aa519ef966f.json',
    'arched-router.json',
    'brave-cistern-441722-a9-8aa519ef966f.json'
  ];
  
  let credentialsFound = false;
  for (const path of credentialPaths) {
    if (existsSync(path)) {
      credentialsFound = true;
      break;
    }
  }
  
  // Verificar si hay alguna forma de autenticación de Google Vision disponible
  const hasGoogleAuth = 
    process.env.GOOGLE_APPLICATION_CREDENTIALS || 
    credentialsFound || 
    (process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_CLIENT_EMAIL);
  
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (value) {
      console.log(`   ✅ ${key}: Configurada`);
    } else {
      console.log(`   ❌ ${key}: NO CONFIGURADA`);
      
      // OPENAI_API_KEY siempre es crítico
      if (key === 'OPENAI_API_KEY') {
        issues.push(`Variable crítica faltante: ${key}`);
      }
      // GOOGLE_PRIVATE_KEY y GOOGLE_CLIENT_EMAIL solo son críticas si no hay otras formas de autenticación
      else if (key === 'GOOGLE_PRIVATE_KEY' || key === 'GOOGLE_CLIENT_EMAIL') {
        if (!hasGoogleAuth && process.env.NODE_ENV === 'production') {
          issues.push(`Variable crítica faltante: ${key} (y no hay otras credenciales de Google Vision)`);
        } else if (!hasGoogleAuth) {
          warnings.push(`Variable opcional faltante: ${key} (en desarrollo se usará cliente mock)`);
        } else {
          console.log(`   ℹ️ ${key}: No necesaria (hay otras credenciales de Google Vision disponibles)`);
        }
      } else {
        warnings.push(`Variable opcional faltante: ${key}`);
      }
    }
  }
  
  // 2. Verificar archivos de credenciales
  console.log('\n2. 📁 Verificando archivos de credenciales...');
  for (const path of credentialPaths) {
    if (existsSync(path)) {
      console.log(`   ✅ Encontrado: ${path}`);
    } else {
      console.log(`   ❌ No encontrado: ${path}`);
    }
  }
  
  // Solo marcar como crítico si no hay ninguna forma de autenticación y estamos en producción
  if (!hasGoogleAuth && process.env.NODE_ENV === 'production') {
    issues.push('No se encontraron credenciales de Google Vision (requeridas en producción)');
  } else if (!hasGoogleAuth) {
    warnings.push('No se encontraron credenciales de Google Vision (en desarrollo se usará cliente mock)');
  }
  
  // 3. Verificar conectividad a APIs
  console.log('\n3. 🌐 Verificando conectividad a APIs...');
  
  // Test OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.ok) {
        console.log('   ✅ OpenAI API: Conectada');
      } else {
        console.log(`   ❌ OpenAI API: Error ${response.status}`);
        issues.push(`OpenAI API error: ${response.status}`);
      }
    } catch (error) {
      console.log(`   ❌ OpenAI API: ${error.message}`);
      issues.push(`OpenAI API: ${error.message}`);
    }
  }
  
  // Test DeepSeek
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const response = await fetch('https://api.deepseek.com/models', {
        headers: { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.ok) {
        console.log('   ✅ DeepSeek API: Conectada');
      } else {
        console.log(`   ❌ DeepSeek API: Error ${response.status}`);
        warnings.push(`DeepSeek API error: ${response.status}`);
      }
    } catch (error) {
      console.log(`   ❌ DeepSeek API: ${error.message}`);
      warnings.push(`DeepSeek API: ${error.message}`);
    }
  }
  
  // Test Google Vision
  try {
    const { default: visionClient } = await import('../config/vision.js');
    console.log('   ✅ Google Vision: Cliente inicializado');
  } catch (error) {
    console.log(`   ❌ Google Vision: ${error.message}`);
    issues.push(`Google Vision: ${error.message}`);
  }
  
  // 4. Verificar configuración del entorno
  console.log('\n4. ⚙️ Verificando configuración del entorno...');
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'no definido'}`);
  console.log(`   Platform: ${process.platform}`);
  console.log(`   Node.js: ${process.version}`);
  console.log(`   Working Directory: ${process.cwd()}`);
  
  // 5. Resumen
  console.log('\n📊 === RESUMEN DEL DIAGNÓSTICO ===');
  
  if (issues.length === 0) {
    console.log('✅ ¡Todo está configurado correctamente!');
  } else {
    console.log('🚨 PROBLEMAS CRÍTICOS ENCONTRADOS:');
    issues.forEach(issue => console.log(`   ❌ ${issue}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️ ADVERTENCIAS:');
    warnings.forEach(warning => console.log(`   ⚠️ ${warning}`));
  }
  
  console.log('\n💡 RECOMENDACIONES PARA PRODUCCIÓN:');
  console.log('   1. Asegúrate de que todas las variables de entorno estén configuradas');
  console.log('   2. Verifica que los archivos de credenciales estén en el servidor');
  console.log('   3. Comprueba la conectividad a internet del servidor');
  console.log('   4. Revisa los logs del servidor para errores específicos');
  
  return {
    success: issues.length === 0,
    issues,
    warnings
  };
} 