# 🛠️ CONFIGURACIÓN PARA PRODUCCIÓN

## ✅ Variables de Entorno Requeridas

### **Variables Básicas**
```env
NODE_ENV=production
PORT=5001
FRONTEND_URL=https://app.uniclick.io
BACKEND_URL=https://api.uniclick.io
```

### **Autenticación y Seguridad**
```env
SESSION_SECRET=tu-session-secret-de-produccion-muy-seguro-aqui
JWT_SECRET=tu-jwt-secret-de-produccion-muy-seguro-aqui
COOKIE_DOMAIN=.uniclick.io
SESSION_DOMAIN=.uniclick.io
```

### **APIs y Servicios**
```env
OPENAI_API_KEY=tu-openai-api-key-de-produccion
GOOGLE_CLIENT_ID=tu-google-client-id-de-produccion
GOOGLE_CLIENT_SECRET=tu-google-client-secret-de-produccion
```

### **Base de Datos**
```env
DATABASE_URL=postgresql://usuario:password@host:5432/database
```

### **Supabase (REQUERIDO para sistema de dominios personalizados)**
```env
SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-supabase-service-role-key-de-produccion
```

### **🆕 Dominios Personalizados (NUEVO)**
```env
# CONFIGURACIÓN CRÍTICA PARA AWS
CLOUDFRONT_DOMAIN=domains.uniclick.io
NEXT_PUBLIC_CLOUDFRONT_DOMAIN=domains.uniclick.io
```

### **🔒 CENTRALIZACIÓN (NUEVO)**
```env
# CENTRALIZAR toda la autenticación en app.uniclick.io
ENABLE_WILDCARD_SUBDOMAINS=false
FORCE_LOGIN=false
```

---

## 🚀 **PASOS PARA DESPLIEGUE A PRODUCCIÓN**

### **1. Verificar Variables de Entorno**

**En tu servidor AWS/ECS, asegúrate de que todas las variables estén configuradas:**

```bash
# Verificar variables críticas
echo "NODE_ENV: $NODE_ENV"
echo "CLOUDFRONT_DOMAIN: $CLOUDFRONT_DOMAIN"
echo "SUPABASE_URL: $SUPABASE_URL"
echo "JWT_SECRET: $JWT_SECRET"
echo "ENABLE_WILDCARD_SUBDOMAINS: $ENABLE_WILDCARD_SUBDOMAINS"
```

### **2. Ejecutar Migración de Base de Datos**

**IMPORTANTE:** Antes del deploy, ejecutar la nueva migración:

```sql
-- Ejecutar en tu base de datos Supabase/PostgreSQL
\i db/migrations/2025-01-21_create_custom_domains.sql
```

### **3. Verificar Certificado SSL Wildcard**

Tu certificado debe cubrir:
- `*.uniclick.io` (existente)
- `domains.uniclick.io` (NUEVO dominio target)

### **4. Deploy del Backend**

```bash
# Commit los cambios
git add .
git commit -m "feat: centralize authentication to app.uniclick.io"
git push origin main

# Deploy usando tu proceso habitual (ECS, Docker, etc.)
```

---

## 🔧 **CONFIGURACIÓN AWS ESPECÍFICA**

### **CloudFront Distribution**

Asegúrate de que tu CloudFront tenga:

1. **Alternate Domain Names (CNAMEs):**
   - `app.uniclick.io` ← **PRINCIPAL para autenticación**
   - `api.uniclick.io`
   - `domains.uniclick.io` ← **NUEVO para dominios personalizados**

2. **SSL Certificate:**
   - Certificado wildcard que cubra `*.uniclick.io`
   - Incluir `domains.uniclick.io`

3. **Origin Configuration:**
   - Origin para `domains.uniclick.io` debe apuntar a tu ECS/ALB

### **Route 53 (DNS)**

Agregar registro DNS:
```
CNAME domains.uniclick.io → tu-cloudfront-distribution.cloudfront.net
```

### **Application Load Balancer (ALB)**

Configurar host-based routing:
```
Host: domains.uniclick.io → Target Group de tu backend
```

---

## 🧪 **TESTING DESPUÉS DEL DEPLOY**

### **1. Verificar Centralización de Autenticación**

```bash
# Test login desde subdominio (debe redirigir a app.uniclick.io)
curl -X POST https://mipanel.uniclick.io/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'

# Debe devolver redirect: "https://app.uniclick.io/dashboard"
```

### **2. Verificar Redirección de Rutas Sensibles**

```bash
# Test acceso a dashboard desde subdominio
curl -I https://mipanel.uniclick.io/dashboard
# Debe devolver: 302 Found y Location: https://app.uniclick.io/dashboard

# Test acceso a settings desde subdominio
curl -I https://mipanel.uniclick.io/settings
# Debe devolver: 302 Found y Location: https://app.uniclick.io/settings
```

