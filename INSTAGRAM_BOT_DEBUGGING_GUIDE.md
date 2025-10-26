# 🔧 Guía de Debugging para Instagram Bot

## ✅ **PROBLEMA IDENTIFICADO Y SOLUCIONADO**

El error "Error al actualizar la personalidad del bot" se debe a que el bot no está activo cuando se intenta actualizar la personalidad.

## 🔧 **Endpoints Mejorados**

### **1. Actualizar Personalidad (Mejorado)**

**POST** `/api/instagram/bot/update-personality`

**Mejoras implementadas**:
- ✅ Mejor logging para debugging
- ✅ Verificación de estado global
- ✅ Información de debug en respuestas de error
- ✅ Mensajes de error más descriptivos

**Respuesta de error mejorada**:
```json
{
  "success": false,
  "error": "Bot no está activo o personalidad no válida",
  "message": "El bot de Instagram no está activo para este usuario. Debe activar el bot primero.",
  "debug": {
    "userId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8",
    "personalityId": 887,
    "globalStatus": {
      "isGlobalRunning": false,
      "activeBotsCount": 0
    }
  }
}
```

### **2. Verificar Bots Activos (NUEVO)**

**GET** `/api/instagram/bot/active-bots`

**Descripción**: Muestra todos los bots activos y su estado.

**Respuesta**:
```json
{
  "success": true,
  "globalStatus": {
    "isGlobalRunning": true,
    "activeBotsCount": 1
  },
  "activeBots": [
    {
      "userId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8",
      "isRunning": true,
      "personality": "Roberto",
      "personalityId": 887,
      "messagesSent": 5,
      "lastActivity": 1761502381829
    }
  ],
  "totalBots": 1,
  "message": "1 bots activos encontrados"
}
```

## 🚀 **Implementación Mejorada en el Frontend**

### **1. Función de Actualización con Debugging**

```javascript
// Función mejorada para actualizar personalidad con debugging
async function updateInstagramBotPersonality(personalityId) {
  try {
    // Primero verificar bots activos
    const activeBotsResponse = await fetch('/api/instagram/bot/active-bots');
    const activeBotsData = await activeBotsResponse.json();
    
    console.log('🤖 Bots activos:', activeBotsData);
    
    if (activeBotsData.totalBots === 0) {
      throw new Error('No hay bots activos. Debe activar el bot primero.');
    }
    
    // Actualizar personalidad
    const response = await fetch('/api/instagram/bot/update-personality', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalityId: personalityId,
        userId: getCurrentUserId()
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Personalidad actualizada:', result.message);
      updatePersonalityUI(personalityId);
      return true;
    } else {
      console.error('❌ Error actualizando personalidad:', result.error);
      console.error('🔍 Debug info:', result.debug);
      
      // Mostrar error específico al usuario
      if (result.error.includes('Bot no está activo')) {
        showError('El bot no está activo. Debe activar el bot primero.');
      } else {
        showError('Error actualizando personalidad: ' + result.error);
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Error en la petición:', error);
    showError('Error de conexión: ' + error.message);
    return false;
  }
}
```

### **2. Función para Verificar Estado del Bot**

```javascript
// Función para verificar el estado completo del bot
async function checkInstagramBotStatus() {
  try {
    const response = await fetch('/api/instagram/bot/active-bots');
    const result = await response.json();
    
    if (result.success) {
      console.log('🤖 Estado de bots:', result);
      
      // Buscar el bot del usuario actual
      const currentUserId = getCurrentUserId();
      const userBot = result.activeBots.find(bot => bot.userId === currentUserId);
      
      if (userBot) {
        return {
          isActive: userBot.isRunning,
          personality: userBot.personality,
          personalityId: userBot.personalityId,
          messagesSent: userBot.messagesSent,
          lastActivity: userBot.lastActivity
        };
      } else {
        return {
          isActive: false,
          personality: null,
          personalityId: null,
          messagesSent: 0,
          lastActivity: null
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error verificando estado del bot:', error);
    return null;
  }
}
```

### **3. Flujo Completo con Validaciones**

