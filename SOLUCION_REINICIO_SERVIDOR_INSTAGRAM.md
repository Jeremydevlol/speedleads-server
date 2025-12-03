# 🔧 Solución: Sesión de Instagram se pierde al reiniciar el servidor

## 🔴 Problema

Cuando el servidor se reinicia (especialmente en desarrollo con `nodemon`), la sesión de Instagram se pierde porque el Map `igSessions` se limpia (está en memoria) y aunque la sesión está guardada en archivo, no se restaura automáticamente.

## ✅ Solución Implementada

Se han realizado **3 mejoras principales** para mantener las sesiones activas después de reiniciar el servidor:

### **1. Restauración Automática al Iniciar el Servidor**

Se agregó una función `restoreAllSavedSessions()` que se ejecuta automáticamente cuando el servidor inicia. Esta función:

- Busca todos los archivos de sesión guardados en `storage/ig_state/`
- Restaura cada sesión automáticamente
- Verifica que las cookies sean válidas
- Restaura el dispositivo guardado
- Restaura la IP guardada
- Marca como `logged = true` solo si la sesión es válida

**Ubicación:** `dist/services/instagramService.js:4051-4144`

**Se ejecuta automáticamente en:** `dist/app.js:3525-3529`

### **2. Mejora en la Restauración de Sesión Individual**

Cuando se llama a `getOrCreateIGSession()`, ahora:

- Restaura el dispositivo guardado completo
- Restaura la IP guardada para mantener consistencia
- Verifica que la sesión sea válida antes de marcarla como activa
- Si la sesión expiró, la marca como `logged = false` y requiere nuevo login

**Ubicación:** `dist/services/instagramService.js:3913-4029` y `3955-4030`

### **3. Logging Mejorado**

Se agregó logging detallado para poder diagnosticar problemas:

- Logs cuando se restaura una sesión
- Logs cuando se verifica la validez
- Logs cuando una sesión expira
- Logs cuando se restauran múltiples sesiones al inicio

## 🔄 Flujo Completo

### **Al Iniciar el Servidor:**

```
1. Servidor inicia
2. Se configura Socket.IO
3. Se llama a restoreAllSavedSessions()
4. Busca archivos en storage/ig_state/*.json
5. Para cada archivo:
   - Carga cookies
   - Restaura dispositivo
   - Restaura IP
   - Verifica validez con Instagram
   - Si es válida: marca logged = true
   - Si expiró: no la agrega al Map
6. Log: "✅ Restauración completada: X sesión(es) activa(s)"
```

### **Cuando se Usa la Sesión:**

```
1. Se llama getOrCreateIGSession(userId)
2. Si existe en memoria y está logged = true → retorna
3. Si existe pero logged = false → intenta restaurar desde archivo
4. Si no existe → crea nueva y restaura desde archivo
5. Verifica validez antes de usar
```

## 📊 Logs Esperados

### **Al Iniciar el Servidor:**

```
🔄 Intentando restaurar todas las sesiones guardadas...
📁 Encontrados 1 archivo(s) de sesión
📥 Restaurando sesión para usuario abc-123 (sitify.io)...
✅ Dispositivo guardado restaurado desde archivo
📍 IP guardada restaurada: 203.0.113.45
🔍 Verificando validez de sesión restaurada...
✅ Sesión restaurada exitosamente para sitify.io
✅ Restauración completada: 1 sesión(es) activa(s) de 1 archivo(s)
```

### **Si la Sesión Expiró:**

```
⚠️ Sesión para sitify.io expiró (login_required), se requerirá nuevo login
✅ Restauración completada: 0 sesión(es) activa(s) de 1 archivo(s)
```

## 🎯 Resultados Esperados

### **Antes (Sin Restauración Automática):**
- ❌ Al reiniciar el servidor, todas las sesiones se perdían
- ❌ Había que hacer login manual cada vez
- ❌ Las operaciones fallaban con "No hay sesión activa"

### **Ahora (Con Restauración Automática):**
- ✅ Al reiniciar el servidor, las sesiones se restauran automáticamente
- ✅ Si las cookies son válidas, la sesión queda activa inmediatamente
- ✅ Si las cookies expiraron, se informa claramente y se requiere nuevo login
- ✅ El dispositivo e IP se restauran para mantener consistencia

## ⚠️ Notas Importantes

1. **Las cookies pueden expirar:** Si Instagram cierra la sesión o las cookies expiran, la sesión no se podrá restaurar y se requerirá nuevo login.

2. **Tiempo de restauración:** La restauración automática puede tardar unos segundos si hay muchas sesiones guardadas, ya que verifica cada una con Instagram.

3. **Logs informativos:** Si ves "Sesión expiró", es normal si pasó mucho tiempo desde el último login. Simplemente haz login nuevamente.

4. **Persistencia:** Las sesiones se guardan en archivos en `storage/ig_state/[userId].json`, por lo que sobreviven a reinicios del servidor.

## 🧪 Cómo Verificar

1. **Hacer login** en Instagram desde el frontend
2. **Reiniciar el servidor** (o esperar a que nodemon lo reinicie)
3. **Verificar logs** - Deberías ver:
   ```
   🔄 Intentando restaurar todas las sesiones guardadas...
   ✅ Sesión restaurada exitosamente para [tu_usuario]
   ```
4. **Intentar obtener DMs** - Debería funcionar sin requerir nuevo login

## 🔍 Troubleshooting

### **Problema: No se restauran las sesiones**

**Verificar:**
1. ¿Existen archivos en `storage/ig_state/`?
   ```bash
   ls -la storage/ig_state/
   ```

2. ¿Los archivos tienen cookies válidas?
   ```bash
   cat storage/ig_state/[userId].json | grep cookieJar
   ```

3. **Verificar logs** al iniciar el servidor para ver si hay errores

### **Problema: Sesión se restaura pero luego falla**

**Causa:** Las cookies expiraron

**Solución:** Hacer login nuevamente desde el frontend

### **Problema: "No hay sesión activa" después de reiniciar**

**Posibles causas:**
1. Las cookies expiraron (normal si pasó mucho tiempo)
2. Instagram cerró la sesión
3. Error al restaurar (revisar logs)

**Solución:** Hacer login nuevamente

---

**Fecha de implementación:** 1 de diciembre de 2025
**Estado:** ✅ Implementado y funcionando



