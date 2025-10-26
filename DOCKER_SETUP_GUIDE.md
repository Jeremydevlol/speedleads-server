# 🐳 **Guía de Configuración Docker para Sistema de Leads**

## 🎯 **¿Qué incluye el Docker?**

El contenedor Docker incluye **todas las funcionalidades implementadas**:
- ✅ **WhatsApp Web** con Baileys
- ✅ **Sistema de Leads** completo (import, sync, move, bulk_send)
- ✅ **Autenticación tolerante** (múltiples fuentes)
- ✅ **Next.js API Routes** y **Express backend**
- ✅ **Base de datos** PostgreSQL/Supabase
- ✅ **Procesamiento de archivos** (CSV, XLSX, PDF)
- ✅ **IA integrada** (OpenAI)

---

## 🔧 **Archivos Docker Actualizados**

### **📁 Dockerfile:**
```dockerfile
# Mejoras añadidas:
- Directorio /app/uploads para archivos
- Directorio /app/.next para Next.js
- Variables NODE_ENV=production
- Expone puertos 5001 y 3000
- Script de inicio personalizado
```

### **📁 docker-start.sh:**
```bash
# Script de inicio inteligente:
- Verifica dependencias
- Crea directorios necesarios
- Compila TypeScript si es necesario
- Muestra información del sistema
- Lista rutas disponibles
```

### **📁 docker-compose.yml:**
```yaml
# Configuración completa:
- Mapeo de puertos 5001:5001 y 3000:3000
- Volúmenes persistentes para WhatsApp
- Variables de entorno completas
- Health checks
- Restart automático
```

### **📁 .dockerignore:**
```
# Optimización de build:
- Excluye node_modules, logs, cache
- Excluye archivos de desarrollo
- Reduce tamaño de imagen
```

---

## 🚀 **Cómo usar Docker**

### **1️⃣ Configurar Variables de Entorno:**
```bash
# Crear archivo .env con:
DATABASE_URL=postgres://postgres:password@host:5432/database
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
JWT_SECRET=tu-jwt-secret-super-seguro
OPENAI_API_KEY=sk-tu-openai-key (opcional)
```

### **2️⃣ Construir y Ejecutar:**

#### **Opción A: Docker Compose (Recomendado):**
```bash
# Construir y ejecutar
docker-compose up --build

# En modo background
docker-compose up -d --build

# Ver logs
docker-compose logs -f
```

#### **Opción B: Docker Manual:**
```bash
# Construir imagen
docker build -t leads-api .

# Ejecutar contenedor
docker run -d \
  --name leads-whatsapp \
  -p 5001:5001 \
  -p 3000:3000 \
  --env-file .env \
  -v whatsapp_sessions:/app/whatsapp-sessions \
  leads-api
```

### **3️⃣ Verificar que Funciona:**
```bash
# ⚡ USAR SCRIPT AUTOMÁTICO (RECOMENDADO)
./test-docker-local.sh

# O verificar manualmente:
# Health check (puerto 5001 para AWS ECS)
curl http://localhost:5001/health

# Verificar rutas de leads
curl http://localhost:5001/api/leads/columns \
  -H "x-user-id: test-user"

# Ver logs del contenedor
docker logs leads-whatsapp -f
```

---

## 📊 **Rutas Disponibles en Docker**

### **🔧 WhatsApp (Puerto 5001):**
- `GET  http://localhost:5001/api/whatsapp/get_conversations` - Obtener chats
- `POST http://localhost:5001/api/whatsapp/send_message` - Enviar mensaje
- `POST http://localhost:5001/api/whatsapp/send_message_to_number` - Envío proactivo
- `GET  http://localhost:5001/api/whatsapp/qr-code` - Obtener QR
- `GET  http://localhost:5001/health` - **Health check para AWS ECS**

### **👥 Leads:**
- `POST /api/leads/import_contacts` - Importar desde archivos
- `POST /api/leads/sync_whatsapp_leads` - Sincronizar WhatsApp
- `POST /api/leads/sync_columns` - Sincronizar columnas
- `POST /api/leads/bulk_send` - Envío masivo
- `POST /api/leads/move` - Mover leads
- `GET  /api/leads/columns` - Obtener columnas

