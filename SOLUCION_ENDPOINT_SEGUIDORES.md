# ✅ SOLUCIÓN: Envío Masivo a Seguidores con IA

## 🚨 Problema Identificado

El frontend está llamando a:
- ❌ `/api/instagram/followers-send-ai` (Next.js API route)
- Este endpoint NO está usando tu mensaje base "di que hay ofertas"
- Está generando mensajes genéricos sin usar el mensaje base que escribes

## ✅ Solución: Modificar el Endpoint de Next.js

**OPCIÓN 1 (Recomendada):** Hacer que el endpoint de Next.js sea un proxy que llame al backend

**OPCIÓN 2:** Cambiar el frontend para llamar directamente al backend

---

## 🔧 OPCIÓN 1: Modificar `app/api/instagram/followers-send-ai/route.ts`

Reemplaza TODO el contenido del archivo por esto:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    console.log('📤 [PROXY] Redirigiendo a backend:', {
      target_username: body.target_username,
      message: body.message?.substring(0, 50),
      limit: body.limit
    });
    
    // Redirigir TODA la petición al backend
    const backendResponse = await fetch(`${BACKEND_URL}/api/instagram/bulk-send-followers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.get('authorization') && {
          'Authorization': req.headers.get('authorization')!
        })
      },
      body: JSON.stringify({
        target_username: body.target_username,
        message: body.message,           // ← Tu mensaje base
        limit: body.limit || 50,
        delay: body.delay || 2000
      })
    });
    
    const data = await backendResponse.json();
    
    return NextResponse.json(data, { 
      status: backendResponse.status 
    });
    
  } catch (error: any) {
    console.error('❌ [PROXY] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

**Esto hará que el endpoint de Next.js simplemente redirija al backend, que SÍ genera mensajes con IA usando tu mensaje base.**

---

## 📝 Código para el Frontend

**Reemplaza** tu función actual por esta:

```typescript
const handleSendToFollowers = async (
  targetUsername: string, 
  messageBase: string,
  limit: number = 50
) => {
  // URL del backend (NO Next.js API route)
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/instagram/bulk-send-followers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target_username: targetUsername,  // Ej: "lucastm04"
        message: messageBase,              // Ej: "di que hay ofertas"
        limit: limit,                      // Ej: 100
        delay: 2000                        // Opcional: 2 segundos entre mensajes
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log(`✅ ${data.sent_count} mensajes enviados`);
      console.log(`🤖 ${data.ai_generated_count || 0} generados con IA`);
      return data;
    } else {
      throw new Error(data.error || 'Error enviando mensajes');
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};
```

---

## 🔍 Cambios Necesarios

1. **Cambiar la URL:**
   - ❌ ANTES: `/api/instagram/followers-send-ai`
   - ✅ AHORA: `http://localhost:5001/api/instagram/bulk-send-followers`

2. **Cambiar el body:**
   ```json
   {
     "target_username": "usuario_objetivo",
     "message": "tu mensaje base aquí",  // ← Este es el mensaje que se personalizará
     "limit": 50,
     "delay": 2000
   }
   ```

---

## ✅ Resultado Esperado

Con tu mensaje base: **"di que hay ofertas"**

Cada seguidor recibirá una variación única:
- "¡Hola! Tenemos promociones increíbles que no te puedes perder 😊"
- "Oye, ¿sabías que tenemos descuentos especiales ahora mismo?"
- "¡Buenas noticias! Lanzamos ofertas exclusivas que creo que te van a encantar"
- ... etc.

---

## 📊 Logs que Verás en el Backend

Cuando funcione correctamente, verás en la consola del backend:

```
═══════════════════════════════════════════════════════════
📤👥 [BULK-FOLLOWERS] Endpoint de envío masivo a seguidores llamado
📝 [BULK-FOLLOWERS] MENSAJE BASE RECIBIDO: "di que hay ofertas"
✅ [BULK-FOLLOWERS] Bot activo encontrado! userId: xxx, personalidad: "Roberto"
✅ [BULK-FOLLOWERS] Personalidad cargada correctamente: "Roberto"
✅ [BULK-FOLLOWERS] Listo para generar mensajes con IA
🧠 [BULK-FOLLOWERS] Generando mensaje con IA para: username
✅ [BULK-FOLLOWERS] ✅ MENSAJE GENERADO CON IA:
   Base: "di que hay ofertas"
   Generado: "¡Hola! Tenemos promociones increíbles..."
```

---

## ⚠️ Verificar

Asegúrate de que:
1. ✅ El backend esté corriendo en `http://localhost:5001`
2. ✅ El bot de Instagram esté activo con una personalidad seleccionada
3. ✅ Usas la URL del backend, no la API route de Next.js

