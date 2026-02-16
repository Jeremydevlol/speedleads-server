# Fix: Error 500 en /api/billing/plans (Frontend Next.js)

## 🔍 Diagnóstico del Problema

### Síntomas Actuales (ACTUALIZADO)
- ❌ El frontend muestra error `HTTP 500: Internal Server Error`
- ❌ Los logs muestran: `Backend billing/plans error: 500 Internal Server Error`
- ❌ El endpoint tarda ~25 segundos y falla con 500
- ✅ El backend responde correctamente en 10ms con 200 OK

### Causa Raíz Identificada
El problema **NO está en el backend API**, sino en el **frontend Next.js**:

1. **Backend responde correctamente en 7-10ms** (verificado con curl directo)
2. **Frontend Next.js tiene un API route** (`/app/api/billing/plans/route.ts`) que actúa como proxy
3. **El proxy de Next.js NO puede conectarse al backend** (problema de red/DNS/URL)
4. **Después de ~25 segundos, el proxy devuelve 500 Internal Server Error**

### Evidencia
```bash
# Test directo al backend (FUNCIONA ✅)
$ curl http://localhost:5001/api/billing/plans
HTTP/1.1 200 OK
Content-Length: 755
{"ok":true,"plans":[...]}  # Respuesta instantánea en ~10ms

# Test desde el frontend Next.js (FALLA ❌)
GET /api/billing/plans 500 in 25098ms  # 25 segundos - ERROR 500
Backend billing/plans error: 500 Internal Server Error
```

### Diagnóstico Técnico
El API route de Next.js está intentando hacer `fetch()` al backend pero:
- La URL del backend está mal configurada (probablemente `undefined` o incorrecta)
- El fetch está tardando 25 segundos antes de fallar
- Next.js devuelve 500 porque no puede conectarse al backend

## ✅ Soluciones Implementadas

### 1. Backend: Optimización con Cache en Memoria
**Archivo:** `/Volumes/Uniclick4TB/api/src/billing.js`

**Cambios:**
- ✅ Cache de planes en memoria (PLANS_CACHE)
- ✅ Headers de cache HTTP (5 minutos)
- ✅ Logging de tiempo de respuesta
- ✅ Respuesta ahora en ~7ms (antes ~15ms)

```javascript
// Cache en memoria (se calcula una sola vez al iniciar)
const PLANS_CACHE = (() => {
  // ... código de generación de planes
})();

router.get('/plans', (req, res) => {
  const startTime = Date.now();
  
  // Headers de cache agresivo
  res.set({
    'Cache-Control': 'public, max-age=300, s-maxage=300',
    'Content-Type': 'application/json'
  });

  const response = { ok: true, plans: PLANS_CACHE };
  const responseTime = Date.now() - startTime;
  
  console.log(`✅ /api/billing/plans responded in ${responseTime}ms`);
  res.json(response);
});
```

### 2. Frontend: Solución URGENTE Requerida

El problema está en el **API route de Next.js** en el frontend. El proxy NO puede conectarse al backend.

**Ubicación:** `/frontnocap/app/api/billing/plans/route.ts` (o similar)

**Problema:** La variable de entorno `BACKEND_URL` está mal configurada o el fetch está fallando.

---

#### ✅ SOLUCIÓN 1: Verificar Variables de Entorno (CRÍTICO)

**Archivo:** `/frontnocap/.env.local` o `/frontnocap/.env`

```bash
# ❌ INCORRECTO (probablemente lo que tienes ahora)
BACKEND_URL=undefined
# o
BACKEND_URL=http://localhost:5001  # Puede no funcionar en producción

# ✅ CORRECTO
NEXT_PUBLIC_BACKEND_URL=http://localhost:5001  # Para desarrollo
BACKEND_URL=http://localhost:5001             # Para API routes server-side
```

**Reinicia Next.js después de cambiar las variables:**
```bash
# Detener Next.js (Ctrl+C)
# Limpiar cache
rm -rf .next
# Reiniciar
npm run dev
```

---

#### ✅ SOLUCIÓN 2: Eliminar el Proxy (RECOMENDADO)

**Elimina completamente el archivo:**
```bash
rm /frontnocap/app/api/billing/plans/route.ts
```

**En el componente del frontend, llama directamente al backend:**
```typescript
// En tu componente React
const loadPlans = async () => {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/billing/plans`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Para enviar cookies
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    setPlans(data.plans);
  } catch (error) {
    console.error('Error loading plans:', error);
  }
};
```

---

#### ✅ SOLUCIÓN 3: Arreglar el Proxy Existente

Si necesitas mantener el proxy, arréglalo así:

```typescript
// /frontnocap/app/api/billing/plans/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // 10 segundos máximo

