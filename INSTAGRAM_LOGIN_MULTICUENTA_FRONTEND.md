# 🔐 Sistema de Login Multi-Cuenta para Instagram Bot

## ✅ **FUNCIONALIDAD IMPLEMENTADA**

El sistema permite hacer login con **cualquier cuenta de Instagram** desde el frontend y gestionar múltiples cuentas simultáneamente.

## 🔧 **Endpoints Disponibles**

### **1. Login de Instagram**

**POST** `/api/instagram/login`

**Descripción**: Inicia sesión con cualquier cuenta de Instagram.

**Parámetros**:
```json
{
  "username": "tu_cuenta_instagram",
  "password": "tu_password_instagram"
}
```

**Respuesta exitosa**:
```json
{
  "success": true,
  "message": "Login real exitoso en Instagram",
  "restored": false,
  "username": "tu_cuenta_instagram",
  "connected": true,
  "sessionId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8"
}
```

### **2. Estado del Bot**

**GET** `/api/instagram/bot/status?userId=USER_ID`

**Descripción**: Verifica el estado del bot para una cuenta específica.

**Respuesta**:
```json
{
  "success": true,
  "active": true,
  "personality": "Roberto",
  "personalityId": 887,
  "messages_sent": 5,
  "last_activity": 1761502381829,
  "userId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8"
}
```

### **3. Activar/Desactivar IA Global**

**POST** `/api/instagram/global-ai/toggle`

**Descripción**: Activa o desactiva el bot con una personalidad específica.

**Parámetros**:
```json
{
  "enabled": true,
  "personalityId": 887,
  "userId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8"
}
```

### **4. Actualizar Personalidad**

**POST** `/api/instagram/bot/update-personality`

**Descripción**: Cambia la personalidad del bot activo.

**Parámetros**:
```json
{
  "personalityId": 888,
  "userId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8"
}
```

## 🚀 **Implementación en el Frontend**

### **1. Función de Login**

```javascript
// Función para hacer login con cualquier cuenta de Instagram
async function loginInstagramAccount(username, password) {
  try {
    const response = await fetch('/api/instagram/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username,
        password: password
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Login exitoso:', result.message);
      console.log('👤 Usuario:', result.username);
      console.log('🔗 Conectado:', result.connected);
      
      // Guardar información de la sesión
      localStorage.setItem('instagram_username', result.username);
      localStorage.setItem('instagram_connected', result.connected);
      
      return {
        success: true,
        username: result.username,
        connected: result.connected
      };
    } else {
      console.error('❌ Error en login:', result.error);
      return {
        success: false,
        error: result.error
      };
    }
  } catch (error) {
    console.error('❌ Error en la petición:', error);
    return {
      success: false,
      error: 'Error de conexión'
    };
  }
}
```

### **2. Función para Activar Bot**

```javascript
// Función para activar el bot con una personalidad específica
async function activateInstagramBot(username, password, personalityId) {
  try {
    // Primero hacer login
    const loginResult = await loginInstagramAccount(username, password);
    
    if (!loginResult.success) {
      return {
        success: false,
        error: 'Error en login: ' + loginResult.error
      };
    }
    
    // Luego activar el bot
    const response = await fetch('/api/instagram/global-ai/toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        enabled: true,
        personalityId: personalityId,
        userId: getCurrentUserId() // ID del usuario del sistema
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Bot activado:', result.message);
      return {
        success: true,
        username: username,
        personalityId: personalityId,
        message: result.message
      };
    } else {
      console.error('❌ Error activando bot:', result.error);
      return {
        success: false,
        error: result.error
      };
    }
  } catch (error) {
    console.error('❌ Error activando bot:', error);
    return {
      success: false,
      error: 'Error interno'
    };
  }
}
```

### **3. Interfaz de Usuario Completa**

```html
<!-- Formulario de Login de Instagram -->
<div id="instagram-login-form">
  <h3>🔐 Login de Instagram</h3>
  
  <div class="form-group">
    <label for="ig-username">Usuario de Instagram:</label>
    <input type="text" id="ig-username" placeholder="tu_usuario_instagram" required>
  </div>
  
  <div class="form-group">
    <label for="ig-password">Contraseña:</label>
    <input type="password" id="ig-password" placeholder="tu_contraseña" required>
  </div>
  
  <div class="form-group">
    <label for="ig-personality">Personalidad:</label>
    <select id="ig-personality">
      <option value="872">Prueba</option>
      <option value="887">Roberto</option>
      <option value="888">Juas</option>
      <option value="889">Juas</option>
      <option value="890">Francisco</option>
    </select>
  </div>
  
  <button id="login-btn" onclick="handleInstagramLogin()">
    🔐 Iniciar Sesión
  </button>
  
  <button id="activate-btn" onclick="handleBotActivation()" disabled>
    🤖 Activar Bot
  </button>
  
  <div id="status-display">
    <p id="login-status">❌ No conectado</p>
    <p id="bot-status">❌ Bot inactivo</p>
  </div>
</div>
```

### **4. JavaScript para Manejo de Eventos**

