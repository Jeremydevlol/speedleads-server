# 🎬 Soporte para URLs de Video en Instrucciones de Personalidad

## Descripción General

Se ha implementado soporte completo para URLs de video de **YouTube**, **Instagram Reels** y **TikTok** en el sistema de instrucciones de personalidad. Ahora los usuarios pueden agregar links directos de estas plataformas y el sistema automáticamente:

1. **Detecta** el tipo de plataforma
2. **Descarga** el video usando `yt-dlp`
3. **Procesa** el contenido para análisis con IA
4. **Extrae** información relevante (título, descripción, duración, etc.)
5. **Almacena** el video en Supabase Storage

## 🚀 Instalación

### Paso 1: Ejecutar Script de Instalación
```bash
cd /Users/amosmendez/Desktop/Uniclcik.io/api
./install-video-support.sh
```

### Paso 2: Verificar Instalación
```bash
yt-dlp --version
```

### Paso 3: Reiniciar Servidor
```bash
npm restart
# o
pm2 restart all
```

## 📋 Plataformas Soportadas

### YouTube
- ✅ Videos regulares: `https://www.youtube.com/watch?v=VIDEO_ID`
- ✅ Enlaces cortos: `https://youtu.be/VIDEO_ID`
- ✅ YouTube Shorts: `https://www.youtube.com/shorts/VIDEO_ID`
- ✅ Videos embebidos: `https://www.youtube.com/embed/VIDEO_ID`

### Instagram
- ✅ Reels: `https://www.instagram.com/reel/REEL_ID/`
- ✅ Posts de video: `https://www.instagram.com/p/POST_ID/`
- ✅ Stories: `https://www.instagram.com/stories/USER/STORY_ID/`

### TikTok
- ✅ Videos regulares: `https://www.tiktok.com/@user/video/VIDEO_ID`
- ✅ Enlaces cortos: `https://vm.tiktok.com/SHORT_ID`
- ✅ Enlaces alternativos: `https://www.tiktok.com/t/SHORT_ID`

## 🔧 Uso en el Frontend

### Ejemplo de Request con URLs de Video

```javascript
const response = await fetch('/api/personalities/instructions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    personalityId: 'personality-uuid',
    instruction: 'Analiza este video y aprende de su contenido',
    media: [
      {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        type: 'video_url',
        filename: 'youtube_video'
      },
      {
        url: 'https://www.instagram.com/reel/ABC123/',
        type: 'video_url', 
        filename: 'instagram_reel'
      },
      {
        url: 'https://www.tiktok.com/@user/video/123456',
        type: 'video_url',
        filename: 'tiktok_video'
      }
    ]
  })
});
```

### Validar URL Antes de Enviar

```javascript
const validateResponse = await fetch('/api/personalities/validate-video-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  })
});

const validation = await validateResponse.json();
if (validation.valid) {
  console.log(`✅ URL válida de ${validation.platform}`);
} else {
  console.log('❌ URL no soportada');
}
```

## 🏗️ Arquitectura del Sistema

### Archivos Creados/Modificados

```
src/
├── utils/
│   ├── videoUrlProcessor.js          # Lógica de detección y descarga
│   └── personalityVideoUrlHandler.js # Procesamiento específico para personality
├── controllers/
│   └── personalityControllerExtended.js # Extensiones del controlador
├── routes/
│   └── personalityVideoRoutes.js     # Nuevas rutas para videos
└── patches/
    └── personalityControllerPatch.js # Parche para integración
```

### Flujo de Procesamiento

1. **Detección**: `detectVideoUrl()` identifica la plataforma
2. **Validación**: Verificar formato y disponibilidad del servicio
3. **Descarga**: `downloadVideoFromUrl()` usa `yt-dlp` para obtener el video
4. **Subida**: El video se sube a Supabase Storage
5. **Metadatos**: Se extraen título, descripción, duración, etc.
6. **Base de Datos**: Se guarda la entrada en la tabla `media`
7. **Limpieza**: Se eliminan archivos temporales

## 📊 Información Extraída

Para cada video procesado se extrae:

