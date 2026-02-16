# Guía Frontend – WhatsApp (conexión, contactos, mensajes)

Configuración y eventos que el frontend debe usar para que WhatsApp funcione bien: conexión, carga de contactos, envío de mensajes y diálogos de progreso.

---

## 1. URLs de conexión

- **API REST (HTTP):**  
  `NEXT_PUBLIC_API_URL` o `BACKEND_URL`  
  Ejemplo desarrollo: `http://localhost:5001`  
  Las rutas WhatsApp van bajo: **`/api/whatsapp/...`**

- **Socket.IO (WebSocket):**  
  Mismo host y puerto que la API.  
  Ejemplo desarrollo: `http://localhost:5001`  
  El cliente debe conectar a ese origen (Socket.IO usa ese host por defecto).

Variables recomendadas en el frontend:

```env
NEXT_PUBLIC_API_URL=http://localhost:5001
# Socket: mismo host que la API (ej. io(NEXT_PUBLIC_API_URL))
```

---

## 2. Autenticación

- **REST:** Enviar el JWT en header:  
  `Authorization: Bearer <token>`  
  (o el método que use el backend, p. ej. `x-user-id` en dev si aplica).

- **Socket:** En cada evento que lo requiera, enviar el token en el payload, por ejemplo:  
  `{ token: session.access_token }`  
  También se puede enviar en el handshake:  
  `io(url, { auth: { token: session.access_token } })`.

El backend resuelve el `userId` desde el JWT (incluyendo Supabase si `FORCE_LOGIN=true`).

---

## 3. Flujo de conexión WhatsApp (Socket)

### 3.1 Conectar Socket y unirse a la sala del usuario

1. Conectar: `io(NEXT_PUBLIC_API_URL)` (o la URL del backend).
2. En `connection`, emitir **`join`** con el token para que el backend una el socket a la sala del usuario e inicie la sesión WhatsApp:

```ts
socket.emit('join', { token: session.access_token });
```

El backend hace `socket.join(userId)` y llama a `startSession(userId)`. Sin este paso no llegarán los eventos al usuario.

### 3.2 Obtener / refrescar el código QR

- **Por Socket (recomendado):**  
  Emitir **`get-qr`** con token. El servidor responde con **`qr-code`** (o arranca la sesión si no hay QR en caché).

```ts
socket.emit('get-qr', { token: session.access_token });
socket.on('qr-code', (qr: string) => {
  // Mostrar imagen QR (qr es base64 o string del código)
});
socket.on('error', (msg: string) => {
  // Ej.: "Token no proporcionado o inválido", "Error obteniendo código QR"
});
```

- **Por HTTP (alternativa):**  
  `GET /api/whatsapp/qr`  
  Header: `Authorization: Bearer <token>`.  
  Respuesta: `{ connected: boolean, data: { qr: string | null }, message }`.

### 3.3 Estado de conexión

- **HTTP:**  
  `GET /api/whatsapp/status`  
  Respuesta: `{ connected: boolean, needsQr: boolean, message }`.

- **Socket (eventos del servidor):**
  - **`session-ready`** (payload: `true`): WhatsApp ya está conectado; se puede ocultar el QR y mostrar la app.
  - **`whatsapp-disconnected`** (payload: `{ reason: 'logged_out' | 'connection_closed' }`): se cerró la sesión; mostrar de nuevo el QR o mensaje de reconexión.
  - **`session-closed`**: mismo uso que `whatsapp-disconnected` para cerrar sesión en UI.

---

## 4. Carga de contactos – eventos y endpoints

### 4.1 Cuándo se cargan los contactos

El backend sincroniza contactos cuando:

1. Se abre la conexión WhatsApp (`connection.open`) y luego llegan eventos **`contacts.upsert`** o **`messaging-history.set`**.
2. Hay una “carga manual” desde el store de Baileys unos segundos después de abrir la conexión.

Durante esa sincronización el servidor emite eventos de progreso y al final actualiza la lista.

### 4.2 Eventos Socket que el frontend debe escuchar (contactos)

| Evento (servidor → cliente) | Cuándo | Payload | Uso en frontend |
|-----------------------------|--------|---------|------------------|
| **`open-dialog`** | Empieza la sincronización de contactos (p. ej. en `messaging-history.set`) | (ninguno o objeto vacío) | Mostrar modal/overlay “Sincronizando contactos”. |
| **`contact-progress`** | Cada N contactos procesados (throttled) | `{ total, processed, avatarUrl?, info?, capitalText?, text? }` | Actualizar barra o texto: “Sincronizando contactos”, `text` tipo “50/200”, etc. |
| **`close-dialog`** | Termina la sincronización (siempre, incluso si hay error) | (ninguno) | Cerrar el modal de “Sincronizando contactos”. |
| **`chats-updated`** | Lista de conversaciones/contactos actualizada (tras sync o nuevos mensajes) | (ninguno) | Refrescar lista de chats/contactos (volver a llamar a `GET /api/whatsapp/get_conversations` o `get_contacts`). |

Recomendación:

- Al recibir **`open-dialog`** → mostrar diálogo de progreso.
- En **`contact-progress`** → actualizar `processed/total` y opcionalmente `capitalText`/`text`.
- Al recibir **`close-dialog`** → cerrar el diálogo (siempre; el backend lo emite en `finally`).
- En **`chats-updated`** → pedir de nuevo conversaciones/contactos por API para tener la lista al día.

### 4.3 Obtener la lista de contactos/conversaciones (HTTP)

- **Conversaciones (chats con último mensaje, etc.):**  
  `GET /api/whatsapp/get_conversations`  
  Header: `Authorization: Bearer <token>`.  
  Usar esto para la lista principal del chat.

