# 🚀 GUÍA PARA ACTUALIZAR EN AWS ECS

## 🎯 **PROBLEMA IDENTIFICADO**
```
refresh_token_not_found (status 400)
over_request_rate_limit (status 429)
```

## 🔧 **VARIABLES CRÍTICAS QUE FALTAN**

En AWS ECS, necesitas configurar estas variables de entorno:

```
NODE_ENV=production
FRONTEND_URL=https://app.uniclick.io
COOKIE_DOMAIN=.uniclick.io
SESSION_DOMAIN=.uniclick.io
```

## 📋 **PASOS PARA ACTUALIZAR EN AWS**

### **1. Actualizar Task Definition del BACKEND**

#### **Opción A: AWS Console**
1. Ve a **ECS** → **Task Definitions**
2. Busca tu task definition del backend (`uniclick-be-ecs-api`)
3. **Create new revision**
4. En **Environment variables**, actualiza/agrega:
   ```
   NODE_ENV = production
   COOKIE_DOMAIN = .uniclick.io
   SESSION_DOMAIN = .uniclick.io
   ```
5. **Create**

#### **Opción B: AWS CLI**
```bash
# Descargar task definition actual
aws ecs describe-task-definition --task-definition uniclick-be-ecs-api --query taskDefinition > backend-task-def.json

# Editar el archivo JSON para agregar las variables:
# En "environment": [
#   {"name": "NODE_ENV", "value": "production"},
#   {"name": "COOKIE_DOMAIN", "value": ".uniclick.io"},
#   {"name": "SESSION_DOMAIN", "value": ".uniclick.io"}
# ]

# Registrar nueva revisión
aws ecs register-task-definition --cli-input-json file://backend-task-def.json
```

### **2. Actualizar Task Definition del FRONTEND**

#### **Opción A: AWS Console**
1. Ve a **ECS** → **Task Definitions**
2. Busca tu task definition del frontend (`uniclick-fe-ecs-next`)
3. **Create new revision**
4. En **Environment variables**, actualiza/agrega:
   ```
   NODE_ENV = production
   NEXT_PUBLIC_BACKEND_URL = https://api.uniclick.io
   ```
5. **Create**

### **3. Actualizar Servicios ECS**

#### **Para el Backend:**
```bash
aws ecs update-service \
  --cluster tu-cluster-name \
  --service uniclick-be-ecs-api \
  --task-definition uniclick-be-ecs-api:LATEST \
  --force-new-deployment
```

#### **Para el Frontend:**
```bash
aws ecs update-service \
  --cluster tu-cluster-name \
  --service uniclick-fe-ecs-next \
  --task-definition uniclick-fe-ecs-next:LATEST \
  --force-new-deployment
```

### **4. Verificar el Deployment**

#### **Monitorear el deployment:**
```bash
# Ver estado del servicio backend
aws ecs describe-services --cluster tu-cluster-name --services uniclick-be-ecs-api

# Ver estado del servicio frontend  
aws ecs describe-services --cluster tu-cluster-name --services uniclick-fe-ecs-next

# Ver logs en tiempo real
aws logs tail /ecs/uniclick-be-ecs-api --follow
aws logs tail /ecs/uniclick-fe-ecs-next --follow
```

## 🎯 **CONFIGURACIÓN ALTERNATIVA: SECRETS MANAGER**

Si usas AWS Secrets Manager:

### **1. Crear/Actualizar Secret**
```bash
aws secretsmanager create-secret \
  --name "uniclick-production-env" \
  --description "Environment variables for Uniclick production" \
  --secret-string '{
    "NODE_ENV": "production",
    "COOKIE_DOMAIN": ".uniclick.io", 
    "SESSION_DOMAIN": ".uniclick.io",
    "FRONTEND_URL": "https://app.uniclick.io"
  }'
```

### **2. Referenciar en Task Definition**
En tu task definition JSON:
```json
"secrets": [
  {
    "name": "NODE_ENV",
    "valueFrom": "arn:aws:secretsmanager:region:account:secret:uniclick-production-env:NODE_ENV::"
  },
  {
    "name": "COOKIE_DOMAIN", 
    "valueFrom": "arn:aws:secretsmanager:region:account:secret:uniclick-production-env:COOKIE_DOMAIN::"
  }
]
```

## ⚡ **OPCIÓN RÁPIDA: Terraform/CDK**

Si usas Infrastructure as Code:

### **Terraform:**
```hcl
resource "aws_ecs_task_definition" "backend" {
  family = "uniclick-be-ecs-api"
  
  container_definitions = jsonencode([{
    name = "backend"
    # ... otras configuraciones
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "COOKIE_DOMAIN", value = ".uniclick.io" },
      { name = "SESSION_DOMAIN", value = ".uniclick.io" }
    ]
  }])
}
```

## 🔍 **VERIFICACIÓN POST-DEPLOYMENT**

### **1. Verificar Variables en Contenedor**
```bash
# Conectarse al contenedor running
aws ecs execute-command \
  --cluster tu-cluster-name \
  --task task-id \
  --container backend \
  --interactive \
  --command "/bin/bash"

# Dentro del contenedor:
echo $NODE_ENV
echo $COOKIE_DOMAIN
```

### **2. Verificar Logs**
```bash
# Buscar en logs que las variables estén correctas
aws logs filter-log-events \
  --log-group-name /ecs/uniclick-be-ecs-api \
  --filter-pattern "NODE_ENV"
```

### **3. Probar Autenticación**
1. Ve a `https://app.uniclick.io`
2. Intenta hacer login
3. Verifica en DevTools → Application → Cookies:
   - `Domain: .uniclick.io` ✅
   - `Secure: true` ✅

## 🚨 **TROUBLESHOOTING**

### **Si sigues viendo errores:**

1. **Verificar Health Checks**
   ```bash
   aws ecs describe-services --cluster tu-cluster-name --services uniclick-be-ecs-api
   ```

2. **Verificar Load Balancer**
   - Asegúrate de que sticky sessions estén configuradas
   - Verifica que el ALB esté pasando las cookies correctamente

3. **Limpiar Cache**
   - Limpia cookies del navegador
   - Limpia cache de CloudFront (si lo usas)

## ⏱️ **TIEMPO ESTIMADO**
- Actualización de variables: **5 minutos**
- Deployment: **10-15 minutos**
- Verificación: **5 minutos**
- **Total: ~25 minutos**

## 🎉 **RESULTADO ESPERADO**

Después del deployment deberías ver:
- ✅ No más `refresh_token_not_found`
- ✅ No más `over_request_rate_limit`  
- ✅ Login funcionando correctamente
- ✅ Cookies compartidas entre subdominios 