- **Título** del video
- **Descripción** completa
- **Duración** en segundos
- **Canal/Usuario** que lo subió
- **Fecha de subida**
- **Número de visualizaciones**
- **Número de likes** (cuando disponible)
- **Miniatura** del video
- **URL original** de la plataforma

## 🔒 Validaciones y Límites

### Límites de Tamaño
- **Archivo individual**: 500 MB máximo
- **Total por instrucción**: 1 GB máximo
- **Duración**: 30 minutos máximo (configurable)

### Validaciones de Seguridad
- ✅ Verificación de plataforma soportada
- ✅ Validación de formato de URL
- ✅ Verificación de disponibilidad del servicio
- ✅ Límites de tamaño y duración
- ✅ Limpieza automática de archivos temporales

## 🛠️ Configuración

### Variables de Entorno
```bash
# Opcional: Bucket específico para videos
VIDEOS_BUCKET_NAME=videos-instrutions

# Configuración de Supabase (ya existente)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

### Configuración de yt-dlp
```json
{
  "format": "best[height<=720]/best",
  "extractFlat": false,
  "writeInfoJson": true,
  "writeDescription": true,
  "writeThumbnail": true
}
```

## 🧪 Testing

### Probar Detección de URLs
```javascript
import { detectVideoUrl } from './src/utils/videoUrlProcessor.js';

const testUrls = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ', 
  'https://www.instagram.com/reel/ABC123/',
  'https://www.tiktok.com/@user/video/123456'
];

testUrls.forEach(url => {
  const result = detectVideoUrl(url);
  console.log(`${result.isValid ? '✅' : '❌'} ${url} -> ${result.platform}`);
});
```

### Probar Descarga (Cuidado: descarga real)
```javascript
import { downloadVideoFromUrl } from './src/utils/videoUrlProcessor.js';

try {
  const result = await downloadVideoFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  console.log('✅ Video descargado:', result.filename);
} catch (error) {
  console.error('❌ Error:', error.message);
}
```

## 🚨 Troubleshooting

### Error: "yt-dlp no está instalado"
```bash
pip3 install --upgrade yt-dlp
# o
pip install --upgrade yt-dlp
```

### Error: "Servicio de descarga no disponible"
```bash
# Verificar instalación
yt-dlp --version

# Verificar PATH
which yt-dlp

# Reinstalar si es necesario
pip3 uninstall yt-dlp
pip3 install yt-dlp
```

### Error: "Permission denied"
```bash
# Dar permisos al directorio temporal
chmod 755 temp_downloads/

# Verificar permisos de escritura
ls -la temp_downloads/
```

### Videos no se procesan
1. Verificar que la URL sea válida y pública
2. Comprobar que el video no esté geo-bloqueado
3. Verificar límites de tamaño y duración
4. Revisar logs del servidor para errores específicos

## 📈 Monitoreo

### Logs Importantes
```bash
# Buscar logs de procesamiento de video
grep "📥 Descargando video" logs/
grep "✅ Video procesado" logs/
grep "❌ Error procesando URL" logs/
```

### Métricas a Monitorear
- Tiempo de descarga por plataforma
- Tasa de éxito/fallo por plataforma
- Tamaño promedio de videos descargados
- Uso de espacio en disco temporal

## ⚖️ Consideraciones Legales

⚠️ **IMPORTANTE**: 
- Respetar los términos de servicio de cada plataforma
- Solo procesar contenido público
- No redistribuir contenido sin permisos
- Informar a los usuarios sobre el procesamiento
- Considerar derechos de autor y privacidad

## 🔄 Actualizaciones Futuras

### Próximas Funcionalidades
- [ ] Soporte para más plataformas (Twitter, Facebook, etc.)
- [ ] Extracción de audio para transcripción
- [ ] Análisis de contenido visual con IA
- [ ] Cache inteligente para evitar re-descargas
- [ ] Procesamiento en background para videos largos

### Optimizaciones Planificadas
- [ ] Compresión automática de videos grandes
- [ ] Streaming de descarga para videos muy largos
- [ ] Paralelización de descargas múltiples
- [ ] Integración con CDN para mejor rendimiento
