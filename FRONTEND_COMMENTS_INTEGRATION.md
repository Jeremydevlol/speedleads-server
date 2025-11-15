# 💬 Integración Frontend - Extracción de Comentarios de Instagram

## 📋 Resumen
Funcionalidad para extraer TODOS los comentarios de publicaciones de Instagram con sistema de caché incremental.

---

## 🔌 Endpoint Disponible

### `POST /api/instagram/comments/from-post`

**Descripción:** Extrae todos los comentarios de un post/reel de Instagram

**Headers:**
```javascript
{
  'Authorization': 'Bearer <JWT_TOKEN>',
  'Content-Type': 'application/json'
}
```

**Body:**
```javascript
{
  "postUrl": "https://www.instagram.com/reel/SHORTCODE/",
  "limit": 10000  // Opcional, default 10000
}
```

**Respuesta Exitosa (200):**
```javascript
{
  "success": true,
  "comments": [
    {
      "comment_id": "17234567890",
      "user_id": "123456789",
      "username": "usuario_ejemplo",
      "full_name": "Nombre Completo",
      "profile_pic_url": "https://...",
      "text": "¡Excelente contenido! 🔥",
      "created_at": 1705234567,
      "like_count": 15,
      "is_verified": true,
      "is_private": false
    }
    // ... más comentarios
  ],
  "post_info": {
    "id": "3693252490930008095",
    "shortcode": "DNBEZKjtbAf",
    "like_count": 1136,
    "comment_count": 124,
    "owner": {
      "username": "autor_post",
      "full_name": "Nombre Autor"
    }
  },
  "extracted_count": 124,
  "limit_requested": 10000,
  "total_comments": 124
}
```

**Respuesta Error (400/500):**
```javascript
{
  "success": false,
  "error": "Mensaje de error",
  "comments": [],
  "post_info": null
}
```

---

## 🎨 Diseño de UI Propuesto

### 📍 Ubicación en el Frontend
```
Dashboard
├── Instagram
│   ├── 🏠 Inicio
│   ├── 💬 Mensajes Directos
│   ├── 🤖 Bot de IA
│   ├── 📝 Comentarios              ← SECCIÓN
│   │   ├── Ver Comentarios Recientes
│   │   └── Extraer de Post Ajeno  ← IMPLEMENTAR ESTO
│   └── ❤️ Likes
│       └── Extraer de Post
```

---

## 🖼️ Componente: Extracción de Comentarios

### Estructura del Componente