```javascript
// Flujo completo para cambiar personalidad con validaciones
async function changeInstagramBotPersonality(newPersonalityId) {
  try {
    // 1. Verificar estado del bot
    const botStatus = await checkInstagramBotStatus();
    
    if (!botStatus || !botStatus.isActive) {
      showError('El bot de Instagram no está activo. Debe activar el bot primero.');
      return false;
    }
    
    // 2. Mostrar información actual
    console.log('🤖 Bot actual:', botStatus);
    
    // 3. Actualizar personalidad
    const success = await updateInstagramBotPersonality(newPersonalityId);
    
    if (success) {
      // 4. Verificar cambio
      const newStatus = await checkInstagramBotStatus();
      if (newStatus && newStatus.personalityId === newPersonalityId) {
        showSuccess(`Personalidad cambiada a: ${getPersonalityName(newPersonalityId)}`);
        return true;
      } else {
        showError('Error verificando el cambio de personalidad');
        return false;
      }
    }
    
    return false;
  } catch (error) {
    console.error('❌ Error en cambio de personalidad:', error);
    showError('Error interno: ' + error.message);
    return false;
  }
}
```

### **4. UI de Debugging**

```html
<!-- Panel de debugging para desarrolladores -->
<div id="debug-panel" style="display: none;">
  <h4>🔧 Debug Panel</h4>
  <button onclick="debugInstagramBot()">Ver Estado del Bot</button>
  <button onclick="debugActiveBots()">Ver Bots Activos</button>
  <div id="debug-output"></div>
</div>

<script>
// Función de debugging
async function debugInstagramBot() {
  const status = await checkInstagramBotStatus();
  document.getElementById('debug-output').innerHTML = 
    '<pre>' + JSON.stringify(status, null, 2) + '</pre>';
}

async function debugActiveBots() {
  const response = await fetch('/api/instagram/bot/active-bots');
  const data = await response.json();
  document.getElementById('debug-output').innerHTML = 
    '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
}
</script>
```

## 📋 **Flujo de Solución de Problemas**

### **Paso 1: Verificar Bots Activos**
```javascript
const activeBots = await fetch('/api/instagram/bot/active-bots').then(r => r.json());
console.log('Bots activos:', activeBots);
```

### **Paso 2: Activar Bot si es Necesario**
```javascript
if (activeBots.totalBots === 0) {
  // Activar bot primero
  await activateInstagramBot(username, password, personalityId);
}
```

### **Paso 3: Actualizar Personalidad**
```javascript
const result = await updateInstagramBotPersonality(newPersonalityId);
if (!result.success) {
  console.error('Debug info:', result.debug);
}
```

## 🎯 **Códigos de Error Mejorados**

- **"Bot no está activo"**: El bot no está activado para el usuario
- **"Personalidad no válida"**: El ID de personalidad no existe
- **"Error de conexión"**: Problema de red o servidor
- **"Error interno"**: Error del servidor (ver logs)

## 🔍 **Logs de Debugging**

El servidor ahora incluye logs detallados:
- ✅ Estado de bots activos
- ✅ Información de personalidades
- ✅ Errores específicos con contexto
- ✅ Debug info en respuestas

## 📝 **Ejemplo de Uso Completo**

```javascript
// Ejemplo completo de uso con manejo de errores
async function handlePersonalityChange(newPersonalityId) {
  try {
    // 1. Verificar estado
    const status = await checkInstagramBotStatus();
    
    if (!status || !status.isActive) {
      // 2. Activar bot si es necesario
      const loginResult = await loginInstagramAccount(username, password);
      if (!loginResult.success) {
        throw new Error('Error en login: ' + loginResult.error);
      }
      
      const activateResult = await activateInstagramBot(username, password, newPersonalityId);
      if (!activateResult.success) {
        throw new Error('Error activando bot: ' + activateResult.error);
      }
    } else {
      // 3. Actualizar personalidad
      const updateResult = await updateInstagramBotPersonality(newPersonalityId);
      if (!updateResult) {
        throw new Error('Error actualizando personalidad');
      }
    }
    
    showSuccess('Personalidad configurada exitosamente');
    return true;
    
  } catch (error) {
    console.error('❌ Error:', error);
    showError('Error: ' + error.message);
    return false;
  }
}
```

---

**¡El sistema ahora tiene debugging completo y manejo de errores mejorado!** 🔧✅
