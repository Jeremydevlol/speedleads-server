# 🎨 Integración Frontend - Extracción de Likes de Instagram

## 📋 Resumen
Nueva funcionalidad para extraer usuarios que dieron like a publicaciones de Instagram.

---

## 🔌 Nuevo Endpoint Disponible

### `POST /api/instagram/likes/from-post`

**Descripción:** Extrae usuarios que dieron like a un post/reel de Instagram

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
  "likes": [
    {
      "user_id": "123456789",
      "username": "usuario_ejemplo",
      "full_name": "Nombre Completo",
      "profile_pic_url": "https://...",
      "is_verified": true,
      "is_private": false
    }
    // ... más usuarios
  ],
  "post_info": {
    "id": "3693252490930008095",
    "shortcode": "DNBEZKjtbAf",
    "like_count": 1136,
    "comment_count": 124,
    "likes_hidden": false,
    "owner": {
      "username": "autor_post",
      "full_name": "Nombre Autor"
    }
  },
  "extracted_count": 198,
  "total_reported_by_api": 1136,
  "note": "Instagram puede truncar la lista de likers en posts grandes."
}
```

**Respuesta Error (400/500):**
```javascript
{
  "success": false,
  "error": "Mensaje de error",
  "likes": [],
  "post_info": null
}
```

---

## 🎨 Diseño de UI Propuesto

### 📍 Ubicación en el Frontend
Crear una nueva sección en el panel de Instagram:

```
Dashboard
├── Instagram
│   ├── 🏠 Inicio
│   ├── 💬 Mensajes Directos
│   ├── 🤖 Bot de IA
│   ├── 📝 Comentarios
│   │   ├── Ver Comentarios Recientes
│   │   └── Extraer de Post Ajeno  ← YA EXISTE
│   └── ❤️ Likes                    ← NUEVA SECCIÓN
│       └── Extraer de Post
```

---

## 🖼️ Componente: Extracción de Likes

### Estructura del Componente

```jsx
// components/Instagram/LikesExtractor.jsx

import { useState } from 'react';
import { Button, Input, Card, Alert, Table, Badge, Avatar } from '@/components/ui';

