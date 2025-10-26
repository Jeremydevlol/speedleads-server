#!/usr/bin/env node

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
  const html = `<!DOCTYPE html>
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
    <img src="${qr}" alt="WhatsApp QR Code" />
    <p>Escanea este código con WhatsApp</p>
</body>
</html>`;
  
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
