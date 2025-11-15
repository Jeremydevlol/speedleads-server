# 🚨 Todas las Alertas de Instagram - Guía Completa Frontend

## 📋 Índice de Alertas

El sistema emite **13 tipos diferentes de alertas** vía Socket.IO en el evento `instagram:alert`.

---

## 🎯 Estructura de Alerta

Todas las alertas siguen este formato:

```javascript
{
  type: 'alert_type',           // Tipo de alerta (ver lista abajo)
  severity: 'success|warning|error',  // Nivel de severidad
  message: 'Mensaje corto',     // Título de la alerta
  description: 'Descripción detallada',  // Texto explicativo
  username: 'usuario_ig',       // Usuario afectado (opcional)
  action_required: true|false,  // Si requiere acción del usuario
  retry_instructions: 'Instrucciones...'  // Qué hacer (opcional)
}
```

---

## 📊 Lista Completa de Alertas

### **1. 🔐 Challenge Requerido (Verificación Manual)**
**Tipo:** `challenge_required`  
**Severidad:** `warning`  
**Cuándo:** Instagram requiere verificación manual (común en cuentas nuevas)

```javascript
{
  type: 'challenge_required',
  severity: 'warning',
  message: 'Cuenta nueva requiere verificación manual',
  description: 'Instagram requiere que verifiques tu cuenta. Abre Instagram en tu teléfono o navegador, completa la verificación y luego reintenta el login.',
  username: 'azulitobluexx',
  action_required: true,
  retry_instructions: 'Verifica en Instagram y reintenta el login.'
}
```

**UI Recomendada:**
- ⚠️ Alerta **naranja**
- Icono: `AlertCircle` o `Shield`
- Botones: "Reintentar Login", "Abrir Instagram"
- Pasos numerados para verificar

---

### **2. 📱 Código de Verificación Requerido**
**Tipo:** `challenge_code_required`  
**Severidad:** `warning`  
**Cuándo:** Instagram envió código por SMS/email

```javascript
{
  type: 'challenge_code_required',
  severity: 'warning',
  message: 'Código de verificación requerido',
  description: 'Instagram envió un código de verificación a tu teléfono o email. Ingresa el código para continuar.',
  username: 'usuario123',
  action_required: true,
  code_input_required: true
}
```

**UI Recomendada:**
- ⚠️ Alerta **naranja** con input
- Campo de texto para ingresar código (6 dígitos)
- Botón: "Verificar Código"
- Timer de reenvío (opcional)

---

### **3. ✅ Challenge Resuelto (Login Exitoso)**
**Tipo:** `challenge_resolved`  
**Severidad:** `success`  
**Cuándo:** Login exitoso después de verificación

```javascript
{
  type: 'challenge_resolved',
  severity: 'success',
  message: 'Login exitoso',
  description: 'La verificación fue completada exitosamente. Tu cuenta está conectada.',
  username: 'usuario123'
}
```

**UI Recomendada:**
- ✅ Toast/notificación **verde**
- Icono: `CheckCircle`
- Auto-cerrar en 3 segundos
- Redirigir a dashboard

---

### **4. ❌ Código Inválido**
**Tipo:** `challenge_code_invalid`  
**Severidad:** `error`  
**Cuándo:** El código ingresado es incorrecto

```javascript
{
  type: 'challenge_code_invalid',
  severity: 'error',
  message: 'Código inválido',
  description: 'El código que ingresaste es incorrecto. Verifica e intenta nuevamente.',
  username: 'usuario123',
  action_required: true
}
```

**UI Recomendada:**
- ❌ Alerta **roja** debajo del input
- Icono: `XCircle`
- Shake animation en el input
- Mantener el input visible para reintentar

---

### **5. ⏳ Verificación Pendiente**
**Tipo:** `challenge_verification_pending`  
**Severidad:** `warning`  
**Cuándo:** Login falló pero hay verificación pendiente

```javascript
{
  type: 'challenge_verification_pending',
  severity: 'warning',
  message: 'Verificación aún pendiente',
  description: 'Parece que aún no has completado la verificación en Instagram. Complétala y luego reintenta el login.',
  username: 'usuario123',
  action_required: true
}
```

