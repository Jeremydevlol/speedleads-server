# 📄 API Documentation: Sistema de Previews de PDFs

## 🎯 Resumen General

Este documento describe la API del backend implementada para soportar el sistema de previews de PDFs en el frontend. El sistema permite subir, almacenar, procesar y servir archivos PDF con metadatos completos para su visualización en iframes.

## 🏗️ Arquitectura del Sistema

```
Frontend (Next.js) ←→ Backend API ←→ Supabase Storage/Database
                                  ←→ OpenAI/DeepSeek (IA Processing)
```

### Componentes Principales:
- **File Upload & Processing**: Subida y procesamiento de PDFs
- **Metadata Management**: Almacenamiento de metadatos completos
- **File Serving**: Servicio de archivos con headers apropiados
- **AI Processing**: Mejora de instrucciones con IA
- **Validation**: Validación robusta de archivos

---

## 📋 Endpoints de la API

### 1. 📤 Subir Instrucción con PDF

**Endpoint:** `POST /api/personalities/instructions`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "personalityId": "859",
  "instruction": "Texto de la instrucción",
  "media": [
    {
      "type": "application/pdf",
      "mimeType": "application/pdf", 
      "filename": "documento.pdf",
      "data": "data:application/pdf;base64,JVBERi0x..."
    }
  ]
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "instructionId": "2893",
  "extractedTexts": ["Texto extraído del PDF..."]
}
```

**Validaciones:**
- ✅ Tamaño máximo total: 100MB
- ✅ Tamaño máximo por archivo: 50MB
- ✅ Tipos permitidos: PDF, imágenes, audio
- ✅ Estructura de datos requerida

---

### 2. 📋 Obtener Instrucciones con Metadatos

**Endpoint:** `POST /api/personalities/get_personalities_instructions`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "personalityId": "859"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "instructions": [
    {
      "id": "123",
      "texto": "Instrucción de texto",
      "created_at": "2025-01-01T00:00:00Z",
      "media": [
        {
          "id": "456",
          "type": "pdf",
          "data": "http://localhost:5001/uploads/documento.pdf",
          "url": "http://localhost:5001/uploads/documento.pdf",
          "filename": "documento.pdf",
          "mimeType": "application/pdf",
          "size": 2048576,
          "extractedText": "Texto extraído del PDF...",
          "uploadedAt": "2025-01-01T00:00:00Z",
          "isSupabaseStorage": true,
          "isLocalStorage": false,
          "previewSupported": true
        }
      ],
      "mediaCount": 1,
      "hasPdfs": true,
      "hasImages": false,
      "hasAudio": false,
      "totalSize": 2048576
    }
  ],
  "metadata": {
    "totalInstructions": 1,
    "totalMediaFiles": 1,
    "totalPdfs": 1,
    "totalSizeMB": 2.0,
    "apiUrl": "http://localhost:5001"
  }
}
```

---

### 3. 📄 Servir Archivo PDF

**Endpoint:** `GET /uploads/:filename`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN> (opcional)
```

**Respuesta:**
- **Content-Type:** `application/pdf`
- **Content-Disposition:** `inline; filename="documento.pdf"`
- **X-Frame-Options:** `SAMEORIGIN`
- **Cache-Control:** `public, max-age=86400`
- **Access-Control-Allow-Origin:** `*` (desarrollo) / `https://uniclick.io` (producción)

**Características:**
- ✅ Streaming para archivos grandes
- ✅ Soporte para conditional requests (304 Not Modified)
- ✅ ETags y Last-Modified para caching
- ✅ Validación de path traversal
- ✅ Headers apropiados para iframe embedding

---

### 4. 🔄 Reprocesar Instrucciones con IA

**Endpoint:** `POST /api/personalities/reprocess_instructions`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "personalityId": "859"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "message": "Instrucciones reprocesadas exitosamente",
  "originalLength": 409,
  "improvedLength": 1848,
  "improvementRatio": "4.52",
  "preview": "# Instrucciones para el Chatbot..."
}
```

---

### 5. 🗑️ Eliminar Instrucción

**Endpoint:** `POST /api/personalities/delete_personality_instruction`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "instructionId": "123",
  "personalityId": "859"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "message": "Instrucción eliminada exitosamente",
  "deleted": "123",
  "mediaFilesDeleted": 2
}
```

---

### 6. 📝 Actualizar Instrucción

**Endpoint:** `POST /api/personalities/update_personality_instruction`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "instructionId": "123",
  "personalityId": "859",
  "newText": "Texto actualizado de la instrucción"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "message": "Instrucción actualizada exitosamente",
  "updated": {
    "instructionId": "123",
    "newText": "Texto actualizado...",
    "updatedAt": "2025-01-01T00:00:00Z",
    "characterCount": 45
  }
}
```

---

## 🎨 Interfaz MediaType para Frontend

### Estructura Esperada por el Frontend:

```typescript
interface MediaType {
  type: "pdf" | "image" | "audio"
  data: string          // URL completa del archivo
  mimeType: string      // "application/pdf"
  filename: string      // Nombre del archivo
  size: number         // Tamaño en bytes
  url: string          // URL completa para el iframe
  extractedText?: string // Texto extraído del PDF (opcional)
}
```

### Ejemplo de Uso en Frontend:

```jsx
// Preview de PDF en iframe
<iframe
  src={item.url || item.data}
  className="w-full h-48 border-0"
  title={item.filename}
