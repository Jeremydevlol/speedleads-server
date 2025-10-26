# 📸 Instagram DM Integration - Quick Start

## ⚡ Instalación Rápida

```bash
# 1. Ejecutar script de setup
chmod +x scripts/setup-instagram.sh
./scripts/setup-instagram.sh

# 2. Instalar dependencias manualmente (alternativa)
npm install instagram-private-api bottleneck bullmq ioredis
```

## 🔧 Configuración Mínima

### 1. Variables de Entorno (.env)

```env
# Instagram
IG_USERNAME=tu_cuenta_secundaria
IG_PASSWORD=tu_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=uniclick2025
```

### 2. Iniciar Redis

**Opción A: Docker**
```bash
docker-compose -f docker-compose.instagram.yml up -d redis
```

**Opción B: Local**
```bash
redis-server
```

### 3. Migraciones de BD

```bash
psql -U your_user -d uniclick -f db/migrations/2025-01-21_create_instagram_tables.sql
```

## 🚀 Uso Básico

### Desde el Backend (API REST)

```javascript
// 1. Login
POST /api/instagram/login
{
  "username": "tu_usuario",
  "password": "tu_password"
}

// 2. Enviar DM
POST /api/instagram/send
{
  "username": "destinatario",
  "text": "Hola!"
}

// 3. Responder con IA
POST /api/instagram/reply-ai
{
  "thread_id": "123456789",
  "text": "Mensaje del usuario",
  "personality_id": 1
}

// 4. Sincronizar inbox
GET /api/instagram/sync-inbox
```

### Desde el Frontend (Socket.IO)

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5001');

// Login
socket.emit('instagram:send', {
  token: jwtToken,
  username: 'destinatario',
  text: 'Hola desde Socket.IO!'
});

// Escuchar mensajes
socket.on('instagram:message', (data) => {
  console.log('Nuevo mensaje:', data);
});

// Escuchar estado
socket.on('instagram:status', (data) => {
  console.log('Estado:', data.connected);
});
```

## 📁 Estructura de Archivos

```
api/
├── dist/
│   ├── services/
│   │   └── instagramService.js      # Servicio principal
│   ├── controllers/
│   │   └── instagramController.js   # Controlador de endpoints
│   ├── routes/
│   │   └── instagramRoutes.js       # Rutas API
│   └── workers/
│       └── instagramQueue.js        # Worker de cola (BullMQ)
├── db/
│   └── migrations/
│       └── 2025-01-21_create_instagram_tables.sql
├── storage/
│   └── ig_state/                    # Sesiones guardadas
├── docker-compose.instagram.yml     # Docker con Redis
├── .env.instagram.example           # Variables de entorno
├── INSTAGRAM_INTEGRATION_GUIDE.md   # Documentación completa
└── INSTAGRAM_README.md              # Este archivo
```

## ⚠️ Advertencias Importantes

### 🚨 RIESGOS
- **Alto riesgo de baneo** si usas tu cuenta principal
- Instagram detecta automatización fácilmente
- **Usa SOLO cuentas secundarias** para testing

### 📊 LÍMITES RECOMENDADOS
- Máximo **30-50 DMs por día** al inicio
- Esperar **1.5-2 segundos** entre mensajes
- Evitar actividad nocturna
- Usar proxies residenciales en producción

### 🛡️ PROTECCIONES IMPLEMENTADAS
- ✅ Rate limiting con Bottleneck (1.5s entre acciones)
- ✅ Cola de mensajes con BullMQ
- ✅ Reintentos automáticos con backoff exponencial
- ✅ Detección de challenges y rate limits
- ✅ Persistencia de sesión (no reloguear constantemente)

## 🧪 Testing

### Test Manual

```bash
# 1. Login
curl -X POST http://localhost:5001/api/instagram/login \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'

# 2. Verificar estado
curl -X GET http://localhost:5001/api/instagram/status \
  -H "Authorization: Bearer YOUR_JWT"

