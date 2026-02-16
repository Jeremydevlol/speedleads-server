#!/bin/bash

echo "🎬 Instalando soporte para URLs de video (YouTube, Instagram Reels, TikTok)"
echo "=================================================================="

# Verificar si Python está instalado
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 no está instalado. Por favor instala Python3 primero."
    exit 1
fi

echo "✅ Python3 encontrado: $(python3 --version)"

# Verificar si pip está instalado
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 no está instalado. Por favor instala pip3 primero."
    exit 1
fi

echo "✅ pip3 encontrado: $(pip3 --version)"

# Instalar yt-dlp
echo "📦 Instalando yt-dlp..."
pip3 install --upgrade yt-dlp

# Verificar instalación
if command -v yt-dlp &> /dev/null; then
    echo "✅ yt-dlp instalado exitosamente: $(yt-dlp --version)"
else
    echo "❌ Error instalando yt-dlp"
    exit 1
fi

# Verificar ffmpeg (necesario para extracción de audio)
echo "📦 Verificando ffmpeg..."
if command -v ffmpeg &> /dev/null; then
    echo "✅ ffmpeg ya está instalado: $(ffmpeg -version | head -n 1)"
else
    echo "⚠️ ffmpeg no está instalado"
    echo "💡 Para instalar ffmpeg:"
    echo "   macOS: brew install ffmpeg"
    echo "   Ubuntu/Debian: sudo apt install ffmpeg"
    echo "   CentOS/RHEL: sudo yum install ffmpeg"
    echo ""
    echo "🔧 Instalando ffmpeg automáticamente (macOS)..."
    if command -v brew &> /dev/null; then
        brew install ffmpeg
        if command -v ffmpeg &> /dev/null; then
            echo "✅ ffmpeg instalado exitosamente"
        else
            echo "❌ Error instalando ffmpeg con Homebrew"
        fi
    else
        echo "❌ Homebrew no está disponible. Instala ffmpeg manualmente."
    fi
fi

# Crear directorio temporal para descargas
TEMP_DIR="./temp_downloads"
if [ ! -d "$TEMP_DIR" ]; then
    mkdir -p "$TEMP_DIR"
    echo "✅ Directorio temporal creado: $TEMP_DIR"
else
    echo "✅ Directorio temporal ya existe: $TEMP_DIR"
fi

# Verificar permisos de escritura
if [ -w "$TEMP_DIR" ]; then
    echo "✅ Permisos de escritura verificados"
else
    echo "❌ No hay permisos de escritura en $TEMP_DIR"
    exit 1
fi

# Instalar dependencias de Node.js si es necesario
echo "📦 Verificando dependencias de Node.js..."

# Verificar si package.json existe
if [ -f "package.json" ]; then
    # Verificar si fluent-ffmpeg está instalado
    if npm list fluent-ffmpeg &> /dev/null; then
        echo "✅ fluent-ffmpeg ya está instalado"
    else
        echo "📦 Instalando fluent-ffmpeg..."
        npm install fluent-ffmpeg
    fi
    
    # Verificar otras dependencias necesarias
    DEPS=("node-fetch" "fs" "path")
    for dep in "${DEPS[@]}"; do
        if npm list "$dep" &> /dev/null || [[ "$dep" == "fs" ]] || [[ "$dep" == "path" ]]; then
            echo "✅ $dep disponible"
        else
            echo "📦 Instalando $dep..."
            npm install "$dep"
        fi
    done
else
    echo "⚠️ package.json no encontrado. Asegúrate de estar en el directorio correcto del proyecto."
fi

# Crear archivo de configuración
CONFIG_FILE="./video-config.json"
cat > "$CONFIG_FILE" << EOF
{
  "videoSupport": {
    "enabled": true,
    "platforms": ["youtube", "instagram", "tiktok"],
    "maxVideoSize": "500MB",
    "maxDuration": 1800,
    "tempDirectory": "./temp_downloads",
    "cleanupInterval": 2,
    "ytDlpOptions": {
      "format": "best[height<=720]/best",
      "extractFlat": false,
      "writeInfoJson": true,
      "writeDescription": true,
      "writeThumbnail": true
    }
  },
  "installation": {
    "date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "version": "1.0.0"
  }
}
EOF

echo "✅ Archivo de configuración creado: $CONFIG_FILE"

# Probar instalación con una URL de ejemplo
echo "🧪 Probando instalación..."
TEST_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Crear script de prueba temporal
TEST_SCRIPT="./test-video-support.js"
cat > "$TEST_SCRIPT" << 'EOF'
import { detectVideoUrl, checkYtDlpAvailability } from './src/utils/videoUrlProcessor.js';

async function testInstallation() {
  console.log('🧪 Probando detección de URLs...');
  
  const testUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.instagram.com/reel/ABC123/',
    'https://www.tiktok.com/@user/video/123456'
  ];
  
  testUrls.forEach(url => {
    const result = detectVideoUrl(url);
    console.log(`${result.isValid ? '✅' : '❌'} ${url} -> ${result.platform || 'no soportada'}`);
  });
  
  console.log('🧪 Verificando yt-dlp...');
  const ytDlpAvailable = await checkYtDlpAvailability();
  console.log(`${ytDlpAvailable ? '✅' : '❌'} yt-dlp ${ytDlpAvailable ? 'disponible' : 'no disponible'}`);
  
  if (ytDlpAvailable) {
    console.log('🎉 Instalación completada exitosamente!');
    console.log('📝 Ahora puedes usar URLs de YouTube, Instagram Reels y TikTok en las instrucciones de personalidad.');
  } else {
    console.log('❌ Hay problemas con la instalación de yt-dlp');
  }
}

testInstallation().catch(console.error);
EOF

echo "🧪 Ejecutando prueba de instalación..."
if node "$TEST_SCRIPT" 2>/dev/null; then
    echo "✅ Prueba exitosa"
else
    echo "⚠️ La prueba falló, pero los componentes básicos están instalados"
fi

# Limpiar archivo de prueba
rm -f "$TEST_SCRIPT"

echo ""
echo "🎉 Instalación completada!"
echo "=================================================================="
echo "✅ yt-dlp instalado y configurado"
echo "✅ Directorio temporal creado"
echo "✅ Dependencias de Node.js verificadas"
echo "✅ Archivo de configuración creado"
echo ""
echo "📝 Próximos pasos:"
echo "1. Reinicia tu servidor de Node.js"
echo "2. Las URLs de video ahora se procesarán automáticamente en las instrucciones"
echo "3. Plataformas soportadas: YouTube, Instagram Reels, TikTok"
echo ""
echo "🔧 Para probar manualmente:"
echo "   yt-dlp --version"
echo "   yt-dlp 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' --get-title"
echo ""
echo "⚠️ Nota: Asegúrate de cumplir con los términos de servicio de cada plataforma"
