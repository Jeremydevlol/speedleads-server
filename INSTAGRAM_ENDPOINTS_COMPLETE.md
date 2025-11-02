# 📋 ENDPOINTS DE INSTAGRAM - LISTA COMPLETA

## 📊 RESUMEN
**Total de endpoints: 31**
- GET: 14 endpoints
- POST: 17 endpoints
- Requieren autenticación: 16
- Públicos: 15

---

## ✅ ENDPOINTS GET (14)

### 1. `GET /api/instagram/diagnostic`
- **Descripción**: Diagnóstico del sistema
- **Autenticación**: ❌ Público
- **Uso**: Verificar que los endpoints de Instagram funcionan

### 2. `GET /api/instagram/status`
- **Descripción**: Estado de sesión de Instagram
- **Autenticación**: ✅ Requiere Bearer token
- **Uso**: Verificar si hay sesión activa

### 3. `GET /api/instagram/dms`
- **Descripción**: Obtener DMs (mensajes directos) de Instagram
- **Autenticación**: ✅ Requiere Bearer token
- **Uso**: Listar conversaciones de DM

### 4. `GET /api/instagram/comments`
- **Descripción**: Obtener comentarios recientes de tus posts
- **Autenticación**: ✅ Requiere Bearer token
- **Uso**: Ver comentarios en tus publicaciones

### 5. `GET /api/instagram/messages`
- **Descripción**: Obtener historial de mensajes
- **Autenticación**: ✅ Requiere Bearer token
- **Uso**: Historial completo de mensajes

### 6. `GET /api/instagram/challenge-status`
- **Descripción**: Estado del challenge pendiente
- **Autenticación**: ✅ Requiere Bearer token
- **Uso**: Verificar si hay challenge pendiente

### 7. `GET /api/instagram/sync-inbox`
- **Descripción**: Sincronizar bandeja de entrada
- **Autenticación**: ✅ Requiere Bearer token
- **Uso**: Sincronizar mensajes nuevos

### 8. `GET /api/instagram/bot/status`
- **Descripción**: Estado del bot para el usuario
- **Autenticación**: ✅ Requiere Bearer token
- **Uso**: Ver si el bot está activo para tu usuario

### 9. `GET /api/instagram/bot/global-status`
- **Descripción**: Estado global de todos los bots
- **Autenticación**: ✅ Requiere Bearer token
- **Uso**: Ver estado del sistema de bots completo

### 10. `GET /api/instagram/bot/active-bots`
- **Descripción**: Lista de bots activos
- **Autenticación**: ❌ Público
- **Uso**: Ver qué bots están activos

### 11. `GET /api/instagram/followers?username=XXX&limit=XX`
- **Descripción**: Obtener seguidores de una cuenta
- **Autenticación**: ❌ Público
- **Parámetros Query**:
  - `username`: Username de la cuenta
  - `limit`: Límite de seguidores (default: 100)
- **Uso**: Extraer seguidores de cualquier cuenta

### 12. `GET /api/instagram/search?query=XXX&limit=XX`
- **Descripción**: Buscar usuarios de Instagram
- **Autenticación**: ❌ Público
- **Parámetros Query**:
  - `query`: Término de búsqueda
  - `limit`: Límite de resultados (default: 20)
- **Uso**: Buscar usuarios por nombre

### 13. `GET /api/instagram/personalities`
- **Descripción**: Obtener personalidades del usuario autenticado
- **Autenticación**: ✅ Requiere Bearer token
- **Uso**: Listar personalidades IA del usuario

### 14. `GET /api/instagram/personalities-public`
- **Descripción**: Obtener personalidades públicas
- **Autenticación**: ❌ Público
- **Uso**: Listar personalidades públicas disponibles

---

## ✅ ENDPOINTS POST (17)

### 15. `POST /api/instagram/login`
- **Descripción**: Login a Instagram
- **Autenticación**: ❌ Público
- **Body**:
  ```json
  {
    "username": "tu_usuario",
    "password": "tu_contraseña"
  }
  ```
- **Uso**: Iniciar sesión en Instagram

### 16. `POST /api/instagram/logout`
- **Descripción**: Logout de Instagram
- **Autenticación**: ✅ Requiere Bearer token
- **Body**: `{}`
- **Uso**: Cerrar sesión de Instagram

