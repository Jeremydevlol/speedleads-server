# 📚 **Website Endpoints Documentation**

Este documento describe todos los endpoints disponibles para el sistema de gestión de websites.

## 🔐 **Autenticación**

Todos los endpoints (excepto los públicos) requieren autenticación mediante JWT token:
```
Authorization: Bearer <token>
```

## 📋 **Endpoints Disponibles**

### **1. GET /api/websites** - Listar webs del usuario

**Descripción:** Obtiene todas las webs del usuario autenticado ordenadas por fecha de creación (más recientes primero).

**Autenticación:** ✅ Requerida

**Respuesta exitosa (200):**
```json
{
  "websites": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "business_name": "Mi Negocio",
      "business_description": "Descripción del negocio",
      "slug": "mi-negocio",
      "sections": [],
      "social_media": {},
      "main_video": {},
      "theme_colors": {},
      "is_published": false,
      "created_at": "2025-01-20T10:00:00Z",
      "updated_at": "2025-01-20T10:00:00Z"
    }
  ]
}
```

**Errores:**
- `500`: Error interno del servidor

---

### **2. GET /api/websites/:id** - Obtener web específica

**Descripción:** Obtiene una web específica del usuario para edición.

**Autenticación:** ✅ Requerida

**Parámetros URL:**
- `id` (string): UUID de la web

**Respuesta exitosa (200):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "business_name": "Mi Negocio",
  "business_description": "Descripción del negocio",
  "slug": "mi-negocio",
  "sections": [],
  "social_media": {},
  "main_video": {},
  "theme_colors": {},
  "is_published": false,
  "created_at": "2025-01-20T10:00:00Z",
  "updated_at": "2025-01-20T10:00:00Z"
}
```

**Errores:**
- `404`: Web no encontrada
- `500`: Error interno del servidor

---

### **3. POST /api/websites** - Crear nueva web

**Descripción:** Crea una nueva web para el usuario autenticado.

**Autenticación:** ✅ Requerida

**Body (JSON):**
```json
{
  "businessName": "Mi Negocio",
  "businessDescription": "Descripción del negocio",
  "slug": "mi-negocio",
  "sections": [],
  "socialMedia": {},
  "mainVideo": {},
  "themeColors": {}
}
```

**Campos requeridos:**
- `businessName`: Nombre del negocio
- `businessDescription`: Descripción del negocio

**Validaciones:**
- El slug debe contener solo letras minúsculas, números y guiones: `/^[a-z0-9-]+$/`
- El slug debe ser único para el usuario

**Respuesta exitosa (201):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "business_name": "Mi Negocio",
  "business_description": "Descripción del negocio",
  "slug": "mi-negocio",
  "sections": [],
  "social_media": {},
  "main_video": {},
  "theme_colors": {},
  "is_published": false,
  "created_at": "2025-01-20T10:00:00Z",
  "updated_at": "2025-01-20T10:00:00Z"
}
```

**Errores:**
- `400`: 
  - Nombre y descripción son requeridos
  - `INVALID_SLUG_FORMAT`: El slug contiene caracteres no válidos
- `409`: 
  - `SLUG_ALREADY_EXISTS`: Ya tienes una web con ese nombre (incluye suggestion)
- `500`: Error interno del servidor

---

### **4. PUT /api/websites/:id** - Actualizar web existente

**Descripción:** Actualiza una web existente del usuario.

**Autenticación:** ✅ Requerida

**Parámetros URL:**
- `id` (string): UUID de la web

**Body (JSON):**
```json
{
  "businessName": "Mi Negocio Actualizado",
  "businessDescription": "Nueva descripción",
  "slug": "mi-negocio-nuevo",
  "sections": [...],
  "socialMedia": {...},
  "mainVideo": {...},
  "themeColors": {...}
}
```

**Validaciones:**
- El slug debe contener solo letras minúsculas, números y guiones
- El slug debe ser único para el usuario (excluyendo la web actual)

**Respuesta exitosa (200):**
```json
{
  "message": "Web actualizada correctamente"
}
```

**Errores:**
- `400`: `INVALID_SLUG_FORMAT`: El slug contiene caracteres no válidos
- `404`: Web no encontrada
- `409`: `SLUG_ALREADY_EXISTS`: Ya tienes otra web con ese nombre
- `500`: Error interno del servidor

