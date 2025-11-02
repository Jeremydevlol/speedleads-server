# 🚨 Alertas de Sesión de Instagram

## 🎯 Problema Identificado

Cuando Instagram cierra la sesión (por inactividad, desafíos de seguridad, o actividad sospechosa), el sistema fallaba en silencio sin notificar al usuario. Los logs mostraban:

```
❌ Error obteniendo inbox: GET /api/v1/direct_v2/inbox/ - 500 Internal Server Error
❌ Error obteniendo comentarios: GET /api/v1/accounts/current_user/ - 403 Forbidden; login_required
```

**El usuario no sabía que tenía que hacer login nuevamente.**

---

## ✅ Solución Implementada

Ahora el sistema detecta automáticamente estos errores y emite alertas en tiempo real vía Socket.IO.

---

## 🔔 Nuevas Alertas Implementadas

### **1. `session_expired` (Error 🔴)**

**Cuándo se activa:**
- Error 403 o 401 de Instagram
- Mensaje contiene "login_required" o "Forbidden"
- Instagram detecta actividad sospechosa y cierra la sesión

**Datos emitidos:**
```json
{
  "type": "session_expired",
  "severity": "error",
  "message": "Sesión de Instagram expirada",
  "description": "Tu sesión de Instagram ha expirado o fue cerrada. Por favor, haz login nuevamente desde el panel de Instagram.",
  "action_required": true,
  "timestamp": 1706457600000
}
```

**Qué hace el sistema:**
1. Marca la sesión como desconectada (`logged = false`)
2. Emite alerta vía Socket.IO
3. El bot deja de intentar procesar mensajes
4. Frontend recibe notificación para hacer login

---

### **2. `rate_limit` (Warning 🟡)**

**Cuándo se activa:**
- Error 429 de Instagram
- Mensaje contiene "rate", "spam", o "too many"
- Instagram detecta demasiadas acciones

**Datos emitidos:**
```json
{
  "type": "rate_limit",
  "severity": "warning",
  "message": "Rate limit de Instagram alcanzado",
  "description": "Instagram está limitando tus acciones. Espera 1-2 horas antes de continuar.",
  "action_required": true,
  "wait_time": "1-2 horas",
  "timestamp": 1706457600000
}
```

**Qué hace el sistema:**
1. Notifica al usuario del problema
2. Recomienda esperar 1-2 horas
3. El bot puede seguir funcionando pero con menos actividad

---

### **3. `instagram_server_error` (Warning 🟡)**

**Cuándo se activa:**
- Error 500, 502, o 503 de Instagram
- Instagram tiene problemas temporales de servidor

**Datos emitidos:**
```json
{
  "type": "instagram_server_error",
  "severity": "warning",
  "message": "Instagram temporalmente no disponible",
  "description": "Instagram está devolviendo error 500. Esto puede ser temporal. El bot intentará de nuevo automáticamente.",
  "error_status": 500,
  "timestamp": 1706457600000
}
```

**Qué hace el sistema:**
1. Notifica que es un problema temporal
2. El bot reintenta automáticamente
3. No requiere acción del usuario

---

## 🔍 Dónde se Detectan Estos Errores

### **1. En fetchInbox (DMs)**

```javascript
// dist/services/instagramBotService.js línea ~487
try {
  threads = await botData.igService.fetchInbox();
} catch (inboxError) {
  // Detecta: 403, 401, 429, 500, etc.
  // Emite alerta específica según el tipo de error
}
```

### **2. En checkForNewComments**

```javascript
// dist/services/instagramBotService.js línea ~1054
try {
  const user = await botData.igService.ig.account.currentUser();
  // ...
} catch (error) {
  // Detecta: 403, 401, 429, 500, etc.
  // Emite alerta específica
}
```

---

## 🎨 UI Recomendada para el Frontend

```tsx
const AlertCard = ({ alert }) => {
  // Para session_expired, mostrar botón de acción
  if (alert.type === 'session_expired') {
    return (
      <div className="alert alert-error">
        <div>
          <h4>🚨 {alert.message}</h4>
          <p>{alert.description}</p>
        </div>
        <button 
          onClick={() => router.push('/instagram/login')}
          className="btn btn-primary"
        >
          Ir a Login de Instagram
        </button>
      </div>
    );
  }
  
  // Para rate_limit, mostrar timer
  if (alert.type === 'rate_limit') {
    return (
      <div className="alert alert-warning">
        <div>
          <h4>⚠️ {alert.message}</h4>
          <p>{alert.description}</p>
          {alert.wait_time && (
            <small>⏰ Espera: {alert.wait_time}</small>
          )}
        </div>
      </div>
    );
  }
  
  // Para instagram_server_error, mostrar mensaje temporar
  if (alert.type === 'instagram_server_error') {
    return (
      <div className="alert alert-warning">
        <div>
          <h4>⚠️ {alert.message}</h4>
          <p>{alert.description}</p>
          <small>🔄 Reintentando automáticamente...</small>
        </div>
      </div>
    );
  }
  
  // Para otros tipos de alertas...
};
```

