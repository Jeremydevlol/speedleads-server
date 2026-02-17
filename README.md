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