**UI Recomendada:**
- ⚠️ Alerta **naranja**
- Icono: `Clock`
- Botones: "Reintentar Login", "Abrir Instagram"

---

### **6. ⚠️ Reintento Automático Falló**
**Tipo:** `challenge_retry_failed`  
**Severidad:** `warning`  
**Cuándo:** El sistema reintentó automáticamente pero falló

```javascript
{
  type: 'challenge_retry_failed',
  severity: 'warning',
  message: 'Reintento automático falló',
  description: 'El sistema intentó reconectar automáticamente pero no fue posible. Por favor, reintenta el login manualmente.',
  username: 'usuario123',
  action_required: true
}
```

**UI Recomendada:**
- ⚠️ Alerta **naranja**
- Icono: `RefreshCw`
- Botón: "Reintentar Login"

---

### **7. 📧 Recuperación de Cuenta Requerida**
**Tipo:** `account_recovery_required`  
**Severidad:** `warning`  
**Cuándo:** Instagram sugiere recuperar la cuenta por email

```javascript
{
  type: 'account_recovery_required',
  severity: 'warning',
  message: 'Recuperación de cuenta requerida',
  description: 'Instagram requiere que recuperes tu cuenta. Revisa tu email para instrucciones de Instagram.',
  username: 'usuario123',
  action_required: true,
  recovery_instructions: 'Revisa tu email y sigue las instrucciones de Instagram para recuperar tu cuenta.'
}
```

**UI Recomendada:**
- ⚠️ Alerta **naranja**
- Icono: `Mail`
- Botones: "Abrir Gmail", "Abrir Instagram"
- Instrucciones claras

---

### **8. 🚨 Login Bloqueado (Sospechoso)**
**Tipo:** `suspicious_login_blocked`  
**Severidad:** `error`  
**Cuándo:** Instagram bloqueó el login por actividad sospechosa

```javascript
{
  type: 'suspicious_login_blocked',
  severity: 'error',
  message: 'Intento de login bloqueado',
  description: 'Instagram bloqueó este intento de login por actividad sospechosa. Intenta iniciar sesión desde tu teléfono primero.',
  username: 'usuario123',
  action_required: true,
  blocked_reason: 'Instagram detectó actividad inusual'
}
```

**UI Recomendada:**
- 🚨 Alerta **roja**
- Icono: `ShieldAlert`
- Botones: "Abrir Instagram en Teléfono"
- Mensaje de seguridad

---

### **9. 🔗 Cuenta Vinculada a Facebook**
**Tipo:** `facebook_linked_account`  
**Severidad:** `error`  
**Cuándo:** La cuenta solo puede acceder vía Facebook

```javascript
{
  type: 'facebook_linked_account',
  severity: 'error',
  message: 'Cuenta vinculada a Facebook',
  description: 'Esta cuenta de Instagram está vinculada a Facebook y solo puede acceder mediante Facebook Login.',
  username: 'usuario123',
  action_required: true,
  facebook_login_required: true
}
```

**UI Recomendada:**
- ❌ Alerta **roja**
- Icono: `Facebook` (lucide-react)
- Botón: "Iniciar con Facebook" (deshabilitado o con mensaje)
- Explicación de limitación

---

### **10. 🚫 Login Bloqueado (Genérico)**
**Tipo:** `login_blocked`  
**Severidad:** `error`  
**Cuándo:** Instagram bloqueó el login por otras razones

```javascript
{
  type: 'login_blocked',
  severity: 'error',
  message: 'Login bloqueado por Instagram',
  description: 'Instagram bloqueó el acceso a esta cuenta. Intenta iniciar sesión desde la app oficial de Instagram primero.',
  username: 'usuario123',
  action_required: true
}
```

**UI Recomendada:**
- 🚫 Alerta **roja**
- Icono: `Ban`
- Botones: "Abrir Instagram"
- Mensaje de contacto a soporte

---

### **11. 🔒 Cuenta Privada (Target)**
**Tipo:** `private_account_target`  
**Severidad:** `error`  
**Cuándo:** Intentas extraer seguidores de una cuenta privada

