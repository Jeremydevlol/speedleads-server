# Meta OAuth — Solo producción (Aplicar HTTPS = Sí)

Cuando **no puedes quitar "Aplicar HTTPS"** en Meta, usa solo la URI de producción. El callback irá siempre al backend en Render y la conexión se guarda en la misma base de datos, así que verás la conexión tanto en producción como si llamas al API desde local.

---

## 1. Meta for Developers

- **Facebook Login** → **Configurar**.
- **URI de redireccionamiento de OAuth válidos**: una sola línea  
  `https://speedleads-server.onrender.com/auth/meta/callback`
- **Aplicar HTTPS**: **Sí** (déjalo así).
- Guardar.

---

## 2. Backend (Render) — variables de entorno

En el dashboard de Render, en tu servicio, asegura:

| Variable | Valor |
|----------|--------|
| `META_APP_ID` | `786569121131451` (o el de tu app) |
| `META_APP_SECRET` | Tu App Secret de SpeedLeads IA |
| `META_REDIRECT_URI` | `https://speedleads-server.onrender.com/auth/meta/callback` |
| `FRONTEND_URL` | `https://www.speedleads.app` (para redirigir después del callback) |

---

## 3. Backend local (cuando quieras probar desde tu máquina)

En el `.env` de tu proyecto (solo para desarrollo):

- **Misma** `META_REDIRECT_URI` que en producción, para que la URL de Facebook apunte al callback de Render:
  ```env
  META_REDIRECT_URI=https://speedleads-server.onrender.com/auth/meta/callback
  ```
- El resto de variables Meta (`META_APP_ID`, `META_APP_SECRET`) igual que en Render.

Así, aunque ejecutes el backend en local, el enlace de “conectar Instagram” llevará a Facebook con `redirect_uri` de Render, y tras autorizar el usuario irá a Render y se guardará la conexión en Supabase.

---

## 4. Cómo probar

**Desde la app en producción (https://www.speedleads.app):**

1. Entras donde se conecta Instagram (chats / integraciones).
2. Clic en conectar con Meta/Instagram.
3. Autorizas en Facebook.
4. Te redirige a `https://www.speedleads.app/chats?channel=instagram&connected=1` y la conexión queda guardada.

**Desde frontend en local (opcional):**

1. Frontend en `http://localhost:3000` debe llamar al **backend que tenga la misma `META_REDIRECT_URI`** (local con .env de producción o directamente al backend en Render).
2. Si llamas al backend en **Render** para `POST /auth/meta/start-link`, obtienes la URL, abres Facebook, autorizas y el callback se ejecuta en Render; te redirige a `FRONTEND_URL` de Render (producción).
3. Si llamas al backend **local** (con `META_REDIRECT_URI` de producción en .env), el flujo es el mismo: callback en Render, conexión en Supabase. Luego, si tu frontend local consulta `GET /api/meta/connection` a tu backend local (misma Supabase), verás la conexión porque está en la misma BD.

---

## 5. Resumen

- **Meta:** una sola URI, HTTPS obligatorio →  
  `https://speedleads-server.onrender.com/auth/meta/callback`
- **Render:** `META_REDIRECT_URI` y `FRONTEND_URL` como arriba.
- **Local:** mismo `META_REDIRECT_URI` en `.env` para que el flujo siga yendo al callback de Render.
- Tras conectar, la conexión está en Supabase y la ves en producción (y en local si usas la misma BD).