```jsx
// components/Instagram/CommentsExtractor.jsx

import { useState } from 'react';
import { Button, Input, Card, Alert, Table, Badge, Avatar } from '@/components/ui';

export default function CommentsExtractor() {
  const [postUrl, setPostUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleExtract = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/instagram/comments/from-post', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ postUrl })
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'Error al extraer comentarios');
      }
    } catch (err) {
      setError('Error de conexión: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">💬 Extraer Comentarios de Post</h2>
        <p className="text-gray-600 mt-1">
          Obtén todos los comentarios de una publicación
        </p>
      </div>

      {/* Input Section */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              URL del Post/Reel
            </label>
            <Input
              type="text"
              placeholder="https://www.instagram.com/reel/SHORTCODE/"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Pega la URL completa del post o reel de Instagram
            </p>
          </div>

          <Button
            onClick={handleExtract}
            disabled={!postUrl || loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Extrayendo comentarios...
              </>
            ) : (
              <>
                <MessageSquare className="mr-2 h-4 w-4" />
                Extraer Comentarios
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results Section */}
      {result && (
        <div className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-sm text-gray-600">Extraídos</div>
              <div className="text-2xl font-bold">{result.extracted_count}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-gray-600">Total en Post</div>
              <div className="text-2xl font-bold">{result.total_comments}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-gray-600">Autor</div>
              <div className="text-lg font-semibold">@{result.post_info.owner.username}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-gray-600">Likes</div>
              <div className="text-2xl font-bold">{result.post_info.like_count}</div>
            </Card>
          </div>

          {/* Success Alert */}
          {result.extracted_count === result.total_comments && (
            <Alert>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle>¡Completo!</AlertTitle>
              <AlertDescription>
                Se extrajeron todos los {result.extracted_count} comentarios del post.
              </AlertDescription>
            </Alert>
          )}

          {/* Partial extraction warning */}
          {result.extracted_count < result.total_comments && (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Extracción Parcial</AlertTitle>
              <AlertDescription>
                Se extrajeron {result.extracted_count} de {result.total_comments} comentarios.
                Vuelve a ejecutar la extracción para obtener los faltantes (sistema de caché incremental).
              </AlertDescription>
            </Alert>
          )}

          {/* Actions Bar */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => downloadJSON(result.comments, 'comments')}
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar JSON
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadCSV(result.comments)}
            >
              <FileText className="mr-2 h-4 w-4" />
              Descargar CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => copyToClipboard(result.comments)}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copiar Usernames
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExtract()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Extraer Más
            </Button>
          </div>

          {/* Comments Table */}
          <Card>
            <div className="p-4 border-b">
              <h3 className="font-semibold">
                Comentarios ({result.comments.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Comentario</TableHead>
                    <TableHead>Likes</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.comments.map((comment) => (
                    <TableRow key={comment.comment_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={comment.profile_pic_url} />
                            <AvatarFallback>
                              {comment.username[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium">@{comment.username}</span>
                              {comment.is_verified && (
                                <Badge variant="secondary" className="text-xs">
                                  ✓
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {comment.full_name}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="truncate" title={comment.text}>
                          {comment.text}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Heart className="h-3 w-3 text-red-500" />
                          <span className="text-sm">{comment.like_count}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-500">
                          {formatDate(comment.created_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(`https://instagram.com/${comment.username}`, '_blank')}
                            title="Ver perfil"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => addToLeads(comment)}
                            title="Agregar a leads"
                          >
                            <UserPlus className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => replyToComment(comment)}
                            title="Responder"
                          >
                            <Reply className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// Helper functions
function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  
  return date.toLocaleDateString();
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${Date.now()}.json`;
  a.click();
}

function downloadCSV(comments) {
  const headers = ['Username', 'Full Name', 'Comment', 'Likes', 'Verified', 'Private', 'Date', 'Profile URL'];
  const rows = comments.map(comment => [
    comment.username,
    comment.full_name,
    comment.text.replace(/,/g, ';'), // Escapar comas
    comment.like_count,
    comment.is_verified ? 'Yes' : 'No',
    comment.is_private ? 'Yes' : 'No',
    new Date(comment.created_at * 1000).toISOString(),
    `https://instagram.com/${comment.username}`
  ]);
  
  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `comments_${Date.now()}.csv`;
  a.click();
}

function copyToClipboard(comments) {
  const usernames = comments.map(c => `@${c.username}`).join('\n');
  navigator.clipboard.writeText(usernames);
  // Mostrar toast de éxito
}

function addToLeads(comment) {
  // Implementar lógica para agregar a leads
  console.log('Agregar a leads:', comment);
}

function replyToComment(comment) {
  // Implementar lógica para responder comentario
  console.log('Responder a:', comment);
}
```

---

## 🗂️ Estructura de Archivos

```
frontend/
├── src/
│   ├── components/
│   │   └── Instagram/
│   │       ├── CommentsExtractor.jsx      ← CREAR/ACTUALIZAR
│   │       ├── LikesExtractor.jsx
│   │       ├── DirectMessages.jsx
│   │       └── BotControl.jsx
│   ├── pages/
│   │   └── instagram/
│   │       ├── index.jsx
│   │       ├── messages.jsx
│   │       ├── comments.jsx               ← CREAR/ACTUALIZAR
│   │       └── likes.jsx
│   └── lib/
│       └── api/
│           └── instagram.js               ← AGREGAR FUNCIÓN
```

---

## 📝 API Client Function

```javascript
// lib/api/instagram.js

