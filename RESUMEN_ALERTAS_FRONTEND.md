# 🔔 Resumen Rápido: Alertas de Instagram para el Frontend

## ⚡ TL;DR

El backend ahora envía alertas en tiempo real vía Socket.IO sobre:
- 🔒 Cuentas privadas (objetivo o en seguidores)
- ⚠️ Extracciones incompletas
- 📊 Separación de públicos vs privados

---

## 🎯 Quick Start para el Frontend

### **1. Escuchar alertas Socket.IO**

```typescript
import io from 'socket.io-client';

const socket = io('http://localhost:5001');

socket.on('instagram:alert', (alert) => {
  // alert.type: 'private_account_target' | 'private_followers_detected' | 'partial_extraction' | 'private_account_message'
  // alert.severity: 'error' | 'warning' | 'info'
  // alert.message: string
  // alert.description: string
  
  console.log('🔔 Alerta:', alert);
  // Mostrar notificación toast
});
```

---

## 📊 Cambios en Respuestas de API

### **Endpoint: `/api/instagram/followers`**

**ANTES:**
```json
{
  "success": true,
  "followers": [...],
  "extracted_count": 1000
}
```

**AHORA:**
```json
{
  "success": true,
  "followers": [...],              // Todos
  "public_followers": [...],       // ✅ NUEVO
  "private_followers": [...],      // ✅ NUEVO
  "public_count": 850,             // ✅ NUEVO
  "private_count": 150,            // ✅ NUEVO
  "extracted_count": 1000,
  "alerts": [                      // ✅ NUEVO
    {
      "type": "private_followers_detected",
      "severity": "info",
      "message": "150 de 1000 son privados",
      "description": "Estas cuentas pueden no aceptar mensajes directos",
      "count": 150,
      "total": 1000
    }
  ]
}
```

---

## 🎨 UI Rápida para Alerta

```tsx
const AlertCard = ({ alert }) => {
  const colors = {
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200'
  };

  const icons = {
    error: '🚨',
    warning: '⚠️',
    info: 'ℹ️'
  };

  return (
    <div className={`p-4 border-l-4 ${colors[alert.severity]}`}>
      <div className="flex items-start">
        <span className="text-2xl mr-3">{icons[alert.severity]}</span>
        <div>
          <h4 className="font-semibold">{alert.message}</h4>
          <p className="text-sm opacity-75">{alert.description}</p>
        </div>
      </div>
    </div>
  );
};
```

---

## 🚀 Ejemplo de Uso

```tsx
import { useState, useEffect } from 'react';
import io from 'socket.io-client';

const MyComponent = () => {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const socket = io('http://localhost:5001');
    socket.on('instagram:alert', (alert) => setAlerts(prev => [...prev, alert]));
    return () => socket.disconnect();
  }, []);

  return (
    <div>
      {alerts.map((alert, i) => <AlertCard key={i} alert={alert} />)}
    </div>
  );
};
```

---

## 📋 Tipos de Alertas

| Tipo | Severidad | Cuándo |
|------|-----------|--------|
| `session_expired` ⭐ | 🔴 error | Sesión de Instagram expirada |
| `rate_limit` ⭐ | 🟡 warning | Rate limit alcanzado |
| `instagram_server_error` ⭐ | 🟡 warning | Error 500/502/503 de Instagram |
| `facebook_linked_account` ⭐ | 🔴 error | Cuenta vinculada a Facebook |
| `login_blocked` ⭐ | 🔴 error | Login bloqueado (cuenta nueva/IP) |
| `challenge_required` ⭐ | 🟡 warning | Verificación requerida (challenge) |
| `challenge_verification_pending` ⭐ | 🟡 warning | Verificación pendiente (401 después de verificar) |
| `private_account_target` | 🔴 error | Cuenta objetivo es privada |
| `private_followers_detected` | 🔵 info | Hay cuentas privadas en seguidores |
| `partial_extraction` | 🟡 warning | No se extrajeron todos los seguidores |
| `private_account_message` | 🔵 info | Bot recibe mensaje de cuenta privada |

---

## ✅ Lo que Necesitas Hacer

1. **Conectar Socket.IO** en tu app
2. **Escuchar** `instagram:alert` events
3. **Mostrar** las alertas en la UI
4. **Actualizar** endpoints para usar `public_followers` y `private_followers`
5. **Mostrar contadores** de públicos vs privados

**Archivo completo con ejemplos:** `FRONTEND_ALERTAS_INSTAGRAM.md`

