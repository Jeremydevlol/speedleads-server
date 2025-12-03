# 🔐 Implementación de 2FA (Autenticación de Dos Factores) para Instagram

## ✅ Implementación Completa

Se ha implementado el sistema completo de manejo de 2FA para Instagram, permitiendo que las cuentas con autenticación de dos factores puedan hacer login correctamente.

---

## 🎯 Flujo Completo

### **1. Usuario hace login con usuario/contraseña**

```
POST /api/instagram/login
{
  "username": "tomasgraciaoficial",
  "password": "tu_password"
}
```

### **2. Instagram responde requiriendo 2FA**

El backend detecta el error `IgLoginTwoFactorRequiredError` y:
- Guarda la información de 2FA en `pending2FA` Map
- Emite evento Socket.IO `instagram:2fa_required`
- Retorna respuesta JSON indicando que se requiere 2FA

**Respuesta:**
```json
{
  "success": false,
  "status": "2FA_REQUIRED",
  "twoFA_required": true,
  "message": "Instagram requiere código de verificación enviado por SMS",
  "username": "tomasgraciaoficial",
  "via": "sms",
  "verification_method": "1"
}
```

**Evento Socket.IO:**
```javascript
{
  event: 'instagram:2fa_required',
  data: {
    username: 'tomasgraciaoficial',
    via: 'sms', // o 'app'
    message: 'Instagram requiere código de verificación enviado por SMS'
  }
}
```

### **3. Frontend muestra modal para código 2FA**

El frontend debe:
- Detectar `status === '2FA_REQUIRED'` en la respuesta
- Mostrar un modal pidiendo el código de 6 dígitos
- Indicar si es SMS o TOTP (app)

### **4. Usuario ingresa código y se envía al backend**

```
POST /api/instagram/2fa
{
  "code": "123456"
}
```

### **5. Backend completa el login con código 2FA**

El backend:
- Verifica que hay un 2FA pendiente para ese usuario
- Llama a `ig.account.twoFactorLogin()` con el código
- Si es correcto, guarda la sesión
- Emite evento `instagram:status` con éxito
- Inicia warm-up period en background

**Respuesta exitosa:**
```json
{
  "success": true,
  "status": "LOGGED",
  "message": "Login exitoso con código 2FA",
  "username": "tomasgraciaoficial",
  "igUserId": "123456789",
  "twoFA_completed": true
}
```

**Respuesta si código incorrecto:**
```json
{
  "success": false,
  "status": "2FA_FAILED",
  "error": "Código incorrecto o expirado",
  "message": "El código de verificación es incorrecto o ha expirado. Por favor, intenta nuevamente."
}
```

---

## 📁 Archivos Modificados

### **1. `dist/services/instagramService.js`**

**Cambios:**
- ✅ Importado `IgLoginTwoFactorRequiredError` de `instagram-private-api`
- ✅ Creado `pending2FA` Map para guardar pendientes de 2FA
- ✅ Modificado método `login()` para detectar 2FA antes de otros errores
- ✅ Creado método `completeTwoFactorLogin(code)` para completar login con código

**Código clave:**

```javascript
// Detección de 2FA en login()
if (loginError instanceof IgLoginTwoFactorRequiredError) {
  const twoFactorInfo = loginError.response?.body?.two_factor_info || {};
  const verificationMethod = totpTwoFactorOn ? '0' : '1'; // '0' = TOTP, '1' = SMS
  
  pending2FA.set(this.userId, {
    twoFactorIdentifier,
    username: igUsername,
    verificationMethod,
    createdAt: Date.now()
  });
  
  emitToUserIG(this.userId, 'instagram:2fa_required', {
    username: igUsername,
    via: verificationMethod === '1' ? 'sms' : 'app',
    message: '...'
  });
  
  return {
    success: false,
    twoFA_required: true,
    status: '2FA_REQUIRED',
    // ...
  };
}
```

### **2. `dist/app.js`**

**Cambios:**
- ✅ Agregada verificación de 2FA en endpoint `/api/instagram/login`
- ✅ Creado nuevo endpoint `POST /api/instagram/2fa`
- ✅ Actualizada lista de endpoints documentados

**Endpoint nuevo:**

```javascript
app.post('/api/instagram/2fa', async (req, res) => {
  const { code } = req.body;
  const userId = /* obtener userId */;
  
  const { getOrCreateIGSession, pending2FA } = await import('./services/instagramService.js');
  
  // Verificar que hay 2FA pendiente
  const pending = pending2FA.get(userId);
  if (!pending) {
    return res.status(400).json({
      success: false,
      error: 'No hay un login con 2FA pendiente'
    });
  }
  
  const session = await getOrCreateIGSession(userId);
  const result = await session.completeTwoFactorLogin(code);
  
  // Retornar resultado...
});
```

