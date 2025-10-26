# 📱 **Guía de Sincronización de Contactos WhatsApp como Leads**

## 🎯 **¿Qué hace esta funcionalidad?**

Convierte **todos los contactos de WhatsApp existentes** en leads del sistema Kanban, permitiendo gestionarlos como cualquier otro lead.

---

## 🔧 **Rutas Implementadas**

### **📁 Next.js (Puerto 3000):**
- ✅ `POST /api/leads/sync_whatsapp_leads` - Sincronizar contactos WhatsApp

### **📁 Backend Express (Puerto 5001):**
- ✅ `POST /api/leads/sync_whatsapp_leads` - Sincronizar contactos WhatsApp

---

## 🚀 **Uso desde Frontend**

### **🔧 Función de Sincronización:**
```javascript
const syncWhatsAppContacts = async () => {
  try {
    const response = await fetch('/api/leads/sync_whatsapp_leads', {
      method: 'POST',
      headers: buildAuthHeaders(session)
    })
    
    const data = await response.json()
    
    if (data.success) {
      console.log(`✅ ${data.created} contactos convertidos a leads`)
      console.log(`⏭️ ${data.skipped} contactos ya existían`)
      
      // Refrescar el board de leads
      refreshLeadsBoard()
    } else {
      console.error('❌ Error:', data.message)
    }
  } catch (error) {
    console.error('❌ Error de conexión:', error)
  }
}
```

### **🔧 Botón de Sincronización:**
```jsx
<button 
  onClick={syncWhatsAppContacts}
  className="bg-blue-500 text-white px-4 py-2 rounded"
>
  📱 Sincronizar Contactos WhatsApp
</button>
```

---

## 🔍 **¿Qué hace exactamente?**

### **📊 Proceso de Sincronización:**

#### **1️⃣ Busca Conversaciones:**
```sql
SELECT external_id, contact_name, contact_photo_url
FROM public.conversations_new
WHERE user_id = $1
  AND external_id IS NOT NULL
  AND external_id NOT LIKE '%@g.us'  -- Excluye grupos
```

#### **2️⃣ Crea Leads:**
```sql
INSERT INTO public.leads_contacts
(user_id, name, message, avatar_url, column_id, conversation_id, phone, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
```

#### **3️⃣ Asigna a Primera Columna:**
- Si no existe columna, crea "Initial Prospect"
- Asigna todos los leads a la primera columna

---

## 📊 **Datos que se Sincronizan**

### **✅ Información Preservada:**
- **Nombre del contacto** (`contact_name` → `name`)
- **Avatar/Photo** (`contact_photo_url` → `avatar_url`)
- **JID de WhatsApp** (`external_id` → `conversation_id`)
- **Usuario** (`user_id`)

### **📝 Información Añadida:**
- **Mensaje por defecto:** "Contacto de WhatsApp"
- **Columna:** Primera columna disponible
- **Phone:** `null` (ya tenemos el JID)

---

## 🧪 **Testing con Curl**

### **🔧 Comando de Prueba:**
```bash
# Generar token JWT válido
TOKEN=$(node -e "
import jwt from 'jsonwebtoken';
const token = jwt.sign({userId: '8ab8810d-6344-4de7-9965-38233f32671a'}, 'X8Iu+SdwFlMkfPT+Y/uQ4NN221SfrT3QfKbXTNV0PSuU3WCP5L+OpNnW0B76MJgV1EbLKDXc3NOIJqDAZIB+1g==');
console.log(token);
")

# Sincronizar contactos
curl -X POST http://localhost:5001/api/leads/sync_whatsapp_leads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN"
```

### **📊 Respuesta Esperada:**
```json
{
  "success": true,
  "created": 15,
  "skipped": 3
}
```

---

## 🔄 **Flujo Completo de Uso**

### **📱 1. Usuario tiene WhatsApp conectado:**
- ✅ Conversaciones existentes en `conversations_new`
- ✅ Contactos con `external_id` (JID)

### **🔄 2. Usuario hace clic en "Sincronizar":**
- ✅ Sistema busca todas las conversaciones
- ✅ Crea leads para contactos que no existen
- ✅ Omite contactos que ya son leads

### **📊 3. Resultado:**
- ✅ Todos los contactos WhatsApp son leads
- ✅ Asignados a la primera columna
- ✅ Listos para gestión en Kanban

---

## 🎯 **Casos de Uso**

### **🆕 Usuario Nuevo:**
```javascript
// Primera vez usando leads
await syncWhatsAppContacts()
// → Convierte todos sus contactos WhatsApp en leads
```

### **🔄 Usuario Existente:**
```javascript
// Ya tiene algunos leads, quiere sincronizar más
await syncWhatsAppContacts()
// → Solo añade contactos que no están como leads
```

### **📱 Después de Conectar WhatsApp:**
```javascript
// Usuario conecta WhatsApp por primera vez
// → Tiene conversaciones nuevas
await syncWhatsAppContacts()
// → Convierte las nuevas conversaciones en leads
```

---

## ⚠️ **Consideraciones Importantes**

### **🔄 Idempotencia:**
- ✅ **Seguro ejecutar múltiples veces**
- ✅ **No crea duplicados** (verifica por `conversation_id`)
- ✅ **Solo añade contactos nuevos**

### **👥 Excluye Grupos:**
- ✅ **Solo contactos individuales** (`@s.whatsapp.net`)
- ❌ **No incluye grupos** (`@g.us`)

### **📱 Requiere WhatsApp Conectado:**
- ✅ **Necesita conversaciones existentes**
- ✅ **No funciona sin WhatsApp activo**

---

## 🔧 **Personalización**

### **📊 Cambiar Columna de Destino:**
```javascript
// En lugar de primera columna, usar columna específica
const targetColumnId = '123' // ID de columna específica

// Modificar la función para usar targetColumnId
```

### **📝 Cambiar Mensaje por Defecto:**
```javascript
// Cambiar "Contacto de WhatsApp" por otro mensaje
const defaultMessage = 'Lead importado desde WhatsApp'
```

---

## 🚀 **Próximos Pasos**

### **✅ Después de Sincronizar:**
1. **Ver leads en el board** Kanban
2. **Mover leads** entre columnas
3. **Enviar mensajes masivos** por columna
4. **Gestionar pipeline** de ventas

### **🔄 Automatización:**
```javascript
// Sincronizar automáticamente al conectar WhatsApp
useEffect(() => {
  if (whatsappConnected) {
    syncWhatsAppContacts()
  }
}, [whatsappConnected])
```

---

## 🎉 **¡Sistema Completo de Leads!**

**Con esta funcionalidad tienes:**
- ✅ **Importar contactos** desde archivos (CSV, XLSX, PDF)
- ✅ **Sincronizar contactos** WhatsApp existentes
- ✅ **Crear leads** automáticamente de mensajes nuevos
- ✅ **Gestionar pipeline** completo en Kanban
- ✅ **Envío masivo** por columna
- ✅ **Persistencia robusta** (IDs reales)

**¡El sistema de leads está 100% completo y funcional!** 🚀