export async function GET(request: Request) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
  
  console.log(`🔄 Proxying to: ${backendUrl}/api/billing/plans`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout
    
    const response = await fetch(
      `${backendUrl}/api/billing/plans`,
      { 
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`❌ Backend error: ${response.status}`);
      return NextResponse.json(
        { error: 'Backend error', status: response.status },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    console.log(`✅ Plans loaded successfully`);
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache 5 minutos
      }
    });
    
  } catch (error: any) {
    console.error('❌ Fetch error:', error.message);
    
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch plans', details: error.message },
      { status: 500 }
    );
  }
}
```

---

#### 🔍 Debug: Verificar qué URL está usando el frontend

Agrega esto temporalmente en el API route para ver qué URL está intentando usar:

```typescript
export async function GET(request: Request) {
  const backendUrl = process.env.BACKEND_URL;
  console.log('🔍 DEBUG - BACKEND_URL:', backendUrl);
  console.log('🔍 DEBUG - All env vars:', Object.keys(process.env).filter(k => k.includes('BACKEND')));
  
  // ... resto del código
}
```

## 🔧 Cómo Verificar la Solución

### 1. Verificar que el backend responde rápido
```bash
curl -w "\nTime: %{time_total}s\n" http://localhost:5001/api/billing/plans
# Debe responder en < 0.1s
```

### 2. Verificar logs del backend
Busca en los logs del backend:
```
✅ /api/billing/plans responded in Xms
```

### 3. Verificar el frontend
- Elimina o modifica el API route de Next.js
- Reinicia el servidor de Next.js
- Verifica que no aparezca más el mensaje "Backend billing/plans timeout after 5s"

## 📊 Métricas de Rendimiento

| Métrica | Antes | Después | Estado |
|---------|-------|---------|--------|
| Tiempo de respuesta backend | 15ms | 7-10ms | ✅ Optimizado |
| Cache en memoria | ❌ No | ✅ Sí | ✅ Implementado |
| Headers de cache HTTP | ❌ No | ✅ Sí (5min) | ✅ Implementado |
| Timeout frontend | 5s → 25s | N/A | ❌ Proxy fallando |
| Error rate | 504 Timeout | 500 Error | ❌ Empeoró |

## 🚀 Acción Inmediata Requerida

### PASO 1: Verificar Variables de Entorno del Frontend
```bash
cd /Volumes/Uniclick4TB/frontnocap
cat .env.local | grep BACKEND
cat .env | grep BACKEND
```

**Debe tener:**
```bash
BACKEND_URL=http://localhost:5001
NEXT_PUBLIC_BACKEND_URL=http://localhost:5001
```

### PASO 2: Reiniciar Frontend con Cache Limpio
```bash
cd /Volumes/Uniclick4TB/frontnocap
rm -rf .next
npm run dev
```

### PASO 3: Verificar Logs del Frontend
Busca en los logs del frontend Next.js:
- `🔄 Proxying to: ...` (debe mostrar la URL correcta)
- `❌ Fetch error: ...` (muestra el error real)

### PASO 4: Si Sigue Fallando, Eliminar el Proxy
```bash
# Encuentra y elimina el API route
find /Volumes/Uniclick4TB/frontnocap/app -name "*billing*" -type f
# Elimina el archivo route.ts que encuentres
```

## 🔍 Debugging Adicional

Si después de los pasos anteriores sigue fallando:

1. **Verifica que el backend esté corriendo:**
   ```bash
   curl http://localhost:5001/api/billing/plans
   ```

2. **Verifica que el frontend pueda hacer fetch:**
   ```bash
   # Desde el directorio del frontend
   node -e "fetch('http://localhost:5001/api/billing/plans').then(r => r.json()).then(console.log)"
   ```

3. **Revisa los logs del backend** para ver si llegan las peticiones del frontend

## 📝 Notas Adicionales

- El backend está optimizado y responde correctamente
- El problema es exclusivamente del lado del frontend
- La solución más simple es eliminar el proxy de Next.js y llamar directamente al backend
- Si necesitas el proxy, aumenta el timeout o agrega cache

---

**Fecha:** 2025-01-18  
**Estado:** Backend optimizado ✅ | Frontend pendiente ⚠️
