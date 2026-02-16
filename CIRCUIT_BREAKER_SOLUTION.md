# ⚡ **SOLUCIÓN DEFINITIVA: Circuit Breaker de ECS**

## 🚨 **Problema Identificado**
**"Se superó el umbral del interruptor"** = **Circuit Breaker activado**

### **¿Qué significa?**
- AWS ECS monitorea health checks del Load Balancer
- Si **múltiples health checks fallan consecutivamente** → **rollback automático**
- El contenedor arranca, pero **no responde rápido** a `/health`

---

## ⚡ **SOLUCIÓN IMPLEMENTADA**

### **1️⃣ Health Checks Mejorados:**
```javascript
// Múltiples endpoints para maximum reliability:
GET /health      // Robusto con JSON detallado
GET /ping        // Súper simple: "pong"
GET /status      // Información del servicio
GET /            // Endpoint raíz
```

### **2️⃣ Script de Inicio Ultra Rápido:**
```bash
# docker-start-fast.sh
- Sin verificaciones complejas
- Arranque inmediato del servidor
- Variables configuradas al inicio
- Sin esperas innecesarias
```

### **3️⃣ Dockerfile Optimizado:**
```dockerfile
# Cambios principales:
CMD ["./docker-start-fast.sh"]  # Inicio rápido
EXPOSE 5001                     # Puerto correcto
ENV NODE_OPTIONS="--max-old-space-size=1024"  # Memoria optimizada
```

---

## 🔧 **Configuración AWS Recomendada**

### **Load Balancer Target Group:**
```json
{
  "HealthCheckPath": "/ping",           // Endpoint más rápido
  "HealthCheckIntervalSeconds": 15,     // Más frecuente
  "HealthCheckTimeoutSeconds": 5,       // Timeout reducido
  "HealthyThresholdCount": 2,           // Menos checks para "healthy"
  "UnhealthyThresholdCount": 3,         // Más tolerancia antes de "unhealthy"
  "HealthCheckGracePeriodSeconds": 120  // Más tiempo para arranque inicial
}
```

### **ECS Task Definition:**
```json
{
  "memory": 1024,                       // Memoria suficiente
  "cpu": 512,                           // CPU suficiente
  "healthCheck": {
    "command": ["CMD-SHELL", "curl -f http://localhost:5001/ping || exit 1"],
    "interval": 30,
    "timeout": 5,
    "retries": 2,
    "startPeriod": 60                   // Tiempo para arranque inicial
  }
}
```

---

## 🧪 **Cómo Probar la Solución**

### **Test Local (si Docker funciona):**
```bash
# Construir imagen optimizada
docker build -t circuit-breaker-fix .

# Test de arranque rápido
time docker run --rm -p 5001:5001 circuit-breaker-fix &
sleep 5

# Test de health checks
curl http://localhost:5001/ping      # Debe responder "pong"
curl http://localhost:5001/health    # Debe responder JSON
curl http://localhost:5001/status    # Debe responder info del servicio
```

### **Test de Velocidad:**
```bash
# Health check debe responder < 1 segundo
time curl http://localhost:5001/ping

# Resultado esperado: real 0m0.XXXs
```

---

## 📊 **Métricas de Éxito**

### **Antes (Fallaba):**
- ❌ Tiempo de arranque: >60s
- ❌ Health check: >10s o timeout
- ❌ Circuit breaker: Activado
- ❌ Rollback: Automático

### **Después (Debería Funcionar):**
- ✅ Tiempo de arranque: <30s
- ✅ Health check: <2s
- ✅ Circuit breaker: Inactivo
- ✅ Despliegue: Estable

---

## 🎯 **Plan de Despliegue**

### **Paso 1: Construir Nueva Imagen**
```bash
# Con los cambios implementados
docker build -t tu-registry/leads-api:circuit-breaker-fix .
docker push tu-registry/leads-api:circuit-breaker-fix
```

### **Paso 2: Actualizar Task Definition**
- Usar nueva imagen
- Configurar health check optimizado
- Aumentar `startPeriod` a 60-120s

### **Paso 3: Actualizar Target Group**
- Health check path: `/ping`
- Timeout: 5s
- Grace period: 120s

### **Paso 4: Desplegar y Monitorear**
```bash
# Monitorear en tiempo real
watch -n 10 'aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:eu-west-1:880780901703:targetgroup/uniclick-be-api-tg/917eef3b978d50c8 --region eu-west-1 --query "TargetHealthDescriptions[0].TargetHealth.State"'
```

---

## 🔍 **Debugging Post-Despliegue**

### **Si Sigue Fallando:**

1. **Ver logs específicos:**
   ```bash
   aws logs get-log-events \
     --log-group-name /ecs/uniclick-be-api-task-definition \
     --log-stream-name [STREAM] \
     --region eu-west-1 \
     --start-time $(date -d '10 minutes ago' +%s)000
   ```

2. **Verificar Target Group:**
   ```bash
   aws elbv2 describe-target-health \
     --target-group-arn arn:aws:elasticloadbalancing:eu-west-1:880780901703:targetgroup/uniclick-be-api-tg/917eef3b978d50c8 \
     --region eu-west-1
   ```

3. **Test manual del health check:**
   ```bash
   # Obtener IP del contenedor y probar
   curl -f http://[CONTAINER-IP]:5001/ping
   ```

---

## 🛡️ **Plan B: Si Aún Falla**

### **Opción 1: Dockerfile.fast (Versión Minimalista)**
```bash
# Usar versión ultra optimizada
docker build -f Dockerfile.fast -t minimal-fix .
```

### **Opción 2: Desactivar Circuit Breaker Temporalmente**
En AWS ECS Service:
- Deployment Configuration
- Circuit breaker: **Disabled**
- Desplegar nueva versión
- Reactivar circuit breaker una vez estable

### **Opción 3: Health Check Más Simple**
Cambiar Target Group health check path a:
- `/` en lugar de `/ping`
- Timeout más largo (10s)
- Más retries (5)

---

## 🎉 **Expectativa de Resultado**

### **Con esta solución:**
1. ✅ **Arranque rápido** (<30s)
2. ✅ **Health checks responden** inmediatamente
3. ✅ **Circuit breaker no se activa**
4. ✅ **No hay rollback automático**
5. ✅ **Despliegue exitoso y estable**

### **Próximo despliegue debería:**
- Pasar de **Revision X** a **Revision Y**
- **Mantenerse en Revision Y** (sin rollback)
- **Target Group healthy**
- **Servicio estable**

---

## 📝 **Resumen de Archivos Modificados**

- ✅ `dist/app.js` - Health checks mejorados
- ✅ `docker-start-fast.sh` - Script de inicio rápido
- ✅ `Dockerfile` - Configuración optimizada
- ✅ `Dockerfile.fast` - Versión minimalista (backup)

**¡El circuit breaker debería quedar solucionado con estos cambios!** ⚡

### **Próximo paso:**
1. **Construir nueva imagen** con estos cambios
2. **Desplegar en ECS**
3. **Monitorear** que no haya rollback
4. **Confirmar** que el servicio queda estable

**¡Esta vez debería funcionar!** 🚀
