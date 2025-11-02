# 📤 Frontend: Envío Masivo a Seguidores con IA

## ⚠️ IMPORTANTE: Usar el endpoint correcto

**NO uses `/api/instagram/followers-send-ai` (Next.js) - ese no genera mensajes basados en tu mensaje base.**

**USA DIRECTAMENTE:** `/api/instagram/bulk-send-followers` del backend (puerto 5001)

## 🎯 Cómo usar el endpoint `/api/instagram/bulk-send-followers`

Este endpoint **extrae automáticamente los seguidores** de una cuenta y les envía mensajes **generados con IA** basados en tu mensaje base.

---

## 📝 Código para el Frontend

### **Opción 1: Función Simple (Recomendada)**

```tsx
const [targetUsername, setTargetUsername] = useState('');
const [messageBase, setMessageBase] = useState('');
const [limit, setLimit] = useState(50);
const [sending, setSending] = useState(false);

const handleSendToFollowers = async () => {
  // Validaciones
  if (!targetUsername.trim()) {
    toast.error('Ingresa el username de la cuenta objetivo');
    return;
  }
  
  if (!messageBase.trim()) {
    toast.error('Escribe el mensaje base');
    return;
  }
  
  setSending(true);
  
  try {
    toast.info(`📤 Enviando mensajes a seguidores de @${targetUsername}...`);
    
    // IMPORTANTE: Usar la URL del backend directamente (puerto 5001)
    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
    
    const response = await fetch(`${BACKEND_URL}/api/instagram/bulk-send-followers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Opcional: incluir token si está disponible
        // 'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        target_username: targetUsername.trim(), // Ej: "competitor_account"
        message: messageBase.trim(),            // Ej: "di que hay ofertas"
        limit: limit || 50,                    // Cuántos seguidores extraer
        delay: 2000                            // Delay entre mensajes (ms)
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      toast.success(
        `✅ ${data.sent_count} mensajes enviados (${data.ai_generated_count || 0} con IA), ${data.failed_count} fallidos`
      );
      
      // Mostrar detalles si hay resultados
      if (data.results) {
        console.log('Resultados detallados:', data.results);
      }
    } else {
      toast.error(data.error || 'Error enviando mensajes');
    }
  } catch (error) {
    toast.error('Error: ' + error.message);
  } finally {
    setSending(false);
  }
};
```

---

### **Opción 2: Componente Completo con UI**

```tsx
import { useState } from 'react';
import toast from 'react-hot-toast';