- **Contactos (lista de contactos sincronizados):**  
  `GET /api/whatsapp/get_contacts`  
  Header: `Authorization: Bearer <token>`.  
  Respuesta: `{ success, contacts, total }`.

### 4.4 Obtener contactos por Socket (opcional)

El servidor tiene el evento **`get-contacts`** (cliente emite, servidor responde):

- Emitir: `socket.emit('get-contacts', { token })`
- Escuchar: `socket.on('contacts-loaded', (data) => { ... })`  
  Payload: `{ success, contacts, total, message? }`.

Si el frontend ya usa **`get_conversations`** o **`get_contacts`** por HTTP y reacciona a **`chats-updated`**, no es obligatorio usar `get-contacts` por Socket.

---

## 5. Resumen de eventos Socket (servidor → cliente)

| Evento | Descripción |
|--------|-------------|
| **`qr-code`** | Código QR para vincular WhatsApp (mostrar y refrescar hasta que llegue `session-ready`). |
| **`session-ready`** | WhatsApp conectado; ocultar QR y permitir uso de la app. |
| **`whatsapp-disconnected`** | Sesión cerrada (`reason`: `logged_out` \| `connection_closed`). |
| **`session-closed`** | Igual que arriba; cerrar sesión en UI. |
| **`open-dialog`** | Inicio de sincronización de contactos → mostrar modal de progreso. |
| **`contact-progress`** | Progreso: `{ total, processed, ... }` → actualizar texto/barra. |
| **`close-dialog`** | Fin de sincronización → cerrar modal (siempre). |
| **`chats-updated`** | Lista de chats/contactos cambiada → refrescar datos (GET conversaciones/contactos). |
| **`clear-chats`** | Limpiar lista en UI (p. ej. al mostrar QR o al desconectar). |
| **`new-message`** | Nuevo mensaje recibido (payload con datos del mensaje). |
| **`new-conversation`** | Nueva conversación creada. |
| **`message-reaction`** | Reacción a un mensaje. |
| **`message-sent`** | Confirmación de envío (por Socket). |
| **`error`** / **`error-message`** | Mensaje de error (ej. token inválido, WhatsApp no conectado). |
| **`analyzing-media`** / **`media-analyzed`** / **`media-analysis-error`** | Progreso/resultado de análisis de media (por conversación). |
| **`lead-created`** | Lead creado (si aplica). |

---

## 6. Envío de mensajes

### 6.1 Por Socket

- **A conversación existente:**  
  `socket.emit('send-message', { token, conversationId, textContent, attachments? })`  
  Respuesta: `message-sent` o `error`.

- **A un número (crea conversación si no existe):**  
  `socket.emit('send-to-number', { token, to, text, attachments?, defaultCountry? })`  
  Respuesta: `message-sent` con `conversationId`, `externalId`, etc., o `error`.

- **Mensaje generado por IA:**  
  `socket.emit('send-ai-message', { token, to, prompt, defaultCountry?, personalityId? })`  
  Respuesta: `ai-message-sent` o `error`.

### 6.2 Por HTTP

- **Enviar a conversación:**  
  `POST /api/whatsapp/send_message`  
  Body: `{ conversationId, textContent, attachments?, senderType? }`.

- **Enviar a número:**  
  `POST /api/whatsapp/send_message_to_number`  
  Body: `{ to, text, attachments?, defaultCountry? }`.

- **Enviar mensaje IA:**  
  `POST /api/whatsapp/send_ai_message`  
  Body: `{ to, prompt, defaultCountry?, personalityId? }`.

Todas con header `Authorization: Bearer <token>`.

---

## 7. Endpoints HTTP útiles (resumen)

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/whatsapp/status` | ¿WhatsApp conectado? |
| GET | `/api/whatsapp/qr` | Obtener QR (alternativa al Socket) |
| GET | `/api/whatsapp/get_conversations` | Lista de conversaciones para el chat |
| GET | `/api/whatsapp/get_contacts` | Lista de contactos |
| GET | `/api/whatsapp/get_messages?conversationId=...` | Mensajes de una conversación |
| POST | `/api/whatsapp/disconnect` | Desconectar WhatsApp |
| POST | `/api/whatsapp/send_message` | Enviar mensaje a conversación |
| POST | `/api/whatsapp/send_message_to_number` | Enviar mensaje a número |
| POST | `/api/whatsapp/send_ai_message` | Enviar mensaje generado por IA |

Todas las rutas anteriores requieren JWT (salvo las que el backend documente como públicas).

---

## 8. Flujo recomendado en el frontend (contactos)

1. Conectar Socket y emitir **`join`** con `token`.
2. Si no hay sesión WhatsApp, emitir **`get-qr`** y mostrar **`qr-code`** hasta recibir **`session-ready`**.
3. Escuchar **`open-dialog`** → mostrar “Sincronizando contactos”.
4. Escuchar **`contact-progress`** → actualizar “X/Y” o barra de progreso.
5. Escuchar **`close-dialog`** → cerrar el modal (siempre).
6. Escuchar **`chats-updated`** → llamar a `GET /api/whatsapp/get_conversations` (y/o `get_contacts`) y actualizar la lista.
7. Para la lista inicial tras login, hacer un `GET /api/whatsapp/get_conversations` y, si se usa, `GET /api/whatsapp/get_contacts`; luego mantener la lista actualizada con **`chats-updated`**.

Con esto, la conexión, la carga de contactos, los diálogos de progreso y el envío de mensajes quedan alineados con el backend.
