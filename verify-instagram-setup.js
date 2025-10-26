#!/usr/bin/env node

/**
 * Script de verificación para Instagram en Render
 * Verifica que todo esté configurado correctamente
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function verifyInstagramSetup() {
  console.log('🔍 Verificando configuración de Instagram...\n');
  
  let allGood = true;
  
  // 1. Verificar archivos del backend
  const backendFiles = [
    'dist/controllers/instagramController.js',
    'dist/routes/instagramRoutes.js', 
    'dist/services/instagramService.js',
    'dist/services/instagramBotService.js'
  ];
  
  console.log('📁 Verificando archivos del backend:');
  for (const file of backendFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file} - FALTANTE`);
      allGood = false;
    }
  }
  
  // 2. Verificar integración en app.js
  console.log('\n🔧 Verificando integración en app.js:');
  const appJsPath = path.join(__dirname, 'dist/app.js');
  if (fs.existsSync(appJsPath)) {
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    
    if (appJsContent.includes('instagramRoutes')) {
      console.log('✅ Instagram routes importado');
    } else {
      console.log('❌ Instagram routes NO importado');
      allGood = false;
    }
    
    if (appJsContent.includes("app.use('/api/instagram', instagramRoutes)")) {
      console.log('✅ Instagram routes montado en app.js');
    } else {
      console.log('❌ Instagram routes NO montado en app.js');
      allGood = false;
    }
    
    if (appJsContent.includes('configureIGIO')) {
      console.log('✅ Socket.IO configurado para Instagram');
    } else {
      console.log('❌ Socket.IO NO configurado para Instagram');
      allGood = false;
    }
  } else {
    console.log('❌ app.js no encontrado');
    allGood = false;
  }
  
  // 3. Verificar dependencias en package.json
  console.log('\n📦 Verificando dependencias:');
  const packageJsonPath = path.join(__dirname, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = packageJson.dependencies || {};
    
    const requiredDeps = [
      'instagram-private-api',
      'bottleneck',
      'socket.io'
    ];
    
    for (const dep of requiredDeps) {
      if (dependencies[dep]) {
        console.log(`✅ ${dep}: ${dependencies[dep]}`);
      } else {
        console.log(`❌ ${dep} - FALTANTE`);
        allGood = false;
      }
    }
  } else {
    console.log('❌ package.json no encontrado');
    allGood = false;
  }
  
  // 4. Verificar migraciones
  console.log('\n🗄️ Verificando migraciones:');
  const migrationPath = path.join(__dirname, 'db/migrations/2025-01-21_create_instagram_tables.sql');
  if (fs.existsSync(migrationPath)) {
    console.log('✅ Migración de Instagram creada');
  } else {
    console.log('❌ Migración de Instagram FALTANTE');
    allGood = false;
  }
  
  // 5. Verificar variables de entorno para Render
  console.log('\n🌐 Verificando configuración para Render:');
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'OPENAI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      console.log(`✅ ${envVar} configurada`);
    } else {
      console.log(`⚠️ ${envVar} no encontrada (puede estar en Render Dashboard)`);
    }
  }
  
  // 6. Resumen final
  console.log('\n' + '='.repeat(50));
  if (allGood) {
    console.log('🎉 ¡Instagram está completamente configurado!');
    console.log('\n📋 Próximos pasos:');
    console.log('1. Ejecutar: npm install');
    console.log('2. Ejecutar: node run-instagram-migrations.js');
    console.log('3. Desplegar en Render');
    console.log('4. Configurar variables de entorno en Render Dashboard');
  } else {
    console.log('❌ Hay problemas en la configuración de Instagram');
    console.log('\n🔧 Soluciones:');
    console.log('1. Verificar que todos los archivos estén presentes');
    console.log('2. Revisar la integración en app.js');
    console.log('3. Instalar dependencias faltantes');
  }
  
  console.log('\n📚 Documentación:');
  console.log('- Endpoints: /api/instagram/*');
  console.log('- Socket.IO: instagram:* events');
  console.log('- Base de datos: Tablas instagram_*');
  
  return allGood;
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyInstagramSetup();
}

export default verifyInstagramSetup;

