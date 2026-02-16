import fs from 'fs';
import io from 'socket.io-client';

// Configuración
const SERVER_URL = 'http://localhost:5001';
const TEST_TOKEN = 'your-test-jwt-token-here'; // Reemplaza con un token válido

// Crear cliente Socket.IO
const socket = io(SERVER_URL, {
  transports: ['websocket'],
  auth: {
    token: TEST_TOKEN
  }
});

console.log('🚀 Iniciando prueba completa de WhatsApp...\n');

// Eventos de conexión
socket.on('connect', () => {
  console.log('✅ Conectado al servidor Socket.IO');
  
  // Unirse al chat del usuario
  socket.emit('join', { token: TEST_TOKEN });
});

socket.on('disconnect', () => {
  console.log('❌ Desconectado del servidor');
});

socket.on('connect_error', (error) => {
  console.error('❌ Error de conexión:', error.message);
});

// Eventos de WhatsApp
socket.on('qr-code', (qr) => {
  console.log('📱 Código QR recibido!');
  console.log('   - Tipo: Imagen base64');
  console.log('   - Longitud:', qr.length, 'caracteres');
  
  // Guardar QR como HTML para visualización
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp QR Code</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 20px;
            background: #f0f0f0;
        }
        .qr-container {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            display: inline-block;
        }
        h1 { color: #25D366; }
        .instructions {
            margin: 20px 0;
            color: #666;
        }
        img { 
            max-width: 300px; 
            border: 2px solid #25D366;
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <div class="qr-container">
        <h1>🔐 WhatsApp QR Code</h1>
        <div class="instructions">
            <p>📱 Abre WhatsApp en tu teléfono</p>
            <p>📷 Ve a Configuración > Dispositivos vinculados</p>
            <p>🔗 Escanea este código QR</p>
        </div>
        <img src="${qr}" alt="WhatsApp QR Code" />
        <p><small>Este código expira en 3 minutos</small></p>
    </div>
</body>
</html>`;
  
  fs.writeFileSync('whatsapp-qr.html', htmlContent);
  console.log('   - QR guardado como: whatsapp-qr.html');
  console.log('   - Abre el archivo en tu navegador para escanear');
});

socket.on('contacts-loaded', (data) => {
  if (data.success) {
    console.log('👥 Contactos cargados exitosamente!');
    console.log(`   - Total de contactos: ${data.total}`);
    
    if (data.contacts && data.contacts.length > 0) {
      console.log('\n📋 Lista de contactos:');
      data.contacts.forEach((contact, index) => {
        const unreadBadge = contact.unreadCount > 0 ? ` [${contact.unreadCount}📱]` : '';
        const lastMsg = contact.lastMessage ? contact.lastMessage.substring(0, 50) : 'Sin mensajes';
        console.log(`   ${index + 1}. ${contact.name} (${contact.phone})${unreadBadge}`);
        console.log(`      Último mensaje: ${lastMsg}`);
      });
    } else {
      console.log('   - No hay contactos disponibles');
    }
  } else {
    console.log('❌ Error cargando contactos:', data.message);
  }
});

socket.on('session-ready', (data) => {
  console.log('✅ Sesión de WhatsApp lista!');
  console.log('   - WhatsApp está conectado y funcionando');
  console.log('   - Puedes enviar y recibir mensajes');
});

socket.on('session-closed', (data) => {
  console.log('🔒 Sesión de WhatsApp cerrada:', data.reason);
});

socket.on('chats-updated', () => {
  console.log('💬 Lista de chats actualizada');
});

socket.on('contact-progress', (data) => {
  console.log(`📱 Sincronizando contactos: ${data.processed}/${data.total}`);
});

socket.on('open-dialog', () => {
  console.log('🔄 Iniciando sincronización de mensajes...');
});

socket.on('close-dialog', () => {
  console.log('✅ Sincronización completada');
});

socket.on('analyzing-media', (data) => {
  console.log(`🔍 Analizando media: ${data.type} en conversación ${data.conversationId}`);
});

socket.on('media-analyzed', (data) => {
  console.log(`✅ Media analizada: ${data.type} - ${data.result}`);
});

socket.on('media-analysis-error', (data) => {
  console.log(`❌ Error analizando media: ${data.type} - ${data.error}`);
});

// Eventos de respuesta
socket.on('message-sent', (data) => {
  console.log('✅ Mensaje enviado exitosamente');
  console.log('   - Conversación:', data.conversationId);
});

socket.on('error-message', (message) => {
  console.error('❌ Error:', message);
});

socket.on('error', (message) => {
  console.error('❌ Error:', message);
});

// Función para solicitar QR
function requestQR() {
  console.log('\n📱 Solicitando código QR...');
  socket.emit('get-qr', { token: TEST_TOKEN });
}

// Función para solicitar contactos
function requestContacts() {
  console.log('\n👥 Solicitando contactos...');
  socket.emit('get-contacts', { token: TEST_TOKEN });
}

// Función para enviar mensaje de prueba
function sendTestMessage() {
  const testData = {
    token: TEST_TOKEN,
    conversationId: '1234567890@s.whatsapp.net', // Reemplaza con un ID real
    textContent: 'Hola! Este es un mensaje de prueba desde el backend.',
    attachments: []
  };
  
  console.log('\n💬 Enviando mensaje de prueba...');
  socket.emit('send-message', testData);
}

// Función para obtener conversaciones
async function getConversations() {
  try {
    const response = await fetch(`${SERVER_URL}/api/whatsapp/get_conversations`, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log('\n📋 Conversaciones obtenidas:');
    console.log('   - Total:', data.conversations?.length || 0);
    
    if (data.conversations && data.conversations.length > 0) {
      data.conversations.forEach((conv, index) => {
        console.log(`   ${index + 1}. ${conv.contact_name} (${conv.external_id})`);
      });
    }
  } catch (error) {
    console.error('❌ Error obteniendo conversaciones:', error.message);
  }
}

// Función para obtener mensajes de una conversación
async function getMessages(conversationId) {
  try {
    const response = await fetch(`${SERVER_URL}/api/whatsapp/get_messages?conversationId=${conversationId}`, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log(`\n💬 Mensajes de ${conversationId}:`);
    console.log('   - Total:', data.messages?.length || 0);
    
    if (data.messages && data.messages.length > 0) {
      data.messages.slice(-5).forEach((msg, index) => {
        const time = new Date(msg.created_at).toLocaleTimeString();
        console.log(`   ${index + 1}. [${time}] ${msg.sender_type}: ${msg.text_content}`);
      });
    }
  } catch (error) {
    console.error('❌ Error obteniendo mensajes:', error.message);
  }
}

// Función para obtener contactos via API REST
async function getContactsAPI() {
  try {
    const response = await fetch(`${SERVER_URL}/api/whatsapp/get_contacts`, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log('\n👥 Contactos obtenidos via API:');
    console.log('   - Total:', data.contacts?.length || 0);
    
    if (data.contacts && data.contacts.length > 0) {
      data.contacts.forEach((contact, index) => {
        const unreadBadge = contact.unreadCount > 0 ? ` [${contact.unreadCount}📱]` : '';
        const lastMsg = contact.lastMessage ? contact.lastMessage.substring(0, 50) : 'Sin mensajes';
        console.log(`   ${index + 1}. ${contact.name} (${contact.phone})${unreadBadge}`);
        console.log(`      Último mensaje: ${lastMsg}`);
      });
    } else {
      console.log('   - No hay contactos disponibles');
    }
  } catch (error) {
    console.error('❌ Error obteniendo contactos via API:', error.message);
  }
 }

// Función para probar la API REST del QR
async function testQRApi() {
  try {
    console.log('\n🔍 Probando API REST del QR...');
    const response = await fetch(`${SERVER_URL}/api/whatsapp/qr`, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log('   - Respuesta API:', data.success ? '✅' : '❌');
    console.log('   - Mensaje:', data.message);
    console.log('   - Conectado:', data.connected ? 'Sí' : 'No');
    
    if (data.data?.qr) {
      console.log('   - QR disponible: Sí');
    } else {
      console.log('   - QR disponible: No');
    }
  } catch (error) {
    console.error('❌ Error en API QR:', error.message);
  }
}

// Menú interactivo
function showMenu() {
  console.log('\n📋 MENÚ DE PRUEBAS:');
  console.log('1. Solicitar código QR');
  console.log('2. Obtener conversaciones');
  console.log('3. Obtener mensajes de conversación');
  console.log('4. Probar API REST del QR');
  console.log('5. Enviar mensaje de prueba');
  console.log('6. Solicitar contactos (Socket.IO)');
  console.log('7. Obtener contactos (API REST)');
  console.log('8. Salir');
  console.log('\nSelecciona una opción (1-8):');
}

// Manejo de entrada del usuario
process.stdin.on('data', (data) => {
  const input = data.toString().trim();
  
  switch (input) {
    case '1':
      requestQR();
      break;
    case '2':
      getConversations();
      break;
    case '3':
      const convId = '1234567890@s.whatsapp.net'; // Reemplaza con un ID real
      getMessages(convId);
      break;
    case '4':
      testQRApi();
      break;
    case '5':
      sendTestMessage();
      break;
    case '6':
      console.log('\n👋 Cerrando prueba...');
      socket.disconnect();
      process.exit(0);
      break;
    default:
      console.log('❌ Opción inválida. Selecciona 1-6.');
  }
  
  setTimeout(showMenu, 1000);
});

// Iniciar menú después de conectar
socket.on('connect', () => {
  setTimeout(() => {
    showMenu();
  }, 1000);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error);
  process.exit(1);
});

console.log('💡 Instrucciones:');
console.log('   - Asegúrate de que el servidor esté ejecutándose en', SERVER_URL);
console.log('   - Reemplaza TEST_TOKEN con un JWT válido');
console.log('   - Usa el menú interactivo para probar diferentes funcionalidades');
console.log('   - El código QR se guardará como whatsapp-qr.html\n');
