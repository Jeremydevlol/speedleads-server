# 🤖 Sistema de IA para Instagram - Guía de Integración Frontend

## 📋 Resumen

El sistema de IA para Instagram funciona exactamente igual que WhatsApp, con respuestas automáticas basadas en personalidades y configuración de IA global por usuario.

---

## 🎯 Funcionalidades Implementadas

### 1. **IA Global Automática**
- El bot responde automáticamente a todos los mensajes entrantes
- Usa la personalidad seleccionada por el usuario
- Mantiene contexto de conversación
- Comportamiento humano (delays, typing simulation)

### 2. **Respuesta Manual con IA**
- El usuario puede responder manualmente usando IA
- Selecciona la personalidad a usar
- Genera respuesta inteligente basada en el contexto

### 3. **Gestión de Personalidades**
- Cada usuario puede tener múltiples personalidades
- Se puede seleccionar una personalidad por defecto
- Las personalidades definen el tono y estilo de respuesta

---

## 🔌 Endpoints Disponibles

### 1. **Activar Bot con IA Global**

```http
POST /api/instagram/bot/activate
Authorization: Bearer {token}
Content-Type: application/json

{
  "username": "instagram_username",
  "password": "instagram_password",
  "personalityId": 1
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Bot de Instagram activado correctamente",
  "userId": "user-uuid"
}
```

---

### 2. **Desactivar Bot**

```http
POST /api/instagram/bot/deactivate
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Bot de Instagram desactivado correctamente"
}
```

---

### 3. **Obtener Estado del Bot**

```http
GET /api/instagram/bot/status
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "success": true,
  "status": {
    "isActive": true,
    "hasService": true,
    "hasPersonality": true,
    "processedMessages": 15,
    "lastResponseTime": 1761303007627
  },
  "userId": "user-uuid"
}
```

---

### 4. **Responder Manualmente con IA**

```http
POST /api/instagram/reply-ai
Authorization: Bearer {token}
Content-Type: application/json

{
  "thread_id": "340282366841710301244259842832008357639",
  "text": "Hola, ¿qué es Uniclick?",
  "personality_id": 1
}
```

**Respuesta:**
```json
{
  "success": true,
  "reply": "¡Hola! Uniclick es una plataforma que te permite crear páginas web personalizadas...",
  "personality": "Asistente Amigable"
}
```

**Notas:**
- `thread_id`: ID de la conversación (obtenido de `/api/instagram/dms`)
- `text`: Mensaje del usuario al que se responde
- `personality_id`: (Opcional) ID de personalidad a usar. Si no se envía, usa la personalidad por defecto del usuario

---

### 5. **Obtener DMs**

```http
GET /api/instagram/dms
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "340282366841710301244259842832008357639",
      "sender_name": "readytoblessd",
      "username": "readytoblessd",
      "avatar": "https://...",
      "last_message": "Quién eres",
      "timestamp": "1761302971162967",
      "unread_count": 0
    }
  ]
}
```

---

### 6. **Obtener Comentarios**

```http
GET /api/instagram/comments
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "18534334033025026",
      "post_id": "3748987634732031894_78009502614",
      "author_name": "readytoblessd",
      "username": "readytoblessd",
      "author_avatar": "https://...",
      "comment_text": "Eso que es amigo",
      "timestamp": "1761134298",
      "post_caption": "",
      "post_image": "https://..."
    }
  ]
}
```

---

## 🎨 Implementación en el Frontend

### 1. **Activar IA Global**

```typescript
// Servicio de Instagram
async activateBot(username: string, password: string, personalityId: number) {
  const response = await fetch(`${API_URL}/api/instagram/bot/activate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username,
      password,
      personalityId
    })
  });
  
  return await response.json();
}
```

---

### 2. **Responder con IA**

```typescript
// Componente de Chat
async sendAIResponse(threadId: string, userMessage: string, personalityId?: number) {
  const response = await fetch(`${API_URL}/api/instagram/reply-ai`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      thread_id: threadId,
      text: userMessage,
      personality_id: personalityId
    })
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log('Respuesta IA:', data.reply);
    console.log('Personalidad usada:', data.personality);
  }
  
  return data;
}
```

---

### 3. **UI Recomendada**

#### **Botón de IA en el Chat**

```tsx
<Button
  onClick={() => handleAIResponse()}
  disabled={!selectedPersonality || isGenerating}
>
  {isGenerating ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Generando...
    </>
  ) : (
    <>
      <Sparkles className="mr-2 h-4 w-4" />
      Responder con IA
    </>
  )}