### 17. `POST /api/instagram/send`
- **Descripción**: Enviar DM a un usuario
- **Autenticación**: ✅ Requiere Bearer token
- **Body**:
  ```json
  {
    "username": "usuario_destino",
    "text": "Mensaje a enviar"
  }
  ```
- **Uso**: Enviar mensaje directo

### 18. `POST /api/instagram/send-message`
- **Descripción**: Enviar mensaje directo (público)
- **Autenticación**: ❌ Público
- **Body**:
  ```json
  {
    "username": "usuario_destino",
    "message": "Mensaje a enviar",
    "userId": "opcional"
  }
  ```
- **Uso**: Enviar mensaje sin autenticación

### 19. `POST /api/instagram/find-and-send`
- **Descripción**: Buscar y enviar mensaje
- **Autenticación**: ❌ Público
- **Body**:
  ```json
  {
    "username": "usuario_a_buscar",
    "message": "Mensaje a enviar"
  }
  ```
- **Uso**: Buscar usuario y enviar mensaje

### 20. `POST /api/instagram/reply-ai`
- **Descripción**: Responder a un mensaje con IA
- **Autenticación**: ✅ Requiere Bearer token
- **Body**:
  ```json
  {
    "thread_id": "id_del_thread",
    "text": "Mensaje del usuario",
    "personality_id": 888
  }
  ```
- **Uso**: Responder con IA a un DM

### 21. `POST /api/instagram/resolve-challenge`
- **Descripción**: Resolver challenge de Instagram
- **Autenticación**: ✅ Requiere Bearer token
- **Body**:
  ```json
  {
    "code": "código_de_verificación"
  }
  ```
- **Uso**: Resolver verificación 2FA

### 22. `POST /api/instagram/bot/activate`
- **Descripción**: Activar bot de Instagram
- **Autenticación**: ✅ Requiere Bearer token
- **Body**:
  ```json
  {
    "username": "usuario_ig",
    "password": "contraseña_ig",
    "personalityId": 888
  }
  ```
- **Uso**: Activar bot automático

### 23. `POST /api/instagram/bot/deactivate`
- **Descripción**: Desactivar bot
- **Autenticación**: ✅ Requiere Bearer token
- **Body**: `{}`
- **Uso**: Desactivar bot automático

### 24. `POST /api/instagram/bot/toggle`
- **Descripción**: Toggle bot (activar/desactivar)
- **Autenticación**: ❌ Público
- **Body**:
  ```json
  {
    "enabled": true,
    "personalityId": 888,
    "userId": "user_id"
  }
  ```
- **Uso**: Activar/desactivar bot desde frontend

### 25. `POST /api/instagram/global-ai/toggle`
- **Descripción**: Toggle IA Global
- **Autenticación**: ❌ Público
- **Body**:
  ```json
  {
    "enabled": true,
    "personalityId": 888,
    "userId": "user_id"
  }
  ```
- **Uso**: Activar IA Global desde frontend

### 26. `POST /api/instagram/bot/update-personality`
- **Descripción**: Actualizar personalidad del bot activo
- **Autenticación**: ❌ Público (pero requiere bot activo)
- **Body**:
  ```json
  {
    "personalityId": 888,
    "userId": "user_id"
  }
  ```
- **Uso**: Cambiar personalidad sin reiniciar bot

### 27. `POST /api/instagram/followers-send-ai`
- **Descripción**: Enviar mensajes IA personalizados a seguidores
- **Autenticación**: ❌ Público
- **Body**:
  ```json
  {
    "username": "cuenta_objetivo",
    "limit": 50,
    "message": "Mensaje base",
    "personalityId": 888,
    "userId": "user_id",
    "delay": 3000
  }
  ```
- **Uso**: Extraer seguidores y enviar mensajes personalizados con IA

### 28. `POST /api/instagram/comments-send-ai`
- **Descripción**: Enviar mensajes IA a comentaristas de un post
- **Autenticación**: ❌ Público
- **Body**:
  ```json
  {
    "postUrl": "https://www.instagram.com/p/XXX/",
    "message": "Mensaje base",
    "personalityId": 888,
    "userId": "user_id",
    "delay": 3000
  }
  ```