export async function extractCommentsFromPost(postUrl, limit = 10000) {
  const response = await fetch('/api/instagram/comments/from-post', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ postUrl, limit })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al extraer comentarios');
  }

  return response.json();
}
```

---

## 🎯 Funcionalidades Clave

### 1. **Extracción de Comentarios**
- ✅ Input para URL del post
- ✅ Botón de extracción con loading state
- ✅ Validación de URL
- ✅ Manejo de errores
- ✅ Sistema de caché incremental

### 2. **Visualización de Resultados**
- ✅ Cards con estadísticas (extraídos, total, autor, likes)
- ✅ Tabla con lista de comentarios
- ✅ Avatar, username, nombre completo
- ✅ Texto del comentario
- ✅ Likes del comentario
- ✅ Fecha relativa (5m, 2h, 3d)
- ✅ Badges para verificados y privados

### 3. **Exportación de Datos**
- ✅ Descargar como JSON
- ✅ Descargar como CSV
- ✅ Copiar usernames al portapapeles
- ✅ Botón "Extraer Más" para continuar extracción

### 4. **Acciones por Comentario**
- ✅ Ver perfil en Instagram (nueva pestaña)
- ✅ Agregar usuario a lista de leads
- ✅ Responder al comentario
- ✅ Ver comentario completo (tooltip)

---

## 🔄 Sistema de Caché Incremental

### ¿Cómo funciona?

```
Primera ejecución:
- Extrae 74 de 124 comentarios
- Guarda en caché: storage/ig_state/comments_SHORTCODE.json

Segunda ejecución:
- Lee caché: 74 comentarios
- Extrae nuevos: 50 comentarios
- Combina: 124 comentarios totales
- Actualiza caché

Tercera ejecución:
- Ya tiene todos: 124/124 ✅
```

### UI para Caché Incremental

```jsx
{/* Si extracción parcial */}
{result.extracted_count < result.total_comments && (
  <Alert variant="warning">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Extracción Parcial</AlertTitle>
    <AlertDescription>
      Se extrajeron {result.extracted_count} de {result.total_comments} comentarios.
      <Button 
        variant="link" 
        onClick={handleExtract}
        className="ml-2"
      >
        Extraer más comentarios →
      </Button>
    </AlertDescription>
  </Alert>
)}

{/* Si extracción completa */}
{result.extracted_count === result.total_comments && (
  <Alert>
    <CheckCircle className="h-4 w-4 text-green-600" />
    <AlertTitle>¡Completo!</AlertTitle>
    <AlertDescription>
      Se extrajeron todos los {result.extracted_count} comentarios.
    </AlertDescription>
  </Alert>
)}
```

---

## 📊 Ejemplo de Datos

```javascript
// Respuesta típica
{
  "success": true,
  "comments": [
    {
      "comment_id": "17234567890",
      "user_id": "123456789",
      "username": "maria_garcia",
      "full_name": "María García",
      "profile_pic_url": "https://...",
      "text": "¡Excelente contenido! Me encanta 🔥",
      "created_at": 1705234567,
      "like_count": 15,
      "is_verified": false,
      "is_private": false
    },
    {
      "comment_id": "17234567891",
      "user_id": "987654321",
      "username": "carlos_lopez",
      "full_name": "Carlos López ✨",
      "profile_pic_url": "https://...",
      "text": "Totalmente de acuerdo 👏",
      "created_at": 1705234890,
      "like_count": 8,
      "is_verified": true,
      "is_private": true
    }
  ],
  "post_info": {
    "id": "3693252490930008095",
    "shortcode": "DNBEZKjtbAf",
    "like_count": 1136,
    "comment_count": 124,
    "owner": {
      "username": "tomasgraciaoficial",
      "full_name": "Tomás Gracia"
    }
  },
  "extracted_count": 124,
  "limit_requested": 10000,
  "total_comments": 124
}
```

---

## 🎨 Estilos Recomendados

### Colores
- **Primary:** Azul (#0095f6) - Color de Instagram
- **Success:** Verde (#00c853)
- **Warning:** Amarillo (#ffc107)
- **Error:** Rojo (#f44336)
- **Comment:** Gris (#8e8e8e)

### Iconos (Lucide React)
```javascript
import {
  MessageSquare,   // 💬 Comentarios
  Download,        // 📥 Descargar
  FileText,        // 📄 CSV
  Copy,            // 📋 Copiar
  ExternalLink,    // 🔗 Ver perfil
  UserPlus,        // 👤+ Agregar a leads
  Reply,           // ↩️ Responder
  Heart,           // ❤️ Likes
  AlertCircle,     // ⚠️ Alertas
  CheckCircle,     // ✅ Completo
  Loader2,         // ⏳ Loading
  RefreshCw        // 🔄 Extraer más
} from 'lucide-react';
```

---

## 🔄 Flujo de Usuario

```
1. Usuario navega a "Instagram > Comentarios > Extraer de Post"
   ↓
