# 🚀 Guía de Implementación del Sistema de WhatsApp

## 📋 Resumen

Este sistema implementa WhatsApp Web completo en el backend, incluyendo:
- ✅ Generación de códigos QR para vincular WhatsApp
- ✅ Manejo de sesiones por usuario
- ✅ Recepción y envío de mensajes
- ✅ Sincronización de contactos y conversaciones
- ✅ Almacenamiento en base de datos
- ✅ Integración con Socket.IO para tiempo real

## 🏗️ Arquitectura del Sistema

### Componentes Principales

1. **WhatsApp Service** (`dist/services/whatsappService.js`)
   - Maneja las sesiones de WhatsApp por usuario
   - Genera y cachea códigos QR
   - Sincroniza contactos y mensajes
   - Emite eventos en tiempo real

2. **WhatsApp Controller** (`dist/controllers/whatsappController.js`)
   - API REST para operaciones de WhatsApp
   - Manejo de mensajes entrantes y salientes
   - Gestión de conversaciones

3. **Socket.IO Integration** (`dist/app.js`)
   - Comunicación en tiempo real
   - Eventos de WhatsApp (QR, conexión, mensajes)

4. **Base de Datos**
   - Tabla `conversations_new`: Conversaciones de WhatsApp
   - Tabla `messages_new`: Mensajes individuales

## 🔧 Configuración Inicial

### 1. Variables de Entorno Requeridas

```bash
# Base de datos
DATABASE_URL=postgresql://user:password@localhost:5432/database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT
JWT_SECRET=your-jwt-secret

# WhatsApp (opcional, para configuración avanzada)
WHATSAPP_SESSION_TIMEOUT=180000
WHATSAPP_MAX_RETRIES=3
```

### 2. Dependencias del Proyecto

```json
{
  "@whiskeysockets/baileys": "^6.6.0",
  "qrcode": "^1.5.3",
  "socket.io": "^4.7.4",
  "pg": "^8.11.3"
}
```

## 📱 Flujo de Conexión de WhatsApp

### Paso 1: Solicitar Código QR

```javascript
// Cliente solicita QR
socket.emit('get-qr', { token: 'jwt-token' });

// Servidor responde con QR
socket.on('qr-code', (qr) => {
  // qr es una imagen base64
  displayQRCode(qr);
});
```

### Paso 2: Escanear QR

1. El usuario abre WhatsApp en su teléfono
2. Va a **Configuración > Dispositivos vinculados**
3. Escanea el código QR mostrado en la aplicación

### Paso 3: Conexión Establecida

```javascript
socket.on('session-ready', (data) => {
  console.log('WhatsApp conectado!');
  // Ahora puedes enviar/recibir mensajes
});
```

## 🔌 API Endpoints

### 1. Obtener Código QR

```http
GET /api/whatsapp/qr
Authorization: Bearer <jwt-token>

Response:
{
  "success": true,
  "message": "Escanea este código QR con WhatsApp",
  "connected": false,
  "data": {
    "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  }
}
```

### 2. Obtener Conversaciones

```http
GET /api/whatsapp/get_conversations
Authorization: Bearer <jwt-token>

Response:
{
  "success": true,
  "conversations": [
    {
      "id": "uuid",
      "external_id": "1234567890@s.whatsapp.net",
      "contact_name": "Juan Pérez",
      "contact_photo_url": "https://...",
      "started_at": "2025-01-20T10:00:00Z",
      "unread_count": 2
    }
  ]
}
```

### 3. Obtener Mensajes

```http
GET /api/whatsapp/get_messages?conversationId=1234567890@s.whatsapp.net
Authorization: Bearer <jwt-token>

Response:
{
  "success": true,
  "messages": [
    {
      "id": "uuid",
      "sender_type": "user",
      "message_type": "text",
      "text_content": "Hola, ¿cómo estás?",
      "created_at": "2025-01-20T10:00:00Z"
    }
  ]
}
```

## 📡 Eventos de Socket.IO

### Eventos del Cliente al Servidor

| Evento | Descripción | Parámetros |
|--------|-------------|------------|
| `join` | Unirse al chat del usuario | `{ token: "jwt" }` |
| `get-qr` | Solicitar código QR | `{ token: "jwt" }` |
| `send-message` | Enviar mensaje | `{ token, conversationId, textContent, attachments }` |

### Eventos del Servidor al Cliente

| Evento | Descripción | Datos |
|--------|-------------|-------|
| `qr-code` | Código QR disponible | `"data:image/png;base64,..."` |
| `session-ready` | WhatsApp conectado | `{ success: true }` |
| `session-closed` | Sesión cerrada | `{ reason: "logged_out" }` |
| `chats-updated` | Lista de chats actualizada | - |
| `message-sent` | Mensaje enviado exitosamente | `{ success: true, conversationId }` |
| `error` | Error en operación | `"mensaje de error"` |

## 💾 Estructura de la Base de Datos

### Tabla: conversations_new

```sql
CREATE TABLE conversations_new (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  external_id TEXT NOT NULL, -- ID de WhatsApp (ej: 1234567890@s.whatsapp.net)
  contact_name TEXT,
  contact_photo_url TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  wa_user_id TEXT, -- Número de teléfono del usuario de WhatsApp
  ai_active BOOLEAN DEFAULT FALSE,
  personality_id UUID REFERENCES personalities(id),
  no_ac_ai BOOLEAN DEFAULT FALSE,
  unread_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla: messages_new

```sql
CREATE TABLE messages_new (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations_new(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  sender_type TEXT NOT NULL, -- 'user', 'ai', 'system'
  message_type TEXT NOT NULL, -- 'text', 'image', 'audio', 'video', 'document'
  text_content TEXT,
  media_url TEXT,
  interactions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🚀 Implementación en el Frontend

### 1. Conexión al Socket

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5001', {
  transports: ['websocket']
});

