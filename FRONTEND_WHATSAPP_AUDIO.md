# 🎤 Guía Frontend: Envío de Audios en WhatsApp

## 📋 Resumen

El backend ya soporta el envío de audios en WhatsApp usando ElevenLabs. Solo necesitas agregar el parámetro `send_as_audio: true` en las llamadas a los endpoints de WhatsApp.

## ✅ Cambios Necesarios en el Frontend

### 1. Endpoint: `/api/whatsapp/send_message`

**Ubicación actual:** `app/api/leads/bulk_send/route.ts` (línea 81)

**Cambio necesario:** Agregar `send_as_audio` al body

**Código actual:**
```typescript
const res = await fetch(`${origin}/api/whatsapp/send_message`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    conversationId: l.conversation_id,
    textContent: messageToSend,
    attachments: [],
    senderType: mode === "ai" ? "ia" : "you",
    personalityId: personalityId || undefined,
  }),
})
```

**Código actualizado (con soporte para audio):**
```typescript
const res = await fetch(`${origin}/api/whatsapp/send_message`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    conversationId: l.conversation_id,
    textContent: messageToSend,
    attachments: [],
    senderType: mode === "ai" ? "ia" : "you",
    personalityId: personalityId || undefined,
    send_as_audio: true, // 🆕 Agregar esto para enviar como audio
  }),
})
```

### 2. Endpoint: `/api/whatsapp/send_message_to_number`

**Si tienes algún componente que envíe mensajes a números específicos**, agrega `send_as_audio`:

**Ejemplo:**
```typescript
const res = await fetch(`${origin}/api/whatsapp/send_message_to_number`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    phoneNumber: "34612345678",
    textContent: "Hola! Este es un mensaje de prueba",
    send_as_audio: true, // 🆕 Enviar como audio
    defaultCountry: "34",
  }),
})
```

## 🎨 Opción: Hacerlo Configurable

Si quieres que el usuario pueda elegir entre texto y audio, puedes agregar un parámetro en tu componente:

### Ejemplo con Toggle/Checkbox:

```typescript
// En tu componente o página
const [sendAsAudio, setSendAsAudio] = useState(false);

// En el fetch
const res = await fetch(`${origin}/api/whatsapp/send_message`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    conversationId: conversationId,
    textContent: message,
    attachments: [],
    senderType: "you",
    send_as_audio: sendAsAudio, // 🎛️ Variable del estado
  }),
})
```

### UI Ejemplo (React):

```tsx
<div className="flex items-center gap-2">
  <input
    type="checkbox"
    id="sendAsAudio"
    checked={sendAsAudio}
    onChange={(e) => setSendAsAudio(e.target.checked)}
  />
  <label htmlFor="sendAsAudio">
    🎤 Enviar como audio (usando ElevenLabs)
  </label>
</div>
```

## 📝 Archivos a Modificar

1. **`app/api/leads/bulk_send/route.ts`** - Línea 84-90
   - Agregar `send_as_audio: true` al body

2. **Cualquier componente que llame a `/api/whatsapp/send_message`**
   - Buscar: `fetch('/api/whatsapp/send_message'`
   - Agregar `send_as_audio` al body

3. **Cualquier componente que llame a `/api/whatsapp/send_message_to_number`**
   - Buscar: `fetch('/api/whatsapp/send_message_to_number'`
   - Agregar `send_as_audio` al body

## 🔍 Cómo Encontrar Todos los Lugares

Ejecuta estos comandos en tu proyecto frontend:

```bash
# Buscar todas las llamadas a send_message
grep -r "send_message" app/
grep -r "sendMessage" app/
grep -r "/api/whatsapp" app/
```

## 📊 Parámetros del Endpoint

| Parámetro | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `send_as_audio` | boolean | No | `false` | Si es `true`, genera audio con ElevenLabs y lo envía como audio en WhatsApp |
| `conversationId` | string | Sí | - | ID de la conversación (JID) |
| `textContent` | string | Sí | - | Texto del mensaje (se convertirá a audio si `send_as_audio=true`) |
| `attachments` | array | No | `[]` | Archivos adjuntos (si hay attachments, no se genera audio) |
| `senderType` | string | No | `"you"` | Tipo de remitente: `"you"`, `"ia"`, o `"user"` |

## ✅ Comportamiento

- **Si `send_as_audio: true`**:
  1. El backend genera audio con ElevenLabs
  2. Convierte el texto a audio MP3
  3. Envía el audio a WhatsApp usando Baileys
  4. Si falla, hace fallback automático a texto

- **Si `send_as_audio: false` o no se incluye**:
  - Envía el mensaje como texto normal

- **Si hay `attachments`**:
  - No se genera audio (los attachments tienen prioridad)

## 🧪 Prueba Rápida

Puedes probar directamente desde el backend con curl:

```bash
curl -X POST http://localhost:5001/api/whatsapp/send_message_to_number \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN" \
  -d '{
    "phoneNumber": "34612345678",
    "textContent": "Hola! Este es un mensaje de prueba de audio",
    "send_as_audio": true,
    "defaultCountry": "34"
  }'
```

## 📌 Notas Importantes

1. ✅ El backend ya está listo y funcionando
2. ✅ Solo necesitas agregar `send_as_audio: true` en las llamadas del frontend
3. ✅ El audio se genera automáticamente con ElevenLabs
4. ✅ Si falla, se envía como texto automáticamente (fallback)
5. ✅ No necesitas cambiar nada más en el backend

## 🚀 Implementación Rápida

**Cambio mínimo necesario** en `app/api/leads/bulk_send/route.ts`:

```typescript
// Cambiar línea 84-90 de:
body: JSON.stringify({
  conversationId: l.conversation_id,
  textContent: messageToSend,
  attachments: [],
  senderType: mode === "ai" ? "ia" : "you",
  personalityId: personalityId || undefined,
}),

// A:
body: JSON.stringify({
  conversationId: l.conversation_id,
  textContent: messageToSend,
  attachments: [],
  senderType: mode === "ai" ? "ia" : "you",
  personalityId: personalityId || undefined,
  send_as_audio: true, // 🎤 Enviar como audio
}),
```

¡Eso es todo! 🎉




