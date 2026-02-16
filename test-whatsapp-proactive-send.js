#!/usr/bin/env node

/**
 * Script de prueba para envío proactivo de mensajes WhatsApp
 * 
 * Uso:
 * 1. Asegúrate de que el backend esté corriendo
 * 2. Configura tu JWT token
 * 3. Ejecuta: node test-whatsapp-proactive-send.js
 */

import io from 'socket.io-client';

// Configuración
const BACKEND_URL = 'http://localhost:5001';
const JWT_TOKEN = 'tu-jwt-token-aqui'; // Reemplaza con tu token real
const TEST_PHONE = '612345678'; // Número de prueba (será normalizado automáticamente)

// Crear conexión Socket.IO
const socket = io(BACKEND_URL);

console.log('🚀 Iniciando prueba de envío proactivo de WhatsApp...\n');

// Eventos del socket
socket.on('connect', () => {
  console.log('✅ Conectado al servidor');
  
  // Unirse al room del usuario
  socket.emit('join', { token: JWT_TOKEN });
});

socket.on('session-ready', () => {
  console.log('✅ Sesión de WhatsApp lista');
  console.log('📱 Enviando mensaje de prueba...\n');
  
  // Enviar mensaje proactivo usando el nuevo evento
  socket.emit('send-to-number', {
    token: JWT_TOKEN,
    to: TEST_PHONE,
    text: '¡Hola! Este es un mensaje proactivo de prueba 🚀',
    defaultCountry: '34' // España
  });
});

socket.on('message-sent', (data) => {
  console.log('✅ Mensaje enviado exitosamente:');
  console.log('   📞 JID normalizado:', data.normalizedJid);
  console.log('   💬 ID Conversación:', data.conversationId);
  console.log('   📨 ID Mensaje:', data.messageId);
  console.log('\n🎉 Prueba completada exitosamente!');
  
  process.exit(0);
});

socket.on('error', (error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

socket.on('error-message', (error) => {
  console.error('❌ Error del servidor:', error);
  process.exit(1);
});

socket.on('qr-code', (qr) => {
  console.log('📱 Código QR recibido. Escanéalo con WhatsApp para conectar.');
  console.log('   Luego el script continuará automáticamente...\n');
});

// Timeout de seguridad
setTimeout(() => {
  console.log('⏰ Timeout: La prueba tardó demasiado');
  process.exit(1);
}, 60000); // 60 segundos

// Manejo de errores
process.on('uncaughtException', (error) => {
  console.error('❌ Error no controlado:', error.message);
  process.exit(1);
});

console.log('⏳ Esperando conexión con WhatsApp...');
console.log('   Si es la primera vez, necesitarás escanear el código QR');
console.log('   Si ya estás conectado, el mensaje se enviará automáticamente\n');
