# 🚀 Guía de Bulk Send Optimizado para Leads

## Descripción

El sistema de bulk send optimizado permite enviar mensajes masivos a todos los leads de una columna específica del Kanban board, con **pre-enlace automático de WhatsApp** y soporte para mensajes manuales y generados por IA.

## ✨ Características Principales

- ✅ **Pre-enlace automático**: Vincula JIDs de WhatsApp automáticamente si el lead tiene teléfono
- ✅ Envío masivo por columna específica
- ✅ Mensajes manuales con templates (`{{name}}`)
- ✅ Mensajes generados por IA con personalidades
- ✅ Throttling optimizado (250ms entre mensajes)
- ✅ Reporte detallado de éxitos/fallos con errores específicos
- ✅ Funciona con leads que tienen solo teléfono (sin WhatsApp previo)

## 🔄 Flujo Optimizado

### Paso 1: Pre-enlace Automático
El endpoint automáticamente:
1. Busca leads en la columna que tienen `phone` pero no `conversation_id`
2. Llama internamente a `/api/whatsapp/ensure_conversations_for_leads`
3. Crea JIDs de WhatsApp para esos leads

### Paso 2: Envío Masivo
1. Obtiene todos los leads de la columna que **YA TIENEN** `conversation_id`
2. Aplica templates con variables (`{{name}}`)
3. Envía mensajes uno por uno con throttling
4. Registra éxitos y fallos detalladamente

## 📡 Endpoint

### POST /api/leads/bulk_send

