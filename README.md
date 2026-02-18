# SpeedLeads Backend

API y Socket.IO para SpeedLeads (WhatsApp, personalidades, leads, calendario, etc.).

## Desarrollo local

```bash
npm install
npm run start
```

Servidor en `http://localhost:5001`. Frontend en `.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:5001`.

## Producción

`npm run start` con variables de entorno en `.env` (Supabase, JWT_SECRET, Stripe, etc.).

Opcional: `VERBOSE_WHATSAPP=1` para ver logs detallados de sincronización de contactos (por defecto va silencioso para no saturar consola).

---

## Webhook Meta (Messenger / Instagram)

- **Callback URL en Meta:**  
  `https://speedleads-server.onrender.com/webhook/meta`

- **Verify token:** valor de la variable de entorno `META_VERIFY_TOKEN` (lo configuras en Meta y en Render igual).

- **Variables en Render (o .env):**
  - `META_VERIFY_TOKEN` – token que Meta envía en la verificación; debe coincidir con el que pongas en la app de Meta.
  - `META_APP_SECRET` – App Secret de la app de Meta (para verificar `X-Hub-Signature-256`).
  - `META_APP_ID` – App ID (por referencia; el webhook usa sobre todo verify token y app secret).
  - `VERIFY_META_SIGNATURE` – opcional; si es `true`, se valida la firma HMAC con `META_APP_SECRET` (en desarrollo puede ser `false`).

- **Probar la verificación:**  
  Abre en el navegador (o con `curl`):
  ```text
  /webhook/meta?hub.mode=subscribe&hub.verify_token=TU_META_VERIFY_TOKEN&hub.challenge=12345
  ```
  La respuesta debe ser **200** con cuerpo exactamente **12345** (texto plano, no JSON). Si el `hub.verify_token` no coincide con `META_VERIFY_TOKEN`, la respuesta es **403**.

### Meta Instagram + Supabase + IA

El webhook guarda mensajes en Supabase y opcionalmente responde con IA.

- **Variables de entorno necesarias:**
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – cliente server (service role).
  - `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_GRAPH_VERSION` (ej. `v24.0`).
  - Para auto-respuesta con IA: `OPENAI_API_KEY` o `DEEPSEEK_API_KEY`; opcional: `META_AI_MODEL`, `META_AI_SYSTEM_PROMPT`, `VERIFY_META_SIGNATURE`.

- **Tablas Supabase esperadas:**
  - **meta_connections**: `tenant_id`, `ig_business_id` (Page/recipient ID), `access_token`, `auto_reply_enabled` (boolean), `status` o `estado` (ej. `'active'`).
  - **meta_conversations**: `tenant_id`, `ig_business_id`, `sender_id` (único por conversación), `last_message`, `last_message_at`; constraint único en `(tenant_id, ig_business_id, sender_id)`.
  - **meta_messages**: `tenant_id`, `ig_business_id`, `sender_id`, `direction` (`'in'`|`'out'`), `mid`, `text`, `raw` (jsonb), `created_at`. Recomendado: índice único en `(tenant_id, ig_business_id, sender_id, mid)` para evitar duplicados.

- **Flujo:** POST recibe evento → 200 OK inmediato → en background: busca conexión por `recipient.id` (ig_business_id), upsert conversación, inserta mensaje (dedupe por `mid`), si `auto_reply_enabled` genera respuesta con IA y envía por Graph API.

- **Estructura del código:**
  - `dist/db/metaRepo.js` – getConnectionByIgId, upsertConversation, insertMessage, getRecentMessages.
  - `dist/services/metaWebhook.service.js` – parseAndExtractMessageEvents, isValidInstagramPayload (solo `object === 'instagram'`).
  - `dist/services/metaSend.service.js` – sendInstagramMessage (Graph API).
  - `dist/services/aiReply.service.js` – generateReply (contexto desde meta_messages + OpenAI/DeepSeek).
  - `dist/routes/metaWebhookRoutes.js` – GET/POST /webhook/meta, procesamiento en background con setImmediate.

- **Ejemplo de payload Meta (solo mensaje):**  
  `object === 'instagram'`, `entry[].messaging[]` con `message.text` o `message.attachments`. Se usa `recipient.id` como `ig_business_id` para buscar en `meta_connections`.

### Diagnóstico Meta (Supabase + tablas + IA)

Endpoints para comprobar en ~30 s que Supabase, tablas, conexión y IA están listos.

- **Protección:** Disponibles si `NODE_ENV !== 'production'` **o** si se envía el header `X-DIAG-KEY` con el valor de `process.env.DIAG_KEY`. En producción sin clave → 403.

- **GET /api/meta/diagnostic**  
  Devuelve estado de env (solo booleanos, sin secretos), `supabaseReachable`, `tablesOk` y `tablesError` si aplica.

- **POST /api/meta/diagnostic/test-event**  
  Body: `{ "ig_business_id": "...", "sender_id": "...", "text": "hola test", "mid": "TEST_MID_123", "send": false }`.  
  Simula un evento: busca conexión, upsert conversación, inserta mensaje (dedupe por `mid`), si `auto_reply_enabled` genera respuesta con IA y opcionalmente envía a Meta con `send: true`.  
  Respuesta: `connectionFound`, `tenant_id`, `insertedIn`, `deduped`, `aiGenerated`, `replyTextPreview`, `sentToMeta`, `metaSendResult`.

- **Variable de entorno:** `DIAG_KEY` – clave para permitir diagnóstico en producción (header `X-DIAG-KEY`).

- **Logs:** Todos los mensajes de diagnóstico usan el prefijo `[DIAG]` en consola (env faltantes, Supabase/tablas, conexión no encontrada, dedupe, fallos de IA o envío a Meta).

### Onboarding Meta/Instagram (conexión OAuth)

- **Variables:** `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` (ej. `https://speedleads-server.onrender.com/auth/meta/callback`), `META_OAUTH_SCOPES`, `META_GRAPH_VERSION`, `FRONTEND_URL`.

- **GET /auth/meta/start** (con JWT): Redirige a Facebook OAuth con `state` firmado (HMAC) que incluye `tenant_id`. El usuario debe estar logueado (mismo JWT que el resto del backend).

- **GET /auth/meta/callback**: Facebook redirige con `code` y `state`. Se verifica `state`, se intercambia `code` por token, se obtiene long-lived y el primer Instagram Business Account de las páginas del usuario. Se hace upsert en `meta_connections` (tenant_id, ig_business_id, access_token, status=active, auto_reply_enabled=false) y se redirige a `FRONTEND_URL/integrations/instagram?connected=1`.

- **GET /api/meta/connection** (con JWT): Devuelve `{ connected, ig_business_id?, auto_reply_enabled?, status? }` para el tenant del token.

- **POST /api/meta/connection/auto-reply** (con JWT): Body `{ "enabled": true|false }`. Actualiza `auto_reply_enabled` para ese tenant.

- **Ejemplos curl:**
  ```bash
  # Estado de conexión (requiere Authorization: Bearer <JWT> o cookie auth_token)
  curl -H "Authorization: Bearer TU_JWT" https://speedleads-server.onrender.com/api/meta/connection

  # Activar auto-respuesta con IA
  curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer TU_JWT" \
    -d '{"enabled":true}' https://speedleads-server.onrender.com/api/meta/connection/auto-reply
  ```
  Para iniciar el onboarding, el usuario debe abrir en el navegador (con sesión activa):  
  `https://speedleads-server.onrender.com/auth/meta/start`