---

## 🔧 Detalles Técnicos

### **Métodos de Verificación:**

- **`'1'` = SMS**: Instagram envía código por SMS al teléfono
- **`'0'` = TOTP (app)**: Código desde app de autenticación (Google Authenticator, Authy, etc.)

### **Almacenamiento de 2FA Pendiente:**

```javascript
pending2FA.set(userId, {
  twoFactorIdentifier: string,    // ID único para este intento de login
  username: string,                // Usuario de Instagram
  verificationMethod: '0' | '1',   // Método de verificación
  createdAt: number                // Timestamp de creación
});
```

### **Limpieza Automática:**

- Se limpia automáticamente cuando:
  - El login 2FA es exitoso
  - Se intenta otro login (sobrescribe el anterior)
- No hay expiración automática (el usuario puede reintentar)

---

## 📡 Eventos Socket.IO

### **1. `instagram:2fa_required`** (cuando se requiere 2FA)

```javascript
{
  username: 'tomasgraciaoficial',
  via: 'sms', // o 'app'
  message: 'Instagram requiere código de verificación enviado por SMS'
}
```

### **2. `instagram:status`** (cuando login 2FA es exitoso)

```javascript
{
  connected: true,
  username: 'tomasgraciaoficial',
  igUserId: '123456789',
  twoFA_completed: true
}
```

### **3. `instagram:alert`** (si código 2FA es incorrecto)

```javascript
{
  type: '2fa_failed',
  severity: 'error',
  message: 'Código 2FA incorrecto o expirado',
  description: '...',
  username: 'tomasgraciaoficial'
}
```

---

## 🎨 Frontend - Cómo Implementar

### **1. Detectar cuando se requiere 2FA**

```javascript
const handleLogin = async (username, password) => {
  const response = await fetch('/api/instagram/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const result = await response.json();
  
  if (result.status === '2FA_REQUIRED') {
    // Mostrar modal de 2FA
    setShow2FAModal(true);
    set2FAVia(result.via); // 'sms' o 'app'
    setUsername(result.username);
  } else if (result.success) {
    // Login exitoso sin 2FA
    console.log('Login exitoso');
  }
};
```

### **2. Escuchar evento Socket.IO**

```javascript
socket.on('instagram:2fa_required', (data) => {
  setShow2FAModal(true);
  set2FAVia(data.via);
  setUsername(data.username);
  toast.info(data.message);
});
```

### **3. Enviar código 2FA**

```javascript
const handle2FASubmit = async (code) => {
  const response = await fetch('/api/instagram/2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  
  const result = await response.json();
  
  if (result.success) {
    toast.success('Login exitoso con 2FA');
    setShow2FAModal(false);
    // Actualizar estado de la app
  } else {
    toast.error(result.message || 'Código incorrecto');
  }
};
```

### **4. Modal de 2FA (ejemplo)**

```jsx
{show2FAModal && (
  <Modal>
    <h2>Verificación de Seguridad</h2>
    <p>
      {via === 'sms' 
        ? 'Ingresa el código de 6 dígitos que recibiste por SMS'
        : 'Ingresa el código de 6 dígitos de tu app de autenticación'}
    </p>
    <input 
      type="text" 
      maxLength={6}
      placeholder="000000"
      onChange={(e) => setCode(e.target.value)}
    />
    <button onClick={() => handle2FASubmit(code)}>
      Verificar
    </button>
  </Modal>
)}
```

---

## ✅ Estado: LISTO PARA PRODUCCIÓN

**Funcionalidades implementadas:**
- ✅ Detección de 2FA durante login
- ✅ Almacenamiento de información de 2FA pendiente
- ✅ Endpoint para completar login con código
- ✅ Eventos Socket.IO para comunicación en tiempo real
- ✅ Manejo de errores (código incorrecto, expirado)
- ✅ Guardado de sesión después de login 2FA exitoso
- ✅ Warm-up period después de login exitoso

**Próximos pasos para frontend:**
1. Agregar detección de `status === '2FA_REQUIRED'` en el login
2. Crear modal para ingresar código 2FA
3. Escuchar evento `instagram:2fa_required` por Socket.IO
4. Llamar a `/api/instagram/2fa` con el código
5. Manejar respuestas exitosas y errores

---

**Fecha de implementación:** 1 de diciembre de 2025
**Estado:** ✅ Completo y probado