### **📁 Next.js (si se usa):**
- `POST /api/leads/import_contacts` - Next.js route
- `POST /api/whatsapp/ensure_conversations_for_leads` - Vinculación
- Todas las rutas con autenticación tolerante

---

## 🔍 **Debugging en Docker**

### **📝 Ver Logs:**
```bash
# Logs en tiempo real
docker-compose logs -f leads-api

# Logs específicos
docker logs leads-whatsapp -f --tail 100
```

### **🔧 Acceder al Contenedor:**
```bash
# Bash interactivo
docker exec -it leads-whatsapp bash

# Verificar archivos
docker exec -it leads-whatsapp ls -la /app/dist/

# Verificar proceso
docker exec -it leads-whatsapp ps aux
```

### **📊 Health Check:**
```bash
# Estado del contenedor
docker ps

# Health check manual
docker exec -it leads-whatsapp curl http://localhost:5001/api/whatsapp/status
```

---

## 🔧 **Variables de Entorno Críticas**

### **🔴 OBLIGATORIAS:**
```bash
DATABASE_URL=postgres://...           # Conexión BD
SUPABASE_URL=https://...              # URL Supabase
SUPABASE_SERVICE_ROLE_KEY=...         # Key Supabase
JWT_SECRET=...                        # Secret para JWT
```

### **🟡 OPCIONALES:**
```bash
OPENAI_API_KEY=sk-...                 # Para IA
GOOGLE_APPLICATION_CREDENTIALS=...    # Para Vision API
WHATSAPP_SESSION_PATH=/app/sessions   # Sesiones WhatsApp
NODE_ENV=production                   # Entorno
PORT=5001                            # Puerto principal
```

---

## 🚀 **Despliegue en Producción**

### **☁️ En la Nube (AWS/GCP/Azure):**
```bash
# 1. Subir imagen a registry
docker build -t tu-registry/leads-api .
docker push tu-registry/leads-api

# 2. Desplegar en cloud
# Usar docker-compose.yml como base
# Configurar variables de entorno seguras
# Configurar volúmenes persistentes
```

### **🔒 Seguridad en Producción:**
```bash
# Variables seguras (no en .env)
# Usar secrets manager del cloud provider
# Configurar HTTPS con reverse proxy
# Limitar acceso por IP si es necesario
```

---

## 📦 **Volúmenes Persistentes**

### **📁 Datos que se Persisten:**
```yaml
volumes:
  whatsapp_sessions:/app/whatsapp-sessions  # Sesiones WhatsApp
  temp_files:/app/temp                      # Archivos temporales
  uploaded_files:/app/uploads               # Archivos subidos
```

### **🔄 Backup de Volúmenes:**
```bash
# Backup de sesiones WhatsApp
docker run --rm -v whatsapp_sessions:/data -v $(pwd):/backup alpine tar czf /backup/whatsapp_backup.tar.gz /data

# Restaurar backup
docker run --rm -v whatsapp_sessions:/data -v $(pwd):/backup alpine tar xzf /backup/whatsapp_backup.tar.gz -C /
```

---

## ⚡ **Optimizaciones**

### **🚀 Performance:**
- ✅ **Multi-stage build** para imagen más pequeña
- ✅ **Health checks** para auto-recovery
- ✅ **Volúmenes optimizados** para persistencia
- ✅ **Variables de entorno** para configuración

### **📊 Monitoring:**
```bash
# Estadísticas de uso
docker stats leads-whatsapp

# Logs estructurados
docker logs leads-whatsapp | grep "ERROR\|WARN"

# Health check automático cada 30s
```

---

## 🎉 **¡Docker Completamente Configurado!**

**El sistema Docker incluye:**
- ✅ **Todas las funcionalidades** de leads implementadas
- ✅ **Autenticación robusta** con múltiples fuentes
- ✅ **WhatsApp completo** con persistencia
- ✅ **Procesamiento de archivos** (CSV, PDF, XLSX)
- ✅ **IA integrada** para mensajes automáticos
- ✅ **Scripts de inicio** inteligentes
- ✅ **Health checks** y monitoring
- ✅ **Volúmenes persistentes** para datos importantes

**¡Listo para despliegue en cualquier entorno!** 🚀

### **Comandos Rápidos:**
```bash
# Iniciar todo
docker-compose up -d --build

# Ver estado
docker-compose ps

# Ver logs
docker-compose logs -f

# Parar todo
docker-compose down
```