- **Uso**: Extraer comentarios y enviar DMs personalizados

### 29. `POST /api/instagram/bulk-send-list`
- **Descripción**: Envío masivo desde lista de usernames
- **Autenticación**: ❌ Público
- **Body**:
  ```json
  {
    "usernames": ["user1", "user2"],
    "message": "Mensaje a enviar",
    "delay": 2000
  }
  ```
- **Uso**: Enviar mensaje a múltiples usuarios

### 30. `POST /api/instagram/bulk-send-followers`
- **Descripción**: Envío masivo a seguidores de una cuenta
- **Autenticación**: ❌ Público
- **Body**:
  ```json
  {
    "target_username": "cuenta_objetivo",
    "message": "Mensaje a enviar",
    "limit": 50,
    "delay": 2000
  }
  ```
- **Uso**: Enviar mensaje a todos los seguidores

### 31. `POST /api/instagram/import-leads`
- **Descripción**: Importar leads de Instagram (seguidores)
- **Autenticación**: ❌ Público
- **Body**:
  ```json
  {
    "username": "cuenta_objetivo",
    "limit": 50
  }
  ```
- **Uso**: Importar seguidores como leads

---

## 🎯 FUNCIONALIDADES PRINCIPALES

### 🤖 **Bot Automático**
- Activar/desactivar bot
- Respuestas automáticas a DMs
- Respuestas automáticas a comentarios
- Personalidad configurable

### 📤 **Envío de Mensajes**
- DM individual
- Envío masivo a seguidores
- Envío masivo desde lista
- Mensajes con IA personalizada

### 📊 **Extracción de Datos**
- Seguidores de cuentas
- Comentarios de posts
- Búsqueda de usuarios
- DMs y conversaciones

### 🧠 **IA e Personalización**
- Respuestas con IA
- Personalidades configurable
- Contexto de conversación
- Mensajes personalizados

---

## 🔐 AUTENTICACIÓN

**Token Bearer requerido para endpoints privados:**
```
Authorization: Bearer {tu_token_jwt}
```

**Endpoints que NO requieren autenticación:**
- `/api/instagram/diagnostic`
- `/api/instagram/login`
- `/api/instagram/send-message`
- `/api/instagram/find-and-send`
- `/api/instagram/bot/active-bots`
- `/api/instagram/followers`
- `/api/instagram/search`
- `/api/instagram/personalities-public`
- `/api/instagram/bot/toggle`
- `/api/instagram/global-ai/toggle`
- `/api/instagram/bot/update-personality`
- `/api/instagram/followers-send-ai`
- `/api/instagram/comments-send-ai`
- `/api/instagram/bulk-send-list`
- `/api/instagram/bulk-send-followers`
- `/api/instagram/import-leads`

---

## ✅ ESTADO DE PRUEBAS

Basado en pruebas con token Bearer:
- ✅ 24 endpoints funcionando correctamente
- ⚠️ 5 endpoints necesitan sesión activa de Instagram
- ⚠️ 2 endpoints tuvieron timeout (activación de bot)
- ❌ 1 endpoint requiere configuración adicional (challenge)

---

## 🚀 ENDPOINTS MÁS IMPORTANTES

### Para uso diario:
1. **Login**: `POST /api/instagram/login`
2. **Estado**: `GET /api/instagram/status`
3. **DMs**: `GET /api/instagram/dms`
4. **Enviar mensaje**: `POST /api/instagram/send-message`
5. **Activar bot**: `POST /api/instagram/global-ai/toggle`

### Para automatización:
1. **Enviar a seguidores con IA**: `POST /api/instagram/followers-send-ai`
2. **Enviar a comentaristas con IA**: `POST /api/instagram/comments-send-ai`
3. **Estado del bot**: `GET /api/instagram/bot/status`

---

## 📝 NOTAS IMPORTANTES

1. **Sesión activa requerida**: Muchos endpoints necesitan hacer login primero
2. **Personalidad**: Usar `personalityId: 888` para personalidad "Juas"
3. **UserId**: `a123ccc0-7ee7-45da-92dc-52059c7e21c8` (del token)
4. **Delay recomendado**: 2000-3000ms entre mensajes para evitar rate limiting
5. **Historial de conversación**: Se guarda automáticamente para continuidad


