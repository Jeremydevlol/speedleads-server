# 🏆 **Sistema de Planes Escalable - Implementación Completa**

## 🎯 **¡Sistema 100% Preparado para Pagos!**

He implementado un **sistema completo y escalable de planes** que funciona desde el primer día y está listo para activar pagos cuando quieras.

## 📊 **Planes Configurados:**

| **Plan** | **Precio/mes** | **Resolución** | **Tamaño máx** | **Videos/Web** | **Webs máx** |
|----------|----------------|----------------|----------------|----------------|--------------|
| 🆓 **Free** | $0 | 480p (SD) | 100MB | 1 | 2 |
| 🥉 **Basic** | $9.99 | 720p (HD) | 500MB | 3 | 5 |
| 🥈 **Premium** | $19.99 | 1080p (Full HD) | 1GB | 10 | 15 |
| 🥇 **Pro** | $49.99 | 4K (2160p) | 5GB | ∞ | ∞ |

## 🛠️ **Lo que ya está implementado:**

### **1. 🗄️ Base de Datos Completa:**
```sql
-- Tabla de configuración de planes
CREATE TABLE public.plan_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_width INTEGER NOT NULL,
  max_height INTEGER NOT NULL,
  max_bitrate BIGINT NOT NULL,
  max_file_size_mb INTEGER NOT NULL,
  max_videos_per_website INTEGER DEFAULT NULL,
  max_websites INTEGER DEFAULT NULL,
  features JSONB DEFAULT '[]',
  price_monthly DECIMAL(10,2) DEFAULT 0,
  price_yearly DECIMAL(10,2) DEFAULT 0
);

-- Tabla de suscripciones de usuarios
CREATE TABLE public.user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  plan_id TEXT NOT NULL REFERENCES public.plan_configs(id),
  status TEXT DEFAULT 'active',
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT
);
```

### **2. 📡 Endpoints del Backend:**

#### **GET `/api/user/plan`** - Plan actual del usuario
```javascript
const response = await fetch('/api/user/plan', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Respuesta:
{
  "plan": "premium",
  "planName": "Premium",
  "status": "active",
  "limits": {
    "maxWidth": 1920,
    "maxHeight": 1080,
    "maxBitrate": 5001000,
    "maxFileSizeMB": 1024,
    "maxVideosPerWebsite": 10,
    "maxWebsites": 15
  },
  "features": ["1080p Full HD video quality", "15 websites max", ...]
}
```

#### **GET `/api/user/plans`** - Todos los planes disponibles
```javascript
const plans = await fetch('/api/user/plans').then(r => r.json());

// Respuesta:
{
  "plans": [
    {
      "id": "free",
      "name": "Free",
      "priceMonthly": 0,
      "quality": "SD",
      "limits": { ... },
      "features": [...]
    },
    // ... más planes
  ]
}
```

#### **POST `/api/user/check-upload-limits`** - Validar antes de subir
```javascript
const check = await fetch('/api/user/check-upload-limits', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fileSizeBytes: videoFile.size,
    websiteId: 'uuid-website'
  })
});

// Si NO puede subir (plan insuficiente):
{
  "canUpload": false,
  "reason": "File size exceeds plan limit",
  "currentPlan": "free",
  "suggestedPlan": "basic",
  "upgrade": true
}
```

#### **GET `/api/user/usage`** - Estadísticas de uso
```javascript
const usage = await fetch('/api/user/usage', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

// Respuesta:
{
  "usage": {
    "websites": 3,
    "totalVideos": 7,
    "storageUsedMB": 250
  },
  "breakdown": {
    "websiteVideoStats": [...]
  }
}
```

### **3. 🎬 Upload Inteligente por Plan:**

El endpoint `POST /api/websites/upload-video` ahora:

✅ **Verifica el tamaño** según el plan del usuario  
✅ **Comprime solo si es necesario** (mantiene calidad máxima posible)  
✅ **Aplica límites dinámicos** de resolución y bitrate  
✅ **Etiqueta archivos** con el plan usado  
✅ **Proporciona feedback** detallado del procesamiento  

```javascript
// Respuesta del upload:
{
  "success": true,
  "videoUrl": "https://storage.url/video.mp4",
  "compressed": true,
  "compressionRatio": "68.5%",
  "quality": "Full HD",
  "plan": "premium",
  "resolution": "1920x1080"
}
```

### **4. 🔧 Funciones de Base de Datos:**

#### **`get_user_plan(user_uuid)`** - Obtener plan actual
```sql
SELECT * FROM get_user_plan('user-uuid-here');
-- Retorna plan completo con límites y features
```

#### **`can_user_upload_video(user_uuid, file_size, website_id)`** - Validar upload
```sql
SELECT * FROM can_user_upload_video(
  'user-uuid', 
  104857600, -- 100MB en bytes
  'website-uuid'
);
-- Retorna: can_upload, reason, current_plan, suggested_plan
```