```javascript
{
  type: 'private_account_target',
  severity: 'error',
  message: 'La cuenta @usuario es privada',
  description: 'No se pueden obtener seguidores de cuentas privadas. Elige una cuenta pública.',
  username: 'usuario_privado',
  action_required: false
}
```

**UI Recomendada:**
- ❌ Toast/notificación **roja**
- Icono: `Lock`
- Auto-cerrar en 5 segundos
- Sugerencia: "Elige una cuenta pública"

---

### **12. ⚠️ Sesión Expirada**
**Tipo:** `session_expired`  
**Severidad:** `warning`  
**Cuándo:** La sesión de Instagram expiró

```javascript
{
  type: 'session_expired',
  severity: 'warning',
  message: 'Sesión expirada',
  description: 'Tu sesión de Instagram ha expirado. Por favor, inicia sesión nuevamente.',
  username: 'usuario123',
  action_required: true
}
```

**UI Recomendada:**
- ⚠️ Modal/dialog **naranja**
- Icono: `LogOut`
- Botón: "Iniciar Sesión"
- Redirigir a login

---

### **13. ❌ Error de Conexión**
**Tipo:** `connection_error`  
**Severidad:** `error`  
**Cuándo:** Error de red o conexión con Instagram

```javascript
{
  type: 'connection_error',
  severity: 'error',
  message: 'Error de conexión',
  description: 'No se pudo conectar con Instagram. Verifica tu conexión a internet e intenta nuevamente.',
  action_required: true
}
```

**UI Recomendada:**
- ❌ Toast/notificación **roja**
- Icono: `WifiOff`
- Botón: "Reintentar"
- Auto-cerrar en 5 segundos

---

## 🎨 Componente React Universal

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Shield, 
  Clock,
  Mail,
  ShieldAlert,
  Ban,
  Lock,
  LogOut,
  WifiOff,
  RefreshCw,
  Smartphone
} from 'lucide-react';
import { socket } from '@/lib/socket';
import { toast } from 'sonner';

interface InstagramAlert {
  type: string;
  severity: 'success' | 'warning' | 'error';
  message: string;
  description: string;
  username?: string;
  action_required?: boolean;
  retry_instructions?: string;
  code_input_required?: boolean;
}