</Button>
```

---

#### **Selector de Personalidad**

```tsx
<Select value={selectedPersonality} onValueChange={setSelectedPersonality}>
  <SelectTrigger>
    <SelectValue placeholder="Selecciona personalidad" />
  </SelectTrigger>
  <SelectContent>
    {personalities.map((p) => (
      <SelectItem key={p.id} value={p.id.toString()}>
        {p.nombre}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

#### **Toggle de IA Global**

```tsx
<div className="flex items-center space-x-2">
  <Switch
    checked={isGlobalAIActive}
    onCheckedChange={handleToggleGlobalAI}
  />
  <Label>IA Global Activa</Label>
</div>
```

---

## 🔄 Flujo de Trabajo

### **Modo Automático (IA Global Activa)**

1. Usuario activa el bot con `POST /api/instagram/bot/activate`
2. Bot se conecta a Instagram con las credenciales
3. Bot monitorea constantemente los mensajes entrantes
4. Cuando llega un mensaje nuevo:
   - Simula escritura humana (delay)
   - Genera respuesta con IA usando la personalidad seleccionada
   - Envía la respuesta automáticamente
   - Marca el mensaje como procesado

### **Modo Manual**

1. Usuario ve los DMs en el frontend
2. Usuario selecciona una conversación
3. Usuario lee el mensaje del contacto
4. Usuario hace clic en "Responder con IA"
5. Frontend llama a `POST /api/instagram/reply-ai`
6. Backend genera respuesta con IA
7. Backend envía la respuesta a Instagram
8. Frontend muestra la respuesta enviada

---

## 🧠 Cómo Funciona la IA

### **Generación de Respuestas**

El sistema usa `generateBotResponse` de `openaiService.js`:

```javascript
const response = await generateBotResponse({
  personality: personalityData,      // Datos de la personalidad
  userMessage: text,                 // Mensaje del usuario
  userId: userId,                    // ID del usuario
  history: conversationHistory,      // Historial de conversación
  mediaType: null,                   // Tipo de media (imagen, audio, etc.)
  mediaContent: null                 // Contenido de la media
});
```

### **Personalidades**

Las personalidades definen:
- **Nombre**: Nombre del asistente
- **Empresa**: Empresa que representa
- **Instrucciones**: Cómo debe comportarse
- **Saludo**: Mensaje de bienvenida
- **Categoría**: Tipo de personalidad (amigable, profesional, etc.)

### **Contexto de Conversación**

El sistema mantiene:
- Últimos 10 mensajes de la conversación
- Información de multimedia compartida
- Historial de saludos (para no repetir)
- Contexto de la empresa/servicio

---

## ⚙️ Configuración

### **Variables de Entorno Requeridas**

```env
# OpenAI (Principal)
OPENAI_API_KEY=sk-...

# DeepSeek (Fallback)
DEEPSEEK_API_KEY=sk-...

# Supabase
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...

# JWT
JWT_SECRET=...

# Instagram (Opcional - solo para pruebas)
INSTAGRAM_USERNAME=...
INSTAGRAM_PASSWORD=...
```

---

## 🎯 Características Especiales

### **Anti-detección**

El bot implementa comportamiento humano:
- **Delays aleatorios**: Entre 3-8 segundos entre respuestas
- **Typing simulation**: Simula que está escribiendo
- **Rate limiting**: Máximo 1 respuesta cada 5 segundos
- **Variación de respuestas**: No repite patrones

### **Manejo de Errores**

- Si falla OpenAI, usa DeepSeek como fallback
- Si ambos fallan, usa respuestas predefinidas
- Logs detallados para debugging
- Reintentos automáticos

### **Persistencia**

- Sesiones de Instagram guardadas en disco
- Cookies persistentes entre reinicios
- Historial de mensajes en base de datos
- Estado del bot por usuario

---

## 📊 Monitoreo

### **Logs del Bot**

```bash
# Ver logs en tiempo real
tail -f backend.log | grep "Instagram Bot"
```

### **Estado del Bot**

```javascript
// Verificar estado
GET /api/instagram/bot/status

// Respuesta
{
  "isActive": true,           // Bot activo
  "hasService": true,         // Servicio de Instagram conectado
  "hasPersonality": true,     // Personalidad cargada
  "processedMessages": 15,    // Mensajes procesados
  "lastResponseTime": 1761... // Última respuesta (timestamp)
}
```

---

## 🚀 Próximos Pasos

1. **Implementar UI en el frontend** para:
   - Activar/desactivar IA global
   - Seleccionar personalidad
   - Responder manualmente con IA
   - Ver estado del bot en tiempo real

2. **Agregar notificaciones** cuando:
   - El bot responde automáticamente
   - Hay un error en la respuesta
   - Se activa/desactiva el bot

3. **Historial de conversación** completo:
   - Guardar todos los mensajes en BD
   - Mostrar historial en el frontend
   - Contexto completo para IA

4. **Respuestas a comentarios**:
   - Responder comentarios vía DM
   - Filtrar comentarios por post
   - Respuestas automáticas a comentarios

---

## 📝 Notas Importantes

- ✅ El sistema ya está **100% funcional** en el backend
- ✅ Usa la **misma lógica que WhatsApp**
- ✅ Soporta **tokens de Supabase**
- ✅ **Personalidades dinámicas** por usuario
- ✅ **Respuestas automáticas** con IA
- ✅ **Anti-detección** implementado
- ✅ **Fallback a DeepSeek** si OpenAI falla

---

## 🎉 ¡Todo Listo!

El backend está completamente preparado para que el frontend implemente la interfaz de usuario. Solo necesitas:

1. Crear los componentes UI
2. Conectar los endpoints
3. Manejar los estados (loading, error, success)
4. Mostrar las respuestas generadas

**¡El sistema de IA está listo para usar!** 🚀