2. Pega URL del post en el input
   ↓
3. Click en "Extraer Comentarios"
   ↓
4. Sistema muestra loading
   ↓
5. Backend extrae comentarios (puede tomar varios segundos)
   ↓
6. Frontend muestra:
   - Estadísticas en cards
   - Tabla con comentarios
   - Alerta si extracción parcial
   ↓
7. Si extracción parcial:
   - Usuario puede hacer click en "Extraer Más"
   - Sistema continúa desde donde quedó (caché incremental)
   ↓
8. Usuario puede:
   - Ver lista completa
   - Descargar datos
   - Agregar usuarios a leads
   - Ver perfiles
   - Responder comentarios
```

---

## ⚠️ Consideraciones Importantes

### Caché Incremental
```jsx
<Alert>
  <Info className="h-4 w-4" />
  <AlertTitle>Sistema de Caché Incremental</AlertTitle>
  <AlertDescription>
    Los comentarios se guardan en caché. Si la primera extracción no obtiene
    todos, puedes ejecutarla nuevamente y se agregarán los faltantes sin
    duplicados.
  </AlertDescription>
</Alert>
```

### Tiempo de Extracción
```jsx
<Alert>
  <Clock className="h-4 w-4" />
  <AlertTitle>Tiempo de Extracción</AlertTitle>
  <AlertDescription>
    Posts con muchos comentarios pueden tardar varios segundos o minutos.
    El sistema extrae en páginas con delays para evitar rate limits.
  </AlertDescription>
</Alert>
```

---

## ✅ Checklist de Implementación

### Backend (✅ Completado)
- [x] Endpoint `/api/instagram/comments/from-post`
- [x] Validación de sesión
- [x] Conversión de shortcode con BigInt
- [x] Extracción de comentarios con paginación
- [x] Sistema de caché incremental
- [x] Manejo de errores
- [x] Documentación

### Frontend (⏳ Pendiente)
- [ ] Crear componente `CommentsExtractor.jsx`
- [ ] Crear/actualizar página `comments.jsx`
- [ ] Agregar función API en `instagram.js`
- [ ] Agregar ruta en navegación
- [ ] Implementar tabla de comentarios
- [ ] Implementar exportación (JSON/CSV)
- [ ] Agregar alertas de caché incremental
- [ ] Botón "Extraer Más"
- [ ] Formato de fecha relativa
- [ ] Testing de UI
- [ ] Responsive design

---

## 🚀 Próximos Pasos

1. **Crear componente base** (`CommentsExtractor.jsx`)
2. **Agregar ruta** en el menú de Instagram
3. **Implementar tabla** con comentarios
4. **Agregar sistema de caché** en UI
5. **Implementar exportación** de datos
6. **Testing** con diferentes posts
7. **Documentar** en el README del frontend

---

## 📞 Soporte

Si necesitas ayuda con la implementación:
- Revisa este documento
- Consulta el endpoint en Postman/Thunder Client
- Verifica logs del servidor
- Prueba con el script `test-comments-extraction.js`

---

**Última actualización:** 12 de Enero, 2025
**Versión:** 1.0.0
