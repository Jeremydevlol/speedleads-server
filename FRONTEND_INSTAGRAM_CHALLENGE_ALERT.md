# 🔐 Frontend - Manejo de Challenge de Instagram

## 🎯 Objetivo
Mostrar una alerta clara al usuario cuando Instagram requiere verificación manual en el teléfono/app.

---

## 📡 Response del Backend

Cuando hay un challenge, el endpoint `/api/instagram/login` devuelve:

```javascript
{
  "success": false,
  "challenge": true,
  "needs_code": false,  // false = verificación manual, true = código SMS/email
  "message": "Instagram requiere verificación. Verifica en tu teléfono/app y luego reintenta el login.",
  "needsUserAction": true,
  "needsManualRetry": true,
  "autoRetry": false,
  "autoRetryIn": null,
  "is_new_account": true,  // true si es cuenta nueva
  "retryInstructions": "Verifica en Instagram y reintenta el login.",
  "challengeId": null,
  "username": "azulitobluexx"
}
```

---

## 🚨 Tipos de Challenge

### **1. Challenge Manual (needs_code: false)**
**Más común en cuentas nuevas**

```javascript
{
  "challenge": true,
  "needs_code": false,
  "needsManualRetry": true,
  "message": "Instagram requiere verificación. Verifica en tu teléfono/app..."
}
```

**Acción del usuario:**
1. Abrir Instagram en el teléfono o navegador
2. Completar la verificación (puede ser captcha, fotos, etc.)
3. Volver al sistema y hacer clic en "Reintentar Login"

### **2. Challenge con Código (needs_code: true)**
**Menos común**

```javascript
{
  "challenge": true,
  "needs_code": true,
  "needsManualRetry": false,
  "message": "Instagram envió un código de verificación..."
}
```

**Acción del usuario:**
1. Revisar SMS o email
2. Ingresar el código en un campo de texto
3. Sistema envía el código automáticamente

---

## 🎨 UI Recomendada

### **Alerta para Challenge Manual:**

```jsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, Smartphone, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

function InstagramChallengeAlert({ challengeData, onRetry }) {
  const isNewAccount = challengeData.is_new_account;
  
  return (
    <Alert variant="warning" className="border-orange-500 bg-orange-50">
      <AlertCircle className="h-5 w-5 text-orange-600" />
      <AlertTitle className="text-orange-900 font-semibold">
        {isNewAccount 
          ? "🔐 Cuenta Nueva - Verificación Requerida" 
          : "🔐 Verificación de Instagram Requerida"}
      </AlertTitle>
      <AlertDescription className="space-y-4">
        <div className="text-orange-800">
          {challengeData.message}
        </div>
        
        {isNewAccount && (
          <div className="bg-orange-100 p-3 rounded-md text-sm text-orange-900">
            <strong>⚠️ Cuentas nuevas:</strong> Instagram requiere verificación 
            manual la primera vez. Esto es normal y solo sucede una vez.
          </div>
        )}
        
        <div className="space-y-2">
          <p className="font-semibold text-orange-900 flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Pasos para verificar:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-orange-800">
            <li>Abre Instagram en tu <strong>teléfono</strong> o en 
                <a href="https://instagram.com" target="_blank" 
                   className="underline ml-1 font-semibold">
                  instagram.com
                </a>
            </li>
            <li>Inicia sesión con <strong>@{challengeData.username}</strong></li>
            <li>Completa la verificación que te pida Instagram 
                (puede ser captcha, seleccionar fotos, etc.)</li>
            <li>Una vez verificado, vuelve aquí y haz clic en 
                <strong> "Reintentar Login"</strong></li>
          </ol>
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button 
            onClick={onRetry}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reintentar Login
          </Button>
          <Button 
            variant="outline"
            onClick={() => window.open('https://instagram.com', '_blank')}
          >
            <Smartphone className="h-4 w-4 mr-2" />
            Abrir Instagram
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

---

## 💻 Código del Componente de Login

```typescript
'use client';

import { useState } from 'react';
import { instagramService } from '@/services/instagram.service';

export function InstagramLoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [challengeData, setChallengeData] = useState(null);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    setChallengeData(null);

    try {
      const result = await instagramService.login(username, password);

      if (result.success) {
        // Login exitoso
        toast.success('✅ Login exitoso en Instagram');
        // Redirigir o actualizar estado
      } else if (result.challenge) {
        // Challenge detectado
        console.log('🔐 Challenge detectado:', result);
        setChallengeData(result);
        
        // Mostrar notificación
        if (result.is_new_account) {
          toast.warning('Cuenta nueva requiere verificación manual');
        } else {
          toast.warning('Instagram requiere verificación');
        }
      } else {
        // Otro error
        setError(result.error || 'Error en login');
        toast.error(result.error || 'Error en login');
      }
    } catch (err) {
      console.error('Error en login:', err);
      setError('Error de conexión');
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    // Reintentar login con las mismas credenciales
    handleLogin();
  };

  return (
    <div className="space-y-4">
      {/* Challenge Alert */}
      {challengeData && (
        <InstagramChallengeAlert 
          challengeData={challengeData}
          onRetry={handleRetry}
        />
      )}

      {/* Error Alert */}
      {error && !challengeData && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Login Form */}
      <div className="space-y-3">
        <Input
          placeholder="Usuario de Instagram"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
        />
        <Input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />
        <Button 
          onClick={handleLogin}
          disabled={loading || !username || !password}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Iniciando sesión...
            </>
          ) : (
            'Iniciar Sesión'
          )}
        </Button>
      </div>
    </div>
  );
}
```

---

## 🔄 Flujo Completo

```
Usuario ingresa credenciales
         ↓
   Click en "Login"
         ↓
