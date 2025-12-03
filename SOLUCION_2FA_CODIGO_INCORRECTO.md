# 🔐 Solución: Código 2FA Incorrecto o Expirado

## ❌ Problema Identificado

Cuando intentas hacer login con una cuenta que tiene 2FA activado, el sistema:
1. ✅ Detecta correctamente que se requiere 2FA
2. ✅ Muestra el modal para ingresar el código
3. ❌ Pero cuando ingresas el código, te dice "Código incorrecto o expirado"

**Error en logs:**
```
❌ Error completando login 2FA: POST /api/v1/accounts/two_factor_login/ - 400 Bad Request; Invalid Parameters
```

---

## 🔍 Causas Posibles

### **1. Código Expirado (MÁS COMÚN) ⏱️**

Los códigos TOTP (app authenticator) **solo duran 30 segundos**. Si tardas en ingresarlo, expira.

**Solución:**
- Ingresa el código **inmediatamente** cuando aparece
- Si pasó más de 30 segundos, espera al siguiente código y úsalo rápido

### **2. Formato del Código 📝**

El código puede tener espacios, guiones u otros caracteres que interfieren.

**Solución implementada:**
- ✅ El sistema ahora limpia automáticamente el código
- ✅ Elimina espacios, guiones y caracteres no numéricos
- ✅ Valida que tenga exactamente 6 dígitos

### **3. Código Incorrecto ❌**

El código que ingresaste no es el correcto que está mostrando tu app authenticator.

**Solución:**
- Verifica que estés usando el código de la app authenticator correcta
- Asegúrate de que la hora de tu dispositivo esté sincronizada
- Si usas SMS, verifica que recibiste el código correcto

---

## ✅ Solución Implementada

### **1. Mejor Validación del Código**

He mejorado la validación del código 2FA para:
- ✅ Limpiar automáticamente espacios, guiones y caracteres no numéricos
- ✅ Validar que tenga al menos 6 dígitos
- ✅ Si tiene más de 6, usar los últimos 6 dígitos
- ✅ Mejor logging para diagnosticar problemas

### **2. Logs Detallados**

Ahora verás en los logs:
```
📝 Código 2FA procesado: 6 dígitos (original recibido: "123456", método: TOTP)
📋 Parámetros para twoFactorLogin: username=tomasgraciaoficial, identifier=..., method=0
```

### **3. Mejor Manejo de Errores**

El sistema ahora:
- ✅ Valida el código antes de enviarlo a Instagram
- ✅ Muestra mensajes de error más claros
- ✅ Indica si el problema es formato o expiración

---

## 🚀 Cómo Usar Correctamente el 2FA

### **Paso 1: Hacer Login**

1. Ingresa usuario y contraseña
2. Haz clic en "Login"
3. El sistema detectará que se requiere 2FA

### **Paso 2: Obtener el Código**

**Si usas App Authenticator (TOTP):**
- ✅ Abre tu app authenticator (Google Authenticator, Authy, etc.)
- ✅ Busca la cuenta de Instagram
- ✅ El código cambia cada 30 segundos
- ✅ **IMPORTANTE:** Ingresa el código **inmediatamente**

**Si usas SMS:**
- ✅ Revisa tu teléfono
- ✅ Busca el SMS de Instagram
- ✅ Ingresa el código de 6 dígitos

### **Paso 3: Ingresar el Código**

1. Cuando aparezca el modal, **NO ESPERES**
2. Abre tu app authenticator
3. Copia el código
4. Pégalo en el campo inmediatamente
5. Haz clic en "Verificar"

**⏱️ CRÍTICO:** Los códigos TOTP solo duran 30 segundos. Si tardas, expirará.

---

## 🔧 Si Sigue Fallando

### **1. Verificar Hora del Sistema**

Los códigos TOTP dependen de la hora del sistema:

```bash
# Verificar que la hora esté correcta
date

# En Linux/Mac, sincronizar:
sudo ntpdate -s time.nist.gov
```

### **2. Verificar que el Código Sea Correcto**

- ✅ Asegúrate de estar usando el código de la cuenta correcta
- ✅ Si tienes múltiples cuentas, verifica que sea la de Instagram
- ✅ Verifica que la hora de tu dispositivo esté correcta

### **3. Probar con Nuevo Código**

1. Espera 30 segundos
2. Obtén un nuevo código de tu app authenticator
3. Ingresa el nuevo código inmediatamente

### **4. Si Usas SMS**

Si recibes códigos por SMS:
- ✅ Verifica que el número de teléfono esté correcto
- ✅ Revisa spam si no recibes el código
- ✅ Espera 1-2 minutos entre solicitudes

---

## 📋 Checklist de Debugging

Si el código sigue fallando, verifica:

- [ ] ¿El código tiene exactamente 6 dígitos?
- [ ] ¿Lo ingresaste dentro de los 30 segundos?
- [ ] ¿La hora de tu dispositivo está correcta?
- [ ] ¿Estás usando la app authenticator correcta?
- [ ] ¿El código que ingresaste coincide con el de la app?
- [ ] ¿Intentaste con un código nuevo (esperaste 30 segundos)?

---

## 🆘 Si Nada Funciona

Si después de todo esto el código sigue fallando:

1. **Desactiva 2FA temporalmente:**
   - Ve a Instagram.com
   - Configuración > Seguridad > Autenticación de dos factores
   - Desactiva 2FA temporalmente
   - Haz login desde aquí
   - Vuelve a activar 2FA después

2. **Usa SMS en lugar de App Authenticator:**
   - En Instagram, cambia de "App Authenticator" a "SMS"
   - Los códigos SMS duran más tiempo (5-10 minutos)
   - Prueba hacer login de nuevo

3. **Contacta soporte:**
   - Si nada funciona, puede haber un problema con la cuenta
   - Verifica en Instagram.com que la cuenta funcione correctamente
   - Puede que Instagram haya bloqueado la cuenta

---

## ✅ Cambios Realizados

1. ✅ Mejor validación y limpieza del código 2FA
2. ✅ Logs más detallados para debugging
3. ✅ Validación de longitud del código
4. ✅ Manejo de códigos con espacios o guiones
5. ✅ Mensajes de error más claros

---

## 📝 Notas Importantes

- ⏱️ **Códigos TOTP expiran en 30 segundos** - Ingresa inmediatamente
- 📱 **Los códigos SMS duran más** - Usa SMS si tienes problemas con TOTP
- 🕐 **La hora del sistema importa** - Verifica que esté sincronizada
- 🔄 **Puedes intentar múltiples veces** - Espera 30 segundos entre intentos

---

**Última actualización:** 2025-12-03
**Estado:** Implementado y listo para producción