```javascript
// Variables globales
let currentInstagramAccount = null;
let currentBotStatus = null;

// Manejar login de Instagram
async function handleInstagramLogin() {
  const username = document.getElementById('ig-username').value;
  const password = document.getElementById('ig-password').value;
  
  if (!username || !password) {
    alert('Por favor completa todos los campos');
    return;
  }
  
  // Mostrar loading
  showLoading('Iniciando sesión...');
  
  // Hacer login
  const result = await loginInstagramAccount(username, password);
  
  if (result.success) {
    currentInstagramAccount = {
      username: result.username,
      connected: result.connected
    };
    
    // Actualizar UI
    document.getElementById('login-status').textContent = `✅ Conectado como: ${result.username}`;
    document.getElementById('activate-btn').disabled = false;
    
    showSuccess('Login exitoso');
  } else {
    showError('Error en login: ' + result.error);
  }
  
  hideLoading();
}

// Manejar activación del bot
async function handleBotActivation() {
  if (!currentInstagramAccount) {
    alert('Primero debes hacer login');
    return;
  }
  
  const personalityId = parseInt(document.getElementById('ig-personality').value);
  const password = document.getElementById('ig-password').value;
  
  // Mostrar loading
  showLoading('Activando bot...');
  
  // Activar bot
  const result = await activateInstagramBot(
    currentInstagramAccount.username, 
    password, 
    personalityId
  );
  
  if (result.success) {
    currentBotStatus = {
      active: true,
      personalityId: personalityId,
      username: result.username
    };
    
    // Actualizar UI
    document.getElementById('bot-status').textContent = 
      `✅ Bot activo con personalidad: ${getPersonalityName(personalityId)}`;
    
    showSuccess('Bot activado exitosamente');
  } else {
    showError('Error activando bot: ' + result.error);
  }
  
  hideLoading();
}

// Función para cambiar personalidad
async function changePersonality(newPersonalityId) {
  if (!currentBotStatus || !currentBotStatus.active) {
    alert('El bot no está activo');
    return;
  }
  
  const response = await fetch('/api/instagram/bot/update-personality', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalityId: newPersonalityId,
      userId: getCurrentUserId()
    })
  });

  const result = await response.json();
  
  if (result.success) {
    currentBotStatus.personalityId = newPersonalityId;
    document.getElementById('bot-status').textContent = 
      `✅ Bot activo con personalidad: ${getPersonalityName(newPersonalityId)}`;
    showSuccess('Personalidad actualizada');
  } else {
    showError('Error actualizando personalidad');
  }
}

// Función para obtener nombre de personalidad
function getPersonalityName(personalityId) {
  const personalities = {
    872: 'Prueba',
    887: 'Roberto',
    888: 'Juas',
    889: 'Juas',
    890: 'Francisco'
  };
  return personalities[personalityId] || 'Desconocida';
}

// Función para obtener ID del usuario actual
function getCurrentUserId() {
  // Aquí debes implementar la lógica para obtener el ID del usuario actual
  // Por ejemplo, desde el token JWT o desde el estado de la aplicación
  return 'a123ccc0-7ee7-45da-92dc-52059c7e21c8';
}
```

## 📋 **Flujo Completo de Uso**

1. **Usuario ingresa** credenciales de Instagram en el frontend
2. **Frontend llama** al endpoint `/api/instagram/login`
3. **Backend valida** las credenciales con Instagram
4. **Usuario selecciona** personalidad para el bot
5. **Frontend activa** el bot con `/api/instagram/global-ai/toggle`
6. **Bot responde** automáticamente con la personalidad seleccionada

## 🎯 **Ventajas del Sistema Multi-Cuenta**

- ✅ **Múltiples cuentas**: Puedes usar cualquier cuenta de Instagram
- ✅ **Sesiones independientes**: Cada cuenta mantiene su propia sesión
- ✅ **Personalidades por cuenta**: Cada cuenta puede tener su personalidad
- ✅ **Cambio dinámico**: Cambiar personalidad sin reiniciar
- ✅ **Sin límites**: No hay restricciones en el número de cuentas

## 🔍 **Ejemplos de Uso**

### **Cuenta Personal**
```javascript
await loginInstagramAccount('mi_cuenta_personal', 'mi_password');
await activateInstagramBot('mi_cuenta_personal', 'mi_password', 887); // Roberto
```

### **Cuenta de Negocio**
```javascript
await loginInstagramAccount('mi_negocio_ig', 'password_negocio');
await activateInstagramBot('mi_negocio_ig', 'password_negocio', 888); // Juas
```

### **Cuenta de Cliente**
```javascript
await loginInstagramAccount('cliente_instagram', 'password_cliente');
await activateInstagramBot('cliente_instagram', 'password_cliente', 890); // Francisco
```

## 🚨 **Consideraciones Importantes**

1. **Credenciales seguras**: Nunca hardcodees passwords en el código
2. **Sesiones activas**: El sistema mantiene una sesión por usuario
3. **Rate limiting**: Instagram puede limitar múltiples logins
4. **Verificación 2FA**: Algunas cuentas pueden requerir verificación adicional

## 📝 **Ejemplo de Implementación Completa**

```javascript
// Clase para manejar Instagram Bot
class InstagramBotManager {
  constructor() {
    this.currentAccount = null;
    this.botStatus = null;
  }
  
  async login(username, password) {
    const result = await loginInstagramAccount(username, password);
    if (result.success) {
      this.currentAccount = result;
    }
    return result;
  }
  
  async activateBot(personalityId) {
    if (!this.currentAccount) {
      throw new Error('No hay cuenta conectada');
    }
    
    const result = await activateInstagramBot(
      this.currentAccount.username, 
      this.currentAccount.password, 
      personalityId
    );
    
    if (result.success) {
      this.botStatus = result;
    }
    
    return result;
  }
  
  async changePersonality(personalityId) {
    return await changePersonality(personalityId);
  }
  
  getStatus() {
    return {
      account: this.currentAccount,
      bot: this.botStatus
    };
  }
}

// Uso
const igBot = new InstagramBotManager();
await igBot.login('mi_cuenta', 'mi_password');
await igBot.activateBot(887);
await igBot.changePersonality(888);
```

---

**¡El sistema está listo para manejar múltiples cuentas de Instagram!** 🎉🔐
