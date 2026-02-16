# 📱 Guía de Envío de Mensajes WhatsApp

## 🎯 Resumen

Tu sistema **YA TIENE** la capacidad de enviar mensajes de WhatsApp, pero ahora hemos agregado **endpoints REST** para facilitar el envío desde cualquier aplicación.

## 🚀 Endpoints Mejorados Disponibles

### 1. Enviar a Conversación Existente

**Endpoint:** `POST /api/whatsapp/send_message`

```bash
curl -X POST http://localhost:5001/api/whatsapp/send_message \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "1234567890@s.whatsapp.net",
    "textContent": "Hola, este es un mensaje de prueba",
    "senderType": "you"
  }'
```

**Parámetros:**
- `conversationId` (requerido): ID de la conversación existente
- `textContent` (requerido): Texto del mensaje
- `attachments` (opcional): Array de archivos adjuntos
- `senderType` (opcional): "you", "ia", o "user" (default: "you")

### 2. Enviar a Número Específico

**Endpoint:** `POST /api/whatsapp/send_message_to_number`

```bash
curl -X POST http://localhost:5001/api/whatsapp/send_message_to_number \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "612345678",
    "textContent": "Hola, este es un mensaje a un número nuevo",
    "senderType": "you",
    "defaultCountry": "34"
  }'
```

**Parámetros:**
- `phoneNumber` (requerido): Número en cualquier formato (612345678, +34612345678, etc.)
- `textContent` (requerido): Texto del mensaje
- `attachments` (opcional): Array de archivos adjuntos
- `senderType` (opcional): "you", "ia", o "user" (default: "you")
- `defaultCountry` (opcional): Código de país por defecto (default: "34")

### 3. 🆕 Enviar Mensaje Generado por IA

**Endpoint:** `POST /api/whatsapp/send_ai_message`

```bash
curl -X POST http://localhost:5001/api/whatsapp/send_ai_message \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "612345678",
    "prompt": "Envía un saludo amigable como asistente virtual",
    "defaultCountry": "34",
    "personalityId": null
  }'
```

**Parámetros:**
- `phoneNumber` (requerido): Número en cualquier formato
- `prompt` (requerido): Instrucción para que la IA genere el mensaje
- `defaultCountry` (opcional): Código de país por defecto (default: "34")
- `personalityId` (opcional): ID de personalidad específica a usar

## 📋 Respuestas de la API

### Respuesta Exitosa

```json
{
  "success": true,
  "message": "Mensaje enviado exitosamente",
  "data": {
    "success": true,
    "conversationId": "uuid",
    "externalId": "1234567890@s.whatsapp.net",
    "messageId": "whatsapp_message_id"
  }
}
```

### Respuesta de Error

```json
{
  "success": false,
  "message": "No hay sesión activa de WhatsApp"
}
```

## 🎯 Nuevas Características Implementadas

### ✅ **Normalización Automática de Números**
- Acepta cualquier formato: `612345678`, `+34612345678`, `0034612345678`
- Convierte automáticamente a JID de WhatsApp: `34612345678@s.whatsapp.net`
- Soporte para diferentes códigos de país

### ✅ **Rate Limiting Inteligente**
- Límite de 30 mensajes por minuto por usuario
- Previene spam y posibles baneos de WhatsApp
- Mensaje de error informativo con tiempo de espera
- Endpoint para consultar estado: `GET /api/whatsapp/rate_limit_status`
- Limpieza automática de límites expirados

### ✅ **Socket.IO Mejorado**
- Nuevo evento `send-to-number` para envío directo
- Manejo de errores más robusto
- Respuestas detalladas con JID normalizado

### ✅ **Creación Automática de Conversaciones**
- Si no existe la conversación, se crea automáticamente
- Eventos en tiempo real para actualizar la UI
- Guardado completo en base de datos
- Soporte para chats individuales (@s.whatsapp.net) y grupos (@g.us)

### ✅ **Manejo Robusto de Adjuntos**
- Mapeo correcto de tipos MIME (PDFs como 'document', no 'application')
- Validación de datos base64
- Warning cuando se envían múltiples adjuntos
- Soporte para filename y caption

## 🔧 Ejemplos de Uso

### JavaScript/Node.js

```javascript
// Enviar mensaje a conversación existente
async function sendMessageToConversation(conversationId, message) {
  const response = await fetch('/api/whatsapp/send_message', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      conversationId: conversationId,
      textContent: message,
      senderType: 'you'
    })
  });
  
  return await response.json();
}

// Enviar mensaje a número específico
async function sendMessageToNumber(phoneNumber, message) {
  const response = await fetch('/api/whatsapp/send_message_to_number', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phoneNumber: phoneNumber,
      textContent: message,
      senderType: 'you'
    })
  });
  
  return await response.json();
}
```

### Python