export default function LikesExtractor() {
  const [postUrl, setPostUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleExtract = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/instagram/likes/from-post', {
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
        setError(data.error || 'Error al extraer likes');
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
        <h2 className="text-2xl font-bold">❤️ Extraer Likes de Post</h2>
        <p className="text-gray-600 mt-1">
          Obtén la lista de usuarios que dieron like a una publicación
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
                Extrayendo likes...
              </>
            ) : (
              <>
                <Heart className="mr-2 h-4 w-4" />
                Extraer Likes
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
              <div className="text-2xl font-bold">{result.total_reported_by_api}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-gray-600">Autor</div>
              <div className="text-lg font-semibold">@{result.post_info.owner.username}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-gray-600">Comentarios</div>
              <div className="text-2xl font-bold">{result.post_info.comment_count}</div>
            </Card>
          </div>

          {/* Warning if truncated */}
          {result.extracted_count < result.total_reported_by_api && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Limitación de Instagram</AlertTitle>
              <AlertDescription>
                Instagram truncó la lista. Se obtuvieron {result.extracted_count} de {result.total_reported_by_api} likes.
                Esto es normal en posts con muchos likes.
              </AlertDescription>
            </Alert>
          )}

          {/* Likes Hidden Warning */}
          {result.post_info.likes_hidden && (
            <Alert variant="warning">
              <Lock className="h-4 w-4" />
              <AlertTitle>Likes Ocultos</AlertTitle>
              <AlertDescription>
                El autor ocultó el contador de likes en esta publicación.
              </AlertDescription>
            </Alert>
          )}

          {/* Actions Bar */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => downloadJSON(result.likes, 'likes')}
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar JSON
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadCSV(result.likes)}
            >
              <FileText className="mr-2 h-4 w-4" />
              Descargar CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => copyToClipboard(result.likes)}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copiar Usernames
            </Button>
          </div>

          {/* Users Table */}
          <Card>
            <div className="p-4 border-b">
              <h3 className="font-semibold">
                Usuarios que dieron Like ({result.likes.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.likes.map((like) => (
                    <TableRow key={like.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={like.profile_pic_url} />
                            <AvatarFallback>
                              {like.username[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium">@{like.username}</span>
                              {like.is_verified && (
                                <Badge variant="secondary" className="text-xs">
                                  ✓
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{like.full_name}</TableCell>
                      <TableCell>
                        {like.is_private ? (
                          <Badge variant="outline">
                            <Lock className="h-3 w-3 mr-1" />
                            Privado
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Unlock className="h-3 w-3 mr-1" />
                            Público
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(`https://instagram.com/${like.username}`, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => addToLeads(like)}
                          >
                            <UserPlus className="h-4 w-4" />
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
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${Date.now()}.json`;
  a.click();
}

function downloadCSV(likes) {
  const headers = ['Username', 'Full Name', 'Verified', 'Private', 'Profile URL'];
  const rows = likes.map(like => [
    like.username,
    like.full_name,
    like.is_verified ? 'Yes' : 'No',
    like.is_private ? 'Yes' : 'No',
    `https://instagram.com/${like.username}`
  ]);
  
  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `likes_${Date.now()}.csv`;
  a.click();
}

function copyToClipboard(likes) {
  const usernames = likes.map(like => `@${like.username}`).join('\n');
  navigator.clipboard.writeText(usernames);
  // Mostrar toast de éxito
}

function addToLeads(like) {
  // Implementar lógica para agregar a leads
  console.log('Agregar a leads:', like);
}
```

---

## 🗂️ Estructura de Archivos

```
frontend/
├── src/
│   ├── components/
│   │   └── Instagram/
│   │       ├── LikesExtractor.jsx          ← NUEVO
│   │       ├── CommentsExtractor.jsx       ← YA EXISTE
│   │       ├── DirectMessages.jsx
│   │       └── BotControl.jsx
│   ├── pages/
│   │   └── instagram/
│   │       ├── index.jsx
│   │       ├── messages.jsx
│   │       ├── comments.jsx
│   │       └── likes.jsx                   ← NUEVA PÁGINA
│   └── lib/
│       └── api/
│           └── instagram.js                ← AGREGAR FUNCIÓN
```

---

## 📝 API Client Function

```javascript
// lib/api/instagram.js

export async function extractLikesFromPost(postUrl, limit = 10000) {
  const response = await fetch('/api/instagram/likes/from-post', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ postUrl, limit })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al extraer likes');
  }

  return response.json();
}
```

---

## 🎯 Funcionalidades Clave

### 1. **Extracción de Likes**
- ✅ Input para URL del post
- ✅ Botón de extracción con loading state
- ✅ Validación de URL
- ✅ Manejo de errores

### 2. **Visualización de Resultados**
- ✅ Cards con estadísticas (extraídos, total, autor)
- ✅ Tabla con lista de usuarios
- ✅ Avatar, username, nombre completo
- ✅ Badges para verificados y privados
- ✅ Alertas para limitaciones de Instagram

### 3. **Exportación de Datos**
- ✅ Descargar como JSON
- ✅ Descargar como CSV
- ✅ Copiar usernames al portapapeles
- ✅ Agregar usuarios a leads

### 4. **Acciones por Usuario**
- ✅ Ver perfil en Instagram (nueva pestaña)
- ✅ Agregar a lista de leads
- ✅ Enviar mensaje directo (si está implementado)

---

## ⚠️ Consideraciones Importantes

### Limitaciones de Instagram
```jsx
<Alert>
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Limitación de Instagram</AlertTitle>
  <AlertDescription>
    Instagram NO pagina los likers. En posts con muchos likes (>200),
    la API solo devuelve los primeros ~200 usuarios. Esto es una
    limitación de Instagram, no del sistema.
  </AlertDescription>
</Alert>
```

### Estados de la UI
1. **Inicial:** Formulario vacío
2. **Loading:** Spinner + texto "Extrayendo likes..."
3. **Success:** Mostrar resultados + estadísticas
4. **Error:** Alert con mensaje de error
5. **Warning:** Si Instagram truncó la lista

---

## 🎨 Estilos Recomendados

### Colores
- **Primary:** Azul (#0095f6) - Color de Instagram
- **Success:** Verde (#00c853)
- **Warning:** Amarillo (#ffc107)
- **Error:** Rojo (#f44336)
- **Heart:** Rosa/Rojo (#ed4956)

### Iconos (Lucide React)
```javascript
import {
  Heart,          // Likes
  Download,       // Descargar
  FileText,       // CSV
  Copy,           // Copiar
  ExternalLink,   // Ver perfil
  UserPlus,       // Agregar a leads
  Lock,           // Privado
  Unlock,         // Público
  AlertCircle,    // Alertas
  Loader2,        // Loading
  CheckCircle     // Verificado
} from 'lucide-react';
```

---

## 🔄 Flujo de Usuario

```
1. Usuario navega a "Instagram > Likes"
   ↓
2. Pega URL del post en el input
   ↓
3. Click en "Extraer Likes"
   ↓
4. Sistema muestra loading
   ↓
5. Backend extrae likes (2-5 segundos)
   ↓
6. Frontend muestra:
   - Estadísticas en cards
   - Tabla con usuarios
   - Alertas si hay limitaciones
   ↓
7. Usuario puede:
   - Ver lista completa
   - Descargar datos
   - Agregar a leads
   - Ver perfiles
```

---

## 📊 Ejemplo de Datos

```javascript
// Respuesta típica
{
  "success": true,
  "likes": [
    {
      "user_id": "123456789",
      "username": "maria_garcia",
      "full_name": "María García",
      "profile_pic_url": "https://...",
      "is_verified": false,
      "is_private": false
    },
    {
      "user_id": "987654321",
      "username": "carlos_lopez",
      "full_name": "Carlos López ✨",
      "profile_pic_url": "https://...",
      "is_verified": true,
      "is_private": true
    }
  ],
  "post_info": {
    "id": "3693252490930008095",
    "shortcode": "DNBEZKjtbAf",
    "like_count": 1136,
    "comment_count": 124,
    "likes_hidden": false,
    "owner": {
      "username": "tomasgraciaoficial",
      "full_name": "Tomás Gracia"
    }
  },
  "extracted_count": 198,
  "total_reported_by_api": 1136,
  "note": "Instagram puede truncar la lista de likers en posts grandes."
}
```

---

## ✅ Checklist de Implementación

### Backend (✅ Completado)
- [x] Endpoint `/api/instagram/likes/from-post`
- [x] Validación de sesión
- [x] Conversión de shortcode con BigInt
- [x] Extracción de likers
- [x] Manejo de errores
- [x] Documentación

### Frontend (⏳ Pendiente)
- [ ] Crear componente `LikesExtractor.jsx`
- [ ] Crear página `likes.jsx`
- [ ] Agregar función API en `instagram.js`
- [ ] Agregar ruta en navegación
- [ ] Implementar tabla de usuarios
- [ ] Implementar exportación (JSON/CSV)
- [ ] Agregar alertas y warnings
- [ ] Testing de UI
- [ ] Responsive design

---

## 🚀 Próximos Pasos

1. **Crear componente base** (`LikesExtractor.jsx`)
2. **Agregar ruta** en el menú de Instagram
3. **Implementar tabla** con usuarios
4. **Agregar exportación** de datos
5. **Testing** con diferentes posts
6. **Documentar** en el README del frontend

---

## 📞 Soporte

Si necesitas ayuda con la implementación:
- Revisa este documento
- Consulta el endpoint en Postman/Thunder Client
- Verifica logs del servidor
- Prueba con el script `test-likes-extraction.js`

---

**Última actualización:** 12 de Enero, 2025
**Versión:** 1.0.0
