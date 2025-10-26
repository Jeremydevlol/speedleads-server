# 🤖 Instagram Bot - Sistema Anti-Detección y Soporte de Medios

## 📋 Resumen

El bot de Instagram ha sido mejorado con medidas avanzadas de anti-detección y soporte completo para medios (imágenes, audios, videos), similar al sistema de WhatsApp.

---

## 🛡️ Medidas Anti-Detección Implementadas

### 1. **Delays Variables y Humanos**

#### **Delays Básicos:**
- **Delay mínimo entre respuestas:** 5 segundos
- **Delay máximo entre respuestas:** 25 segundos
- **Delay de lectura:** 1.5 segundos + 10ms por carácter
- **Delay de escritura:** 3 segundos + 15ms por carácter

#### **Delays Inteligentes:**
```javascript
// Ejemplo de delay según hora del día
const currentHour = new Date().getHours();
if (currentHour >= 1 && currentHour < 7) {
  delay *= 1.5; // 50% más lento en horas tranquilas (1 AM - 7 AM)
}
```

### 2. **Límites de Actividad**

#### **Por Hora:**
- Máximo **30 mensajes por hora**
- El bot automáticamente deja de responder si alcanza este límite

#### **Por Día:**
- Máximo **200 mensajes por día**
- Contador se resetea cada 24 horas

#### **Horas Tranquilas:**
- **Habilitado:** Sí
- **Horario:** 1 AM - 7 AM
- **Comportamiento:** Delays aumentados en 50%

### 3. **Comportamiento Humano**

#### **Simulación de Lectura:**
```javascript
// Simula que el usuario "lee" el mensaje antes de responder
await simulateReading(messageLength);
// Tiempo = 1.5s + (longitud del mensaje * 10ms)
// Máximo: 5 segundos
```

#### **Simulación de Escritura:**
```javascript
// Simula que el usuario "escribe" la respuesta
await simulateTyping(responseLength);
// Tiempo = 3s + (longitud de respuesta * 15ms)
// Máximo: 8 segundos
```

#### **Probabilidad de "Estar Ocupado":**
- **5% de probabilidad** de no responder un mensaje
- Simula que el usuario está ocupado o no vio el mensaje

### 4. **Seguimiento de Actividad**

El bot mantiene un registro de:
- ✅ Timestamp de cada mensaje enviado
- ✅ Mensajes procesados (evita duplicados)
- ✅ Historial de conversación por thread
- ✅ Última vez que respondió

---

## 📎 Soporte de Medios (Como WhatsApp)

### 1. **Imágenes** 📸

#### **Procesamiento:**
1. Detecta imagen en el mensaje
2. Extrae URL de la imagen
3. Analiza con **GPT-4 Vision**
4. Genera descripción detallada
5. Responde con contexto de la imagen

#### **Ejemplo:**
```javascript
// Usuario envía imagen de un auto
// Bot detecta: "Un auto deportivo rojo estacionado en la calle"
// Respuesta: "¡Qué auto más increíble! El rojo le queda perfecto..."
```

### 2. **Audios** 🎵

#### **Procesamiento:**
1. Detecta audio en el mensaje
2. Descarga el archivo de audio
3. Transcribe con **Whisper de OpenAI**
4. Genera respuesta basada en la transcripción
5. Responde como si fuera texto

#### **Ejemplo:**
```javascript
// Usuario envía audio: "Hola, quiero información sobre sus servicios"
// Bot transcribe y responde: "¡Hola! Claro, con gusto te cuento sobre..."
```

### 3. **Videos** 🎥

#### **Procesamiento:**
1. Detecta video en el mensaje
2. Extrae URL del video
3. Reconoce que es un video (análisis básico)
4. Responde reconociendo el contenido

#### **Nota:** 
- Por ahora, solo reconoce que es un video
- En el futuro se puede agregar análisis de frames con visión AI

---

## 🔧 Configuración del Bot

### **Archivo:** `dist/services/instagramBotService.js`

```javascript
this.config = {
  name: 'Asistente Uniclick',
  antiDetection: {
    minDelay: 5000,      // 5 segundos
    maxDelay: 25000,     // 25 segundos
    typingDelay: 3000,   // 3 segundos
    readingDelay: 1500,  // 1.5 segundos
    
    maxMessagesPerHour: 30,
    maxMessagesPerDay: 200,
    
    quietHours: {
      enabled: true,
      start: 1,  // 1 AM
      end: 7     // 7 AM
    },
    
    responseVariation: {
      enabled: true,
      skipChance: 0.05,  // 5%
      delayMultiplier: 1.5
    }
  }
};
```

---

## 📊 Flujo de Procesamiento de Mensajes

### **Diagrama:**

