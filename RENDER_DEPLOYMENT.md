# 🚀 Guía de Despliegue en Render

## 📋 Información del Servicio

- **URL del Servicio**: https://speedleads-server.onrender.com
- **Service ID**: srv-d3occ13e5dus73aki5m0
- **Frontend URL**: https://app.uniclick.io
- **Repositorio**: https://github.com/Jeremydevlol/speedleads-server.git

## 🔧 Configuración de Variables de Entorno en Render

### 1. Variables de Conexión (CRÍTICAS)
```bash
NODE_ENV=production
PORT=5001
FRONTEND_URL=https://app.uniclick.io
BACKEND_URL=https://speedleads-server.onrender.com
```

### 2. Supabase (CRÍTICAS)
```bash
SUPABASE_URL=[tu_supabase_url]
SUPABASE_ANON_KEY=[tu_supabase_anon_key]
SUPABASE_SERVICE_ROLE_KEY=[tu_service_role_key]
DATABASE_URL=[tu_database_url_de_supabase]
```

### 3. Auth0 (CRÍTICAS)
```bash
AUTH0_DOMAIN=[tu_auth0_domain]
AUTH0_CLIENT_ID=[tu_auth0_client_id]
AUTH0_CLIENT_SECRET=[tu_auth0_secret]
```

### 4. Google OAuth (CRÍTICAS)
```bash
GOOGLE_CLIENT_ID=[tu_google_client_id]
GOOGLE_CLIENT_SECRET=[tu_google_client_secret]
GOOGLE_REDIRECT_URI=https://app.uniclick.io/login/callback
```

### 5. Google APIs
```bash
GOOGLE_VISION_API_KEY=[tu_google_vision_api_key]
GOOGLE_TRANSLATE_API_KEY=[tu_google_translate_api_key]
```

### 6. SendGrid
```bash
SENDGRID_API_KEY=[tu_sendgrid_api_key]
SENDGRID_FROM_EMAIL=affiliates@uniclick.io
SENDGRID_INVITE_TEMPLATE_ID=[tu_sendgrid_template_id]
```

### 7. Stripe
```bash
STRIPE_SECRET_KEY=[tu_stripe_secret_key]
STRIPE_PUBLISHABLE_KEY=[tu_stripe_publishable_key]
```

### 8. JWT y Sesiones (CRÍTICAS)
```bash
JWT_SECRET=[genera_un_secret_aleatorio_largo]
SESSION_SECRET=[genera_un_secret_aleatorio_largo]
COOKIE_DOMAIN=.uniclick.io
SESSION_DOMAIN=.uniclick.io
```

### 9. OpenAI (CRÍTICA)
```bash
OPENAI_API_KEY=[tu_openai_api_key]
```

### 10. Configuración Adicional
```bash
ENABLE_WILDCARD_SUBDOMAINS=true
FORCE_LOGIN=false
CLOUDFRONT_DOMAIN=domains.uniclick.io
NEXT_PUBLIC_CLOUDFRONT_DOMAIN=domains.uniclick.io
NEXT_TELEMETRY_DISABLED=1
```

## 📝 Pasos para Desplegar en Render

### Opción 1: Desde el Dashboard de Render (Recomendado)

1. **Ir al Dashboard de Render**
   - Visita: https://dashboard.render.com/
   - Busca el servicio: `srv-d3occ13e5dus73aki5m0`

2. **Configurar Variables de Entorno**
   - Ve a la pestaña "Environment"
   - Agrega todas las variables listadas arriba
   - Guarda los cambios

3. **Conectar el Repositorio**
   - Ve a "Settings"
   - En "Build & Deploy", conecta el repositorio:
     - Repository: `https://github.com/Jeremydevlol/speedleads-server.git`
     - Branch: `main`

4. **Configurar Build**
   - Build Command: (dejar vacío, usa Dockerfile)
   - Start Command: (dejar vacío, usa CMD del Dockerfile)
   - Docker Command: `./docker-start-fast.sh`

5. **Deploy Manual**
   - Ve a "Manual Deploy"
   - Click en "Deploy latest commit"
   - Espera a que el build termine (puede tardar 5-10 minutos)

### Opción 2: Desde la CLI de Render

```bash
# 1. Instalar Render CLI
npm install -g @render/cli

# 2. Login
render login

# 3. Desplegar
render deploy --service srv-d3occ13e5dus73aki5m0
```

## 🔍 Verificación del Despliegue

### 1. Health Check
```bash
curl https://speedleads-server.onrender.com/api/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "timestamp": "2025-01-16T10:20:00.000Z"
}
```

### 2. Verificar CORS
```bash
curl -H "Origin: https://app.uniclick.io" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://speedleads-server.onrender.com/api/auth/login
```

### 3. Verificar WebSocket
```javascript
// En el navegador (https://app.uniclick.io)
const socket = io('https://speedleads-server.onrender.com', {
  withCredentials: true
});

socket.on('connect', () => {
  console.log('✅ WebSocket conectado');
});
```

## 🐛 Troubleshooting

### Problema: Build falla con "not found"
**Solución**: Asegúrate de que todos los archivos referenciados en el Dockerfile existen:
```bash
# Verificar archivos críticos
ls -la docker-start-fast.sh
ls -la dist/app.js
ls -la package.json
```

### Problema: Variables de entorno no se cargan
**Solución**: 
1. Verifica que todas las variables estén en el dashboard de Render
2. Reinicia el servicio después de agregar variables
3. Verifica los logs: `render logs srv-d3occ13e5dus73aki5m0`

### Problema: CORS errors en el frontend
**Solución**: 
1. Verifica que `FRONTEND_URL=https://app.uniclick.io` esté configurada
2. Verifica que el origen en el navegador sea exactamente `https://app.uniclick.io`
3. Revisa los logs del backend para ver qué origen está siendo rechazado

### Problema: Puerto incorrecto
**Solución**: Render asigna el puerto dinámicamente. El script `docker-start-fast.sh` ya maneja esto con:
```bash
export PORT=${PORT:-5001}
```

## 📊 Monitoreo

### Ver Logs en Tiempo Real
```bash
render logs srv-d3occ13e5dus73aki5m0 --tail
```

### Métricas en Dashboard
- CPU Usage
- Memory Usage
- Request Rate
- Response Time

## 🔄 Auto-Deploy

El servicio está configurado para auto-deploy cuando se hace push a `main`:

```bash
git add .
git commit -m "Update backend"
git push origin main
```

Render detectará el push y desplegará automáticamente.

## 🚨 Importante

1. **NO subir credenciales al repositorio** - Todas las credenciales deben estar en las variables de entorno de Render
2. **Verificar health checks** - Render espera que `/api/health` responda en menos de 30 segundos
3. **Logs** - Siempre revisar los logs después de un deploy para detectar errores
4. **Rollback** - Si algo falla, puedes hacer rollback desde el dashboard a un deploy anterior

## 📞 Soporte

- Dashboard: https://dashboard.render.com/
- Docs: https://render.com/docs
- Status: https://status.render.com/
