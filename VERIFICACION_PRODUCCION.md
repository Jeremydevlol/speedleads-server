# 🔍 VERIFICACIÓN EN PRODUCCIÓN

## ✅ **CHECKLIST DE VERIFICACIÓN**

### **1. VERIFICAR LOGS DE AWS (2 minutos)**

#### **Backend Logs:**
```bash
# Ver logs recientes del backend
aws logs tail /ecs/uniclick-be-ecs-api --follow

# Buscar errores específicos
aws logs filter-log-events \
  --log-group-name /ecs/uniclick-be-ecs-api \
  --start-time $(date -d '10 minutes ago' +%s)000 \
  --filter-pattern "refresh_token_not_found"

aws logs filter-log-events \
  --log-group-name /ecs/uniclick-be-ecs-api \
  --start-time $(date -d '10 minutes ago' +%s)000 \
  --filter-pattern "over_request_rate_limit"
```

#### **Frontend Logs:**
```bash
# Ver logs del frontend
aws logs tail /ecs/uniclick-fe-ecs-next --follow

# Buscar errores de autenticación
aws logs filter-log-events \
  --log-group-name /ecs/uniclick-fe-ecs-next \
  --start-time $(date -d '10 minutes ago' +%s)000 \
  --filter-pattern "AuthApiError"
```

#### **✅ QUÉ DEBERÍAS VER:**
- ✅ `✅ Entorno: PRODUCTION`
- ✅ `✅ URL Frontend: https://app.uniclick.io`
- ✅ `✅ CORS allow in production`
- ❌ **NO más**: `refresh_token_not_found`
- ❌ **NO más**: `over_request_rate_limit`

### **2. VERIFICAR VARIABLES DE ENTORNO (1 minuto)**

```bash
# Conectarse al contenedor del backend
aws ecs execute-command \
  --cluster tu-cluster-name \
  --task $(aws ecs list-tasks --cluster tu-cluster-name --service-name uniclick-be-ecs-api --query 'taskArns[0]' --output text | cut -d'/' -f3) \
  --container backend \
  --interactive \
  --command "/bin/bash"

# Dentro del contenedor, verificar:
echo "NODE_ENV: $NODE_ENV"
echo "COOKIE_DOMAIN: $COOKIE_DOMAIN"
echo "SESSION_DOMAIN: $SESSION_DOMAIN"
echo "FRONTEND_URL: $FRONTEND_URL"
```

#### **✅ VALORES ESPERADOS:**
```
NODE_ENV: production
COOKIE_DOMAIN: .uniclick.io
SESSION_DOMAIN: .uniclick.io
FRONTEND_URL: https://app.uniclick.io
```

### **3. PRUEBA MANUAL DE AUTENTICACIÓN (3 minutos)**

#### **A. Limpiar Cache del Navegador:**
1. Abre **DevTools** (F12)
2. Clic derecho en **Reload** → **Empty Cache and Hard Reload**
3. Ve a **Application** → **Storage** → **Clear site data**

#### **B. Probar Login:**
1. Ve a `https://app.uniclick.io`
2. Intenta hacer **login**
3. Observa la consola del navegador

#### **✅ QUÉ DEBERÍAS VER:**
- ✅ Login exitoso sin errores
- ✅ Redirección correcta después del login
- ❌ **NO más errores** en la consola del navegador

#### **C. Verificar Cookies:**
1. **DevTools** → **Application** → **Cookies** → `https://app.uniclick.io`
2. Busca cookies de autenticación

#### **✅ COOKIES ESPERADAS:**
```
Domain: .uniclick.io
Secure: ✓ (checked)
HttpOnly: ✓ (checked)
SameSite: None
```

### **4. PRUEBA DE SUBDOMINIOS (2 minutos)**

Si tienes subdominios de clientes:

1. Ve a un subdominio (ej: `https://cliente.uniclick.io`)
2. Verifica que las cookies se compartan
3. El usuario debería mantenerse autenticado

### **5. VERIFICAR MÉTRICAS EN AWS (1 minuto)**

#### **CloudWatch Metrics:**
```bash
# Ver métricas de errores HTTP
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_4XX_Count \
  --start-time $(date -d '1 hour ago' -Iseconds) \
  --end-time $(date -Iseconds) \
  --period 300 \
  --statistics Sum
```

#### **✅ QUÉ DEBERÍAS VER:**
- ✅ Reducción significativa en errores 4XX
- ✅ No más picos de errores 400/429

### **6. PRUEBA DE CARGA SIMPLE (OPCIONAL)**

```bash
# Probar múltiples requests para verificar rate limiting
for i in {1..10}; do
  curl -s -o /dev/null -w "%{http_code} " https://app.uniclick.io/api/health
done
echo
```

#### **✅ RESULTADO ESPERADO:**
```
200 200 200 200 200 200 200 200 200 200
```

## 🚨 **SEÑALES DE QUE ALGO ESTÁ MAL**

### **❌ SI VES ESTO, AÚN HAY PROBLEMAS:**

#### **En Logs:**
```
refresh_token_not_found
over_request_rate_limit
AuthApiError: Request rate limit reached
CORS blocked origin
Session ID: undefined
```

#### **En el Navegador:**
- Errores de autenticación en la consola
- Login que no funciona
- Redirecciones infinitas
- Cookies sin el dominio correcto

### **🔧 SOLUCIONES RÁPIDAS:**

1. **Si sigues viendo errores:**
   ```bash
   # Reiniciar servicios completamente
   aws ecs update-service \
     --cluster tu-cluster-name \
     --service uniclick-be-ecs-api \
     --desired-count 0
   
   # Esperar 30 segundos
   sleep 30
   
   aws ecs update-service \
     --cluster tu-cluster-name \
     --service uniclick-be-ecs-api \
     --desired-count 1
   ```

2. **Verificar Task Definition:**
   ```bash
   aws ecs describe-task-definition \
     --task-definition uniclick-be-ecs-api \
     --query 'taskDefinition.containerDefinitions[0].environment'
   ```

## 📊 **REPORTE DE VERIFICACIÓN**

Después de completar todos los pasos, deberías poder confirmar:

- [ ] ✅ No hay errores en logs de AWS
- [ ] ✅ Variables de entorno correctas
- [ ] ✅ Login funciona sin errores
- [ ] ✅ Cookies configuradas correctamente
- [ ] ✅ Subdominios funcionan (si aplica)
- [ ] ✅ Métricas muestran reducción de errores

## 🎉 **¡ÉXITO!**

Si todos los checks pasan:
- **El problema está resuelto** ✅
- **La autenticación funciona** ✅
- **No más rate limiting** ✅
- **Cookies compartidas correctamente** ✅

## 🆘 **¿NECESITAS AYUDA?**

Si algo no funciona:
1. Copia los logs específicos del error
2. Comparte la configuración de variables que ves
3. Indica qué paso específico falla

**¡Tiempo total de verificación: ~10 minutos!** 