# 🚀 Quick Start - Despliegue en Render

## ✅ Cambios Completados

1. ✅ **Dockerfile corregido** - Eliminada dependencia de archivo de credenciales
2. ✅ **Script de inicio actualizado** - Configurado para Render con PORT dinámico
3. ✅ **render.yaml creado** - Configuración de servicio para Render
4. ✅ **Documentación completa** - Ver `RENDER_DEPLOYMENT.md`
5. ✅ **Código subido a GitHub** - https://github.com/Jeremydevlol/speedleads-server.git

## 🎯 Próximos Pasos

### 1. Configurar Servicio en Render

Ve a: https://dashboard.render.com/web/srv-d3occ13e5dus73aki5m0

#### A. Conectar Repositorio
- **Settings** → **Build & Deploy**
- **Repository**: `https://github.com/Jeremydevlol/speedleads-server.git`
- **Branch**: `main`
- **Auto-Deploy**: ✅ Enabled

#### B. Configurar Build
- **Environment**: Docker
- **Dockerfile Path**: `./Dockerfile`
- **Docker Command**: (dejar vacío, usa CMD del Dockerfile)

#### C. Configurar Variables de Entorno
Ve a **Environment** y agrega estas variables **CRÍTICAS**:

```bash
# Conexión
NODE_ENV=production
PORT=5001
FRONTEND_URL=https://app.uniclick.io
BACKEND_URL=https://speedleads-server.onrender.com

# Supabase (OBTENER DE TU .env)
SUPABASE_URL=<tu_valor>
SUPABASE_ANON_KEY=<tu_valor>
SUPABASE_SERVICE_ROLE_KEY=<tu_valor>
DATABASE_URL=<tu_valor>

# Auth0 (OBTENER DE TU .env)
AUTH0_DOMAIN=<tu_valor>
AUTH0_CLIENT_ID=<tu_valor>
AUTH0_CLIENT_SECRET=<tu_valor>

# Google OAuth (OBTENER DE TU .env)
GOOGLE_CLIENT_ID=<tu_valor>
GOOGLE_CLIENT_SECRET=<tu_valor>
GOOGLE_REDIRECT_URI=https://app.uniclick.io/login/callback

# Google APIs (OBTENER DE TU .env)
GOOGLE_VISION_API_KEY=<tu_valor>
GOOGLE_TRANSLATE_API_KEY=<tu_valor>

# SendGrid (OBTENER DE TU .env)
SENDGRID_API_KEY=<tu_valor>
SENDGRID_FROM_EMAIL=affiliates@uniclick.io
SENDGRID_INVITE_TEMPLATE_ID=<tu_valor>

# Stripe (OBTENER DE TU .env)
STRIPE_SECRET_KEY=<tu_valor>
STRIPE_PUBLISHABLE_KEY=<tu_valor>

# JWT y Sesiones (OBTENER DE TU .env)
JWT_SECRET=<tu_valor>
SESSION_SECRET=<tu_valor>
COOKIE_DOMAIN=.uniclick.io
SESSION_DOMAIN=.uniclick.io

# OpenAI (OBTENER DE TU .env)
OPENAI_API_KEY=<tu_valor>

# Configuración Adicional
ENABLE_WILDCARD_SUBDOMAINS=true
FORCE_LOGIN=false
CLOUDFRONT_DOMAIN=domains.uniclick.io
NEXT_PUBLIC_CLOUDFRONT_DOMAIN=domains.uniclick.io
NEXT_TELEMETRY_DISABLED=1
```

### 2. Desplegar

Una vez configuradas las variables:

1. Ve a **Manual Deploy**
2. Click en **Deploy latest commit**
3. Espera 5-10 minutos mientras se construye la imagen Docker
4. Monitorea los logs en tiempo real

### 3. Verificar Despliegue

```bash
# Health check
curl https://speedleads-server.onrender.com/api/health

# Debe responder:
# {"status":"ok","timestamp":"..."}
```

### 4. Configurar Frontend

El frontend en `https://app.uniclick.io` debe apuntar a:

```javascript
// En tu archivo de configuración del frontend
const API_URL = 'https://speedleads-server.onrender.com';
```

## 🔍 Monitoreo

### Ver Logs
```bash
# Desde Render Dashboard
https://dashboard.render.com/web/srv-d3occ13e5dus73aki5m0/logs

# O desde CLI
render logs srv-d3occ13e5dus73aki5m0 --tail
```

### Métricas
- CPU Usage
- Memory Usage  
- Request Rate
- Response Time

## 🐛 Troubleshooting Común

### Error: "Health check failed"
**Causa**: El servidor no responde en `/api/health` en 30 segundos
**Solución**: 
1. Verifica los logs para ver errores de inicio
2. Asegúrate de que todas las variables de entorno estén configuradas
3. Verifica que el puerto sea 5001 o el que Render asigne

### Error: "Build failed"
**Causa**: Falta algún archivo o dependencia
**Solución**:
1. Verifica que `dist/app.js` exista en el repo
2. Verifica que `docker-start-fast.sh` tenga permisos de ejecución
3. Revisa los logs de build para ver el error específico

### Error: CORS en el frontend
**Causa**: El origen no está permitido
**Solución**:
1. Verifica que `FRONTEND_URL=https://app.uniclick.io` esté configurada
2. El CORS ya está configurado en `dist/app.js` para permitir `app.uniclick.io`

## 📞 Recursos

- **Dashboard**: https://dashboard.render.com/
- **Documentación Completa**: Ver `RENDER_DEPLOYMENT.md`
- **Repositorio**: https://github.com/Jeremydevlol/speedleads-server.git
- **Frontend**: https://app.uniclick.io

## ⚡ Auto-Deploy

Cada vez que hagas push a `main`, Render desplegará automáticamente:

```bash
git add .
git commit -m "Update backend"
git push origin main
```

Render detectará el cambio y desplegará en ~5-10 minutos.

## 🎉 ¡Listo!

Una vez desplegado, tu backend estará disponible en:
- **URL**: https://speedleads-server.onrender.com
- **Health Check**: https://speedleads-server.onrender.com/api/health
- **Status**: https://speedleads-server.onrender.com/status

El frontend en `https://app.uniclick.io` podrá conectarse automáticamente.
