# 🚀 Guía de Configuración - Rutas Next.js para Leads

## 📁 **Archivos Creados**

### **1. Rutas de API (Next.js App Router)**
- ✅ `app/api/leads/create/route.ts` - Crear nuevos leads
- ✅ `app/api/leads/move/route.ts` - Mover leads entre columnas
- ✅ `lib/db.ts` - Re-export limpio de la configuración de DB

### **2. Scripts de Prueba**
- ✅ `test-nextjs-leads-routes.js` - Pruebas completas de las rutas

---

## 🔧 **Configuración Requerida**

### **1. Variables de Entorno (.env.local en Next.js)**
```env
JWT_SECRET=tu-jwt-secret-aqui
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

### **2. Dependencias de Next.js**
```bash
npm install jsonwebtoken pg @types/jsonwebtoken
# o
yarn add jsonwebtoken pg @types/jsonwebtoken
```

---

## 📱 **Uso desde Frontend**

### **🔨 Crear Lead**
```javascript
// Función para crear un lead
async function createLead(leadData) {
  const response = await fetch('/api/leads/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      name: leadData.name,
      message: leadData.message,
      avatar_url: leadData.avatar_url,
      column_id: 'col1', // o UUID directo
      conversation_id: leadData.conversation_id
    })
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('Lead creado:', result.lead);
    return result.lead;
  } else {
    throw new Error(result.message);
  }
}
```

### **🔄 Mover Lead**
```javascript
// Función para mover un lead
async function moveLead(leadId, targetColumnId) {
  const response = await fetch('/api/leads/move', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      leadId: leadId,
      targetColumnId: targetColumnId // 'col1', 'col2' o UUID
    })
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('Lead movido:', result.lead);
    return result.lead;
  } else {
    throw new Error(result.message);
  }
}
```

---

## 🎯 **Formatos de Columna Soportados**

### **1. Formato "col1", "col2", etc.**
```javascript
// Se resuelve automáticamente al UUID de la columna correspondiente
column_id: 'col1' // → Primera columna del usuario
column_id: 'col2' // → Segunda columna del usuario
column_id: 'col3' // → Tercera columna del usuario
```

### **2. UUID Directo**
```javascript
// UUID directo de la columna
column_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
```

---

## 🔍 **Resolución de Problemas**

### **❌ Error: "Columna inválida"**
**Causa:** El formato de columna no se pudo resolver
**Solución:**
1. Verificar que el usuario tenga columnas creadas
2. Usar UUID directo en lugar de "col1", "col2"
3. Revisar logs del servidor

### **❌ Error: "Lead no encontrado o sin permiso"**
**Causa:** Problemas de seguridad (RLS) o lead no existe
**Solución:**
```sql
-- Verificar políticas RLS
SELECT * FROM pg_policies WHERE tablename = 'leads_contacts';

-- Si es necesario, desactivar RLS temporalmente
ALTER TABLE public.leads_contacts DISABLE ROW LEVEL SECURITY;
```

### **❌ Error: "Cannot resolve module 'lib/db'"**
**Causa:** Problemas con el import del módulo de DB
**Solución:**
```typescript
// Cambiar en route.ts:
import pool from '../../../../dist/config/db.js'
// En lugar de:
import pool from '../../../../lib/db'
```

### **❌ Error: "JWT verification failed"**
**Causa:** Token JWT inválido o expirado
**Solución:**
1. Verificar que `JWT_SECRET` sea correcto en ambos proyectos
2. Generar nuevo token si es necesario
3. Verificar formato del header: `Bearer <token>`

---

## 🧪 **Pruebas**

### **1. Probar Rutas Next.js**
```bash
# Ejecutar script de prueba
node test-nextjs-leads-routes.js
```

### **2. Logs Esperados**
```bash
🚀 Next.js API: Creando nuevo lead...
📝 Datos del lead: { name: 'Juan Pérez', column_id: 'col1' }
🎯 Columna resuelta: col1 → f47ac10b-58cc-4372-a567-0e02b2c3d479
✅ Lead creado exitosamente: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### **3. Verificar en Base de Datos**
```sql
-- Verificar leads creados
SELECT id, name, column_id, conversation_id, created_at 
FROM public.leads_contacts 
WHERE user_id = 'tu-user-id'
ORDER BY created_at DESC
LIMIT 5;
```

---

## 🔐 **Seguridad**

### **✅ Características de Seguridad Implementadas**
- 🔒 **Autenticación JWT** obligatoria
- 🛡️ **Filtrado por user_id** en todas las operaciones
- 🔍 **Validación de datos** de entrada
- 📝 **Logs detallados** para auditoría
- ⚡ **Manejo robusto de errores**

### **🚨 Políticas RLS Requeridas**
```sql
-- Asegurar que las políticas RLS estén activas
ALTER TABLE public.leads_contacts ENABLE ROW LEVEL SECURITY;

-- Política para SELECT
CREATE POLICY leads_contacts_select ON public.leads_contacts 
FOR SELECT USING (auth.uid() = user_id);

-- Política para INSERT
CREATE POLICY leads_contacts_insert ON public.leads_contacts 
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Política para UPDATE
CREATE POLICY leads_contacts_update ON public.leads_contacts 
FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## 📊 **Respuestas de API**

### **✅ Respuesta Exitosa (Crear)**
```json
{
  "success": true,
  "lead": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Juan Pérez",
    "message": "Nuevo contacto",
    "avatar_url": null,
    "column_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "conversation_id": "34612345678@s.whatsapp.net",
    "created_at": "2025-01-22T10:30:00.000Z"
  }
}
```

### **✅ Respuesta Exitosa (Mover)**
```json
{
  "success": true,
  "lead": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Juan Pérez",
    "column_id": "b2c3d4e5-f6g7-8901-bcde-f23456789012",
    "conversation_id": "34612345678@s.whatsapp.net",
    "updated_at": "2025-01-22T10:35:00.000Z"
  }
}
```

### **❌ Respuesta de Error**
```json
{
  "success": false,
  "message": "Lead no encontrado o sin permiso"
}
```

---

## 🚀 **Próximos Pasos**

1. **Implementar en tu store de Zustand/Redux:**
   ```javascript
   // Ejemplo con optimistic updates
   const createLead = async (leadData) => {
     // 1. Update optimístico
     const tempId = `temp-${Date.now()}`;
     addLeadOptimistic(tempId, leadData);
     
     try {
       // 2. Llamada real a la API
       const realLead = await createLead(leadData);
       
       // 3. Reemplazar lead temporal con real
       replaceLeadOptimistic(tempId, realLead);
     } catch (error) {
       // 4. Revertir en caso de error
       removeLeadOptimistic(tempId);
       throw error;
     }
   };
   ```

2. **Integrar con tu sistema de drag & drop**
3. **Añadir más endpoints si necesitas (delete, update, etc.)**
4. **Configurar middleware de rate limiting si es necesario**

---

✅ **¡Las rutas Next.js están listas para usar!** 🎉
