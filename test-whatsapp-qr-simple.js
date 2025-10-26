#!/usr/bin/env node

/**
 * 🧪 Prueba Simple de Generación de QR de WhatsApp
 */

import fetch from 'node-fetch';

console.log('🧪 Probando generación de QR de WhatsApp...\n');

// Función para hacer petición al endpoint de QR
async function testQrGeneration() {
  try {
    console.log('📡 Haciendo petición a /api/whatsapp/qr...');
    
    // Primero necesitamos un token JWT válido
    // Por ahora vamos a probar sin autenticación para ver qué error obtenemos
    const response = await fetch('http://localhost:5001/api/whatsapp/qr', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': 'Bearer tu-token-jwt-aqui'
      }
    });
    
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    
    const data = await response.json();
    console.log('📄 Respuesta del servidor:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.success && data.data && data.data.qr) {
      console.log('\n✅ ¡QR generado exitosamente!');
      console.log(`   - Longitud del QR: ${data.data.qr.length} caracteres`);
      console.log('   - El QR está en formato base64');
      
      // Guardar QR como HTML para visualización
      const html = `<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp QR Test</title>
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
        }
        img { 
            max-width: 300px; 
            border: 2px solid #25D366; 
            border-radius: 5px;
        }
        h1 { color: #25D366; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 WhatsApp QR Code</h1>
        <p>Escanea este código con WhatsApp</p>
        <img src="${data.data.qr}" alt="WhatsApp QR Code" />
        <p><small>Este código expira en 3 minutos</small></p>
    </div>
</body>
</html>`;
      
      const fs = await import('fs');
      fs.writeFileSync('whatsapp-qr-test.html', html);
      console.log('   - QR guardado como: whatsapp-qr-test.html');
      console.log('   - Abre el archivo en tu navegador para escanear');
      
    } else if (data.success && data.connected) {
      console.log('\n✅ WhatsApp ya está conectado');
      console.log('   - No se necesita QR');
      
    } else {
      console.log('\n❌ Error en la generación del QR:');
      console.log(`   - Mensaje: ${data.message || 'Sin mensaje'}`);
      console.log(`   - Success: ${data.success}`);
      console.log(`   - Connected: ${data.connected || false}`);
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

// Función para probar con autenticación (necesitarás un token real)
async function testWithAuth() {
  console.log('\n🔐 Probando con autenticación...');
  console.log('   - Necesitas un token JWT válido para esta prueba');
  console.log('   - Puedes obtenerlo desde tu frontend o crear uno de prueba');
}

// Ejecutar pruebas
console.log('🚀 Iniciando pruebas...\n');
await testQrGeneration();
await testWithAuth();

console.log('\n📋 Resumen:');
console.log('   1. Si obtuviste un error 401, necesitas autenticación');
console.log('   2. Si obtuviste un error 500, hay un problema en el servidor');
console.log('   3. Si obtuviste success: true, el QR se generó correctamente');
console.log('   4. Si obtuviste connected: true, WhatsApp ya está conectado');