---

## 🧪 Cómo Probar

### **Test 1: Simular Sesión Expirada**

1. Activa el bot de Instagram
2. En los logs, deberías ver que funciona correctamente
3. Cierra manualmente la sesión en Instagram web
4. Espera 45 segundos (siguiente check del bot)
5. Deberías ver en los logs: `🚨 SESIÓN EXPIRADA`
6. El frontend debería recibir alerta `session_expired`

### **Test 2: Verificar Rate Limit**

Los rate limits son difíciles de simular sin hacer muchas acciones. Pero cuando ocurren naturalmente, verás:
- Log: `🚨 RATE LIMIT alcanzado`
- Alerta emitida: `rate_limit`
- Frontend muestra advertencia

### **Test 3: Error 500**

Instagram rara vez devuelve 500s, pero cuando lo hace:
- Log: `🚨 Error de servidor de Instagram (500)`
- Alerta emitida: `instagram_server_error`
- Bot reintenta automáticamente

---

## 📝 Implementación en el Frontend

Ver archivo: `FRONTEND_ALERTAS_INSTAGRAM.md`

**Resumen rápido:**

```typescript
socket.on('instagram:alert', (alert) => {
  if (alert.type === 'session_expired') {
    // Mostrar alerta crítica
    // Redirigir a página de login
  } else if (alert.type === 'rate_limit') {
    // Mostrar advertencia
    // Desactivar botón de envío temporalmente
  } else if (alert.type === 'instagram_server_error') {
    // Mostrar mensaje temporal
    // No requiere acción del usuario
  }
});
```

---

## ✅ Estado Actual

- ✅ Detección de sesión expirada: Implementada
- ✅ Detección de rate limit: Implementada
- ✅ Detección de errores 500: Implementada
- ✅ Emisión de alertas vía Socket.IO: Implementada
- ✅ Marcado de sesión como desconectada: Implementada
- ✅ Detención automática del envío masivo: Implementada ⭐ NUEVO
- ✅ Compilación sin errores: Confirmada

---

## 🎯 Beneficios

1. **Transparencia**: El usuario sabe inmediatamente qué está pasando
2. **Acción rápida**: Puede hacer login nuevamente sin perder tiempo
3. **Menos frustración**: No hay silencio cuando algo falla
4. **Mejor UX**: Alertas claras con instrucciones
5. **Debugging**: Logs detallados para diagnóstico

---

## 🛑 Detención Automática del Envío Masivo

Además de las alertas, cuando la sesión expira **durante** un envío masivo de seguidores, el sistema **detiene automáticamente** el proceso.

### **Código Implementado:**

```javascript
// En dist/app.js línea ~1520
if (sendResult.error && sendResult.error.includes('No hay sesión activa')) {
  console.error(`🚨 [BULK-FOLLOWERS] SESIÓN EXPIRADA DURANTE ENVÍO MASIVO. Deteniendo proceso...`);
  console.log(`📊 [BULK-FOLLOWERS] Resumen hasta ahora: ${sentCount} enviados, ${failedCount} fallidos`);
  break; // Salir del loop
}
```

### **Comportamiento:**

1. ✅ El envío masivo continúa normalmente
2. 🚨 Si Instagram cierra la sesión durante el proceso
3. 🔍 El bot detecta "No hay sesión activa" en el error
4. 🛑 Se detiene automáticamente el envío masivo
5. 📊 Se muestra un resumen de cuántos mensajes se enviaron antes de fallar
6. 🔔 Se emite la alerta `session_expired` al frontend

### **Ejemplo de Logs:**

```
📤 [BULK-FOLLOWERS] Procesando 20/38: usuario123...
✅ [BULK-FOLLOWERS] Mensaje enviado a usuario123
⏳ [BULK-FOLLOWERS] Esperando 2000ms antes del siguiente mensaje...

📤 [BULK-FOLLOWERS] Procesando 21/38: usuario124...
❌ [BULK-FOLLOWERS] Error enviando a usuario124: No hay sesión activa de Instagram...
🚨 [BULK-FOLLOWERS] SESIÓN EXPIRADA DURANTE ENVÍO MASIVO. Deteniendo proceso...
📊 [BULK-FOLLOWERS] Resumen hasta ahora: 20 enviados, 1 fallidos
✅ [BULK-FOLLOWERS] Envío masivo completado: 20 enviados (20 con IA), 1 fallidos
```

**Beneficios:**
- No desperdicia tokens de IA generando mensajes que no se enviarán
- No intenta enviar más mensajes cuando la sesión ya expiró
- El usuario sabe exactamente cuántos mensajes se enviaron
- El frontend recibe la alerta de sesión expirada

---

**TODO LISTO Y FUNCIONANDO** 🚀

