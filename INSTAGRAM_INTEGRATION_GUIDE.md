# 📸 Guía de Integración de Instagram DM con IA

## ⚠️ ADVERTENCIAS IMPORTANTES

### Riesgos
- **Alto riesgo de baneo**: Instagram detecta automatización fácilmente
- **Usar SOLO cuentas secundarias** para testing
- **NO usar tu cuenta principal** hasta validar en producción
- La librería `instagram-private-api` usa ingeniería inversa (no oficial)

### Limitaciones Recomendadas
- Máximo **30-50 DMs por día** al inicio
- Esperar **1.5-2 segundos** entre mensajes
- Usar **proxies residenciales** para múltiples cuentas
- Resolver **challenges manualmente** en la app oficial

---

## 🚀 Instalación

### 1. Instalar Dependencias

```bash
npm install instagram-private-api bottleneck bullmq ioredis
```

### 2. Configurar Variables de Entorno

Copia `.env.instagram.example` a `.env` y configura:

```bash
cp .env.instagram.example .env
```

Edita `.env`:
```env
IG_USERNAME=tu_cuenta_secundaria
IG_PASSWORD=tu_password
REDIS_URL=redis://localhost:6379
```

### 3. Iniciar Redis

**Opción A: Docker Compose**
```bash
docker-compose -f docker-compose.instagram.yml up -d redis
```

**Opción B: Redis local**
```bash
brew install redis  # macOS
redis-server
```

### 4. Ejecutar Migraciones de Base de Datos

```bash
psql -U your_user -d uniclick -f db/migrations/2025-01-21_create_instagram_tables.sql
```

### 5. Iniciar Worker de Cola (opcional pero recomendado)

```bash
node dist/workers/instagramQueue.js
```

---

## 📋 Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                   │
│              Socket.IO + REST API calls              │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                  Backend (Node.js)                   │
│  ┌──────────────────────────────────────────────┐   │
│  │  instagramRoutes.js (REST endpoints)         │   │
│  └──────────────┬───────────────────────────────┘   │
│                 │                                    │
│  ┌──────────────▼───────────────────────────────┐   │
│  │  instagramController.js                      │   │
│  │  - Login/Logout                              │   │
│  │  - Send DM                                   │   │
│  │  - Reply with AI                             │   │
│  └──────────────┬───────────────────────────────┘   │
│                 │                                    │
│  ┌──────────────▼───────────────────────────────┐   │
│  │  instagramService.js                         │   │
│  │  - Session management                        │   │
│  │  - Rate limiting (Bottleneck)                │   │
│  │  - Instagram API client                      │   │
│  └──────────────┬───────────────────────────────┘   │
│                 │                                    │
│  ┌──────────────▼───────────────────────────────┐   │
│  │  instagramQueue.js (BullMQ)                  │   │
│  │  - Message queue                             │   │
│  │  - Retry logic                               │   │
│  │  - Rate limit protection                     │   │
│  └──────────────┬───────────────────────────────┘   │
└─────────────────┼───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│              Redis (BullMQ)                      │
└──────────────────────────────────────────────────┘
```

---

## 🔌 Endpoints API

### 1. Login a Instagram
```http
POST /api/instagram/login
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "username": "tu_usuario",
  "password": "tu_password",
  "proxy": "http://user:pass@host:port" // Opcional
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Login exitoso",
  "restored": false,
  "username": "tu_usuario"
}
```

**Respuesta con challenge:**
```json
{
  "success": false,
  "error": "Challenge requerido. Resuelve el challenge en la app oficial de Instagram."
}
```

### 2. Enviar DM
```http
POST /api/instagram/send
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "username": "destinatario",
  "text": "Hola! Este es un mensaje de prueba"
}
```

### 3. Sincronizar Inbox
```http
GET /api/instagram/sync-inbox
Authorization: Bearer <jwt_token>
```

**Respuesta:**
```json
{
  "success": true,
  "threads": [
    {
      "thread_id": "123456789",
      "users": [
        {
          "pk": "987654321",
          "username": "usuario1",
          "full_name": "Usuario Uno"
        }
      ],
      "last_message": {
        "id": "msg_123",
        "type": "text",
        "text": "Hola!",
        "timestamp": 1234567890
      }
    }
  ],
  "count": 1
}
```

### 4. Responder con IA
```http
POST /api/instagram/reply-ai
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "thread_id": "123456789",
  "text": "Mensaje del usuario",
  "personality_id": 1  // Opcional
}
```

### 5. Verificar Estado
```http
GET /api/instagram/status
Authorization: Bearer <jwt_token>
```

### 6. Obtener Historial de Mensajes
```http
GET /api/instagram/messages?thread_id=123456789&limit=50
Authorization: Bearer <jwt_token>
```

---

## 🔌 Socket.IO Events

### Eventos Emitidos (Backend → Frontend)

```javascript
// Estado de conexión
socket.on('instagram:status', (data) => {
  console.log(data);
  // { connected: true, username: "...", igUserId: "..." }
});

// Challenge requerido
socket.on('instagram:challenge', (data) => {
  console.log(data);
  // { message: "...", type: "challenge_required" }
});

// Nuevo mensaje recibido
socket.on('instagram:message', (data) => {
  console.log(data);
  // { thread_id: "...", users: [...], message: {...} }
});

// Error
socket.on('instagram:error', (data) => {
  console.log(data);
  // { message: "...", type: "rate_limit" }
});
```

### Eventos Escuchados (Frontend → Backend)

```javascript
// Enviar DM
socket.emit('instagram:send', {
  token: jwtToken,
  username: 'destinatario',
  text: 'Mensaje'
});