### **3. Verificar Endpoints de Dominios Personalizados**

```bash
# Test configuración de dominio
curl -X POST https://api.uniclick.io/api/dns/configure \
  -H "Authorization: Bearer tu-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "subdomain": "shop",
    "websiteId": "tu-website-uuid"
  }'

# Test verificación DNS  
curl -X POST https://api.uniclick.io/api/dns/verify \
  -H "Authorization: Bearer tu-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{"domain": "shop.example.com"}'

# Test generación SSL
curl -X POST https://api.uniclick.io/api/ssl/generate \
  -H "Authorization: Bearer tu-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{"domain": "shop.example.com"}'
```

### **4. Verificar Variables en Contenedor**

```bash
# SSH a tu contenedor y verificar
docker exec -it tu-contenedor-backend bash
env | grep -E "(CLOUDFRONT|SUPABASE|JWT|ENABLE_WILDCARD)"
```

### **5. Verificar Base de Datos**

```sql
-- Verificar que la tabla fue creada
SELECT * FROM custom_domains LIMIT 1;
```

---

## 🔒 **COMPORTAMIENTO ESPERADO DESPUÉS DEL DEPLOY**

### **✅ Autenticación Centralizada:**
- **Login**: Siempre va a `https://app.uniclick.io/dashboard`
- **Google OAuth**: Siempre va a `https://app.uniclick.io/dashboard`
- **Emails**: Siempre llevan a `https://app.uniclick.io/login`
- **Rutas sensibles**: Automáticamente redirigen a `app.uniclick.io`

### **✅ Subdominios Solo para Websites:**
- **mipanel.uniclick.io/dashboard** → Redirige a `app.uniclick.io/dashboard`
- **mipanel.uniclick.io/settings** → Redirige a `app.uniclick.io/settings`
- **mipanel.uniclick.io/** → Sirve website (NO redirige)
- **mipanel.uniclick.io/api/** → Permite APIs (webchats, etc.)

### **✅ Dominios Personalizados:**
- **shop.example.com** → Sirve website del usuario
- **shop.example.com/dashboard** → Redirige a `app.uniclick.io/dashboard`

---

## 🚨 **PROBLEMAS COMUNES Y SOLUCIONES**

### **Problema 1: Login no redirige a app.uniclick.io**
**Solución:**
```bash
# Verificar variable de entorno
echo $ENABLE_WILDCARD_SUBDOMAINS
# Debe ser: false

# Verificar logs del backend
aws logs tail /ecs/uniclick-be-ecs-api --follow
# Debe mostrar: "🔄 CENTRALIZACIÓN: Redirección automática a app.uniclick.io"
```

### **Problema 2: CORS bloquea subdominios**
**Solución:**
```bash
# Verificar configuración CORS
# Los subdominios ya NO están permitidos por diseño
# Solo app.uniclick.io está permitido para autenticación
```

### **Problema 3: Emails llevan a FRONTEND_URL en lugar de app.uniclick.io**
**Solución:**
```bash
# Verificar logs del backend
# Debe mostrar: "📧 Enviando invitación a: email con URL: https://app.uniclick.io/login"
```

---

## 📋 **CHECKLIST FINAL DE VERIFICACIÓN**

- [ ] **Variables de entorno configuradas** (NODE_ENV=production, ENABLE_WILDCARD_SUBDOMAINS=false)
- [ ] **Migración de base de datos ejecutada** (custom_domains table)
- [ ] **Certificado SSL configurado** (wildcard *.uniclick.io)
- [ ] **CloudFront configurado** (domains.uniclick.io CNAME)
- [ ] **Backend deployado** con nuevos cambios
- [ ] **Login redirige a app.uniclick.io** desde cualquier subdominio
- [ ] **Rutas sensibles redirigen** a app.uniclick.io
- [ ] **Dominios personalizados funcionan** para websites
- [ ] **Emails llevan a app.uniclick.io/login**

---

## 🎯 **RESULTADO FINAL**

Después de implementar estos cambios:

✅ **Toda la autenticación está centralizada en `https://app.uniclick.io`**
✅ **Los subdominios solo sirven websites, NO autenticación**
✅ **Los correos siempre llevan a `https://app.uniclick.io/login`**
✅ **Las rutas sensibles redirigen automáticamente a `app.uniclick.io`**
✅ **El sistema de dominios personalizados sigue funcionando para websites**
✅ **Los webchats y APIs siguen funcionando desde subdominios**

**¡El sistema está listo para producción con autenticación centralizada!** 🚀 