// Autenticación
socket.emit('join', { token: 'jwt-token' });
```

### 2. Solicitar Código QR

```javascript
function requestQR() {
  socket.emit('get-qr', { token: 'jwt-token' });
}

socket.on('qr-code', (qr) => {
  // Mostrar QR en la interfaz
  const qrImage = document.createElement('img');
  qrImage.src = qr;
  document.getElementById('qr-container').appendChild(qrImage);
});
```

### 3. Manejar Estado de Conexión

```javascript
socket.on('session-ready', () => {
  document.getElementById('status').textContent = 'WhatsApp Conectado';
  document.getElementById('qr-container').style.display = 'none';
  document.getElementById('chat-interface').style.display = 'block';
});

socket.on('session-closed', (data) => {
  document.getElementById('status').textContent = 'WhatsApp Desconectado';
  document.getElementById('qr-container').style.display = 'block';
  document.getElementById('chat-interface').style.display = 'none';
});
```

### 4. Enviar Mensajes

```javascript
function sendMessage(conversationId, text) {
  socket.emit('send-message', {
    token: 'jwt-token',
    conversationId: conversationId,
    textContent: text,
    attachments: []
  });
}

socket.on('message-sent', (data) => {
  console.log('Mensaje enviado:', data);
});
```

## 🧪 Pruebas del Sistema

### 1. Archivo de Prueba

Usa el archivo `test-whatsapp-complete.js` para probar todas las funcionalidades:

```bash
# Instalar dependencias
npm install socket.io-client

# Ejecutar prueba
node test-whatsapp-complete.js
```

### 2. Verificar Funcionamiento

1. **Servidor ejecutándose**: Puerto 5001
2. **Token JWT válido**: Reemplazar en `TEST_TOKEN`
3. **Base de datos**: Tablas creadas y accesibles
4. **Dependencias**: Todas instaladas correctamente

## 🔒 Seguridad y Consideraciones

### 1. Autenticación
- Todos los endpoints requieren JWT válido
- Las sesiones de WhatsApp están aisladas por usuario
- No hay acceso cruzado entre usuarios

### 2. Rate Limiting
- Límite de 5 conexiones simultáneas por usuario
- Cache de QR por 3 minutos
- Reintentos automáticos en caso de error

### 3. Manejo de Errores
- Reconexión automática en caso de desconexión
- Logs detallados para debugging
- Fallbacks para operaciones críticas

## 🐛 Solución de Problemas

### Problema: QR no se genera

**Causas posibles:**
- Sesión ya activa
- Error en la inicialización de Baileys
- Problemas de permisos en el directorio de auth

**Solución:**
```javascript
// Verificar estado de la sesión
const session = sessions.get(userId);
if (session && session.user) {
  console.log('Ya conectado');
} else {
  // Forzar nueva sesión
  await startSession(userId);
}
```

### Problema: Mensajes no se envían

**Causas posibles:**
- Sesión no conectada
- ID de conversación incorrecto
- Error en la base de datos

**Solución:**
```javascript
// Verificar conexión
if (!sessions.has(userId)) {
  await startSession(userId);
}

// Verificar conversación
const conversation = await getConversation(conversationId, userId);
if (!conversation) {
  throw new Error('Conversación no encontrada');
}
```

### Problema: Socket.IO no funciona

**Causas posibles:**
- CORS mal configurado
- Puerto incorrecto
- Problemas de red

**Solución:**
```javascript
// Verificar configuración CORS
const io = new SocketIOServer(server, {
  cors: {
    origin: ['http://localhost:3000'],
    credentials: true
  }
});
```

## 📈 Monitoreo y Logs

### 1. Logs del Sistema

```javascript
// Habilitar logs detallados
const logger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty'
  }
});
```

### 2. Métricas de Rendimiento

- Número de sesiones activas
- Tiempo de respuesta de mensajes
- Tasa de éxito de envío
- Uso de memoria por sesión

### 3. Alertas

- Sesiones que fallan al reconectar
- Errores de base de datos
- Tiempo de respuesta alto
- Uso excesivo de memoria

## 🚀 Despliegue en Producción

### 1. Variables de Entorno

```bash
NODE_ENV=production
PORT=5001
DATABASE_URL=postgresql://...
JWT_SECRET=strong-secret-key
```

### 2. Proceso Manager

```bash
# Usar PM2 para producción
npm install -g pm2
pm2 start app.js --name "whatsapp-api"
pm2 startup
pm2 save
```

### 3. Monitoreo

```bash
# Monitorear procesos
pm2 monit

# Ver logs
pm2 logs whatsapp-api

# Reiniciar en caso de problemas
pm2 restart whatsapp-api
```

## 📚 Recursos Adicionales

- [Documentación de Baileys](https://github.com/WhiskeySockets/Baileys)
- [Socket.IO Documentation](https://socket.io/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## 🤝 Soporte

Para problemas o preguntas:
1. Revisar logs del servidor
2. Verificar configuración de base de datos
3. Comprobar variables de entorno
4. Revisar conectividad de red

---

**¡El sistema de WhatsApp está listo para usar! 🎉**
