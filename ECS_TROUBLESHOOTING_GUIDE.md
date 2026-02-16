# 🚨 **Guía de Troubleshooting ECS - Rollback Automático**

## 🎯 **Problema: ECS se revierte automáticamente**

**Síntomas:**
- ✅ Despliegue inicial exitoso
- ❌ Rollback automático después de unos minutos
- 🔄 Vuelve a revisión anterior

---

## 🔍 **Diagnóstico Paso a Paso**

### **1️⃣ Ejecutar Scripts de Diagnóstico:**

```bash
# Test completo local
./test-potential-issues.sh

# Debug específico de ECS (requiere AWS CLI)
./debug-ecs-failure.sh
```

### **2️⃣ Verificar Logs de ECS:**

#### **A) Via AWS Console:**
1. Ir a **ECS** → **Clusters** → `uniclick-cluster`
2. Click en **Services** → `uniclick-be-api-eu-west-1`
3. Tab **Logs** → Ver logs de la tarea fallida
4. Buscar errores en los últimos 5-10 minutos

#### **B) Via AWS CLI:**
```bash
# Ver estado de las tareas
aws ecs list-tasks --cluster uniclick-cluster --service-name uniclick-be-api-eu-west-1 --region eu-west-1

# Ver logs específicos
aws logs get-log-events \
    --log-group-name /ecs/uniclick-be-api-task-definition \
    --log-stream-name [STREAM_NAME] \
    --region eu-west-1
```

### **3️⃣ Verificar Health Check del Load Balancer:**

```bash
# Estado del Target Group
aws elbv2 describe-target-health \
    --target-group-arn arn:aws:elasticloadbalancing:eu-west-1:880780901703:targetgroup/uniclick-be-api-tg/917eef3b978d50c8 \
    --region eu-west-1
```

**Estados posibles:**
- `healthy` ✅ - Todo bien
- `unhealthy` ❌ - Health check falla
- `draining` 🔄 - Terminando
- `initial` ⏳ - Iniciando

---

## 🔧 **Posibles Causas y Soluciones**

### **🔴 Causa 1: Contenedor no arranca**

**Síntomas:** Logs muestran error al inicio
**Soluciones:**
```bash
# Test local con imagen actual
docker build -t test-image .
docker run --rm -p 5001:5001 test-image

# Si falla, usar versión minimal
docker build -f Dockerfile.minimal -t test-minimal .
docker run --rm -p 5001:5001 test-minimal
```

### **🔴 Causa 2: Health Check falla**

**Síntomas:** Target Group muestra `unhealthy`
**Verificaciones:**
```bash
# Test health check local
curl -f http://localhost:5001/health
curl -f http://localhost:5001/

# Verificar timeout (debe responder < 10s)
time curl http://localhost:5001/health
```

**Posibles problemas:**
- Puerto incorrecto (debe ser 5001)
- Endpoint `/health` no existe
- Servidor tarda mucho en arrancar
- Dependencias bloquean el arranque

### **🔴 Causa 3: Variables de entorno faltantes**

**Síntomas:** Logs muestran errores de conexión a BD
**Verificar en ECS Task Definition:**
```json
{
  "environment": [
    {"name": "DATABASE_URL", "value": "postgres://..."},
    {"name": "JWT_SECRET", "value": "..."},
    {"name": "PORT", "value": "5001"},
    {"name": "NODE_ENV", "value": "production"}
  ]
}
```

### **🔴 Causa 4: Timeout muy estricto**

**Síntomas:** Contenedor funciona local pero falla en ECS
**Configuración actual del Load Balancer:**
- Health check interval: 30s
- Timeout: 10s  
- Healthy threshold: 2
- Unhealthy threshold: 2

**Solución temporal:** Aumentar timeouts en AWS

### **🔴 Causa 5: Memoria/CPU insuficiente**

**Síntomas:** Contenedor se termina inesperadamente
**Verificar en Task Definition:**
```json
{
  "memory": 1024,  // Mínimo recomendado
  "cpu": 512       // Mínimo recomendado
}
```

### **🔴 Causa 6: Dependencias que fallan**

**Síntomas:** Error al conectar a servicios externos
**Verificaciones comunes:**
- Base de datos no accesible desde ECS
- APIs externas bloqueadas
- Credenciales incorrectas

---

## 🛠️ **Soluciones por Prioridad**

### **🥇 Solución 1: Script Robusto (YA IMPLEMENTADO)**
```dockerfile
# Dockerfile actualizado con:
CMD ["./docker-start-robust.sh"]
```