```python
import requests

def send_whatsapp_message(conversation_id, message, jwt_token):
    url = "http://localhost:5001/api/whatsapp/send_message"
    headers = {
        "Authorization": f"Bearer {jwt_token}",
        "Content-Type": "application/json"
    }
    data = {
        "conversationId": conversation_id,
        "textContent": message,
        "senderType": "you"
    }
    
    response = requests.post(url, headers=headers, json=data)
    return response.json()

def send_whatsapp_to_number(phone_number, message, jwt_token):
    url = "http://localhost:5001/api/whatsapp/send_message_to_number"
    headers = {
        "Authorization": f"Bearer {jwt_token}",
        "Content-Type": "application/json"
    }
    data = {
        "phoneNumber": phone_number,
        "textContent": message,
        "senderType": "you"
    }
    
    response = requests.post(url, headers=headers, json=data)
    return response.json()
```

## 🎯 Casos de Uso

### 1. **Respuesta Automática de IA**
```javascript
// Cuando recibes un mensaje, puedes responder automáticamente
const aiResponse = await generateAIResponse(userMessage);
await sendMessageToConversation(conversationId, aiResponse);
```

### 2. **Mensajes Proactivos**
```javascript
// Enviar mensajes a clientes sin que hayan iniciado conversación
await sendMessageToNumber("1234567890", "¡Hola! Tenemos una oferta especial para ti");
```

### 3. **Notificaciones del Sistema**
```javascript
// Enviar notificaciones automáticas
await sendMessageToNumber("1234567890", "Tu pedido ha sido procesado");
```

### 4. **Integración con CRM**
```javascript
// Desde tu CRM, enviar mensajes a clientes
const customer = await getCustomerFromCRM(customerId);
await sendMessageToNumber(customer.phone, "Gracias por tu compra");
```

## 🆕 Nuevos Eventos Socket.IO

### Envío Directo a Número

```javascript
// Cliente envía mensaje normal
socket.emit('send-to-number', {
  token: 'jwt-token',
  to: '612345678',
  text: 'Mensaje proactivo',
  defaultCountry: '34'
});

// Cliente envía mensaje generado por IA
socket.emit('send-ai-message', {
  token: 'jwt-token',
  to: '612345678',
  prompt: 'Envía un saludo amigable como asistente virtual',
  defaultCountry: '34',
  personalityId: null
});

// Servidor responde mensaje normal
socket.on('message-sent', (data) => {
  console.log('JID normalizado:', data.normalizedJid);
  console.log('ID Conversación:', data.conversationId);
  console.log('ID Mensaje:', data.messageId);
});

// Servidor responde mensaje IA
socket.on('ai-message-sent', (data) => {
  console.log('Respuesta IA:', data.aiResponse);
  console.log('Prompt usado:', data.aiPrompt);
  console.log('Personalidad:', data.personalityUsed);
  console.log('JID normalizado:', data.normalizedJid);
});
```

## 🧪 Scripts de Prueba

Hemos incluido scripts de prueba para verificar que todo funciona:

### 1. Prueba Socket.IO
```bash
node test-whatsapp-proactive-send.js
```

### 2. Prueba API REST
```bash
node test-whatsapp-rest-api.js
```

### 3. Prueba IA Proactiva
```bash
node test-whatsapp-ai-proactive.js
```

## ⚠️ Consideraciones Importantes

### 1. **Sesión Activa**
- El usuario debe tener WhatsApp conectado (código QR escaneado)
- Verifica que la sesión esté activa antes de enviar

### 2. **Rate Limiting**
- Límite de 30 mensajes por minuto por usuario
- Error informativo si se excede el límite
- Tiempo de espera mostrado en segundos

### 3. **Normalización de Números**
- Acepta cualquier formato de número internacional
- Convierte automáticamente a JID de WhatsApp
- Soporte configurable para código de país por defecto

### 4. **Límites de WhatsApp**
- Respeta los límites de mensajes de WhatsApp
- No envíes spam o mensajes no solicitados
- Calienta números nuevos gradualmente

### 5. **Manejo de Errores**
- Siempre maneja los errores de la API
- Verifica que el mensaje se envió correctamente
- Logs detallados para debugging

## 🔄 Flujo Completo

1. **Usuario escanea QR** → WhatsApp conectado
2. **Aplicación envía mensaje** → Usa endpoint REST
3. **Sistema verifica sesión** → Valida conexión
4. **Mensaje enviado** → A través de WhatsApp Web
5. **Guardado en BD** → Historial completo
6. **Respuesta confirmada** → API retorna éxito

## 🎉 ¡Listo para Usar!

Ahora puedes enviar mensajes de WhatsApp desde cualquier aplicación que pueda hacer peticiones HTTP. El sistema mantiene toda la funcionalidad existente y agrega la flexibilidad de los endpoints REST.

### Próximos Pasos Sugeridos:
1. Probar los endpoints con Postman o curl
2. Integrar en tu aplicación frontend
3. Implementar manejo de errores
4. Agregar validaciones adicionales según tus necesidades
