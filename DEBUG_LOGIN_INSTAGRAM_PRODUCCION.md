# 🐛 Debug: Login de Instagram en Producción

## 🔍 Problema Identificado

Los logs muestran que:
- ✅ Socket conectado: `o1hG1FCY5L4i9XXLAAAX`
- ✅ Token validado para userId: `2614da61-29f7-4f2e-9a9b-dcb8e1bbdae7`
- ✅ Usuario encontrado: `juan@gmail.com`

Pero **NO** aparece el log:
- ❌ `🔐 [LOGIN] Endpoint de login de Instagram llamado`

Esto significa que **el endpoint `/api/instagram/login` NO se está llamando** desde el frontend.

---

## ✅ Solución Implementada

### **1. Logs Detallados Agregados**

He agregado logs muy detallados al inicio del endpoint para capturar:
- 📅 Hora exacta de la petición
- 🌐 IP del cliente
- 📦 Headers completos
- 📨 Body recibido
- 🔍 Proceso de obtención del userId

### **2. Middleware Interceptor**

Se agregó un middleware que intercepta **TODAS** las peticiones POST a `/api/instagram/login` antes de llegar al endpoint, para verificar si la petición está llegando al servidor.

---

## 📋 Qué Buscar en los Logs

### **Si la petición LLEGA al servidor, deberías ver:**

```
🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯
🚨🚨🚨 MIDDLEWARE INTERCEPTOR: Petición POST a /api/instagram/login detectada 🚨🚨🚨
   Timestamp: 2025-01-XX...
   IP: 81.41.175.157
   URL completa: /api/instagram/login
   Body parseado: SÍ
   Headers auth: PRESENTE/NO
🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯
```

Y luego:

```
═══════════════════════════════════════════════════════════════
🔐 [LOGIN] ⚡ ENDPOINT DE LOGIN DE INSTAGRAM LLAMADO ⚡
📅 Hora: 2025-01-XX...
🌐 IP: 81.41.175.157
📝 Method: POST
🛣️  Path: /api/instagram/login
...
```

### **Si NO ves estos logs:**

El problema está en el **frontend**:
- ❌ No está llamando al endpoint
- ❌ Está llamando a un endpoint diferente
- ❌ Hay un error de JavaScript que impide la llamada
- ❌ La URL del endpoint es incorrecta

---

## 🔧 Verificaciones Necesarias

### **1. Verificar que el Frontend Llame al Endpoint**

En el frontend, busca dónde se hace el login de Instagram y verifica que:
- ✅ La URL sea: `https://speedleads-server.onrender.com/api/instagram/login`
- ✅ El método sea: `POST`
- ✅ Se envíen: `username`, `password`, y opcionalmente `userId`
- ✅ Se incluya el header `Authorization: Bearer <token>` si es necesario

### **2. Verificar el Código del Frontend**

El frontend debería hacer algo como:

```javascript
const response = await fetch('https://speedleads-server.onrender.com/api/instagram/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` // Opcional si el endpoint es público
  },
  body: JSON.stringify({
    username: 'cuenta_instagram',
    password: 'contraseña',
    userId: '2614da61-29f7-4f2e-9a9b-dcb8e1bbdae7' // Opcional, se obtiene del token
  })
});

const data = await response.json();
console.log('Resultado login:', data);
```

### **3. Verificar Consola del Navegador**

Abre la consola del navegador (F12) y verifica:
- ✅ Si hay errores de JavaScript
- ✅ Si la petición se está haciendo
- ✅ Si hay errores de CORS
- ✅ Si hay errores de red

### **4. Verificar Network Tab**

En la pestaña "Network" del navegador:
- ✅ Busca la petición a `/api/instagram/login`
- ✅ Verifica el estado de la petición (200, 400, 500, etc.)
- ✅ Verifica los headers enviados
- ✅ Verifica el body enviado
- ✅ Verifica la respuesta del servidor

---

## 🚨 Posibles Problemas y Soluciones

### **Problema 1: El Frontend No Está Llamando al Endpoint**

**Síntomas:**
- No ves ningún log del middleware interceptor
- No ves ningún log del endpoint

**Solución:**
- Verificar el código del frontend
- Verificar que el botón/acción de login esté conectado correctamente
- Verificar que no haya errores de JavaScript en la consola

### **Problema 2: Error de CORS**

**Síntomas:**
- En la consola del navegador ves: `CORS policy: ...`
- La petición falla antes de llegar al servidor

**Solución:**
- Verificar la configuración de CORS en `dist/app.js`
- Verificar que el origen del frontend esté permitido

### **Problema 3: URL Incorrecta**

**Síntomas:**
- La petición va a una URL diferente
- Error 404 en los logs

**Solución:**
- Verificar que la URL sea exactamente: `/api/instagram/login`
- Verificar que no haya errores de tipeo

### **Problema 4: Error Silencioso en el Frontend**

**Síntomas:**
- La petición se hace pero no se procesa
- No hay respuesta visible

**Solución:**
- Agregar `try/catch` en el frontend
- Agregar logs en el frontend antes y después de la petición
- Verificar el manejo de errores

---

## 📊 Próximos Pasos

1. ✅ **Verificar logs después del deploy** - Deberías ver los nuevos logs detallados
2. ✅ **Verificar consola del navegador** - Buscar errores de JavaScript
3. ✅ **Verificar Network tab** - Ver si la petición se está haciendo
4. ✅ **Verificar código del frontend** - Asegurar que llame al endpoint correcto

---

## 🔍 Comandos Útiles para Debug

### **Ver logs en tiempo real (Render):**
```bash
# En Render, ve a "Logs" para ver los logs en tiempo real
```

### **Probar el endpoint directamente con curl:**
```bash
curl -X POST https://speedleads-server.onrender.com/api/instagram/login \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN" \
  -d '{
    "username": "cuenta_instagram",
    "password": "contraseña",
    "userId": "2614da61-29f7-4f2e-9a9b-dcb8e1bbdae7"
  }'
```

---

## ✅ Conclusión

El problema principal es que **el endpoint no se está llamando desde el frontend**. Los logs agregados ayudarán a identificar exactamente dónde está fallando el proceso.

**Siguiente paso:** Verificar el código del frontend y asegurar que esté llamando al endpoint correcto.

