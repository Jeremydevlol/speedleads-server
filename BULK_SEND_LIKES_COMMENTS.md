# 📤 Nuevos Endpoints - Envío Masivo a Likes y Comentarios

## 🎯 Objetivo
Permitir enviar mensajes automáticos con IA a usuarios que:
1. Dieron like a una publicación
2. Comentaron en una publicación

Similar a cómo funciona el envío masivo a seguidores.

---

## 🔌 Nuevos Endpoints

### 1. **Enviar a Usuarios que Dieron Like**
```
POST /api/instagram/bulk-send-likers
```

### 2. **Enviar a Usuarios que Comentaron**
```
POST /api/instagram/bulk-send-commenters
```

---

## 📝 Request Body (Ambos Endpoints)

```javascript
{
  "postUrl": "https://www.instagram.com/reel/SHORTCODE/",
  "message": "Mensaje base que se personalizará con IA",
  "limit": 50,              // Opcional, default 50
  "delay": 2000,            // Opcional, default 2000ms
  "userId": "uuid",         // Opcional, se obtiene del token JWT
  "personalityId": "uuid",  // Opcional, se obtiene del bot activo
  "send_as_audio": false    // Opcional, default false (audio deshabilitado)
}
```

---

## 📤 Response

```javascript
{
  "success": true,
  "message": "Envío masivo completado: 45 mensajes enviados (40 generados con IA), 5 fallidos",
  "postUrl": "https://www.instagram.com/reel/SHORTCODE/",
  "post_info": {
    "id": "3693252490930008095",
    "shortcode": "DNBEZKjtbAf",
    "like_count": 1137,
    "comment_count": 124,
    "owner": {
      "username": "autor_post",
      "full_name": "Nombre Autor"
    }
  },
  "sent_count": 45,
  "ai_generated_count": 40,
  "failed_count": 5,
  "total_users": 50,
  "personality_used": "uuid-personalidad",
  "personality_name": "Vendedor Profesional",
  "send_as_audio": false,
  "results": [
    {
      "username": "usuario1",
      "full_name": "Usuario Uno",
      "status": "sent",
      "ai_generated": true,
      "sent_as_audio": false,
      "message_preview": "Hola Usuario Uno! Vi que te gustó el post sobre...",
      "timestamp": "2025-01-13T16:30:00.000Z"
    }
    // ... más resultados
  ]
}
```

---

## 🔄 Flujo de Funcionamiento

### **Endpoint: bulk-send-likers**
```
1. Recibe postUrl y mensaje base
   ↓
2. Extrae likes del post (usando getLikesFromPost)
   ↓
3. Por cada usuario que dio like:
   a. Genera mensaje personalizado con IA
   b. Usa el nombre del usuario y contexto del post
   c. Envía mensaje directo
   d. Guarda en historial de conversación
   ↓
4. Retorna resumen de envíos
```

### **Endpoint: bulk-send-commenters**
```
1. Recibe postUrl y mensaje base
   ↓
2. Extrae comentarios del post (usando getCommentsFromPost)
   ↓
3. Por cada usuario que comentó:
   a. Genera mensaje personalizado con IA
   b. Incluye referencia al comentario del usuario
   c. Envía mensaje directo
   d. Guarda en historial de conversación
   ↓
4. Retorna resumen de envíos
```

---

## 🤖 Personalización con IA

### **Para Likers:**
```javascript
// Contexto enviado a la IA:
{
  "user_info": {
    "username": "usuario1",
    "full_name": "Usuario Uno",
    "is_verified": false,
    "is_private": false
  },
  "post_info": {
    "author": "@autor_post",
    "like_count": 1137,
    "comment_count": 124
  },
  "action": "dio like al post",
  "base_message": "Mensaje base del usuario"
}

// Prompt para IA:
"Genera un mensaje personalizado para {username} ({full_name}) que dio like 
al post de {author}. Usa este mensaje base como guía: {base_message}. 
Personaliza el mensaje mencionando que viste que le gustó el contenido."
```

### **Para Commenters:**
```javascript
// Contexto enviado a la IA:
{
  "user_info": {
    "username": "usuario1",
    "full_name": "Usuario Uno",
    "comment_text": "¡Excelente contenido! 🔥",
    "comment_likes": 15
  },
  "post_info": {
    "author": "@autor_post",
    "like_count": 1137,
    "comment_count": 124
  },
  "action": "comentó en el post",
  "base_message": "Mensaje base del usuario"
}

// Prompt para IA:
"Genera un mensaje personalizado para {username} ({full_name}) que comentó 
'{comment_text}' en el post de {author}. Usa este mensaje base como guía: 
{base_message}. Personaliza el mensaje haciendo referencia a su comentario."
```

