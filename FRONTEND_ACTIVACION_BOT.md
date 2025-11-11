# 🤖 Documentación: Activación del Bot de Instagram desde el Frontend

## 📋 Resumen

El bot de Instagram **NO se activa automáticamente** al hacer login. El frontend debe activarlo manualmente después de:
1. ✅ Hacer login exitoso en Instagram
2. ✅ Seleccionar una personalidad
3. ✅ Activar la IA Global

---

## 🔗 Endpoint de Activación

**POST** `/api/instagram/global-ai/toggle`

**Base URL:** `http://localhost:5001` (o tu URL del backend)

---

## 📤 Request Body (Activación)

### Parámetros Requeridos:

```json
{
  "enabled": true,
  "personalityId": 872,
  "userId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8"
}
```

### Descripción de Parámetros:

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `enabled` | `boolean` | ✅ Sí | `true` para activar, `false` para desactivar |
| `personalityId` | `number` | ✅ Sí (si enabled=true) | ID de la personalidad seleccionada por el usuario |
| `userId` | `string` | ✅ Sí | ID del usuario (puede venir del token JWT si está autenticado) |

### Headers (Opcional):

```
Authorization: Bearer <tu_jwt_token>
Content-Type: application/json
```

**Nota:** Si se envía el token JWT en el header, el `userId` puede obtenerse automáticamente del token. Si no, debe enviarse en el body.

---

## 📥 Response Exitosa (Activación)

```json
{
  "success": true,
  "message": "IA Global activada exitosamente",
  "active": true,
  "personalityId": 872,
  "userId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8",
  "status": {
    "isActive": true,
    "hasService": true,
    "hasPersonality": true,
    "personalityData": {
      "id": 872,
      "nombre": "Nombre de la Personalidad",
      "empresa": "Empresa",
      "instrucciones": "...",
      "saludo": "..."
    },
    "messagesSent": 0,
    "lastActivity": 1761667326412
  },
  "globalStatus": {
    "isGlobalRunning": true,
    "activeBots": 1,
    "botUsers": ["a123ccc0-7ee7-45da-92dc-52059c7e21c8"]
  }
}
```

---

## ❌ Response de Error

### Error: userId faltante
```json
{
  "success": false,
  "error": "userId es requerido. Por favor proporciona el userId en el body o usa un token de autenticación válido.",
  "userId": null
}
```

### Error: personalityId faltante
```json
{
  "success": false,
  "error": "personalityId es requerido para activar la IA Global. Por favor selecciona una personalidad.",
  "userId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8"
}
```

### Error: Sesión de Instagram no activa
```json
{
  "success": false,
  "error": "No hay sesión activa de Instagram. Debe hacer login primero.",
  "userId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8",
  "steps": [
    "1. Haz login en Instagram",
    "2. Selecciona una personalidad desde el frontend",
    "3. Activa la IA Global desde el frontend"
  ]
}
```

---

## 📤 Request Body (Desactivación)

```json
{
  "enabled": false,
  "userId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8"
}
```

**Nota:** Para desactivar, no se requiere `personalityId`.

---

## 💻 Ejemplo de Código Frontend (JavaScript/TypeScript)

### Ejemplo 1: Con fetch API (Vanilla JS)

```javascript
async function activarBotInstagram(userId, personalityId, authToken = null) {
  const url = 'http://localhost:5001/api/instagram/global-ai/toggle';
  
  const headers = {
    'Content-Type': 'application/json'
  };
  
  // Si hay token de autenticación, agregarlo
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const body = {
    enabled: true,
    personalityId: personalityId,
    userId: userId
  };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Bot activado exitosamente');
      console.log('Personalidad:', data.status.personalityData.nombre);
      return data;
    } else {
      console.error('❌ Error activando bot:', data.error);
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('❌ Error en la petición:', error);
    throw error;
  }
}

// Uso:
// activarBotInstagram('a123ccc0-7ee7-45da-92dc-52059c7e21c8', 872, 'tu_jwt_token');
```

### Ejemplo 2: Con axios (React/Vue/Angular)

```javascript
import axios from 'axios';

async function activarBotInstagram(userId, personalityId, authToken = null) {
  const url = 'http://localhost:5001/api/instagram/global-ai/toggle';
  
  const config = {
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  // Si hay token de autenticación, agregarlo
  if (authToken) {
    config.headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const body = {
    enabled: true,
    personalityId: personalityId,
    userId: userId
  };
  
  try {
    const response = await axios.post(url, body, config);
    
    if (response.data.success) {
      console.log('✅ Bot activado exitosamente');
      console.log('Personalidad:', response.data.status.personalityData.nombre);
      return response.data;
    } else {
      console.error('❌ Error activando bot:', response.data.error);
      throw new Error(response.data.error);
    }
  } catch (error) {
    console.error('❌ Error en la petición:', error.response?.data || error.message);
    throw error;
  }
}

// Uso:
// activarBotInstagram('a123ccc0-7ee7-45da-92dc-52059c7e21c8', 872, 'tu_jwt_token');
```

