#!/usr/bin/env node

/**
 * Script de verificación del sistema de WhatsApp
 * Verifica que todos los componentes estén configurados correctamente
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Verificando configuración del sistema de WhatsApp...\n');

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

// Verificar archivos del sistema
logHeader('📁 VERIFICACIÓN DE ARCHIVOS');

const requiredFiles = [
  'dist/services/whatsappService.js',
  'dist/controllers/whatsappController.js',
  'dist/routes/whatsappRoutes.js',
  'dist/app.js',
  'dist/config/db.js'
];

let filesOk = 0;
for (const file of requiredFiles) {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    logSuccess(`${file} - Existe`);
    filesOk++;
  } else {
    logError(`${file} - No encontrado`);
  }
}

console.log(`\n📊 Archivos del sistema: ${filesOk}/${requiredFiles.length}`);

// Verificar dependencias del package.json
logHeader('📦 VERIFICACIÓN DE DEPENDENCIAS');

try {
  const packagePath = path.join(__dirname, 'package.json');
  if (fs.existsSync(packagePath)) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const dependencies = packageJson.dependencies || {};
    
    const requiredDeps = [
      '@whiskeysockets/baileys',
      'qrcode',
      'socket.io',
      'pg'
    ];
    
    let depsOk = 0;
    for (const dep of requiredDeps) {
      if (dependencies[dep]) {
        logSuccess(`${dep} - ${dependencies[dep]}`);
        depsOk++;
      } else {
        logError(`${dep} - No instalado`);
      }
    }
    
    console.log(`\n📊 Dependencias: ${depsOk}/${requiredDeps.length}`);
  } else {
    logError('package.json no encontrado');
  }
} catch (error) {
  logError(`Error leyendo package.json: ${error.message}`);
}

// Verificar variables de entorno
logHeader('🔐 VERIFICACIÓN DE VARIABLES DE ENTORNO');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  let varsOk = 0;
  for (const varName of requiredVars) {
    if (envContent.includes(`${varName}=`)) {
      logSuccess(`${varName} - Configurada`);
      varsOk++;
    } else {
      logWarning(`${varName} - No configurada`);
    }
  }
  
  console.log(`\n📊 Variables de entorno: ${varsOk}/${requiredVars.length}`);
} else {
  logWarning('.env no encontrado - Verificar configuración manualmente');
}

// Verificar estructura de directorios
logHeader('📂 VERIFICACIÓN DE DIRECTORIOS');

const requiredDirs = [
  'dist/services',
  'dist/controllers',
  'dist/routes',
  'dist/config',
  'db/migrations'
];

let dirsOk = 0;
for (const dir of requiredDirs) {
  const dirPath = path.join(__dirname, dir);
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    logSuccess(`${dir}/ - Existe`);
    dirsOk++;
  } else {
    logError(`${dir}/ - No encontrado`);
  }
}

console.log(`\n📊 Directorios: ${dirsOk}/${requiredDirs.length}`);

// Verificar archivos de migración
logHeader('🗄️ VERIFICACIÓN DE BASE DE DATOS');

const migrationsDir = path.join(__dirname, 'db/migrations');
if (fs.existsSync(migrationsDir)) {
  const migrationFiles = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql'));
  
  if (migrationFiles.length > 0) {
    logSuccess(`Encontradas ${migrationFiles.length} migraciones`);
    migrationFiles.forEach(file => {
      logInfo(`  - ${file}`);
    });
  } else {
    logWarning('No se encontraron archivos de migración');
  }
} else {
  logError('Directorio de migraciones no encontrado');
}

// Verificar archivos de prueba
logHeader('🧪 VERIFICACIÓN DE ARCHIVOS DE PRUEBA');

const testFiles = [
  'test-whatsapp-complete.js',
  'WHATSAPP_IMPLEMENTATION_GUIDE.md'
];

let testsOk = 0;
for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    logSuccess(`${file} - Existe`);
    testsOk++;
  } else {
    logWarning(`${file} - No encontrado`);
  }
}

console.log(`\n📊 Archivos de prueba: ${testsOk}/${testFiles.length}`);

// Resumen final
logHeader('📋 RESUMEN FINAL');

const totalChecks = requiredFiles.length + 4 + 4 + requiredDirs.length + 2 + testFiles.length;
const totalOk = filesOk + depsOk + varsOk + dirsOk + testsOk;

console.log(`\n🎯 Total de verificaciones: ${totalChecks}`);
console.log(`✅ Exitosas: ${totalOk}`);
console.log(`❌ Fallidas: ${totalChecks - totalOk}`);

if (totalOk === totalChecks) {
  console.log(`\n${colors.green}${colors.bold}🎉 ¡Sistema de WhatsApp completamente configurado!${colors.reset}`);
  console.log('\n📱 Para probar el sistema:');
  console.log('   1. Asegúrate de que el servidor esté ejecutándose');
  console.log('   2. Ejecuta: node test-whatsapp-complete.js');
  console.log('   3. Sigue las instrucciones en WHATSAPP_IMPLEMENTATION_GUIDE.md');
} else {
  console.log(`\n${colors.yellow}${colors.bold}⚠️  Hay problemas que resolver antes de usar el sistema${colors.reset}`);
  console.log('\n🔧 Pasos para resolver:');
  console.log('   1. Instala las dependencias faltantes: npm install');
  console.log('   2. Configura las variables de entorno en .env');
  console.log('   3. Verifica que todos los archivos estén en su lugar');
  console.log('   4. Ejecuta este script nuevamente');
}

console.log(`\n${colors.blue}📚 Documentación completa: WHATSAPP_IMPLEMENTATION_GUIDE.md${colors.reset}`);
console.log(`${colors.blue}🧪 Pruebas del sistema: test-whatsapp-complete.js${colors.reset}\n`);
