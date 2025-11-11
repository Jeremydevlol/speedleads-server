# 🔔 Sistema de Alertas de Instagram - Frontend

## 🎯 Resumen

El backend ahora envía **alertas en tiempo real** sobre el estado de las extracciones de seguidores y el bot de Instagram. Estas alertas se emiten vía **Socket.IO** y también se incluyen en las respuestas de los endpoints.

---

## 📡 Evento Socket.IO: `instagram:alert`

### **Escuchar el evento**

```typescript
import io from 'socket.io-client';

const socket = io('http://localhost:5001', {
  transports: ['websocket']
});

// Escuchar alertas de Instagram
socket.on('instagram:alert', (alert) => {
  console.log('🔔 Alerta recibida:', alert);
  
  // Mostrar la alerta al usuario según su severidad
  showAlert(alert);
});
```

---

## 🎨 Componente React para Mostrar Alertas

```tsx
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import io from 'socket.io-client';

interface InstagramAlert {
  type: 'private_account_target' | 'private_followers_detected' | 'partial_extraction' | 'private_account_message';
  severity: 'error' | 'warning' | 'info';
  message: string;
  description: string;
  username?: string;
  pk?: string;
  is_private?: boolean;
  timestamp?: number;
  count?: number;
  total?: number;
  extracted?: number;
  difference?: number;
}

const useInstagramAlerts = () => {
  const [alerts, setAlerts] = useState<InstagramAlert[]>([]);

  useEffect(() => {
    const socket = io('http://localhost:5001', {
      transports: ['websocket']
    });

    socket.on('instagram:alert', (alert: InstagramAlert) => {
      console.log('🔔 Alerta de Instagram:', alert);
      
      // Agregar a la lista de alertas
      setAlerts(prev => [...prev, alert]);
      
      // Mostrar notificación toast según severidad
      switch(alert.severity) {
        case 'error':
          toast.error(alert.message, {
            duration: 6000,
            icon: '🚨'
          });
          break;
        case 'warning':
          toast(alert.message, {
            duration: 5000,
            icon: '⚠️'
          });
          break;
        case 'info':
          toast(alert.message, {
            duration: 4000,
            icon: 'ℹ️'
          });
          break;
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return alerts;
};

export default useInstagramAlerts;
```

---

## 🎨 UI para Mostrar Alertas en el Frontend

### **Componente de Alerta**

