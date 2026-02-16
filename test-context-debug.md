# Debug del Contexto de la IA

## Pasos para verificar que el contexto funciona:

1. **Revisa los logs del servidor** cuando recibas un mensaje. Busca:
   - `📚 Historial obtenido: X mensajes` - Debe mostrar más de 0 mensajes
   - `🧠 Historial optimizado: X mensajes válidos` - Debe mostrar el número correcto
   - `📖 VERIFICANDO LECTURA COMPLETA DE MENSAJES` - Debe mostrar los últimos mensajes con su contenido

2. **Verifica que el historial se está obteniendo correctamente**:
   - El log debe mostrar mensajes con roles correctos (`[USER]`, `[ASSISTANT]`)
   - Los mensajes deben tener contenido visible (no vacío)

3. **Prueba con una conversación**:
   - Mensaje 1: "quiero un carro azul"
   - Espera la respuesta
   - Mensaje 2: "pero debería ser mejor azul o negro?"
   - La IA debería recordar que hablaste de un carro

## Si el contexto no funciona:

1. Verifica que los mensajes se están guardando en la base de datos
2. Revisa que `getConversationHistory` está retornando mensajes
3. Verifica que el `conversationId` es el mismo en toda la conversación
4. Revisa los logs para ver cuántos mensajes se están enviando a OpenAI

