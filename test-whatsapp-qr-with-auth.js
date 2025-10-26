#!/usr/bin/env node

/**
 * 🧪 Prueba de Generación de QR de WhatsApp con Autenticación
 */

import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

console.log('🧪 Probando generación de QR de WhatsApp con autenticación...\n');

// Configuración
const JWT_SECRET = process.env.JWT_SECRET || 'tu-secret-key-aqui';
const API_BASE_URL = 'http://localhost:5001';

// Función para generar un token JWT de prueba
function generateTestToken(userId = 'test-user-123') {
  const payload = {
    userId: userId,
    sub: userId,
    id: userId,
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hora
  };
  
  return jwt.sign(payload, JWT_SECRET);
}

// Función para probar la generación del QR
async function testQrWithAuth() {
  try {
    console.log('🔐 Generando token JWT de prueba...');
    const token = generateTestToken();
    console.log(`   - Token generado: ${token.substring(0, 50)}...`);
    
    console.log('\n📡 Haciendo petición autenticada a /api/whatsapp/qr...');
    
    const response = await fetch(`${API_BASE_URL}/api/whatsapp/qr`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    
    const data = await response.json();
    console.log('\n📄 Respuesta del servidor:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.success && data.data && data.data.qr) {
      console.log('\n✅ ¡QR generado exitosamente!');
      console.log(`   - Longitud del QR: ${data.data.qr.length} caracteres`);
      console.log('   - El QR está en formato base64');
      
      // Guardar QR como HTML para visualización
      const html = `<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp QR Test - Autenticado</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 20px; 
            background: #f0f0f0;
        }
        .container {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            display: inline-block;
            max-width: 500px;
        }
        img { 
            max-width: 300px; 
            border: 2px solid #25D366; 
            border-radius: 5px;
        }
        h1 { color: #25D366; }
        .status { 
            background: #e8f5e8; 
            padding: 10px; 
            border-radius: 5px; 
            margin: 10px 0;
        }
        .instructions {
            text-align: left;
            margin: 20px 0;
        }
        .instructions li {
            margin: 5px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 WhatsApp QR Code</h1>
        <div class="status">
            <strong>✅ Autenticación exitosa</strong><br>
            Usuario: test-user-123
        </div>
        <div class="instructions">
            <h3>📱 Instrucciones:</h3>
            <ol>
                <li>Abre WhatsApp en tu teléfono</li>
                <li>Ve a Configuración > Dispositivos vinculados</li>
                <li>Escanea este código QR</li>
                <li>Espera a que se complete la vinculación</li>
            </ol>
        </div>
        <img src="${data.data.qr}" alt="WhatsApp QR Code" />
        <p><small>Este código expira en 3 minutos</small></p>
        <div class="status">
            <strong>🔗 Estado:</strong> ${data.connected ? 'Conectado' : 'Esperando escaneo'}
        </div>
    </div>
</body>
</html>`;
      
      const fs = await import('fs');
      fs.writeFileSync('whatsapp-qr-authenticated.html', html);
      console.log('   - QR guardado como: whatsapp-qr-authenticated.html');
      console.log('   - Abre el archivo en tu navegador para escanear');
      
    } else if (data.success && data.connected) {
      console.log('\n✅ WhatsApp ya está conectado');
      console.log('   - No se necesita QR');
      console.log('   - El usuario ya tiene una sesión activa');
      
    } else {
      console.log('\n❌ Error en la generación del QR:');
      console.log(`   - Mensaje: ${data.message || 'Sin mensaje'}`);
      console.log(`   - Success: ${data.success}`);
      console.log(`   - Connected: ${data.connected || false}`);
      
      if (data.needsQr) {
        console.log('   - El sistema indica que necesita un QR');
      }
    }
    
  } catch (error) {
    console.error('❌ Error en la petición:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('   - El servidor no está ejecutándose en el puerto 5001');
      console.log('   - Ejecuta: npm start');
    } else if (error.code === 'ENOTFOUND') {
      console.log('   - No se puede resolver localhost');
    } else {
      console.log('   - Error de red o del servidor');
    }
  }
}

// Función para probar el estado de conexión
async function testConnectionStatus() {
  try {
    console.log('\n🔍 Probando estado de conexión...');
    
    const token = generateTestToken();
    const response = await fetch(`${API_BASE_URL}/api/whatsapp/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('📊 Estado de conexión:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`   - Endpoint de estado no disponible (${response.status})`);
    }
    
  } catch (error) {
    console.log(`   - Error verificando estado: ${error.message}`);
  }
}

// Función para limpiar sesiones existentes
async function clearExistingSessions() {
  try {
    console.log('\n🧹 Limpiando sesiones existentes...');
    
    const token = generateTestToken();
    const response = await fetch(`${API_BASE_URL}/api/whatsapp/disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Sesiones limpiadas:', data.message);
    } else {
      console.log('   - No se pudo limpiar sesiones (puede ser normal)');
    }
    
  } catch (error) {
    console.log(`   - Error limpiando sesiones: ${error.message}`);
  }
}

// Ejecutar pruebas
console.log('🚀 Iniciando pruebas con autenticación...\n');

// Primero limpiar sesiones existentes
await clearExistingSessions();

// Luego probar la generación del QR
await testQrWithAuth();

// Finalmente verificar el estado
await testConnectionStatus();

console.log('\n📋 Resumen:');
console.log('   1. Si obtuviste un QR, el sistema está funcionando correctamente');
console.log('   2. Si obtuviste "ya conectado", hay una sesión activa previa');
console.log('   3. Si obtuviste un error, revisa los logs del servidor');
console.log('   4. El archivo HTML generado te permitirá escanear el QR');