---

## 📊 Ejemplos de Uso

### **Ejemplo 1: Enviar a Likers**
```javascript
// Request
POST /api/instagram/bulk-send-likers
{
  "postUrl": "https://www.instagram.com/reel/DNBEZKjtbAf/",
  "message": "Hola! Vi que te gustó mi contenido. ¿Te interesa saber más?",
  "limit": 50,
  "delay": 3000
}

// Response
{
  "success": true,
  "sent_count": 48,
  "ai_generated_count": 48,
  "failed_count": 2,
  "total_users": 50
}
```

### **Ejemplo 2: Enviar a Commenters**
```javascript
// Request
POST /api/instagram/bulk-send-commenters
{
  "postUrl": "https://www.instagram.com/reel/DNBEZKjtbAf/",
  "message": "Gracias por tu comentario! Me alegra que te haya gustado.",
  "limit": 30,
  "delay": 2000
}

// Response
{
  "success": true,
  "sent_count": 28,
  "ai_generated_count": 28,
  "failed_count": 2,
  "total_users": 30
}
```

---

## ⚠️ Consideraciones

### **Rate Limiting:**
- Delay mínimo recomendado: 2000ms (2 segundos)
- Instagram puede bloquear si envías demasiado rápido
- Límite recomendado: 50-100 mensajes por sesión

### **Personalidad de IA:**
- Si no hay bot activo, se envía el mensaje base sin personalizar
- Si hay bot activo, se usa su personalidad para generar variaciones
- Cada mensaje es único y personalizado

### **Audio Deshabilitado:**
- `send_as_audio` está deshabilitado por defecto
- Instagram eliminó `broadcastVoice` en 2025
- Solo se envían mensajes de texto

### **Historial de Conversación:**
- Cada mensaje se guarda en el historial
- Permite que el bot responda coherentemente después
- Se mantienen los últimos 50 mensajes por usuario

---

## 🔧 Implementación Técnica

### **Código Base (Estructura):**
```javascript
app.post('/api/instagram/bulk-send-likers', async (req, res) => {
  const { postUrl, message, limit = 50, delay = 2000, userId, personalityId } = req.body;
  
  // 1. Validar parámetros
  // 2. Obtener userId y personalityId (del bot activo o token)
  // 3. Extraer likes del post
  // 4. Por cada usuario:
  //    - Generar mensaje con IA
  //    - Enviar mensaje
  //    - Guardar en historial
  //    - Delay
  // 5. Retornar resumen
});

app.post('/api/instagram/bulk-send-commenters', async (req, res) => {
  const { postUrl, message, limit = 50, delay = 2000, userId, personalityId } = req.body;
  
  // 1. Validar parámetros
  // 2. Obtener userId y personalityId (del bot activo o token)
  // 3. Extraer comentarios del post
  // 4. Por cada usuario:
  //    - Generar mensaje con IA (incluye su comentario)
  //    - Enviar mensaje
  //    - Guardar en historial
  //    - Delay
  // 5. Retornar resumen
});
```

---

## 📄 Archivos a Modificar

1. **`dist/app.js`** - Agregar los 2 nuevos endpoints
2. **`dist/services/instagramService.js`** - Ya tiene las funciones necesarias:
   - `getLikesFromPost(postUrl, limit)`
   - `getCommentsFromPost(postUrl, limit)`
   - `sendText({ username, text })`

---

## ✅ Checklist de Implementación

- [ ] Crear endpoint `POST /api/instagram/bulk-send-likers`
- [ ] Crear endpoint `POST /api/instagram/bulk-send-commenters`
- [ ] Integrar extracción de likes
- [ ] Integrar extracción de comentarios
- [ ] Implementar generación de mensajes con IA
- [ ] Implementar envío de mensajes
- [ ] Implementar guardado de historial
- [ ] Agregar manejo de errores
- [ ] Agregar rate limiting
- [ ] Testing con posts reales
- [ ] Documentar en frontend

---

**Última actualización:** 13 de Enero, 2025  
**Versión:** 1.0.0  
**Estado:** 📝 Especificación completa - Listo para implementar
