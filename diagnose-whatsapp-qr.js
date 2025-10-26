#!/usr/bin/env node

/**
 * 🔍 Diagnóstico del Sistema de WhatsApp QR
 * 
 * Este script diagnostica problemas comunes con la generación del QR de WhatsApp
 */

import fs from 'fs';
import path from 'path';

console.log('🔍 DIAGNÓSTICO DEL SISTEMA DE WHATSAPP QR');
console.log('==========================================\n');

// 1. Verificar estructura de archivos
console.log('📁 1. Verificando estructura de archivos...');
const requiredFiles = [
  'dist/services/whatsappService.js',
  'dist/controllers/whatsappController.js',
  'dist/routes/whatsappRoutes.js',
  'package.json'
];

let filesExist = true;
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - FALTANTE`);
    filesExist = false;
  }
});

if (!filesExist) {
  console.log('\n❌ ERROR: Archivos requeridos faltantes. Ejecuta "npm run build" primero.');
  process.exit(1);
}

// 2. Verificar dependencias
console.log('\n📦 2. Verificando dependencias...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const requiredDeps = ['@whiskeysockets/baileys', 'qrcode', 'socket.io'];

requiredDeps.forEach(dep => {
  if (packageJson.dependencies[dep]) {
    console.log(`   ✅ ${dep}: ${packageJson.dependencies[dep]}`);
  } else {
    console.log(`   ❌ ${dep} - FALTANTE`);
  }
});

// 3. Verificar directorio de autenticación
console.log('\n🔐 3. Verificando directorio de autenticación...');
const authDir = 'auth';
if (!fs.existsSync(authDir)) {
  console.log(`   ⚠️  Directorio ${authDir} no existe. Se creará automáticamente.`);
  try {
    fs.mkdirSync(authDir, { recursive: true });
    console.log(`   ✅ Directorio ${authDir} creado.`);
  } catch (error) {
    console.log(`   ❌ Error creando directorio: ${error.message}`);
  }
} else {
  console.log(`   ✅ Directorio ${authDir} existe.`);
  
  // Verificar permisos
  try {
    fs.accessSync(authDir, fs.constants.R_OK | fs.constants.W_OK);
    console.log(`   ✅ Permisos de lectura/escritura OK.`);
  } catch (error) {
    console.log(`   ❌ Error de permisos: ${error.message}`);
  }
}

// 4. Verificar variables de entorno
console.log('\n🌍 4. Verificando variables de entorno...');
const envFile = '.env';
if (fs.existsSync(envFile)) {
  console.log(`   ✅ Archivo .env encontrado.`);
  
  const envContent = fs.readFileSync(envFile, 'utf8');
  const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
  
  requiredEnvVars.forEach(envVar => {
    if (envContent.includes(envVar)) {
      console.log(`   ✅ ${envVar} configurado.`);
    } else {
      console.log(`   ⚠️  ${envVar} no encontrado en .env`);
    }
  });
} else {
  console.log(`   ❌ Archivo .env no encontrado.`);
}

// 5. Verificar logs de errores
console.log('\n📋 5. Verificando logs de errores...');
const logFiles = ['backend.log', 'error.log', 'app.log'];
let hasLogs = false;

logFiles.forEach(logFile => {
  if (fs.existsSync(logFile)) {
    console.log(`   📄 ${logFile} encontrado.`);
    hasLogs = true;
    
    try {
      const logContent = fs.readFileSync(logFile, 'utf8');
      const errorLines = logContent.split('\n').filter(line => 
        line.toLowerCase().includes('error') || 
        line.toLowerCase().includes('qr') ||
        line.toLowerCase().includes('whatsapp')
      );
      
      if (errorLines.length > 0) {
        console.log(`   ⚠️  ${errorLines.length} líneas relevantes encontradas:`);
        errorLines.slice(-5).forEach(line => {
          console.log(`      ${line.substring(0, 100)}...`);
        });
      }
    } catch (error) {
      console.log(`   ❌ Error leyendo ${logFile}: ${error.message}`);
    }
  }
});

if (!hasLogs) {
  console.log(`   ℹ️  No se encontraron archivos de log.`);
}

// 6. Crear script de prueba
console.log('\n🧪 6. Creando script de prueba...');
const testScript = `#!/usr/bin/env node

/**
 * Prueba de generación de QR de WhatsApp
 */

import { io } from 'socket.io-client';

console.log('🧪 Probando generación de QR de WhatsApp...');

// Conectar al servidor
const socket = io('http://localhost:5001', {
  transports: ['websocket'],
  timeout: 10000
});

socket.on('connect', () => {
  console.log('✅ Conectado al servidor');
  
  // Solicitar QR (necesitarás un token JWT válido)
  console.log('📱 Solicitando código QR...');
  socket.emit('get-qr', { 
    token: 'test-token' // Reemplaza con un token real
  });
});

socket.on('qr-code', (qr) => {
  console.log('✅ QR recibido!');
  console.log('   - Longitud:', qr.length, 'caracteres');
  console.log('   - Tipo: Imagen base64');
  
  // Guardar QR para visualización
  const html = \`<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp QR Test</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
        img { max-width: 300px; border: 2px solid #25D366; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>🔐 WhatsApp QR Code</h1>
    <img src="\${qr}" alt="WhatsApp QR Code" />
    <p>Escanea este código con WhatsApp</p>
</body>
</html>\`;
  
  fs.writeFileSync('test-qr.html', html);
  console.log('   - QR guardado como: test-qr.html');
  console.log('   - Abre el archivo en tu navegador para escanear');
});

socket.on('whatsapp-connected', (data) => {
  console.log('✅ WhatsApp conectado!');
  console.log('   - Usuario:', data.user);
  console.log('   - Teléfono:', data.phone);
});

socket.on('error', (error) => {
  console.error('❌ Error:', error);
});

socket.on('disconnect', () => {
  console.log('❌ Desconectado del servidor');
});

// Timeout después de 30 segundos
setTimeout(() => {
  console.log('⏰ Timeout alcanzado');
  socket.disconnect();
  process.exit(0);
}, 30000);
`;

fs.writeFileSync('test-whatsapp-qr.js', testScript);
console.log('   ✅ Script de prueba creado: test-whatsapp-qr.js');

// 7. Recomendaciones
console.log('\n💡 7. Recomendaciones para solucionar problemas:');
console.log('   📋 Si el QR no se genera:');
console.log('      1. Verifica que el servidor esté ejecutándose en el puerto 5001');
console.log('      2. Asegúrate de tener un token JWT válido');
console.log('      3. Revisa los logs del servidor para errores');
console.log('      4. Verifica que no haya sesiones activas previas');
console.log('');
console.log('   🔧 Comandos útiles:');
console.log('      - Iniciar servidor: npm start');
console.log('      - Probar QR: node test-whatsapp-qr.js');
console.log('      - Ver logs: tail -f backend.log');
console.log('      - Limpiar sesiones: rm -rf auth/*');
console.log('');
console.log('   🐛 Problemas comunes:');
console.log('      - Puerto ocupado: Cambia el puerto en .env');
console.log('      - Permisos: chmod 755 auth/');
console.log('      - Dependencias: npm install');
console.log('      - Sesiones colgadas: Reinicia el servidor');

console.log('\n✅ Diagnóstico completado!');
console.log('📝 Revisa los resultados arriba y sigue las recomendaciones.');