Envía mensajes a todos los leads de una columna específica con pre-enlace automático.

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
x-user-id: <user-id> (opcional, fallback)
```

**Body:**
```json
{
  "columnId": "uuid-de-la-columna",
  "mode": "manual", // "manual" o "ai"
  "text": "Hola {{name}}! Mensaje personalizado",
  "promptTemplate": "Hola {{name}}, te contacto para ofrecerte...", // Solo si mode=ai
  "personalityId": "uuid-personalidad-ia" // Opcional
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "sent": 5,
  "fail": 1,
  "detail": [
    {
      "to": "5491234567890@s.whatsapp.net",
      "ok": true
    },
    {
      "to": "5491234567891@s.whatsapp.net",
      "ok": false,
      "error": "Rate limit exceeded"
    }
  ]
}
```

**Respuesta de error:**
```json
{
  "success": false,
  "message": "No hay leads con WhatsApp en esta columna"
}
```

## 🚀 Uso desde Frontend

### 🔧 Función de Envío Masivo Optimizada:
```javascript
const bulkSendMessagesOptimized = async (columnId, options) => {
  try {
    const response = await fetch('/api/leads/bulk_send', {
      method: 'POST',
      headers: buildAuthHeaders(session),
      body: JSON.stringify({
        columnId,
        mode: options.mode || 'manual',
        text: options.text,
        promptTemplate: options.promptTemplate,
        personalityId: options.personalityId
      })
    })
    
    const data = await response.json()
    
    if (data.success) {
      console.log(`✅ ${data.sent} mensajes enviados`)
      console.log(`❌ ${data.fail} mensajes fallaron`)
      
      // Mostrar detalles de fallos si los hay
      if (data.detail) {
        data.detail.forEach(item => {
          if (!item.ok) {
            console.warn(`❌ Error enviando a ${item.to}: ${item.error}`)
          }
        })
      }
      
      return data
    } else {
      console.error('❌ Error:', data.message)
      return null
    }
  } catch (error) {
    console.error('❌ Error de conexión:', error)
    return null
  }
}
```

### 🔧 Ejemplos de Uso:

#### 📝 Mensaje Manual:
```javascript
await bulkSendMessagesOptimized('col-uuid-123', {
  mode: 'manual',
  text: 'Hola {{name}}! 👋 Tenemos una oferta especial para ti.'
})
```

#### 🤖 Mensaje con IA:
```javascript
await bulkSendMessagesOptimized('col-uuid-123', {
  mode: 'ai',
  promptTemplate: 'Saluda cordialmente a {{name}} y ofrécele nuestros servicios de consultoría.',
  personalityId: 'professional-sales'
})
```

## 🎨 Componente Frontend Mejorado

### 📱 Modal de Envío Masivo Optimizado:
```jsx
const BulkSendModalOptimized = ({ columnId, columnTitle, onClose, onSuccess }) => {
  const [mode, setMode] = useState('manual')
  const [message, setMessage] = useState('Hola {{name}}! 👋')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const handleSend = async () => {
    setSending(true)
    
    const options = mode === 'manual' 
      ? { mode: 'manual', text: message }
      : { mode: 'ai', promptTemplate: message, personalityId: 'default' }
    
    const data = await bulkSendMessagesOptimized(columnId, options)
    setResult(data)
    setSending(false)
    
    // Callback de éxito para refrescar el board
    if (data?.success && onSuccess) {
      onSuccess(data)
    }
  }

  return (
    <div className="modal">
      <div className="modal-content">
        <h3>📤 Envío Masivo - {columnTitle}</h3>
        <p className="info">
          💡 Se vinculará automáticamente WhatsApp a leads que solo tengan teléfono
        </p>
        
        {/* Selector de modo */}
        <div className="mode-selector">
          <button 
            className={mode === 'manual' ? 'active' : ''}
            onClick={() => setMode('manual')}
          >
            📝 Manual
          </button>
          <button 
            className={mode === 'ai' ? 'active' : ''}
            onClick={() => setMode('ai')}
          >
            🤖 IA
          </button>
        </div>

        {/* Editor de mensaje */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={mode === 'manual' 
            ? 'Escribe tu mensaje aquí. Usa {{name}} para el nombre del lead.'
            : 'Describe cómo quieres que la IA genere el mensaje.'
          }
          rows={4}
        />

        {/* Botones */}
        <div className="actions">
          <button onClick={onClose} disabled={sending}>
            Cancelar
          </button>
          <button onClick={handleSend} disabled={sending}>
            {sending ? '📤 Enviando...' : '📤 Enviar Masivo'}
          </button>
        </div>

        {/* Resultado detallado */}
        {result && (
          <div className="result">
            <div className="summary">
              <p>✅ {result.sent} mensajes enviados</p>
              {result.fail > 0 && <p>❌ {result.fail} mensajes fallaron</p>}
            </div>
            
            {result.detail && result.detail.length > 0 && (
              <details className="details">
                <summary>Ver detalles</summary>
                <ul>
                  {result.detail.map((item, index) => (
                    <li key={index} className={item.ok ? 'success' : 'error'}>
                      {item.ok ? '✅' : '❌'} {item.to}
                      {item.error && <span className="error-msg"> - {item.error}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

## 🔄 Flujo Interno Optimizado del Sistema

### 📊 Proceso de Envío:

#### 1️⃣ Pre-enlace Automático:
```javascript
// Llamada interna automática
await fetch(`${origin}/api/whatsapp/ensure_conversations_for_leads`, {
  method: "POST",
  headers: authHeaders,
})
```

#### 2️⃣ Consulta de Leads Preparados:
```sql
-- Solo leads YA vinculados con WhatsApp
SELECT name, conversation_id
FROM public.leads_contacts
WHERE user_id = $1 AND column_id = $2 AND conversation_id IS NOT NULL
```

#### 3️⃣ Procesamiento y Envío:
```javascript
for (const lead of leads) {
  // Aplicar template
  let messageToSend = mode === "ai" 
    ? promptTemplate.replace(/{{name}}/gi, lead.name || "")
    : text.replace(/{{name}}/gi, lead.name || "")

  // Enviar mensaje
  const res = await fetch(`${origin}/api/whatsapp/send_message`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      conversationId: lead.conversation_id,
      textContent: messageToSend,
      attachments: [],
      senderType: mode === "ai" ? "ia" : "you",
      personalityId: personalityId || undefined,
    }),
  })

  // Registrar resultado
  if (res.ok) {
    sent++
    detail.push({ to: lead.conversation_id, ok: true })
  } else {
    fail++
    const error = await res.text().catch(() => "")
    detail.push({ to: lead.conversation_id, ok: false, error })
  }

  // Throttling
  await new Promise(r => setTimeout(r, 250))
}
```

## 🧪 Testing

### 🔧 Script de Prueba:
```bash
# Ejecutar script de prueba optimizado
node test-bulk-send-optimized.js

# Resultado esperado:
# 📋 Test: Bulk Send Optimizado con Pre-enlace Automático
# ✅ Enviados: 5
# ❌ Fallidos: 0
# 📝 Detalle: 5 envíos exitosos
```

### 🔍 Curl Manual:
```bash
curl -X POST http://localhost:5001/api/leads/bulk_send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "columnId": "col-uuid-123",
    "mode": "manual",
    "text": "Hola {{name}}! Test optimizado 🚀"
  }'
```

## ⚡ Ventajas del Flujo Optimizado

### 🎯 **Funciona en Todos los Casos:**
- ✅ Leads con WhatsApp ya vinculado → Envía directamente
- ✅ Leads solo con teléfono → Pre-enlaza automáticamente y envía
- ✅ Leads sin teléfono ni WhatsApp → Los ignora (no falla)

### 📊 **Reporte Detallado:**
- ✅ Contador de enviados/fallidos
- ✅ Lista detallada de cada envío
- ✅ Errores específicos por lead
- ✅ JID de WhatsApp para cada resultado

### ⚡ **Performance Optimizada:**
- ✅ Pre-enlace automático en una sola llamada
- ✅ Throttling de 250ms (más rápido que antes)
- ✅ Manejo de errores granular
- ✅ No bloquea si algunos leads fallan

## 🎉 ¡Sistema de Envío Masivo Optimizado Completo!

**Con esta versión optimizada tienes:**
- ✅ **Pre-enlace automático** - No necesitas preparar leads manualmente
- ✅ **Funciona con cualquier lead** - Solo teléfono o WhatsApp completo
- ✅ **Reporte detallado** - Sabes exactamente qué pasó con cada envío
- ✅ **Más rápido** - 250ms entre mensajes vs 1000ms anterior
- ✅ **Más robusto** - Maneja errores sin fallar todo el lote
- ✅ **Frontend mejorado** - Modal con información detallada

**¡El sistema ahora es completamente automático y robusto!** 🚀