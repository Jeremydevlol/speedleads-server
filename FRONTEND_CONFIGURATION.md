# 🌐 Configuración del Frontend para Conectarse al Backend en Producción

## 🎯 URLs del Backend

### Producción (Render):
```
Backend URL: https://speedleads-server.onrender.com
WebSocket URL: wss://speedleads-server.onrender.com
```

### Desarrollo (Local):
```
Backend URL: http://localhost:5001
WebSocket URL: ws://localhost:5001
```

## 📋 Variables de Entorno del Frontend

El frontend necesita estas variables de entorno configuradas:

### Archivo `.env.production` o `.env.local`:

```bash
# Backend URLs
NEXT_PUBLIC_API_URL=https://speedleads-server.onrender.com
NEXT_PUBLIC_BACKEND_URL=https://speedleads-server.onrender.com
NEXT_PUBLIC_WS_URL=wss://speedleads-server.onrender.com

# Frontend URL
NEXT_PUBLIC_FRONTEND_URL=https://www.speedleads.app
NEXT_PUBLIC_APP_URL=https://www.speedleads.app

# Supabase (mismo que el backend)
NEXT_PUBLIC_SUPABASE_URL=https://jnzsabhbfnivdiceoefg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuenNhYmhiZm5pdmRpY2VvZWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NjA5MDYsImV4cCI6MjA2NzAzNjkwNn0.ID_WIi84MkK0H6SlyskI82_j-kEpMDo6tyoNYCSV5SI

# Auth0 (si usas Auth0)
NEXT_PUBLIC_AUTH0_DOMAIN=dev-rv4bjopgvlrimoz8.us.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=53zf6IPjN8QTSSbLnzqxeCfCkUygLxYh
NEXT_PUBLIC_AUTH0_REDIRECT_URI=https://app.uniclick.io/login/callback

# Google OAuth (si usas Google Login)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=312282697259-oln4b0tq0fc1ej4q3r4icecjpo059f5e.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=https://app.uniclick.io/login/callback

# Stripe (si usas pagos)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51NIrUICyxjHNGlGbLTbm2gJ9z2HbycKUbuRKcczFreViWdiurbRok3xAmLw7TRwMbRE92eJtoZXvfs4saSTWN0fu00QHjMYOvL

# Configuración adicional
NEXT_PUBLIC_NODE_ENV=production
```

## 🔧 Configuración de Axios/Fetch

### Opción 1: Axios (Recomendado)

```javascript
// lib/axios.js o config/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'https://speedleads-server.onrender.com',
  timeout: 30000, // 30 segundos
  withCredentials: true, // IMPORTANTE: Para cookies/sesiones
  headers: {
    'Content-Type': 'application/json',
  }
});

// Interceptor para agregar token si existe
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirigir a login si no está autenticado
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### Uso:
```javascript
import api from '@/lib/axios';

// GET request
const response = await api.get('/api/users');

// POST request
const response = await api.post('/api/auth/login', {
  email: 'user@example.com',
  password: 'password'
});
```

### Opción 2: Fetch Nativo

```javascript
// lib/api.js
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://speedleads-server.onrender.com';

export async function fetchAPI(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // IMPORTANTE: Para cookies
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/login';
    }
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}
```

### Uso:
```javascript
import { fetchAPI } from '@/lib/api';

// GET request
const data = await fetchAPI('/api/users');

// POST request
const data = await fetchAPI('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password'
  })
});
```

## 🔌 Configuración de Socket.IO

```javascript
// lib/socket.js
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'https://speedleads-server.onrender.com';

