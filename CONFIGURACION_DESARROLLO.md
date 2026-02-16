# 🛠️ Configuración para Desarrollo

## Problemas Resueltos

✅ **Error CORS**: Se ha corregido para permitir `localhost:3000` en desarrollo
✅ **Cookies no recibidas**: Se ha corregido el dominio de cookies para localhost
✅ **Sesiones**: Se ha corregido la configuración de sesiones para desarrollo local
✅ **Centralización**: Toda la autenticación ahora va a `app.uniclick.io`

## Configuración de Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con:

```env
# ===============================
# CONFIGURACIÓN PARA DESARROLLO
# ===============================

# Entorno de desarrollo
NODE_ENV=development

# Configuración de puertos
PORT=5001

# URLs para desarrollo local
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5001

# Configuración de cookies y sesiones (NO especificar COOKIE_DOMAIN para localhost)
SESSION_SECRET=tu-session-secret-aqui
JWT_SECRET=tu-jwt-secret-aqui
# COOKIE_DOMAIN=.uniclick.io  # Solo para producción, comentar para desarrollo

# Configuración de OpenAI
OPENAI_API_KEY=tu-openai-api-key-aqui

# Configuración de Google OAuth
GOOGLE_CLIENT_ID=tu-google-client-id-aqui
GOOGLE_CLIENT_SECRET=tu-google-client-secret-aqui

# Configuración de base de datos
DATABASE_URL=postgresql://usuario:password@localhost:5432/tu-base-de-datos

# Configuración de Supabase
SUPABASE_URL=tu-supabase-url-aqui
NEXT_PUBLIC_SUPABASE_URL=tu-supabase-url-aqui
SUPABASE_SERVICE_ROLE_KEY=tu-supabase-service-role-key-aqui

# 🔒 CENTRALIZACIÓN: Deshabilitar wildcards para forzar app.uniclick.io
ENABLE_WILDCARD_SUBDOMAINS=false
```

## Cambios Realizados

### 1. CORS Configuration (dist/app.js)
- ✅ Corregido para usar `ENV_CONFIG.NODE_ENV` en lugar de `process.env.NODE_ENV`
- ✅ Agregado logging para verificar que CORS permite el origen en desarrollo
- ✅ **NUEVO**: Eliminada la lógica de subdominios para autenticación

### 2. Cookie Domain (dist/app.js, dist/controllers/authController.js, dist/routes/testRoutes.js)
- ✅ En desarrollo: `domain: undefined` (permite localhost)
- ✅ En producción: `domain: .uniclick.io` (permite subdominios)

### 3. Session Configuration (dist/app.js)
- ✅ Corregido el dominio de sesiones para desarrollo local

### 4. Domain Security Middleware (dist/middleware/domainSecurity.js)
- ✅ **NUEVO**: `centralizeAuthMiddleware` que redirige automáticamente a `app.uniclick.io`
- ✅ **NUEVO**: Eliminada la lógica de redirección a subdominios
- ✅ Comentado el header Access-Control-Allow-Origin que conflictúa con CORS

### 5. Authentication Controller (dist/controllers/authController.js)
- ✅ **NUEVO**: Login SIEMPRE redirige a `app.uniclick.io/dashboard`
- ✅ **NUEVO**: Google OAuth SIEMPRE redirige a `app.uniclick.io/dashboard`
- ✅ **NUEVO**: Force login SIEMPRE redirige a `app.uniclick.io/dashboard`
- ✅ **NUEVO**: Emails de invitación SIEMPRE llevan a `app.uniclick.io/login`

## 🔒 **CENTRALIZACIÓN IMPLEMENTADA**

### **Comportamiento Actual:**
- ✅ **Login**: Siempre va a `https://app.uniclick.io/dashboard`
- ✅ **Google OAuth**: Siempre va a `https://app.uniclick.io/dashboard`
- ✅ **Emails**: Siempre llevan a `https://app.uniclick.io/login`
- ✅ **Rutas sensibles**: Automáticamente redirigen a `app.uniclick.io`
- ✅ **Subdominios**: Solo sirven websites, NO autenticación

### **Rutas que SIEMPRE van a app.uniclick.io:**
- `/login` → `https://app.uniclick.io/login`
- `/dashboard` → `https://app.uniclick.io/dashboard`
- `/settings` → `https://app.uniclick.io/settings`
- `/account` → `https://app.uniclick.io/account`
- `/conversations` → `https://app.uniclick.io/conversations`
- `/personalities` → `https://app.uniclick.io/personalities`
- `/profile` → `https://app.uniclick.io/profile`
- `/admin` → `https://app.uniclick.io/admin`
- `/billing` → `https://app.uniclick.io/billing`
- `/subscription` → `https://app.uniclick.io/subscription`

## Verificación

Para verificar que todo funciona:

1. **Inicia el servidor**:
   ```bash
   npm run dev
   ```

2. **Verifica que no hay errores CORS**:
   - Deberías ver: `✅ CORS allow in development: http://localhost:3000`
   - No deberías ver: `❌ CORS blocked origin: http://localhost:3000`

3. **Verifica las cookies**:
   - Las cookies deberían recibirse correctamente
   - El session ID ya no debería ser `undefined`

4. **Verifica la centralización**:
   - Login debería redirigir a `app.uniclick.io/dashboard`
   - Google OAuth debería redirigir a `app.uniclick.io/dashboard`

## Notas Importantes

- ⚠️ **NO especificar COOKIE_DOMAIN** en desarrollo local (localhost)
- ⚠️ **Usar COOKIE_DOMAIN=.uniclick.io** solo en producción para subdominios
- ⚠️ **FRONTEND_URL y BACKEND_URL** deben coincidir con tu entorno
- ⚠️ **SESSION_SECRET y JWT_SECRET** deben ser strings seguros y únicos
- 🎯 **CENTRALIZACIÓN**: Toda la autenticación ahora va a `app.uniclick.io`

## Producción

Para producción, las variables deberían ser:
```env
NODE_ENV=production
FRONTEND_URL=https://app.uniclick.io
BACKEND_URL=https://api.uniclick.io
COOKIE_DOMAIN=.uniclick.io
SESSION_DOMAIN=.uniclick.io
ENABLE_WILDCARD_SUBDOMAINS=false
``` 