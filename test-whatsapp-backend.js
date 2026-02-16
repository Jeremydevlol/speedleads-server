// client-test.js
import fs from 'fs';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5001');

const userId = 'terminal-test-user';

socket.on('connect', () => {
  console.log(`🧩 Conectado como socket ${socket.id}`);
  socket.emit('join', { userId });
});

socket.on('qr-code', (qr) => {
  console.log('📸 QR recibido (imagen en base64). También puedes abrirlo en un navegador si lo guardas como .html');
  fs.writeFileSync('qr-terminal.html', `<img src="${qr}" />`);
});

socket.on('session-ready', () => {
  console.log('✅ Sesión de WhatsApp lista');
});

socket.on('session-closed', (reason) => {
  console.warn('🔌 Sesión cerrada:', reason);
});

socket.on('error-message', (msg) => {
  console.error('❌ Error recibido:', msg);
});