```tsx
import { X } from 'lucide-react';

interface AlertProps {
  alert: InstagramAlert;
  onClose: () => void;
}

const InstagramAlertCard: React.FC<AlertProps> = ({ alert, onClose }) => {
  // Colores según severidad
  const colors = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  // Iconos según severidad
  const icons = {
    error: '🚨',
    warning: '⚠️',
    info: 'ℹ️'
  };

  return (
    <div className={`border-l-4 p-4 mb-3 rounded shadow ${colors[alert.severity]}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start">
          <span className="text-2xl mr-3">{icons[alert.severity]}</span>
          <div>
            <h4 className="font-semibold text-sm mb-1">{alert.message}</h4>
            <p className="text-xs opacity-90">{alert.description}</p>
            
            {/* Información adicional según el tipo de alerta */}
            {alert.type === 'private_followers_detected' && (
              <div className="mt-2 text-xs">
                📊 <strong>{alert.count}</strong> de <strong>{alert.total}</strong> seguidores son privados
              </div>
            )}
            
            {alert.type === 'partial_extraction' && (
              <div className="mt-2 text-xs">
                ⚠️ Solo se extrajeron <strong>{alert.extracted}</strong> de <strong>{alert.total}</strong> seguidores
                <br />
                Diferencia: <strong>{alert.difference}</strong> seguidores faltantes
              </div>
            )}
            
            {alert.username && (
              <div className="mt-2 text-xs">
                👤 Usuario: <strong>@{alert.username}</strong>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 ml-4"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default InstagramAlertCard;
```

### **Componente de Lista de Alertas**

```tsx
import { useState } from 'react';
import InstagramAlertCard from './InstagramAlertCard';

const InstagramAlertsPanel: React.FC = () => {
  const alerts = useInstagramAlerts();
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const handleDismiss = (alert: InstagramAlert) => {
    const alertId = `${alert.type}_${alert.timestamp}_${alert.username || ''}`;
    setDismissedAlerts(prev => new Set([...prev, alertId]));
  };

  const visibleAlerts = alerts.filter(alert => {
    const alertId = `${alert.type}_${alert.timestamp}_${alert.username || ''}`;
    return !dismissedAlerts.has(alertId);
  });

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-96 overflow-y-auto z-50">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lg flex items-center">
            🔔 Alertas de Instagram
            {visibleAlerts.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-2 py-1">
                {visibleAlerts.length}
              </span>
            )}
          </h3>
          {visibleAlerts.length > 0 && (
            <button
              onClick={() => setDismissedAlerts(new Set(visibleAlerts.map(alert => 
                `${alert.type}_${alert.timestamp}_${alert.username || ''}`
              )))}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cerrar todas
            </button>
          )}
        </div>
        <div>
          {visibleAlerts.map((alert, index) => (
            <InstagramAlertCard
              key={`${alert.type}_${alert.timestamp}_${index}`}
              alert={alert}
              onClose={() => handleDismiss(alert)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default InstagramAlertsPanel;
```

---

## 📊 Tipos de Alertas Disponibles

### **1. `session_expired` (Error) ⭐ NUEVO**

**Cuándo:** Cuando la sesión de Instagram expira o es cerrada por Instagram

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

---

### **2. `rate_limit` (Warning) ⭐ NUEVO**

**Cuándo:** Cuando Instagram limita las acciones por actividad sospechosa

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

---

### **3. `instagram_server_error` (Warning) ⭐ NUEVO**

**Cuándo:** Cuando Instagram devuelve errores 500/502/503

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

---

### **4. `facebook_linked_account` (Error) ⭐ NUEVO**

**Cuándo:** Cuando intentas hacer login a una cuenta de Instagram vinculada a Facebook

```json
{
  "type": "facebook_linked_account",
  "severity": "error",
  "message": "Cuenta vinculada a Facebook",
  "description": "Tu cuenta de Instagram está vinculada a Facebook y no permite login directo con usuario/contraseña. Opciones: 1) Desvincular la cuenta de Facebook en Instagram (Configuración > Cuenta > Facebook), 2) Usar otra cuenta de Instagram no vinculada a Facebook, 3) Si es posible, iniciar sesión vía Facebook en la app de Instagram una vez y luego intentar desde aquí.",
  "username": "chuliganga",
  "action_required": true,
  "instructions": [
    "Ve a Instagram.com o la app",
    "Configuración > Cuenta > Facebook",
    "Desvincula la cuenta de Facebook",
    "O usa otra cuenta no vinculada",
    "Luego intenta login nuevamente"
  ],
  "timestamp": 1706457600000
}
```

**Solución:**
1. Ir a Instagram.com o la app móvil
2. Configuración → Cuenta → Facebook
3. Desvincular la cuenta de Facebook
4. O usar otra cuenta de Instagram no vinculada a Facebook
5. Intentar login nuevamente

---

### **5. `login_blocked` (Error) ⭐ NUEVO**

**Cuándo:** Cuando Instagram bloquea el login por razones genéricas (cuenta nueva, IP bloqueada, etc.)

```json
{
  "type": "login_blocked",
  "severity": "error",
  "message": "Login bloqueado por Instagram",
  "description": "Instagram está bloqueando el login. Posibles causas: 1) La cuenta es nueva y requiere verificación, 2) Instagram detectó actividad sospechosa, 3) La cuenta necesita ser verificada manualmente primero, 4) La IP está siendo bloqueada temporalmente. SOLUCIÓN: Haz login manualmente en Instagram.com o la app móvil primero, luego espera 24-48 horas antes de intentar desde aquí.",
  "username": "usuario",
  "action_required": true,
  "instructions": [
    "PASO 1: Verificar cuenta manualmente",
    "  → Ve a Instagram.com o la app móvil",
    "  → Inicia sesión con tu cuenta",
    "  → Completa cualquier verificación (SMS/Email)",
    "  → Usa la cuenta normalmente por 24-48 horas",
    "",
    "PASO 2: Esperar período de confianza",
    "  → Instagram necesita \"confiar\" en la IP",
    "  → Usa la cuenta desde navegador/app por 1-2 días",
    "  → Haz posts, likes, follows normales",
    "",
    "PASO 3: Reintentar desde aquí",
    "  → Después de 24-48 horas",
    "  → Intenta login nuevamente",
    "",
    "Si el problema persiste, usa otra cuenta"
  ],
  "error_message": "POST /api/v1/accounts/login/ - 400 Bad Request...",
  "timestamp": 1706457600000
}
```

**Solución:**
1. Haz login manual en Instagram.com o app móvil
2. Completa verificaciones (SMS/Email)
3. Usa la cuenta normalmente por 24-48 horas
4. Reintenta login desde el sistema

---

### **6. `challenge_code_required` (Warning) ⭐ NUEVO**

**Cuándo:** Cuando Instagram requiere un código de verificación para completar el login

```json
{
  "type": "challenge_code_required",
  "severity": "warning",
  "message": "Código de verificación requerido",
  "description": "Instagram requiere un código de verificación para completar el login. Por favor, ingresa el código que recibiste por SMS o Email.",
  "username": "dineroxig",
  "action_required": true,
  "needs_code": true,
  "challenge_id": "challenge_1234567890",
  "instructions": [
    "PASO 1: Revisa tu teléfono/email",
    "  → Instagram envió un código de verificación",
    "  → Revisa SMS o correo electrónico",
    "  → El código es de 6 dígitos",
    "",
    "PASO 2: Ingresa el código",
    "  → Usa el campo de código que aparece",
    "  → Ingresa el código completo",
    "  → El sistema verificará automáticamente",
    "",
    "Si no recibes el código:",
    "  → Espera 30-60 segundos",
    "  → Verifica spam/correo no deseado",
    "  → Puedes solicitar un nuevo código"
  ],
  "timestamp": 1234567890
}
```

**Acción del Frontend:**
```tsx
if (alert.type === 'challenge_code_required') {
  // Mostrar modal o input para ingresar código
  setShowCodeInput(true);
  setChallengeId(alert.challenge_id);
  
  // El usuario ingresa el código y llama a:
  // POST /api/instagram/resolve-challenge
  // Body: { code: "123456" }
}
```

---

### **7. `challenge_code_invalid` (Error) ⭐ NUEVO**

**Cuándo:** Cuando el código de verificación ingresado es incorrecto

```json
{
  "type": "challenge_code_invalid",
  "severity": "error",
  "message": "Código inválido",
  "description": "El código de verificación ingresado es incorrecto. Por favor, verifica el código e inténtalo nuevamente.",
  "username": "dineroxig",
  "timestamp": 1234567890
}
```

**Acción del Frontend:**
```tsx
if (alert.type === 'challenge_code_invalid') {
  // Mostrar error y permitir reingresar código
  setCodeError('Código incorrecto. Inténtalo de nuevo.');
  setCodeInput('');
}
```

---

### **8. `challenge_required` (Warning) ⭐ NUEVO**

**Cuándo:** Cuando Instagram requiere verificación de seguridad (challenge) que NO requiere código

```json
{
  "type": "challenge_required",
  "severity": "warning",
  "message": "Verificación requerida",
  "description": "Instagram requiere verificación de seguridad. Por favor: 1) Verifica en tu teléfono/app de Instagram (acepta el login), 2) Espera 1-2 minutos, 3) Reintenta el login desde aquí. El sistema NO reintentará automáticamente.",
  "username": "dineroxig",
  "action_required": true,
  "instructions": [
    "PASO 1: Verificar en teléfono/app",
    "  → Abre Instagram en tu teléfono",
    "  → Verás una notificación de login",
    "  → Toca \"Fue yo\" o acepta el login",
    "  → Completa cualquier verificación (código SMS/Email)",
    "",
    "PASO 2: Esperar 1-2 minutos",
    "  → Instagram necesita procesar la verificación",
    "  → No intentes login inmediatamente",
    "",
    "PASO 3: Reintentar login",
    "  → Vuelve a hacer login desde aquí",
    "  → Si ya verificaste, debería funcionar",
    "",
    "NOTA: Si falla después de verificar, espera 5-10 minutos más"
  ],
  "challengeId": "challenge_1706457600000",
  "timestamp": 1706457600000
}
```

**IMPORTANTE:** El sistema NO reintenta automáticamente. Debes reintentar manualmente después de verificar.

---

### **7. `challenge_verification_pending` (Warning) ⭐ NUEVO**

**Cuándo:** Cuando el login falla con 401 después de verificar en teléfono

```json
{
  "type": "challenge_verification_pending",
  "severity": "warning",
  "message": "Verificación aún pendiente",
  "description": "El login falló después de verificación. Posibles causas: 1) Instagram aún no procesó la verificación (espera 2-5 minutos más), 2) La verificación no se completó correctamente, 3) Necesitas verificar de nuevo. SOLUCIÓN: Verifica nuevamente en Instagram, espera 2-5 minutos, y reintenta el login.",
  "username": "dineroxig",
  "action_required": true,
  "instructions": [
    "Si ya verificaste en teléfono:",
    "  → Espera 2-5 minutos más",
    "  → Instagram necesita procesar la verificación",
    "  → Luego reintenta el login",
    "",
    "Si no verificaste aún:",
    "  → Abre Instagram en tu teléfono",
    "  → Verifica el login (acepta o \"Fue yo\")",
    "  → Espera 2-5 minutos",
    "  → Reintenta el login desde aquí"
  ],
  "timestamp": 1706457600000
}
```

---

### **8. `private_account_target` (Error)**

**Cuándo:** Cuando intentas extraer seguidores de una cuenta privada

```json
{
  "type": "private_account_target",
  "severity": "error",
  "message": "La cuenta @username es privada",
  "description": "No se pueden obtener seguidores de cuentas privadas. La cuenta objetivo debe ser pública para extraer sus seguidores.",
  "username": "username",
  "account_info": {...}
}
```

---

### **5. `private_followers_detected` (Info)**

**Cuándo:** Cuando se detectan cuentas privadas entre los seguidores extraídos

```json
{
  "type": "private_followers_detected",
  "severity": "info",
  "message": "150 de 1000 seguidores extraídos son cuentas privadas",
  "description": "Estas cuentas pueden no aceptar mensajes directos de cuentas que no siguen.",
  "count": 150,
  "total": 1000
}
```

---

### **6. `partial_extraction` (Warning)**

**Cuándo:** Cuando no se pudieron extraer todos los seguidores esperados

```json
{
  "type": "partial_extraction",
  "severity": "warning",
  "message": "Solo se pudieron extraer 850 de 1000 seguidores",
  "description": "La diferencia de 150 seguidores podría deberse a límites de la API o configuración de privacidad de la cuenta.",
  "extracted": 850,
  "total": 1000,
  "difference": 150
}
```

---

### **7. `private_account_message` (Info)**

**Cuándo:** Cuando el bot recibe un mensaje de una cuenta privada

```json
{
  "type": "private_account_message",
  "severity": "info",
  "message": "Mensaje recibido de cuenta privada: @username",
  "description": "Has recibido un mensaje de una cuenta privada. Puede que sea un mensaje importante de un usuario que te sigue.",
  "username": "username",
  "pk": "123456789",
  "is_private": true,
  "timestamp": 1706457600000
}
```

---

## 🔍 Integrar con Extracción de Seguidores

### **Respuesta del Endpoint `/api/instagram/followers`**

La respuesta ahora incluye arrays separados y alertas:

```json
{
  "success": true,
  "followers": [...],                // ✅ Todos los seguidores
  "public_followers": [...],         // ✅ NUEVO: Solo públicos
  "private_followers": [...],        // ✅ NUEVO: Solo privados
  "public_count": 850,               // ✅ NUEVO
  "private_count": 150,              // ✅ NUEVO
  "extracted_count": 1000,
  "total_followers": 1000,
  "alerts": [                        // ✅ NUEVO
    {
      "type": "private_followers_detected",
      "severity": "info",
      "message": "150 de 1000 seguidores son privados",
      "description": "Estas cuentas pueden no aceptar mensajes directos",
      "count": 150,
      "total": 1000
    }
  ]
}
```

### **Manejar la respuesta en el frontend**

```typescript
const response = await fetch(`${BACKEND_URL}/api/instagram/followers?username=${username}&limit=${limit}`);
const data = await response.json();

if (data.success) {
  console.log('📊 Seguidores extraídos:');
  console.log(`   - Públicos: ${data.public_count}`);
  console.log(`   - Privados: ${data.private_count}`);
  console.log(`   - Total: ${data.extracted_count}`);
  
  // Mostrar alertas si existen
  if (data.alerts && data.alerts.length > 0) {
    data.alerts.forEach(alert => {
      // Mostrar cada alerta
      showAlert(alert);
    });
  }
  
  // Usar solo seguidores públicos si quieres
  const followersToUse = data.public_followers || data.followers;
  
  // O mostrar ambos por separado
  setPublicFollowers(data.public_followers);
  setPrivateFollowers(data.private_followers);
}
```

---

## 🎨 UI: Separar Seguidores Públicos y Privados

```tsx
const FollowersDisplay = ({ data }) => {
  const [showPrivate, setShowPrivate] = useState(false);

  return (
    <div>
      <h2>Seguidores Extraídos</h2>
      
      {/* Alerta si hay seguidores privados */}
      {data.private_count > 0 && (
        <div className="alert alert-info mb-4">
          ⚠️ {data.private_count} de {data.extracted_count} seguidores son cuentas privadas
          <br />
          <small>
            Las cuentas privadas pueden no aceptar mensajes directos de cuentas que no siguen.
          </small>
        </div>
      )}

      {/* Tabs para mostrar públicos/privados */}
      <div className="tabs">
        <button
          onClick={() => setShowPrivate(false)}
          className={!showPrivate ? 'active' : ''}
        >
          Públicos ({data.public_count})
        </button>
        <button
          onClick={() => setShowPrivate(true)}
          className={showPrivate ? 'active' : ''}
        >
          Privados ({data.private_count})
        </button>
      </div>

      {/* Lista de seguidores */}
      <FollowersList
        followers={showPrivate ? data.private_followers : data.public_followers}
      />
    </div>
  );
};
```

---

## 🚀 Ejemplo Completo de Integración

```tsx
import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import toast from 'react-hot-toast';
import InstagramAlertsPanel from './components/InstagramAlertsPanel';

const InstagramFollowersPage = () => {
  const [targetUsername, setTargetUsername] = useState('');
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  // Hook personalizado para escuchar alertas
  const alerts = useInstagramAlerts();

  const handleExtractFollowers = async () => {
    if (!targetUsername.trim()) {
      toast.error('Ingresa un username');
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch(
        `http://localhost:5001/api/instagram/followers?username=${targetUsername}&limit=${limit}`
      );
      const data = await response.json();

      if (data.success) {
        setResults(data);
        toast.success(`✅ ${data.extracted_count} seguidores extraídos`);
        
        // Las alertas se mostrarán automáticamente vía Socket.IO
        // Pero también puedes mostrar alertas de la respuesta
        if (data.alerts && data.alerts.length > 0) {
          data.alerts.forEach(alert => {
            toast(alert.message, { icon: '⚠️' });
          });
        }
      } else {
        toast.error(data.error || 'Error extrayendo seguidores');
      }
    } catch (error) {
      toast.error('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Extracción de Seguidores de Instagram</h1>
      
      <div className="form">
        <input
          type="text"
          placeholder="Username"
          value={targetUsername}
          onChange={(e) => setTargetUsername(e.target.value)}
        />
        <input
          type="number"
          placeholder="Límite"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
        <button onClick={handleExtractFollowers} disabled={loading}>
          {loading ? 'Extrayendo...' : 'Extraer Seguidores'}
        </button>
      </div>

      {results && (
        <div>
          <h2>Resultados</h2>
          <p>✅ Públicos: {results.public_count}</p>
          <p>🔒 Privados: {results.private_count}</p>
          <p>📊 Total: {results.extracted_count}</p>
        </div>
      )}

      {/* Panel de alertas flotante */}
      <InstagramAlertsPanel />
    </div>
  );
};

export default InstagramFollowersPage;
```

---

## 📝 Resumen de Cambios Necesarios

### **1. Instalar dependencias (si aún no las tienes)**

```bash
npm install socket.io-client
npm install react-hot-toast  # o tu librería de toast favorita
```

### **2. Configurar Socket.IO**

```typescript
// En tu app.tsx o layout.tsx
import io from 'socket.io-client';

const socket = io('http://localhost:5001', {
  transports: ['websocket'],
  // Agregar autenticación si es necesario
  // auth: {
  //   token: 'your-token'
  // }
});
```

### **3. Agregar el hook de alertas**

Copia el hook `useInstagramAlerts` mostrado arriba.

### **4. Mostrar el panel de alertas**

Agrega `<InstagramAlertsPanel />` en tus páginas de Instagram.

---

## ✅ Checklist de Implementación

- [ ] Instalar `socket.io-client`
- [ ] Configurar conexión Socket.IO en el frontend
- [ ] Crear hook `useInstagramAlerts`
- [ ] Crear componente `InstagramAlertCard`
- [ ] Crear componente `InstagramAlertsPanel`
- [ ] Actualizar endpoints para manejar arrays `public_followers` y `private_followers`
- [ ] Mostrar alertas en la UI cuando se extraen seguidores
- [ ] Mostrar alertas en tiempo real cuando el bot recibe mensajes
- [ ] Probar con cuentas privadas y públicas
- [ ] Documentar para el equipo

---

## 🎯 Resultado Final

Con estas implementaciones, el usuario verá:

1. ✅ Alertas en tiempo real cuando el bot detecte problemas
2. ✅ Notificaciones toast cuando hay alertas
3. ✅ Panel flotante con alertas acumuladas
4. ✅ Separación clara entre seguidores públicos y privados
5. ✅ Información detallada sobre extracciones parciales
6. ✅ Indicadores visuales de severidad (error/warning/info)

**Todo automático y en tiempo real vía Socket.IO** 🔔