/>

// Mostrar metadatos
<div>
  <p>Archivo: {item.filename}</p>
  <p>Tamaño: {(item.size / 1024).toFixed(2)} KB</p>
  <p>Tipo: {item.mimeType}</p>
  {item.extractedText && (
    <details>
      <summary>Texto extraído</summary>
      <p>{item.extractedText}</p>
    </details>
  )}
</div>
```

---

## 🔒 Validaciones y Límites

### Tipos de Archivo Soportados:
- **PDFs:** `application/pdf`
- **Imágenes:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- **Audio:** `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/mp3`

### Límites de Tamaño:
- **Archivo individual:** 50MB máximo
- **Total por request:** 100MB máximo
- **Recomendado para preview:** < 10MB para mejor rendimiento

### Validaciones Implementadas:
- ✅ Tipo MIME permitido
- ✅ Tamaño de archivo
- ✅ Estructura de datos
- ✅ Nombre de archivo válido
- ✅ Datos base64 válidos

---

## ⚡ Optimizaciones y Performance

### Caching:
- **Cache-Control:** `public, max-age=86400` (24 horas)
- **ETags:** Basados en fecha de modificación y tamaño
- **Conditional Requests:** Soporte para 304 Not Modified

### Streaming:
- Archivos grandes se sirven via streaming
- Reducción de uso de memoria
- Mejor experiencia para archivos de gran tamaño

### CORS:
- **Desarrollo:** `Access-Control-Allow-Origin: *`
- **Producción:** `Access-Control-Allow-Origin: https://uniclick.io`
- Headers apropiados para iframe embedding

---

## 🛠️ Configuración de Desarrollo

### Variables de Entorno Requeridas:
```env
NODE_ENV=development
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
```

### URLs Base:
- **Desarrollo:** `http://localhost:5001`
- **Producción:** `https://api.uniclick.io`

### Detección Automática en Frontend:
```typescript
const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    if (envUrl) return envUrl;
  }
  return 'https://api.uniclick.io'; // Fallback
};
```

---

## 🧪 Testing y Debugging

### Logs del Sistema:
El sistema genera logs detallados para debugging:
```
🎯 Procesando 1 archivos multimedia para instrucción 2893
📁 Validando 1 archivos multimedia...
   - Archivo 1: documento.pdf (application/pdf, 2.5 KB)
✅ Validación completada: 1 archivos, 0.00 MB total
☁️ Archivo subido a Supabase Storage: https://...
🤖 Procesando texto del PDF con IA para mejorar instrucciones...
✨ Instrucciones mejoradas con IA: 1848 caracteres
💾 Guardando en base de datos para userId: cb41...
✅ Registro insertado en media table con ID: 2291
```

### Comandos de Prueba:
```bash
# Subir PDF
curl -X POST "http://localhost:5001/api/personalities/instructions" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"personalityId": "859", "instruction": "Test", "media": [...]}'

# Obtener instrucciones
curl -X POST "http://localhost:5001/api/personalities/get_personalities_instructions" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"personalityId": "859"}'

# Servir archivo
curl -I "http://localhost:5001/uploads/documento.pdf"
```

---

## 🚨 Manejo de Errores

### Errores Comunes:

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Archivo 1 (documento.zip): Tipo no soportado (application/zip). Tipos permitidos: PDF, imágenes, audio"
}
```

**413 Payload Too Large:**
```json
{
  "success": false,
  "message": "El tamaño total de los archivos (105.2 MB) supera el máximo de 100 MB"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Instrucción no encontrada o no tienes permisos para eliminarla"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "message": "Error interno del servidor",
  "error": "Detalles del error (solo en desarrollo)"
}
```

---

## 🎯 Próximos Pasos y Mejoras

### Funcionalidades Futuras:
- [ ] Compresión automática de PDFs grandes
- [ ] Thumbnails automáticos para previews
- [ ] Búsqueda full-text en contenido de PDFs
- [ ] Versionado de archivos
- [ ] Análisis de contenido con IA más avanzado

### Optimizaciones Pendientes:
- [ ] CDN para archivos estáticos
- [ ] Compresión gzip para respuestas JSON
- [ ] Rate limiting por usuario
- [ ] Métricas de uso y performance

---

## 📞 Soporte y Contacto

Para dudas sobre la implementación o reportar bugs:
- **Documentación:** Este archivo
- **Logs:** Revisar consola del servidor
- **Testing:** Usar script de pruebas completo

---

**Última actualización:** 2025-10-06  
**Versión de la API:** 1.0  
**Estado:** ✅ Completamente implementado y funcional