## 🚀 **Cómo Activar Pagos (Cuando Quieras):**

### **1. 📱 En el Frontend:**
```javascript
// Cambiar esta línea en tu componente:
const userPlan = 'premium'; // Hardcoded por ahora

// Por esta (cuando implementes pagos):
const { data: userPlanData } = await fetch('/api/user/plan');
const userPlan = userPlanData.plan;
```

### **2. 💳 Integrar Stripe:**
```javascript
// En userController.js, agregar:
export async function upgradePlan(req, res) {
  const { planId } = req.body;
  const userId = req.user.userId || req.user.sub || req.user.id;
  
  // Crear Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    customer_email: req.user.email,
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `Plan ${planId}` },
        unit_amount: getPlanPrice(planId) * 100,
      },
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: `${process.env.FRONTEND_URL}/billing/success`,
    cancel_url: `${process.env.FRONTEND_URL}/billing/cancel`,
    metadata: { userId, planId }
  });
  
  res.json({ sessionId: session.id });
}
```

### **3. 🔄 Webhook de Stripe:**
```javascript
// En webhooksRoutes.js:
app.post('/webhooks/stripe', async (req, res) => {
  const event = req.body;
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, planId } = session.metadata;
    
    // Actualizar plan del usuario
    await supabaseAdmin
      .from('user_plans')
      .upsert({
        user_id: userId,
        plan_id: planId,
        status: 'active',
        stripe_subscription_id: session.subscription,
        stripe_customer_id: session.customer
      });
  }
  
  res.json({ received: true });
});
```

## 🎯 **Estado Actual vs Futuro:**

### **🟢 YA FUNCIONA (Sin pagos):**
- ✅ Todos los usuarios tienen plan "premium" temporalmente
- ✅ Sistema de límites completamente funcional
- ✅ Compresión dinámica por plan
- ✅ Validaciones automáticas
- ✅ UI informativa de planes
- ✅ Estadísticas de uso

### **🔵 PARA ACTIVAR PAGOS:**
1. **Conectar Stripe** (5 minutos)
2. **Activar webhook** de pagos (10 minutos)
3. **Cambiar plan por defecto** de "premium" a "free"
4. **Probar flujo completo** (15 minutos)

## 📈 **Funcionalidades Avanzadas Incluidas:**

### **🔍 Validación Inteligente:**
- **Pre-upload**: Verifica límites antes de procesar
- **Sugerencias**: Recomienda plan apropiado automáticamente
- **Contador de uso**: Rastrea videos por web y total

### **🎬 Compresión Dinámica:**
- **Solo cuando necesario**: No toca videos que ya cumplen límites
- **Calidad máxima**: Usa la mejor calidad permitida por el plan
- **Aspect ratio**: Mantiene proporciones originales
- **Progressive download**: Optimizado para web

### **📊 Monitoreo y Estadísticas:**
- **Uso detallado**: Por usuario y por website
- **Almacenamiento**: Tracking en tiempo real
- **Límites**: Comparación con plan actual

## 🔧 **Configuración de Desarrollo:**

Para probar diferentes planes en desarrollo:

```sql
-- Cambiar plan de un usuario específico
INSERT INTO public.user_plans (user_id, plan_id, status)
VALUES ('user-uuid-here', 'free', 'active')
ON CONFLICT (user_id) DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  status = EXCLUDED.status;

-- Ver todos los usuarios y sus planes
SELECT 
  up.user_id,
  up.plan_id,
  pc.name as plan_name,
  pc.max_file_size_mb,
  pc.max_height
FROM user_plans up
JOIN plan_configs pc ON up.plan_id = pc.id;
```

## 💰 **Proyección de Ingresos:**

Con los precios configurados:

| **Plan** | **Precio/mes** | **Target %** | **Proyección mensual** |
|----------|----------------|--------------|------------------------|
| Free | $0 | 60% | $0 |
| Basic | $9.99 | 25% | $2,497.50 (250 usuarios) |
| Premium | $19.99 | 12% | $2,398.80 (120 usuarios) |
| Pro | $49.99 | 3% | $1,499.70 (30 usuarios) |
| **TOTAL** | - | **100%** | **$6,396/mes** |

*Basado en 1,000 usuarios activos*

## 🎊 **¡El Sistema Está Listo!**

**Todo lo que necesitas para activar pagos:**

1. ✅ **Base de datos** configurada con planes
2. ✅ **Backend** con validaciones dinámicas  
3. ✅ **Compresión** inteligente por plan
4. ✅ **Endpoints** completos de gestión
5. ✅ **Funciones SQL** optimizadas
6. ✅ **Documentación** completa

**Cuando quieras activar pagos:**
- 🔌 Conectar Stripe (30 minutos)
- 🎨 Actualizar UI de billing (1 hora)  
- 🧪 Probar flujo completo (30 minutos)

**¡Tu sistema escalable está funcionando desde HOY! 🚀** 