---

### **5. DELETE /api/websites/:id** - Eliminar web

**Descripción:** Elimina una web del usuario y limpia automáticamente todos los videos asociados.

**Autenticación:** ✅ Requerida

**Parámetros URL:**
- `id` (string): UUID de la web

**Respuesta exitosa (200):**
```json
{
  "message": "Web y videos eliminados correctamente"
}
```

**Errores:**
- `500`: Error interno del servidor

---

### **6. GET /api/websites/check-slug/:slug** - Verificar disponibilidad de slug

**Descripción:** Verifica si un slug está disponible para el usuario.

**Autenticación:** ✅ Requerida

**Parámetros URL:**
- `slug` (string): Slug a verificar

**Respuesta exitosa (200):**
```json
{
  "available": true,
  "suggestions": []
}
```

**O si no está disponible:**
```json
{
  "available": false,
  "suggestions": [
    "mi-slug-1642674000000",
    "mi-slug-abc123"
  ]
}
```

**Errores:**
- `500`: Error interno del servidor

---

## 🎬 **Endpoints de Videos**

### **7. POST /api/websites/upload-video** - Subir y comprimir video

**Descripción:** Sube un video, verifica límites del plan del usuario, comprime automáticamente si es necesario usando FFmpeg y lo almacena en Supabase Storage.

**Autenticación:** ✅ Requerida

**Content-Type:** `multipart/form-data`

**Body (FormData):**
- `video` (File): Archivo de video

**Límites por plan:**
- **Free**: 100MB, 480p (SD)
- **Basic**: 500MB, 720p (HD)
- **Premium**: 1GB, 1080p (Full HD)
- **Pro**: 5GB, 4K (2160p)

**Formatos soportados:**
- `video/mp4`
- `video/webm`
- `video/quicktime`
- `video/avi`
- `video/mov`

