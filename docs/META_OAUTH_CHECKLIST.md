# Meta OAuth — Checklist y ejemplos

## Error 1349220 — "Función no disponible" / "Facebook login no está disponible"

Si en el callback ves `error_code=1349220` y el mensaje *"En este momento, el inicio de sesión con Facebook no está disponible..."*, **el fallo es de Meta**, no de tu servidor. Suele pasar cuando:

- Meta está **actualizando la app** (mensaje explícito de Facebook).
- La app está en **modo Development** y hay restricciones temporales.
- Cambios recientes en la app (permisos, productos) y Meta aún no ha propagado el estado.

**Qué hacer:**

1. **Esperar** y volver a intentar en unos minutos u horas.
2. En [developers.facebook.com](https://developers.facebook.com) → tu app → **Dashboard**: revisar si hay avisos o "App en mantenimiento".
3. Comprobar que **Facebook Login** (y **Instagram** si aplica) estén habilitados y sin errores en **Use cases**.
4. Si la app está en **Development**, asegurarte de que el usuario que prueba esté en **Roles** (Admin/Developer/Tester).

El backend redirige al frontend con `error=meta_login_unavailable` para que puedas mostrar un mensaje amigable tipo: *"El inicio de sesión con Facebook no está disponible. Vuelve a intentarlo más tarde."*

---

## Por qué sale "La aplicación no está activa"

Meta muestra ese mensaje cuando la app está en **modo Development** y el usuario que inicia el login **no** es Admin/Developer/Tester, o cuando la **Redirect URI** no coincide exactamente con la configurada en la app, o la app está deshabilitada/revocada.

---

## Checklist en Meta for Developers (arreglar "app no activa")

1. **App Mode**
   - Entra en [developers.facebook.com](https://developers.facebook.com) → Tu app → Dashboard.
   - Si está en **Development**: solo usuarios en Roles pueden usar el login.
   - Para que cualquier usuario pueda probar: pasa la app a **Live** (y completa revisión de permisos si Meta lo pide).

2. **Roles (si la app está en Development)**
   - App → **App roles** → **Roles**.
   - Añade al usuario que prueba como **Admin**, **Developer** o **Tester**.

3. **Valid OAuth Redirect URIs**
   - App → **Use cases** → **Customize** (o **Facebook Login** / **Instagram**) → **Settings**.
   - En **Valid OAuth Redirect URIs** añade **exactamente** la URL del callback del backend:
     - Dev: `http://localhost:5001/auth/meta/callback`
     - Prod: `https://<tu-backend>/auth/meta/callback`
   - Sin barra final, mismo protocolo (http/https) y mismo host/puerto que use el backend.

4. **App ID y App Secret**
   - Usa los de **esta** app (Dashboard → Configuración → Básica).
   - Las variables `META_APP_ID` y `META_APP_SECRET` en el backend deben ser de la misma app.

5. **Productos y permisos**
   - Producto **Facebook Login** (y/o **Instagram**) añadido a la app.
   - Permisos solicitados en la URL (p. ej. `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_messages`) deben estar habilitados para la app (sin errores de revisión si está en Live).

6. **Cuenta Facebook/Instagram (importante para "Conectar Instagram")**
   - La cuenta de Facebook con la que inicies sesión debe tener **al menos una Página de Facebook** (crear en [facebook.com/pages](https://www.facebook.com/pages)).
   - Esa **Página** debe tener **conectada una cuenta de Instagram en modo Professional o Creator** (en Configuración de la Página → Instagram, o en Meta Business Suite). Si no, verás el error `no_instagram_business` o `no_pages` al volver del callback.
   - En la app de Meta no debe aparecer la app deshabilitada o revocada para esa cuenta.

---

## Desarrollo local (que funcione en local)

1. **En Meta for Developers** (Facebook Login → Configurar):
   - En **URI de redireccionamiento de OAuth válidos** añade **dos líneas** (cada URI en su propia línea):
     - `https://speedleads-server.onrender.com/auth/meta/callback`
     - `http://localhost:5001/auth/meta/callback`
   - Pon **«Aplicar HTTPS»** en **No** (para que Meta acepte `http://localhost`).
   - Guarda.

2. **En tu máquina** (solo cuando desarrolles en local), en el `.env` del backend:
   - Comenta la línea de producción y usa la de local:
     ```env
     # META_REDIRECT_URI=https://speedleads-server.onrender.com/auth/meta/callback
     META_REDIRECT_URI=http://localhost:5001/auth/meta/callback
     ```
   - Asegúrate de tener `FRONTEND_URL=http://localhost:3000` si el front corre en 3000.

3. **Reinicia** el backend local (`npm start`) y prueba el flujo desde el front en local.

4. **Para producción**: vuelve a dejar en `.env` (o en las variables de Render) la URI de producción y en Meta puedes dejar «Aplicar HTTPS» en Sí si solo usas la URL de Render.

---

## Variables de entorno (backend)

| Variable | Uso |
|----------|-----|
| `META_APP_ID` | App ID de la app en Meta |
| `META_APP_SECRET` | App Secret (nunca en logs ni en frontend) |
| `META_REDIRECT_URI` | **Exactamente** la URL del callback (ej. `http://localhost:5001/auth/meta/callback`) |
| `META_OAUTH_SCOPES` | Opcional; por defecto: `pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_messages` |
| `META_GRAPH_VERSION` | Opcional; por defecto: `v24.0` |
| `FRONTEND_URL` | Origen del frontend; el callback redirige a `FRONTEND_URL/chats?channel=instagram&...` (ej. `http://localhost:3000`) |

---

## Ejemplos curl

### POST /auth/meta/start-link (obtener URL de OAuth)

```bash
curl -s -X POST http://localhost:5001/auth/meta/start-link \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_JWT_AQUI" \
  | jq
```

Respuesta esperada (200):

```json
{ "url": "https://www.facebook.com/v24.0/dialog/oauth?client_id=..." }
```

El frontend debe abrir esa `url` en el navegador (no seguir un redirect del backend).

### GET /api/meta/connection (estado de conexión)

```bash
curl -s http://localhost:5001/api/meta/connection \
  -H "Authorization: Bearer TU_JWT_AQUI" \
  | jq
```

Respuesta si está conectado (200):

```json
{
  "connected": true,
  "ig_business_id": "123456789",
  "auto_reply_enabled": false,
  "status": "active"
}
```

Si no hay conexión (200):

```json
{ "connected": false }
```

---

## Error "column meta_connections.access_token does not exist"

Si en los logs del backend aparece **`[metaConnectionsRepo] getConnectionByTenantId error: column meta_connections.access_token does not exist`**, la tabla **`meta_connections`** en Supabase no tiene el esquema que usa el código (falta la columna `access_token` o la tabla no existe).

**Qué hacer:**

1. Ejecutar la migración que crea/actualiza la tabla:
   - En Supabase: **SQL Editor** → New query.
   - Copiar y ejecutar el contenido de **`db/migrations/2025-02-18_meta_connections.sql`** (crea la tabla con `access_token` y, si la tabla ya existía, añade las columnas que falten).
2. Reiniciar el backend y volver a probar el flujo de conexión Meta.

Sin esta tabla/columna, el callback de OAuth puede guardar el token pero las rutas que leen la conexión (p. ej. `/api/meta/connection`) fallan y la app no puede "loguear" / usar la conexión Meta.

---

## Errores del callback: `no_pages` y `no_instagram_business`

Si al volver de Facebook el frontend recibe `error=no_pages` o `error=no_instagram_business`:

- **`no_pages`**: La cuenta de Facebook no tiene ninguna **Página**. Crear una en [facebook.com/pages](https://www.facebook.com/pages) y volver a intentar "Conectar Instagram".
- **`no_instagram_business`**: La cuenta tiene Páginas pero **ninguna tiene una cuenta de Instagram Professional/Creator vinculada**. En [Meta Business Suite](https://business.facebook.com) o en Configuración de la Página → Instagram, vincular la cuenta de Instagram a la Página y repetir el flujo.

La cuenta que uses (por ejemplo losdety o un probador) debe ser la que tenga la Página y el Instagram conectados.

---

## Flujo resumido

1. Frontend llama **POST /auth/meta/start-link** con JWT → backend responde `{ url }`.
2. Frontend redirige al usuario a `url` (Facebook OAuth).
3. Usuario autoriza → Meta redirige a **GET /auth/meta/callback?code=...&state=...**.
4. Backend valida `state`, intercambia `code` por token, obtiene long-lived y página/IG, guarda en `meta_connections`, redirige a `FRONTEND_URL/chats?channel=instagram&connected=1` (o `&error=...` en caso de error).
