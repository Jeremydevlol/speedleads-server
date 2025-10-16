# Consideraciones de tiempo de espera y rendimiento en handlers HTTP

Este documento resume los puntos críticos detectados en los controllers del backend que pueden exceder el **timeout** (por ejemplo, 60 s del ALB de AWS) y propone posibles soluciones.

---

## 1. Procesamiento local de audio: FFmpeg + Whisper CLI

**Ubicación**: `dist/controllers/whatsappController.js`

```js
await execAsync(`ffmpeg -i "${tempFile}" -ar 16000 -ac 1 "${wavFile}"`);
await execAsync(
  `whisper "${wavFile}" --model base --language Spanish --output_dir "${tempDir}"`
);
```

**Problema**:
- Puede tardar mucho tiempo (≥ 60 s) al procesar audios medianos o largos.
- Bloquea la respuesta HTTP hasta completar FFmpeg y la transcripción local.

**Posibles soluciones**:
- Externalizar la transcripción a la API de OpenAI Whisper.
- Desacoplar el trabajo pesado a un worker o cola de tareas (Bull, Agenda, RabbitMQ).
- Devolver pronto un job ID al cliente y notificar resultado por WebSocket/Webhook/polling.

---

## 2. Llamadas síncronas a Google Vision API

**Ubicación**: `dist/controllers/whatsappController.js`

```js
extractedText = await analyzeImageBufferWithVision(buffer);
extractedText = await analyzePdfBufferWithVision(buffer);
```

**Problema**:
- Cada petición a la API remota de Google Vision puede demorar varios segundos.
- Sumado a otras tareas, el handler puede superar el timeout.

**Posibles soluciones**:
- Mover a un flujo asíncrono desacoplado (job queue).
- Usar procesamiento en segundo plano y notificar al cliente posteriormente.
- Aplicar límites de tamaño/páginas de PDF y rechazar peticiones muy grandes.

---

## 3. Procesamiento inline de medios en personalityController

**Ubicación**: `dist/controllers/personalityController.js` → `processMediaArray`

```js
await processMediaArray(media, ...);
const botResp = await generateBotResponse(...);
```

**Problema**:
- OCR de PDF (poppler + Vision), OCR de imágenes y transcripción de audio se ejecutan antes de responder.
- Bucles secuenciales de E/S y llamadas a APIs externas pueden tardar mucho.

**Posibles soluciones**:
- Procesar medios off‑line en workers.
- Guardar datos crudos y notificar al cliente cuando estén listos.
- Limitar tamaños totales de media (ya hay límite de 10 MB).

---

## 4. Handler Webchat bloqueante

**Ubicación**: `dist/controllers/webchatConfig.js`

```js
res.json = async (data) => { ... }
return await testPersonalityContextPublic(req, res);
```

**Problema**:
- La petición no finaliza hasta completar todo el flujo de IA/BD/OCR.

**Posibles soluciones**:
- Desacoplar testPersonalityContextPublic a un endpoint asíncrono.
- Implementar respuesta temprana y follow‑up por WebSocket/Webhook.

---

## 5. Bulk insert secuencial de eventos

**Ubicación**: `dist/controllers/calendarController.js`

```js
for (const event of events) {
  const newEvent = await insertEvent(...);
  insertedEvents.push(newEvent);
}
```

**Problema**:
- Insertar uno a uno cientos de eventos puede tardar decenas de segundos.

**Posibles soluciones**:
- Usar un único `INSERT ... VALUES (...)` con múltiples filas.
- Desacoplar la carga masiva a un worker asíncrono.

---

## 6. Llamadas a OpenAI GPT-4 sin control de timeout

**Ubicación**: `dist/services/openaiService.js`

```js
const completion = await openai.createChatCompletion({ model: 'gpt-4', ... });
```

**Problema**:
- GPT-4 puede tardar > 30 s en generar respuesta, sin fallback temporizado.

**Posibles soluciones**:
- Utilizar un diseño de aplicacion que permita manejo asincrono de respuestas con jobs que se ejecuten en segundo plano.
- Configurar un timeout HTTP razonable y manejar fallback rápido. (no siempre los intermediarios lo permiten, como CF, ALB, etc.)
- Subir a modelo más rápido o recortar contexto si es muy largo.

---

## Recomendaciones generales

- Desacoplar tareas pesadas a workers o colas de tareas.
- Notificar resultados finales por WebSocket, Webhook o polling.
- Limitar tamaños de payload (media, historial) para acotar latencia.
- Batch operations en BD (bulk inserts, updates).
- Implementar timeouts en llamadas externas (FFmpeg, Vision, OpenAI).
- Aumentar idle timeout del ALB solo como medida temporal.