**Compresión inteligente:**
- Solo comprime si excede límites del plan
- Mantiene máxima calidad posible
- Preserva aspect ratio original
- Progressive download habilitado

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "videoUrl": "https://proyecto.supabase.co/storage/v1/object/public/web-creator-videos/userId/video.mp4",
  "fileName": "userId/abc123_premium.mp4",
  "originalSize": 104857600,
  "finalSize": 26214400,
  "compressed": true,
  "compressionRatio": "75.0%",
  "quality": "Full HD",
  "plan": "premium",
  "resolution": "1920x1080"
}
```

**Errores:**
- `400`: No se ha proporcionado un archivo de video
- `413`: Archivo demasiado grande para tu plan (incluye upgrade info)
- `415`: Tipo de archivo no permitido
- `500`: Error procesando el video

---

### **8. GET /api/websites/storage/stats** - Estadísticas de almacenamiento

**Descripción:** Obtiene estadísticas de uso de almacenamiento de videos del usuario.

**Autenticación:** ✅ Requerida

**Respuesta exitosa (200):**
```json
{
  "totalFiles": 5,
  "totalSize": 262144000,
  "totalSizeMB": 250,
  "maxSizeMB": 500,
  "files": [
    {
      "name": "video1_premium.mp4",
      "size": 52428800,
      "sizeMB": 50,
      "created_at": "2025-01-20T10:00:00Z"
    }
  ]
}
```

**Errores:**
- `500`: Error interno del servidor

---

## 👤 **Endpoints de Usuario y Planes**

### **9. GET /api/user/plan** - Plan actual del usuario

**Descripción:** Obtiene el plan actual del usuario con todos los límites y características.

**Autenticación:** ✅ Requerida

**Respuesta exitosa (200):**
```json
{
  "plan": "premium",
  "planName": "Premium",
  "status": "active",
  "expiresAt": null,
  "limits": {
    "maxWidth": 1920,
    "maxHeight": 1080,
    "maxBitrate": 5001000,
    "maxFileSizeMB": 1024,
    "maxVideosPerWebsite": 10,
    "maxWebsites": 15
  },
  "features": [
    "1080p Full HD video quality",
    "15 websites max",
    "10 videos per website",
    "Priority support",
    "Custom domains"
  ]
}
```

**Errores:**
- `500`: Error interno del servidor

---

### **10. GET /api/user/plans** - Todos los planes disponibles

**Descripción:** Obtiene todos los planes disponibles con precios y características.

**Autenticación:** ❌ No requerida

**Respuesta exitosa (200):**
```json
{
  "plans": [
    {
      "id": "free",
      "name": "Free",
      "priceMonthly": 0,
      "priceYearly": 0,
      "quality": "SD",
      "limits": {
        "maxWidth": 854,
        "maxHeight": 480,
        "maxBitrate": 1000000,
        "maxFileSizeMB": 100,
        "maxVideosPerWebsite": 1,
        "maxWebsites": 2
      },
      "features": [
        "480p video quality",
        "2 websites max",
        "1 video per website",
        "Basic support"
      ]
    }
  ]
}
```

**Errores:**
- `500`: Error interno del servidor

---

### **11. POST /api/user/check-upload-limits** - Verificar límites antes de subir

**Descripción:** Verifica si el usuario puede subir un video basado en su plan actual y uso.

**Autenticación:** ✅ Requerida

**Body (JSON):**
```json
{
  "fileSizeBytes": 104857600,
  "websiteId": "uuid-opcional"
}
```

**Respuesta exitosa (200) - Puede subir:**
```json
{
  "canUpload": true,
  "reason": "Upload allowed",
  "currentPlan": "premium"
}
```

**Respuesta de error (403) - No puede subir:**
```json
{
  "canUpload": false,
  "reason": "File size exceeds plan limit",
  "currentPlan": "free",
  "suggestedPlan": "basic",
  "upgrade": true
}
```

**Errores:**
- `400`: fileSizeBytes es requerido
- `500`: Error interno del servidor

---

### **12. GET /api/user/usage** - Estadísticas de uso del usuario

**Descripción:** Obtiene estadísticas detalladas del uso actual del usuario.

**Autenticación:** ✅ Requerida

**Respuesta exitosa (200):**
```json
{
  "usage": {
    "websites": 3,
    "totalVideos": 7,
    "storageUsedMB": 250,
    "storageUsedBytes": 262144000
  },
  "breakdown": {
    "websiteVideoStats": [
      {
        "websiteId": "uuid-1",
        "videoCount": 2
      },
      {
        "websiteId": "uuid-2",
        "videoCount": 5
      }
    ]
  }
}
```

**Errores:**
- `500`: Error interno del servidor

---

### **13. POST /api/websites/:id/publish** - Publicar web

**Descripción:** Publica una web del usuario.

**Autenticación:** ✅ Requerida

**Parámetros URL:**
- `id` (string): UUID de la web

**Respuesta exitosa (200):**
```json
{
  "message": "Web publicada correctamente"
}
```

**Errores:**
- `500`: Error interno del servidor

---

### **14. POST /api/websites/:id/unpublish** - Despublicar web

**Descripción:** Despublica una web del usuario.

**Autenticación:** ✅ Requerida

**Parámetros URL:**
- `id` (string): UUID de la web

**Respuesta exitosa (200):**
```json
{
  "message": "Web despublicada correctamente"
}
```

**Errores:**
- `500`: Error interno del servidor

---

### **15. GET /api/websites/public/:username/:slug** - Obtener web pública

**Descripción:** Obtiene una web pública por username y slug (sin autenticación).

**Autenticación:** ❌ No requerida

**Parámetros URL:**
- `username` (string): Username del propietario
- `slug` (string): Slug de la web

**Respuesta exitosa (200):**
```json
{
  "businessName": "Mi Negocio",
  "businessDescription": "Descripción del negocio",
  "themeColors": {},
  "socialMedia": {},
  "mainVideo": {},
  "sections": [],
  "isPublished": true
}
```

**Errores:**
- `404`: Web no encontrada

---

## 🌍 **Endpoints de Traducción**

### **16. POST /api/websites/:id/translate** - Traducir web existente

**Descripción:** Traduce una web existente a otro idioma.

**Autenticación:** ✅ Requerida

**Body (JSON):**
```json
{
  "targetLanguage": "en",
  "sourceLanguage": "es",
  "createNew": false
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "action": "updated_existing",
  "websiteId": "uuid",
  "targetLanguage": "en",
  "sourceLanguage": "es",
  "updated_at": "2025-01-20T10:00:00Z",
  "translatedWebsite": {...}
}
```

---

### **17. POST /api/websites/translate-all** - Traducir todas las webs

**Descripción:** Traduce todas las webs del usuario a otro idioma.

**Autenticación:** ✅ Requerida

**Body (JSON):**
```json
{
  "targetLanguage": "en",
  "sourceLanguage": "es",
  "createNew": true
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "message": "Traducción masiva completada a en",
  "results": {
    "total": 3,
    "successful": [...],
    "failed": [],
    "targetLanguage": "en",
    "sourceLanguage": "es"
  }
}
```

---

## 🗄️ **Schema de Base de Datos**

```sql
-- Websites table
CREATE TABLE public.websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_description TEXT NOT NULL,
  slug TEXT,
  sections JSONB DEFAULT '[]',
  social_media JSONB DEFAULT '{}',
  main_video JSONB DEFAULT '{}',
  theme_colors JSONB DEFAULT '{}',
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- Plan configurations
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