// Responder con IA
socket.emit('instagram:reply-ai', {
  token: jwtToken,
  thread_id: '123456789',
  text: 'Mensaje del usuario'
});
```

---

## 🔧 Integración con app.js

Agrega esto a tu `dist/app.js`:

```javascript
import instagramRoutes from './routes/instagramRoutes.js';
import { configureIGIO } from './services/instagramService.js';

// ... código existente ...

// Rutas de Instagram
app.use('/api/instagram', instagramRoutes);

// Configurar Socket.IO para Instagram
configureIGIO(io);

// Socket.IO handlers para Instagram
io.on('connection', (socket) => {
  // ... handlers existentes de WhatsApp ...
  
  // Instagram: Enviar DM
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
  
  // Instagram: Responder con IA
  socket.on('instagram:reply-ai', async ({ token, thread_id, text }) => {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const userId = payload.userId || payload.sub;
      
      // Implementar lógica de respuesta con IA
      // Similar a WhatsApp
    } catch (error) {
      socket.emit('instagram:error', { message: error.message });
    }
  });
});
```

---

## 🛡️ Mejores Prácticas Anti-Baneo

### 1. Rate Limiting
- ✅ Implementado con Bottleneck (1.5s entre acciones)
- ✅ Cola con BullMQ para reintentos
- ✅ Máximo 40 acciones por minuto

### 2. Comportamiento Humano
- ⏱️ Delays aleatorios entre mensajes
- 📊 Volumen bajo al inicio (< 30 DMs/día)
- 🌙 Evitar actividad nocturna
- 📱 Simular patrones de uso real

### 3. Proxies
```javascript
// En login
await igService.login({
  username: 'tu_usuario',
  password: 'tu_password',
  proxy: 'http://user:pass@proxy.com:8080'
});
```

### 4. Manejo de Challenges
- Resolver manualmente en app oficial
- No automatizar resolución de captchas
- Esperar 24-48h después de challenge

### 5. Monitoreo
```javascript
// Logs detallados con Pino
import pino from 'pino';
const logger = pino({ level: 'info' });

// Alertas ante errores
socket.on('instagram:error', (data) => {
  if (data.type === 'rate_limit') {
    // Pausar envíos por 24h
  }
});
```

---

## 🧪 Testing

### 1. Test de Login
```bash
curl -X POST http://localhost:5001/api/instagram/login \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_account",
    "password": "test_password"
  }'
```

### 2. Test de Envío
```bash
curl -X POST http://localhost:5001/api/instagram/send \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "destinatario",
    "text": "Test message"
  }'
```

### 3. Test de Inbox
```bash
curl -X GET http://localhost:5001/api/instagram/sync-inbox \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 📊 Monitoreo de Cola (BullMQ)

### Ver estadísticas
```javascript
import { getQueueStats } from './workers/instagramQueue.js';

const stats = await getQueueStats();
console.log(stats);
// { waiting: 5, active: 1, completed: 100, failed: 2 }
```

### Redis Commander (UI)
```bash
docker-compose -f docker-compose.instagram.yml --profile debug up redis-commander
```
Accede a: http://localhost:8081

---

## 🚨 Troubleshooting

### Error: "Challenge requerido"
**Solución:** Abre Instagram en tu móvil y resuelve el challenge manualmente.

### Error: "Rate limit alcanzado"
**Solución:** Espera 24 horas y reduce el volumen de mensajes.

### Error: "Sesión no activa"
**Solución:** Haz login nuevamente con `/api/instagram/login`.

### Error: "Connection to Redis failed"
**Solución:** Verifica que Redis esté corriendo:
```bash
redis-cli ping  # Debe responder "PONG"
```

---

## 🔄 Migración a API Oficial (Futuro)

Para producción, considera migrar a **Instagram Graph API**:

1. Crear app en Facebook Developers
2. Solicitar permisos de Instagram Messaging
3. Proceso de aprobación (2-4 semanas)
4. Implementar con API oficial

**Ventajas:**
- ✅ Sin riesgo de baneo
- ✅ Más estable
- ✅ Soporte oficial

**Desventajas:**
- ❌ Solo cuentas de negocio
- ❌ Proceso de aprobación largo
- ❌ Más limitado

---

## 📝 Checklist de Implementación

- [x] Instalar dependencias
- [x] Configurar variables de entorno
- [x] Iniciar Redis
- [x] Ejecutar migraciones
- [x] Integrar rutas en app.js
- [x] Configurar Socket.IO
- [x] Iniciar worker de cola
- [ ] Crear cuenta de testing de Instagram
- [ ] Probar login
- [ ] Probar envío de DM
- [ ] Probar respuesta con IA
- [ ] Configurar proxies (producción)
- [ ] Implementar monitoreo
- [ ] Documentar para equipo

---

## 📚 Recursos

- [instagram-private-api Docs](https://github.com/dilame/instagram-private-api)
- [BullMQ Docs](https://docs.bullmq.io/)
- [Bottleneck Docs](https://github.com/SGrondin/bottleneck)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api)

---

## 🆘 Soporte

Para problemas o preguntas:
1. Revisar logs: `tail -f logs/instagram.log`
2. Verificar Redis: `redis-cli monitor`
3. Revisar cola: Redis Commander
4. Contactar al equipo de desarrollo

---

**⚠️ RECORDATORIO FINAL:** Usa SOLO cuentas secundarias para testing. Instagram puede banear cuentas sin previo aviso.
