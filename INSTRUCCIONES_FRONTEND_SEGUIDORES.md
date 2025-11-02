# 🔧 INSTRUCCIONES PARA EL FRONTEND

## Problema Actual

El endpoint `/api/instagram/followers-send-ai` en Next.js está generando mensajes genéricos sin usar tu mensaje base "di que hay ofertas".

## ✅ SOLUCIÓN RÁPIDA

Modifica el archivo: `app/api/instagram/followers-send-ai/route.ts`

### Reemplaza TODO el contenido por esto:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    console.log('📤 [PROXY] Redirigiendo al backend:', {
      target_username: body.target_username,
      message_base: body.message?.substring(0, 50) + '...',
      limit: body.limit
    });
    
    // IMPORTANTE: Redirigir TODO al backend que SÍ usa el mensaje base
    const backendResponse = await fetch(`${BACKEND_URL}/api/instagram/bulk-send-followers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.get('authorization') && {
          'Authorization': req.headers.get('authorization')!
        })
      },
      body: JSON.stringify({
        target_username: body.target_username,  // Ej: "lucastm04"
        message: body.message,                  // Ej: "di que hay ofertas" ← Este es el mensaje base
        limit: body.limit || 50,
        delay: body.delay || 2000
      })
    });
    
    const data = await backendResponse.json();
    
    return NextResponse.json(data, { 
      status: backendResponse.status 
    });
    
  } catch (error: any) {
    console.error('❌ [PROXY] Error redirigiendo al backend:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Error comunicándose con el backend',
        message: 'Verifica que el backend esté corriendo en http://localhost:5001'
      },
      { status: 500 }
    );
  }
}
```

## ✅ Qué Hace Esto

1. El endpoint de Next.js recibe la petición del frontend
2. Redirige TODA la petición al backend (`http://localhost:5001/api/instagram/bulk-send-followers`)
3. El backend:
   - Extrae los seguidores
   - Busca el bot activo y su personalidad
   - Genera mensajes ÚNICOS con IA basados en tu mensaje base
   - Envía cada mensaje personalizado

## 🎯 Resultado

Con mensaje base: **"di que hay ofertas"**

Cada seguidor recibirá:
- ✅ Mensaje 1: "¡Hola! Tenemos promociones increíbles que no te puedes perder 😊"
- ✅ Mensaje 2: "Oye, ¿sabías que tenemos descuentos especiales ahora mismo?"
- ✅ Mensaje 3: "¡Buenas noticias! Lanzamos ofertas exclusivas que creo que te van a encantar"
- ... 100 mensajes diferentes basados en "ofertas"

## ⚠️ Requisitos

1. ✅ Backend corriendo en `http://localhost:5001`
2. ✅ Bot de Instagram activo con personalidad seleccionada
3. ✅ Variable de entorno `NEXT_PUBLIC_BACKEND_URL` configurada (o usa el default `http://localhost:5001`)