Backend intenta login
         ↓
   ¿Challenge detectado?
         ↓
    SÍ → Devuelve challenge: true
         ↓
Frontend muestra alerta naranja
         ↓
Usuario abre Instagram en teléfono
         ↓
Usuario completa verificación
         ↓
Usuario vuelve y click "Reintentar"
         ↓
Backend intenta login nuevamente
         ↓
   ¿Login exitoso?
         ↓
    SÍ → ✅ Login completado
```

---

## 🎨 Estilos CSS (Tailwind)

```css
/* Alerta de Challenge */
.challenge-alert {
  @apply border-l-4 border-orange-500 bg-orange-50 p-4 rounded-lg;
}

.challenge-alert-title {
  @apply text-orange-900 font-semibold text-lg mb-2;
}

.challenge-alert-description {
  @apply text-orange-800 text-sm space-y-3;
}

.challenge-steps {
  @apply bg-orange-100 p-3 rounded-md;
}

.challenge-button-retry {
  @apply bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md;
}
```

---

## 📱 Versión Mobile

Para mobile, considera usar un **modal/dialog** en lugar de una alerta inline:

```jsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function InstagramChallengeModal({ open, onOpenChange, challengeData, onRetry }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            Verificación Requerida
          </DialogTitle>
          <DialogDescription className="space-y-4 pt-4">
            {/* Mismo contenido que la alerta */}
            <div className="text-sm text-gray-700">
              {challengeData.message}
            </div>
            
            {/* Pasos... */}
            
            <div className="flex flex-col gap-2">
              <Button onClick={onRetry} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Reintentar Login
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => window.open('https://instagram.com', '_blank')}
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Abrir Instagram
              </Button>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 🧪 Testing

### **Caso 1: Cuenta Nueva**
```javascript
// Simular response
const mockChallengeResponse = {
  success: false,
  challenge: true,
  needs_code: false,
  is_new_account: true,
  message: "Instagram requiere verificación...",
  username: "nueva_cuenta"
};

// Verificar que se muestra:
// ✅ Alerta naranja
// ✅ Mensaje de "Cuenta Nueva"
// ✅ Botón "Reintentar Login"
// ✅ Botón "Abrir Instagram"
```

### **Caso 2: Challenge en Cuenta Existente**
```javascript
const mockChallengeResponse = {
  success: false,
  challenge: true,
  needs_code: false,
  is_new_account: false,
  message: "Verificación requerida",
  username: "cuenta_existente"
};

// Verificar que se muestra:
// ✅ Alerta naranja
// ✅ Sin mensaje de "Cuenta Nueva"
// ✅ Botones de acción
```

---

## 📊 Métricas a Trackear

```javascript
// Analytics
analytics.track('instagram_challenge_shown', {
  username: challengeData.username,
  is_new_account: challengeData.is_new_account,
  needs_code: challengeData.needs_code
});

// Cuando el usuario reintenta
analytics.track('instagram_challenge_retry', {
  username: challengeData.username
});

// Cuando el login es exitoso después del challenge
analytics.track('instagram_challenge_resolved', {
  username: challengeData.username,
  retry_count: retryCount
});
```

---

## ✅ Checklist de Implementación

- [ ] Crear componente `InstagramChallengeAlert`
- [ ] Integrar en el formulario de login
- [ ] Manejar estado `challengeData`
- [ ] Implementar botón "Reintentar Login"
- [ ] Implementar botón "Abrir Instagram"
- [ ] Agregar toast notifications
- [ ] Testing con cuenta nueva
- [ ] Testing con cuenta existente
- [ ] Responsive design (mobile/desktop)
- [ ] Analytics tracking

---

## 🎯 Resultado Final

El usuario verá:

1. **Alerta naranja clara** con el emoji 🔐
2. **Mensaje específico** para cuentas nuevas vs existentes
3. **Pasos numerados** fáciles de seguir
4. **Botón "Reintentar Login"** prominente
5. **Botón "Abrir Instagram"** para facilitar la verificación
6. **Diseño responsive** que funciona en mobile y desktop

---

**Última actualización:** 13 de Enero, 2025  
**Versión:** 1.0.0  
**Estado:** ✅ Especificación completa - Backend listo, Frontend pendiente
