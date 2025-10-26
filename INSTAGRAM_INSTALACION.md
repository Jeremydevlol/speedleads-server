# 📦 Instagram Bot - Instalación en SpeedLeads Server

## ✅ Archivos Copiados

Todos los archivos del sistema de Instagram han sido copiados desde `api` a `speedleads-server-main`.

### **Servicios (Backend):**
- ✅ `dist/services/instagramBotService.js` (27 KB)
- ✅ `dist/services/instagramService.js` (16 KB)

### **Controladores:**
- ✅ `dist/controllers/instagramController.js` (11 KB)

### **Rutas:**
- ✅ `dist/routes/instagramRoutes.js` (9.6 KB)

### **Documentación:**
- ✅ `INSTAGRAM_BOT_ANTI_DETECTION.md`
- ✅ `INSTAGRAM_MEJORAS_COMPLETAS.md`
- ✅ `INSTAGRAM_INTEGRATION_GUIDE.md`
- ✅ `INSTAGRAM_README.md`
- ✅ `INSTAGRAM_SETUP_COMPLETE.md`

### **Scripts de Prueba:**
- ✅ `test-instagram-anti-detection-simple.js`
- ✅ Otros scripts de prueba de Instagram

### **Migraciones de BD:**
- ✅ `db/migrations/*instagram*.sql`

---

## 🔧 Pasos para Activar Instagram

### **1. Instalar Dependencias**

```bash
npm install instagram-private-api bottleneck axios
```

### **2. Importar Rutas en app.js**

Agrega esto en tu archivo `dist/app.js`:

```javascript
// Importar rutas de Instagram
import instagramRoutes from './routes/instagramRoutes.js';

// Registrar rutas
app.use('/api/instagram', instagramRoutes);
```

### **3. Crear Carpeta de Sesiones**

```bash
mkdir -p storage/ig_state
```

### **4. Configurar Variables de Entorno**

Agrega a tu `.env`:

```bash
# Instagram (opcional, solo si quieres credenciales por defecto)
INSTAGRAM_USERNAME=tu_usuario
INSTAGRAM_PASSWORD=tu_contraseña
```

### **5. Ejecutar Migraciones de BD**

```bash
# Si usas PostgreSQL/Supabase
psql -U tu_usuario -d tu_bd -f db/migrations/2025-01-21_create_instagram_tables.sql
```

O ejecuta las migraciones manualmente en Supabase.

---

## 🚀 Endpoints Disponibles

Una vez activado, tendrás estos endpoints:

```bash
# Activar bot
POST /api/instagram/bot/activate
{
  "username": "tu_usuario_instagram",
  "password": "tu_contraseña",
  "personalityId": 1
}

# Desactivar bot
POST /api/instagram/bot/deactivate

# Ver estado
GET /api/instagram/bot/status

# Actualizar personalidad
POST /api/instagram/bot/update-personality
{
  "personalityId": 1
}

# Obtener DMs
GET /api/instagram/dms

# Obtener comentarios
GET /api/instagram/comments

# Login manual
POST /api/instagram/login
{
  "username": "tu_usuario",
  "password": "tu_contraseña"
}

# Logout
POST /api/instagram/logout

# Enviar mensaje
POST /api/instagram/send
{
  "username": "destinatario",
  "message": "Hola!"
}
```

---

## 🎯 Funcionalidades

### **✅ Anti-Detección Avanzada:**
- Delays variables (5-25 segundos)
- Simulación de lectura y escritura
- Límites de actividad (30/hora, 200/día)
- Horas tranquilas (1 AM - 7 AM)
- 5% probabilidad de no responder

### **✅ Soporte de Medios:**
- Imágenes con Google Vision AI
- Audios con Whisper (transcripción)
- Videos (reconocimiento básico)

### **✅ Bot Inteligente:**
- Respuestas automáticas con IA
- Múltiples personalidades
- Historial de conversación
- Multi-usuario

---

## 🧪 Probar el Sistema

```bash
# Ejecutar script de pruebas
node test-instagram-anti-detection-simple.js
```

---

## 📊 Estructura de Archivos

```
speedleads-server-main/
├── dist/
│   ├── services/
│   │   ├── instagramBotService.js    ✅ Copiado
│   │   └── instagramService.js       ✅ Copiado
│   ├── controllers/
│   │   └── instagramController.js    ✅ Copiado
│   └── routes/
│       └── instagramRoutes.js        ✅ Copiado
├── db/
│   └── migrations/
│       └── *instagram*.sql           ✅ Copiado
├── storage/
│   └── ig_state/                     ← Crear esta carpeta
├── INSTAGRAM_*.md                    ✅ Copiado
└── test-instagram-*.js               ✅ Copiado
```

---

## ⚠️ Importante

1. **Requiere servicios existentes:**
   - `openaiService.js` (para IA)
   - `googleVisionService.js` (para imágenes)
   - `personalityController.js` (para personalidades)

2. **Autenticación:**
   - Todos los endpoints requieren JWT token
   - Usa el mismo sistema de auth que el resto de la app

3. **Base de Datos:**
   - Ejecuta las migraciones antes de usar
   - Requiere tablas: `instagram_accounts`, `instagram_messages`, `instagram_threads`

---

## 📝 Próximos Pasos

1. ✅ Archivos copiados
2. ⏳ Instalar dependencias
3. ⏳ Importar rutas en app.js
4. ⏳ Ejecutar migraciones
5. ⏳ Probar endpoints
6. ⏳ Activar bot desde frontend

---

**Fecha de instalación:** 2025-01-24  
**Versión:** 2.0 (Con anti-detección y soporte de medios)  
**Estado:** ✅ Archivos copiados, listo para configurar