const BulkSendFollowers = () => {
  const [targetUsername, setTargetUsername] = useState('');
  const [messageBase, setMessageBase] = useState('');
  const [limit, setLimit] = useState(50);
  const [delay, setDelay] = useState(2000);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);

  const handleSend = async () => {
    if (!targetUsername.trim() || !messageBase.trim()) {
      toast.error('Completa todos los campos');
      return;
    }

    setSending(true);
    setResults(null);

    // IMPORTANTE: Usar la URL del backend directamente (puerto 5001)
    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/instagram/bulk-send-followers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_username: targetUsername.trim(),
          message: messageBase.trim(),
          limit: parseInt(limit),
          delay: parseInt(delay)
        })
      });

      const data = await response.json();

      if (data.success) {
        setResults(data);
        toast.success(
          `✅ ${data.sent_count} mensajes enviados (${data.ai_generated_count || 0} generados con IA)`
        );
      } else {
        toast.error(data.error || 'Error enviando mensajes');
      }
    } catch (error) {
      toast.error('Error: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bulk-send-container">
      <h2>📤 Enviar Mensajes Masivos a Seguidores (con IA)</h2>
      
      <div className="form-group">
        <label>Cuenta objetivo (sin @):</label>
        <input
          type="text"
          value={targetUsername}
          onChange={(e) => setTargetUsername(e.target.value)}
          placeholder="Ej: competitor_account"
          disabled={sending}
        />
      </div>

      <div className="form-group">
        <label>Mensaje base:</label>
        <textarea
          value={messageBase}
          onChange={(e) => setMessageBase(e.target.value)}
          placeholder="Ej: di que hay ofertas especiales"
          rows={3}
          disabled={sending}
        />
        <small>
          💡 Este mensaje será personalizado con IA para cada seguidor. 
          Cada uno recibirá una variación única.
        </small>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Límite de seguidores:</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            min={1}
            max={500}
            disabled={sending}
          />
        </div>

        <div className="form-group">
          <label>Delay entre mensajes (ms):</label>
          <input
            type="number"
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
            min={1000}
            max={10000}
            disabled={sending}
          />
        </div>
      </div>

      <button 
        onClick={handleSend} 
        disabled={sending || !targetUsername.trim() || !messageBase.trim()}
        className="btn-primary"
      >
        {sending ? '📤 Enviando...' : '📤 Enviar Mensajes con IA'}
      </button>

      {results && (
        <div className="results">
          <h3>📊 Resultados:</h3>
          <p>✅ Enviados: {results.sent_count}</p>
          <p>🤖 Generados con IA: {results.ai_generated_count || 0}</p>
          <p>❌ Fallidos: {results.failed_count}</p>
          {results.personality_name && (
            <p>🎭 Personalidad usada: {results.personality_name}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default BulkSendFollowers;
```

---

## ⚠️ ERROR COMÚN

Si ves en los logs del frontend:
```
📤 Instagram Followers Send AI endpoint llamado
OpenAI API key not configured, using fallback response
```

**Esto significa que estás usando el endpoint equivocado.** El endpoint de Next.js (`/api/instagram/followers-send-ai`) NO usa tu mensaje base.

**SOLUCIÓN:** Cambia para usar directamente:
```
http://localhost:5001/api/instagram/bulk-send-followers
```

---

## 🔑 Parámetros del Endpoint

### **POST `/api/instagram/bulk-send-followers`**

#### **Body (JSON):**

```json
{
  "target_username": "usuario_objetivo",  // ✅ Requerido
  "message": "tu mensaje base aquí",      // ✅ Requerido
  "limit": 50,                            // Opcional (default: 50)
  "delay": 2000                           // Opcional (default: 2000ms)
}
```

**Nota:** No necesitas enviar `userId` ni `personalityId` - el backend los detecta automáticamente del bot activo.

---

## ✅ Respuesta del Backend

```json
{
  "success": true,
  "message": "Envío masivo completado: 50 mensajes enviados (50 generados con IA), 0 fallidos",
  "target_username": "usuario_objetivo",
  "sent_count": 50,
  "ai_generated_count": 50,           // ✅ Cuántos mensajes se generaron con IA
  "failed_count": 0,
  "total_followers": 50,
  "personality_used": 887,             // ID de personalidad usada
  "personality_name": "Roberto",       // Nombre de personalidad
  "results": [
    {
      "username": "user1",
      "full_name": "User One",
      "status": "sent",
      "ai_generated": true,            // ✅ Indica si este mensaje fue generado con IA
      "message_preview": "¡Hola! Te tenemos una sorpresa...",
      "timestamp": "2025-01-28T..."
    }
  ],
  "account_info": {...}
}
```

---

## 🎯 Ejemplo de Uso

```tsx
// El usuario escribe en el frontend:
target_username: "competitor_account"
message: "di que hay ofertas especiales"
limit: 100

// El backend:
// 1. Extrae 100 seguidores de "competitor_account"
// 2. Para cada seguidor, genera un mensaje ÚNICO con IA:
//    - Seguidor 1: "¡Hola! Tenemos promociones increíbles que no te puedes perder 😊"
//    - Seguidor 2: "Oye, ¿sabías que tenemos descuentos especiales ahora mismo?"
//    - Seguidor 3: "¡Buenas noticias! Lanzamos ofertas exclusivas que creo que te van a encantar"
//    ... 100 mensajes diferentes
// 3. Envía cada mensaje con un delay de 2 segundos
```

---

## 🔍 Detección Automática

El backend automáticamente:
- ✅ Busca el bot activo de Instagram
- ✅ Obtiene la personalidad configurada
- ✅ Usa esa personalidad para generar mensajes con IA
- ✅ Crea variaciones únicas del mensaje base

**No necesitas enviar nada más que:**
- `target_username`
- `message` (mensaje base)
- `limit` (opcional)
- `delay` (opcional)

---

## 💡 Recomendaciones

1. **Mensaje base corto y claro**: "di que hay ofertas" es mejor que un texto largo
2. **Delay adecuado**: Usa 2000-3000ms para evitar rate limiting
3. **Límite razonable**: Empieza con 10-20 seguidores para probar
4. **Bot activo**: Asegúrate de tener el bot de Instagram activado con una personalidad seleccionada

---

## ⚠️ Requisitos Previos

Para que funcione la generación con IA, necesitas:

1. ✅ Bot de Instagram activado (desde el frontend)
2. ✅ Personalidad seleccionada (asociada al bot)
3. ✅ Cuenta de Instagram logueada

Si no hay bot activo, el sistema enviará el mensaje base tal cual (sin personalización).