**Beneficios:**
- ✅ Logging detallado
- ✅ Verificación de health check
- ✅ Manejo de errores
- ✅ Timeout configurables

### **🥈 Solución 2: Versión Minimal**
```bash
# Si el script robusto falla, probar versión minimal
docker build -f Dockerfile.minimal -t minimal-test .

# Desplegar versión minimal para identificar el problema
```

### **🥉 Solución 3: Aumentar Timeouts**
En AWS Load Balancer:
- Health check timeout: 10s → 30s
- Start period: 40s → 120s
- Interval: 30s → 60s

### **🏅 Solución 4: Variables de Entorno**
Verificar que todas las variables estén en ECS Task Definition:
```bash
DATABASE_URL=postgres://...
JWT_SECRET=tu-secret
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=sk-...
PORT=5001
NODE_ENV=production
```

---

## 🧪 **Plan de Testing**

### **Paso 1: Test Local**
```bash
# Test completo con todos los escenarios
./test-potential-issues.sh

# Resultado esperado: todos los tests ✅
```

### **Paso 2: Test con Condiciones AWS**
```bash
# Simular memoria/CPU limitado
docker run --memory=1g --cpus=0.5 -p 5001:5001 tu-imagen

# Simular variables de entorno de producción
docker run -e DATABASE_URL="$DATABASE_URL" -e JWT_SECRET="$JWT_SECRET" tu-imagen
```

### **Paso 3: Despliegue Gradual**
1. **Desplegar versión minimal** (sin funcionalidades complejas)
2. **Verificar que no se revierta**
3. **Añadir funcionalidades gradualmente**

---

## 📊 **Checklist de Verificación**

### **Pre-Despliegue:**
- [ ] `./test-potential-issues.sh` pasa todos los tests
- [ ] Health check responde < 5s localmente
- [ ] Variables de entorno configuradas
- [ ] Imagen < 2GB (recomendado)

### **Post-Despliegue:**
- [ ] Task arranca en < 2 minutos
- [ ] Health check OK en Target Group
- [ ] Logs no muestran errores críticos
- [ ] API responde correctamente

### **Si se Revierte:**
- [ ] Ejecutar `./debug-ecs-failure.sh`
- [ ] Revisar logs de CloudWatch
- [ ] Verificar Target Group health
- [ ] Comprobar Task Definition

---

## 🎯 **Próximos Pasos Recomendados**

### **1️⃣ Inmediato:**
```bash
# Ejecutar diagnóstico completo
./test-potential-issues.sh
./debug-ecs-failure.sh

# Ver resultados y identificar el problema específico
```

### **2️⃣ Si tests locales pasan:**
- El problema está en AWS (variables, timeouts, red)
- Revisar Task Definition y Load Balancer config

### **3️⃣ Si tests locales fallan:**
- Usar `Dockerfile.minimal` para aislar el problema
- Identificar qué componente específico causa el fallo

### **4️⃣ Despliegue con Monitoreo:**
```bash
# Después de desplegar, monitorear en tiempo real:
watch -n 5 'aws ecs describe-services --cluster uniclick-cluster --services uniclick-be-api-eu-west-1 --region eu-west-1 --query "services[0].deployments[0].status"'
```

---

## 🆘 **Si Nada Funciona**

### **Plan B: Rollback Controlado**
1. Identificar la **última versión estable**
2. Forzar despliegue de esa versión
3. Implementar cambios **gradualmente**

### **Plan C: Recrear Servicio**
1. Crear nuevo ECS Service con configuración limpia
2. Migrar tráfico gradualmente
3. Eliminar servicio problemático

---

## 📞 **Información para Soporte**

Si necesitas ayuda externa, proporciona:
1. **Logs de `./debug-ecs-failure.sh`**
2. **Task Definition actual**
3. **Target Group configuration**
4. **Logs de CloudWatch** (últimos 30 minutos)
5. **Resultado de `./test-potential-issues.sh`**

---

## 🎉 **Una vez Solucionado**

### **Documentar la Solución:**
1. **¿Cuál fue la causa raíz?**
2. **¿Qué cambio específico lo solucionó?**
3. **¿Cómo prevenir en el futuro?**

### **Automatizar la Prevención:**
1. Añadir el fix al CI/CD pipeline
2. Crear test automático para esa condición
3. Actualizar documentación

**¡El problema se solucionará! Solo necesitamos identificar la causa específica.** 🚀