# 3. Enviar DM
curl -X POST http://localhost:5001/api/instagram/send \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"username":"destinatario","text":"Test"}'
```

### Test con Postman

Importa esta colección:

```json
{
  "info": {
    "name": "Instagram API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Login",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{jwt_token}}"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"username\":\"test\",\"password\":\"test123\"}"
        },
        "url": "{{base_url}}/api/instagram/login"
      }
    }
  ]
}
```

## 🔄 Integración con app.js

Agrega esto a tu `dist/app.js`:

```javascript
// Importar rutas y servicios de Instagram
import instagramRoutes from './routes/instagramRoutes.js';
import { configureIGIO, getOrCreateIGSession } from './services/instagramService.js';

// Registrar rutas
app.use('/api/instagram', instagramRoutes);

// Configurar Socket.IO
configureIGIO(io);

// Handlers de Socket.IO
io.on('connection', (socket) => {
  socket.on('instagram:send', async ({ token, username, text }) => {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const userId = payload.userId || payload.sub;
      
      const igService = await getOrCreateIGSession(userId);
      await igService.sendText({ username, text });
      
      socket.emit('instagram:message-sent', { success: true });
    } catch (error) {
      socket.emit('instagram:error', { message: error.message });
    }
  });
});
```

## 📊 Monitoreo

### Ver logs
```bash
tail -f logs/instagram.log
```

### Monitorear Redis
```bash
redis-cli monitor
```

### Ver cola (Redis Commander)
```bash
docker-compose -f docker-compose.instagram.yml --profile debug up redis-commander
# Acceder a: http://localhost:8081
```

### Estadísticas de cola
```javascript
import { getQueueStats } from './workers/instagramQueue.js';

const stats = await getQueueStats();
console.log(stats);
// { waiting: 5, active: 1, completed: 100, failed: 2 }
```

## 🐛 Troubleshooting

| Error | Solución |
|-------|----------|
| "Challenge requerido" | Resuelve el challenge en la app oficial de Instagram |
| "Rate limit alcanzado" | Espera 24 horas y reduce volumen de mensajes |
| "Sesión no activa" | Haz login nuevamente con `/api/instagram/login` |
| "Connection to Redis failed" | Verifica que Redis esté corriendo: `redis-cli ping` |
| "instagram-private-api not found" | Ejecuta: `npm install instagram-private-api` |

## 📚 Documentación Completa

Para más detalles, consulta:
- **[INSTAGRAM_INTEGRATION_GUIDE.md](./INSTAGRAM_INTEGRATION_GUIDE.md)** - Guía completa
- **[instagram-private-api Docs](https://github.com/dilame/instagram-private-api)** - Documentación de la librería
- **[BullMQ Docs](https://docs.bullmq.io/)** - Documentación de la cola

## 🔐 Seguridad

### Mejores Prácticas
- ✅ Nunca commitear credenciales en `.env`
- ✅ Usar variables de entorno en producción
- ✅ Rotar contraseñas regularmente
- ✅ Usar proxies para múltiples cuentas
- ✅ Monitorear logs de errores

### Encriptar Credenciales (Producción)
```javascript
// Usar bcrypt para encriptar passwords en BD
import bcrypt from 'bcrypt';

const hashedPassword = await bcrypt.hash(password, 10);
// Guardar hashedPassword en BD
```

## 🚀 Despliegue

### Docker
```bash
# Build
docker build -t uniclick-api .

# Run con Redis
docker-compose -f docker-compose.instagram.yml up -d
```

### PM2 (Producción)
```bash
# Instalar PM2
npm install -g pm2

# Iniciar app
pm2 start dist/app.js --name uniclick-api

# Iniciar worker
pm2 start dist/workers/instagramQueue.js --name instagram-worker

# Ver logs
pm2 logs
```

## 📞 Soporte

Para problemas o preguntas:
1. Revisar [INSTAGRAM_INTEGRATION_GUIDE.md](./INSTAGRAM_INTEGRATION_GUIDE.md)
2. Verificar logs: `tail -f logs/instagram.log`
3. Revisar Redis: `redis-cli monitor`
4. Contactar al equipo de desarrollo

---

**⚠️ RECORDATORIO:** Usa SOLO cuentas secundarias. Instagram puede banear sin previo aviso.

**✅ LISTO PARA USAR:** Sigue los pasos de instalación y estarás enviando DMs con IA en minutos.