export const socket = io(SOCKET_URL, {
  withCredentials: true, // IMPORTANTE: Para autenticación
  transports: ['websocket', 'polling'], // Intentar WebSocket primero
  autoConnect: false, // Conectar manualmente cuando sea necesario
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

// Conectar cuando el usuario esté autenticado
export function connectSocket(userId) {
  if (!socket.connected) {
    socket.auth = { userId };
    socket.connect();
  }
}

// Desconectar cuando el usuario cierre sesión
export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}

// Event listeners
socket.on('connect', () => {
  console.log('✅ Socket conectado:', socket.id);
});

socket.on('disconnect', () => {
  console.log('❌ Socket desconectado');
});

socket.on('error', (error) => {
  console.error('❌ Socket error:', error);
});

export default socket;
```

### Uso en Componente:
```javascript
import { useEffect } from 'react';
import { socket, connectSocket, disconnectSocket } from '@/lib/socket';

export default function ChatComponent() {
  useEffect(() => {
    // Conectar cuando el componente se monte
    const userId = localStorage.getItem('userId');
    if (userId) {
      connectSocket(userId);
    }

    // Escuchar eventos
    socket.on('new_message', (message) => {
      console.log('Nuevo mensaje:', message);
    });

    // Limpiar al desmontar
    return () => {
      socket.off('new_message');
      disconnectSocket();
    };
  }, []);

  // Enviar mensaje
  const sendMessage = (message) => {
    socket.emit('send_message', message);
  };

  return (
    // Tu componente
  );
}
```

## 🔐 Configuración de Autenticación

### Google OAuth:
```javascript
// lib/auth.js
export const googleLogin = () => {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI;
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}&` +
    `redirect_uri=${redirectUri}&` +
    `response_type=code&` +
    `scope=openid email profile&` +
    `access_type=offline&` +
    `prompt=consent`;
  
  window.location.href = authUrl;
};
```

### Auth0:
```javascript
// lib/auth0.js
import { Auth0Provider } from '@auth0/auth0-react';

export function Auth0ProviderWrapper({ children }) {
  return (
    <Auth0Provider
      domain={process.env.NEXT_PUBLIC_AUTH0_DOMAIN}
      clientId={process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: process.env.NEXT_PUBLIC_AUTH0_REDIRECT_URI
      }}
    >
      {children}
    </Auth0Provider>
  );
}
```

## 📡 Endpoints Principales del Backend

```javascript
// Autenticación
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/google
POST   /api/auth/refresh

// Usuarios
GET    /api/users
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id

// Contactos
GET    /api/contacts
POST   /api/contacts
GET    /api/contacts/:id
PUT    /api/contacts/:id
DELETE /api/contacts/:id

// Chats
GET    /api/chats
POST   /api/chats
GET    /api/chats/:id
GET    /api/chats/:id/messages
POST   /api/chats/:id/messages

// WhatsApp
GET    /api/whatsapp/status
POST   /api/whatsapp/send
GET    /api/whatsapp/qr

// Calendario
GET    /api/calendar/events
POST   /api/calendar/events
PUT    /api/calendar/events/:id
DELETE /api/calendar/events/:id

// IA
POST   /api/ai/chat
POST   /api/ai/analyze
POST   /api/ai/transcribe

// Health Check
GET    /api/health
GET    /ping
GET    /status
```

## 🧪 Testing de Conexión

### Script de Prueba:
```javascript
// test-backend.js
const API_URL = 'https://speedleads-server.onrender.com';

async function testBackend() {
  try {
    // Test 1: Health Check
    console.log('🔍 Testing health check...');
    const health = await fetch(`${API_URL}/api/health`);
    console.log('✅ Health:', await health.json());

    // Test 2: CORS
    console.log('🔍 Testing CORS...');
    const corsTest = await fetch(`${API_URL}/api/health`, {
      credentials: 'include',
      headers: {
        'Origin': 'https://app.uniclick.io'
      }
    });
    console.log('✅ CORS:', corsTest.ok ? 'OK' : 'FAILED');

    // Test 3: Socket.IO
    console.log('🔍 Testing Socket.IO...');
    const socket = io(API_URL, { withCredentials: true });
    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      socket.disconnect();
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testBackend();
```

## 🚨 Troubleshooting

### Error: CORS
**Problema**: `Access to fetch at 'https://speedleads-server.onrender.com' from origin 'https://app.uniclick.io' has been blocked by CORS`

**Solución**: El backend ya está configurado para permitir `https://app.uniclick.io`. Asegúrate de:
1. Usar `credentials: 'include'` o `withCredentials: true`
2. No usar `localhost` en producción
3. Verificar que el origen sea exactamente `https://app.uniclick.io`

### Error: 401 Unauthorized
**Problema**: Requests fallan con 401

**Solución**:
1. Verificar que el token esté en localStorage
2. Agregar header `Authorization: Bearer ${token}`
3. Verificar que `withCredentials: true` esté configurado

### Error: Socket no conecta
**Problema**: Socket.IO no se conecta

**Solución**:
1. Usar `wss://` en producción (no `ws://`)
2. Agregar `withCredentials: true`
3. Verificar que el backend esté corriendo

## ✅ Checklist de Configuración

- [ ] Variables de entorno configuradas en `.env.production`
- [ ] `NEXT_PUBLIC_API_URL` apunta a `https://speedleads-server.onrender.com`
- [ ] Axios/Fetch configurado con `withCredentials: true`
- [ ] Socket.IO configurado con `withCredentials: true`
- [ ] Headers de autenticación configurados
- [ ] Interceptores de error configurados
- [ ] Health check funciona: `curl https://speedleads-server.onrender.com/api/health`
- [ ] CORS funciona desde `https://app.uniclick.io`

## 🎉 ¡Listo!

Con esta configuración, tu frontend en `https://app.uniclick.io` podrá conectarse completamente al backend en `https://speedleads-server.onrender.com`.