```
1. Nuevo mensaje detectado
   ↓
2. ¿Es seguro responder? (límites, delays)
   ↓ Sí
3. ¿Debemos responder? (5% skip chance)
   ↓ Sí
4. Detectar tipo de medio (imagen/audio/video)
   ↓
5. Procesar medio (análisis/transcripción)
   ↓
6. Simular lectura del mensaje
   ↓
7. Generar respuesta con IA + personalidad
   ↓
8. Simular escritura de respuesta
   ↓
9. Enviar respuesta
   ↓
10. Registrar mensaje enviado
   ↓
11. Delay humano antes del siguiente mensaje
```

---

## 🎯 Funciones Principales

### 1. **Anti-Detección**

```javascript
// Verificar si es seguro responder
isSafeToRespond(userId)

// Verificar si debemos responder (skip chance)
shouldRespond(userId)

// Generar delay humano
getHumanDelay()

// Simular lectura
simulateReading(messageLength)

// Simular escritura
simulateTyping(responseLength)

// Registrar mensaje enviado
recordMessageSent(userId)
```

### 2. **Procesamiento de Medios**

```javascript
// Procesar imagen con visión AI
processImage(imageUrl, userMessage)

// Procesar audio con transcripción
processAudio(audioUrl, userMessage)

// Procesar video
processVideo(videoUrl, userMessage)
```

### 3. **Generación de Respuestas**

```javascript
// Generar respuesta con IA (con soporte de medios)
generateAIResponse(userId, userMessage, history, mediaType, mediaContent)
```

---

## 📈 Estadísticas y Monitoreo

### **Logs del Bot:**

```
🔍 [Instagram Bot] Verificando nuevos mensajes para user123...
   Personalidad activa: Juas (ID: 889)
📥 [Instagram Bot] 3 conversaciones encontradas para user123

💬 [Instagram Bot] Nuevo mensaje para user123:
   De: @usuario_ejemplo
   Texto: "Hola, ¿cómo estás?"
📸 [Instagram Bot] Imagen detectada: https://...
✅ [Instagram Bot] Imagen analizada: Un gato naranja durmiendo...
👀 [Instagram Bot] Simulando lectura del mensaje...
🧠 [Instagram Bot] Generando respuesta con IA para usuario user123...
📎 [Instagram Bot] Mensaje con medio detectado: image
✅ [Instagram Bot] Respuesta IA generada: "¡Qué lindo gato! Se ve muy..."
⌨️  [Instagram Bot] Simulando escritura...
📤 [Instagram Bot] Enviando respuesta...
✅ [Instagram Bot] Respuesta enviada exitosamente para user123
⏳ [Instagram Bot] Esperando 12.5s (comportamiento humano)...
```

---

## ⚠️ Advertencias y Límites

### **Límites de Instagram:**
- No enviar más de **30 mensajes por hora**
- No enviar más de **200 mensajes por día**
- Respetar delays mínimos entre mensajes
- Evitar patrones repetitivos

### **Recomendaciones:**
- ✅ Usar personalidades variadas
- ✅ Activar horas tranquilas
- ✅ No desactivar el skip chance
- ✅ Monitorear logs regularmente
- ❌ No modificar delays a menos de 3 segundos
- ❌ No aumentar límites de mensajes

---

## 🚀 Uso del Sistema

### **Activar Bot:**
```bash
POST /api/instagram/bot/activate
{
  "username": "tu_usuario",
  "password": "tu_contraseña",
  "personalityId": 889
}
```

### **Desactivar Bot:**
```bash
POST /api/instagram/bot/deactivate
```

### **Ver Estado:**
```bash
GET /api/instagram/bot/status
```

### **Actualizar Personalidad:**
```bash
POST /api/instagram/bot/update-personality
{
  "personalityId": 889
}
```

---

## 🎨 Integración con Frontend

El frontend ya está preparado para:
- ✅ Activar/desactivar bot
- ✅ Seleccionar personalidad
- ✅ Ver estado del bot
- ✅ Ver mensajes y respuestas
- ✅ Filtrar por DMs y comentarios

---

## 📝 Notas Finales

### **Ventajas del Sistema:**
1. **Muy difícil de detectar** como bot
2. **Soporte completo de medios** (imágenes, audios, videos)
3. **Respuestas inteligentes** con personalidad
4. **Límites automáticos** para proteger la cuenta
5. **Comportamiento humano** realista

### **Próximas Mejoras:**
- [ ] Análisis de frames de video con visión AI
- [ ] Detección de emociones en imágenes
- [ ] Respuestas con emojis contextuales
- [ ] Análisis de sentimiento en conversaciones
- [ ] Integración con más plataformas

---

## 🔗 Archivos Relacionados

- `dist/services/instagramBotService.js` - Servicio principal del bot
- `dist/services/openaiService.js` - Servicio de IA y procesamiento de medios
- `dist/services/instagramService.js` - Servicio de Instagram API
- `dist/routes/instagramRoutes.js` - Rutas de API

---

**¡El bot de Instagram está listo para usar con todas las mejoras de anti-detección y soporte de medios!** 🎉