export function InstagramAlertHandler() {
  const [alert, setAlert] = useState<InstagramAlert | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  useEffect(() => {
    // Escuchar alertas de Instagram
    socket.on('instagram:alert', (data: InstagramAlert) => {
      console.log('🚨 Instagram Alert:', data);
      
      // Alertas que se muestran como toast
      const toastTypes = [
        'challenge_resolved',
        'private_account_target',
        'connection_error'
      ];
      
      if (toastTypes.includes(data.type)) {
        if (data.severity === 'success') {
          toast.success(data.message, { description: data.description });
        } else if (data.severity === 'error') {
          toast.error(data.message, { description: data.description });
        } else {
          toast.warning(data.message, { description: data.description });
        }
      } else {
        // Alertas que se muestran como componente
        setAlert(data);
      }
    });

    return () => {
      socket.off('instagram:alert');
    };
  }, []);

  const handleRetry = () => {
    // Reintentar login
    // Llamar a tu función de login
    setAlert(null);
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error('Código inválido', { 
        description: 'El código debe tener 6 dígitos' 
      });
      return;
    }

    try {
      // Enviar código al backend
      // await instagramService.submitChallengeCode(verificationCode);
      setAlert(null);
      setVerificationCode('');
    } catch (error) {
      toast.error('Error al verificar código');
    }
  };

  const handleOpenInstagram = () => {
    window.open('https://instagram.com', '_blank');
  };

  if (!alert) return null;

  // Mapeo de iconos
  const iconMap = {
    challenge_required: Shield,
    challenge_code_required: Smartphone,
    challenge_resolved: CheckCircle,
    challenge_code_invalid: XCircle,
    challenge_verification_pending: Clock,
    challenge_retry_failed: RefreshCw,
    account_recovery_required: Mail,
    suspicious_login_blocked: ShieldAlert,
    facebook_linked_account: AlertCircle,
    login_blocked: Ban,
    private_account_target: Lock,
    session_expired: LogOut,
    connection_error: WifiOff,
  };

  const Icon = iconMap[alert.type] || AlertCircle;

  // Mapeo de colores
  const colorMap = {
    success: 'border-green-500 bg-green-50 text-green-900',
    warning: 'border-orange-500 bg-orange-50 text-orange-900',
    error: 'border-red-500 bg-red-50 text-red-900',
  };

  const iconColorMap = {
    success: 'text-green-600',
    warning: 'text-orange-600',
    error: 'text-red-600',
  };

  return (
    <Alert className={`${colorMap[alert.severity]} border-l-4`}>
      <Icon className={`h-5 w-5 ${iconColorMap[alert.severity]}`} />
      <AlertTitle className="font-semibold text-lg">
        {alert.message}
      </AlertTitle>
      <AlertDescription className="space-y-4">
        <p>{alert.description}</p>

        {alert.username && (
          <p className="text-sm font-medium">
            Usuario: <span className="font-mono">@{alert.username}</span>
          </p>
        )}

        {/* Input para código de verificación */}
        {alert.code_input_required && (
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="Código de 6 dígitos"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="font-mono text-center text-lg tracking-widest"
            />
            <Button 
              onClick={handleVerifyCode}
              className="w-full"
              disabled={verificationCode.length !== 6}
            >
              Verificar Código
            </Button>
          </div>
        )}

        {/* Instrucciones de reintento */}
        {alert.retry_instructions && (
          <div className="bg-white/50 p-3 rounded-md text-sm">
            <p className="font-semibold mb-1">Instrucciones:</p>
            <p>{alert.retry_instructions}</p>
          </div>
        )}

        {/* Botones de acción */}
        {alert.action_required && !alert.code_input_required && (
          <div className="flex gap-2 pt-2">
            <Button onClick={handleRetry} className="flex-1">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar Login
            </Button>
            <Button 
              variant="outline" 
              onClick={handleOpenInstagram}
              className="flex-1"
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Abrir Instagram
            </Button>
          </div>
        )}

        {/* Botón de cerrar */}
        {!alert.action_required && (
          <Button 
            variant="outline" 
            onClick={() => setAlert(null)}
            className="w-full"
          >
            Cerrar
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
```

---

## 📱 Integración en tu App

```typescript
// En tu layout o página principal
import { InstagramAlertHandler } from '@/components/instagram-alert-handler';

export default function Layout({ children }) {
  return (
    <div>
      {/* Alertas de Instagram */}
      <InstagramAlertHandler />
      
      {/* Resto de tu app */}
      {children}
    </div>
  );
}
```

---

## 🎯 Resumen por Severidad

### **✅ Success (1 alerta):**
- `challenge_resolved` - Login exitoso

### **⚠️ Warning (6 alertas):**
- `challenge_required` - Verificación manual
- `challenge_code_required` - Código requerido
- `challenge_verification_pending` - Verificación pendiente
- `challenge_retry_failed` - Reintento falló
- `account_recovery_required` - Recuperación requerida
- `session_expired` - Sesión expirada

### **❌ Error (6 alertas):**
- `challenge_code_invalid` - Código inválido
- `suspicious_login_blocked` - Login bloqueado (sospechoso)
- `facebook_linked_account` - Cuenta de Facebook
- `login_blocked` - Login bloqueado (genérico)
- `private_account_target` - Cuenta privada
- `connection_error` - Error de conexión

---

## ✅ Checklist de Implementación

- [ ] Crear componente `InstagramAlertHandler`
- [ ] Configurar Socket.IO listener para `instagram:alert`
- [ ] Implementar mapeo de iconos y colores
- [ ] Agregar input para código de verificación
- [ ] Implementar botones de acción
- [ ] Integrar toast notifications (Sonner)
- [ ] Testing de cada tipo de alerta
- [ ] Responsive design
- [ ] Animaciones (shake, fade, etc.)
- [ ] Analytics tracking

---

**Última actualización:** 13 de Enero, 2025  
**Total de alertas:** 13  
**Estado:** ✅ Documentación completa