-- User subscriptions
CREATE TABLE public.user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plan_configs(id),
  status TEXT DEFAULT 'active',
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  UNIQUE(user_id)
);

-- Storage bucket for videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'web-creator-videos', 
  'web-creator-videos', 
  true,
  524288000, -- 500MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/avi', 'video/mov']
);
```

## 🏆 **Sistema de Planes**

| **Plan** | **Precio/mes** | **Resolución** | **Tamaño máx** | **Videos/Web** | **Webs máx** |
|----------|----------------|----------------|----------------|----------------|--------------|
| 🆓 **Free** | $0 | 480p (SD) | 100MB | 1 | 2 |
| 🥉 **Basic** | $9.99 | 720p (HD) | 500MB | 3 | 5 |
| 🥈 **Premium** | $19.99 | 1080p (Full HD) | 1GB | 10 | 15 |
| 🥇 **Pro** | $49.99 | 4K (2160p) | 5GB | ∞ | ∞ |

## 🔒 **Seguridad**

- **RLS (Row Level Security):** Habilitado en websites, storage y user_plans
- **Políticas:** Los usuarios solo pueden ver/modificar sus propias webs, videos y planes
- **Validación de slugs:** Formato estricto `/^[a-z0-9-]+$/`
- **Unicidad:** Los slugs son únicos por usuario
- **Videos:** Solo usuarios pueden subir a sus carpetas, pero son públicamente accesibles
- **Planes:** Validación automática de límites en tiempo real

## 🎬 **Sistema de Videos Inteligente**

### **Características:**
- **Compresión dinámica:** Solo comprime si excede límites del plan
- **Calidad máxima:** Mantiene la mejor calidad posible dentro del plan
- **Límites por plan:** Tamaño, resolución y bitrate específicos
- **Almacenamiento:** Supabase Storage con limpieza automática
- **Progressive download:** Videos empiezan a reproducir mientras descargan
- **Validación previa:** Verifica límites antes de procesar

### **Optimizaciones:**
- Reducción promedio del 60-80% en tamaño (solo cuando necesario)
- Codec H.264 para máxima compatibilidad
- AAC audio a 128kbps
- Fast start para reproducción inmediata
- Etiquetado con plan usado para analytics

## 📝 **Notas Importantes**

1. **Slugs únicos por usuario:** Cada usuario puede tener un slug único, pero diferentes usuarios pueden usar el mismo slug.

2. **Validación de formato:** Los slugs solo aceptan letras minúsculas, números y guiones.

3. **Sugerencias automáticas:** Cuando un slug ya existe, el sistema proporciona sugerencias automáticas.

4. **Traducción inteligente:** El sistema puede traducir automáticamente el contenido de las webs.

5. **RLS:** Toda la seguridad se maneja a nivel de base de datos con Row Level Security.

6. **Timestamps automáticos:** Los campos `created_at` y `updated_at` se manejan automáticamente.

7. **Videos optimizados:** Todos los videos se comprimen solo si es necesario según el plan del usuario.

8. **Limpieza automática:** Los videos se eliminan automáticamente al borrar webs.

9. **Sistema escalable:** Preparado para activar pagos y diferentes planes cuando sea necesario.

10. **Validación en tiempo real:** Los límites se verifican antes de cualquier operación. 