### Ejemplo 3: React Hook (useState + useEffect)

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

function InstagramBotControl({ userId, authToken }) {
  const [botActivo, setBotActivo] = useState(false);
  const [personalityId, setPersonalityId] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  
  // Función para activar el bot
  const activarBot = async (selectedPersonalityId) => {
    setCargando(true);
    setError(null);
    
    try {
      const response = await axios.post(
        'http://localhost:5001/api/instagram/global-ai/toggle',
        {
          enabled: true,
          personalityId: selectedPersonalityId,
          userId: userId
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` })
          }
        }
      );
      
      if (response.data.success) {
        setBotActivo(true);
        setPersonalityId(selectedPersonalityId);
        console.log('✅ Bot activado:', response.data.status.personalityData.nombre);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      console.error('❌ Error activando bot:', err);
    } finally {
      setCargando(false);
    }
  };
  
  // Función para desactivar el bot
  const desactivarBot = async () => {
    setCargando(true);
    setError(null);
    
    try {
      const response = await axios.post(
        'http://localhost:5001/api/instagram/global-ai/toggle',
        {
          enabled: false,
          userId: userId
        },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` })
          }
        }
      );
      
      if (response.data.success) {
        setBotActivo(false);
        setPersonalityId(null);
        console.log('✅ Bot desactivado');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      console.error('❌ Error desactivando bot:', err);
    } finally {
      setCargando(false);
    }
  };
  
  return (
    <div>
      <h2>Control de Bot de Instagram</h2>
      
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      
      <div>
        <label>
          Selecciona una personalidad:
          <select 
            onChange={(e) => setPersonalityId(e.target.value)}
            disabled={botActivo || cargando}
          >
            <option value="">-- Selecciona --</option>
            <option value="872">Personalidad 1 (ID: 872)</option>
            <option value="887">Personalidad 2 (ID: 887)</option>
            {/* Agrega más opciones según tus personalidades */}
          </select>
        </label>
      </div>
      
      <div>
        {!botActivo ? (
          <button 
            onClick={() => activarBot(personalityId)}
            disabled={!personalityId || cargando}
          >
            {cargando ? 'Activando...' : 'Activar Bot'}
          </button>
        ) : (
          <button 
            onClick={desactivarBot}
            disabled={cargando}
          >
            {cargando ? 'Desactivando...' : 'Desactivar Bot'}
          </button>
        )}
      </div>
      
      {botActivo && (
        <div style={{ color: 'green', marginTop: '10px' }}>
          ✅ Bot activo con personalidad ID: {personalityId}
        </div>
      )}
    </div>
  );
}

export default InstagramBotControl;
```

---

## ✅ Checklist para el Frontend

Antes de activar el bot, asegúrate de:

- [ ] ✅ Usuario ya hizo login en Instagram (`POST /api/instagram/login`)
- [ ] ✅ `userId` está disponible (del token JWT o del usuario autenticado)
- [ ] ✅ Usuario seleccionó una personalidad (`personalityId`)
- [ ] ✅ La petición incluye todos los parámetros requeridos

---

## 🔍 Verificar Estado del Bot

Para verificar si el bot está activo:

**GET** `/api/instagram/bot/status?userId=TU_USER_ID`

**Response:**
```json
{
  "success": true,
  "active": true,
  "personality": "Nombre de la Personalidad",
  "personalityId": 872,
  "messages_sent": 0,
  "last_activity": 1761667326412,
  "userId": "a123ccc0-7ee7-45da-92dc-52059c7e21c8"
}
```

---

## 📝 Notas Importantes

1. **El bot NO se activa automáticamente** después del login
2. **Se requiere `personalityId`** para activar (debe ser seleccionado por el usuario)
3. **Se requiere sesión activa de Instagram** (hacer login primero)
4. **El `userId` puede venir del token JWT** o del body de la petición
5. **El bot usa la personalidad seleccionada** para todas las respuestas automáticas

---

## 🚀 Flujo Completo

```
1. Usuario hace login en Instagram
   ↓
2. Frontend muestra lista de personalidades disponibles
   ↓
3. Usuario selecciona una personalidad
   ↓
4. Usuario activa la IA Global (toggle)
   ↓
5. Frontend envía POST /api/instagram/global-ai/toggle
   Body: { enabled: true, personalityId: X, userId: Y }
   ↓
6. Backend activa el bot con la personalidad seleccionada
   ↓
7. Bot comienza a responder DMs y comentarios automáticamente
```

---

## 🐛 Troubleshooting

### Error: "userId es requerido"
- **Solución:** Envía el `userId` en el body o asegúrate de que el token JWT está presente en el header

### Error: "personalityId es requerido"
- **Solución:** Asegúrate de enviar `personalityId` cuando `enabled: true`

### Error: "No hay sesión activa de Instagram"
- **Solución:** El usuario debe hacer login primero usando `POST /api/instagram/login`

### Bot no responde después de activarlo
- **Verifica:** Que el estado del bot muestre `active: true` usando `GET /api/instagram/bot/status`
- **Verifica:** Los logs del servidor para ver errores



