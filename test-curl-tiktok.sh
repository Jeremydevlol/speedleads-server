#!/bin/bash

echo "🧪 Test con cURL - Transcripción de TikTok"
echo "=========================================="
echo ""

# URL del TikTok a probar
TIKTOK_URL="https://www.tiktok.com/@ac2ality/video/7558465231140244749?q=ac2ality&t=1759865659452"

echo "📋 URL a procesar: $TIKTOK_URL"
echo ""

# Verificar que el servidor esté corriendo
echo "🔍 Verificando servidor..."
SERVER_URL="http://localhost:5001"

if curl -s "$SERVER_URL/health" > /dev/null 2>&1; then
    echo "✅ Servidor corriendo en $SERVER_URL"
else
    echo "❌ Servidor no está corriendo en $SERVER_URL"
    echo "💡 Inicia el servidor con: npm start"
    exit 1
fi

echo ""
echo "🔐 Necesitas un token JWT válido para hacer la prueba"
echo "💡 Puedes obtenerlo desde:"
echo "   - El frontend (localStorage o cookies)"
echo "   - Hacer login primero"
echo ""

# Ejemplo de request (necesita token real)
echo "📝 Comando cURL de ejemplo:"
echo "=========================="
cat << 'EOF'
curl -X POST http://localhost:5001/api/personalities/instructions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_JWT_AQUI" \
  -d '{
    "personalityId": "tu-personality-id-uuid",
    "instruction": "Analiza este TikTok y aprende de todo lo que dice",
    "media": [
      {
        "url": "https://www.tiktok.com/@ac2ality/video/7558465231140244749?q=ac2ality&t=1759865659452",
        "type": "video_url",
        "filename": "tiktok_ac2ality_test"
      }
    ]
  }'
EOF

echo ""
echo ""
echo "🎯 Lo que pasará cuando ejecutes el comando:"
echo "==========================================="
echo "1. 🔍 El sistema detectará que es un TikTok válido"
echo "2. 📥 Descargará el video usando yt-dlp"
echo "3. 🎵 Extraerá el audio con ffmpeg"
echo "4. 🎤 Enviará el audio a OpenAI Whisper para transcripción"
echo "5. 📝 Creará una instrucción con TODO el texto hablado"
echo "6. 💾 Guardará en la base de datos como media"
echo "7. 🤖 La IA aprenderá de la transcripción completa"

echo ""
echo "📊 Respuesta esperada:"
echo "====================="
cat << 'EOF'
{
  "success": true,
  "instructionId": "uuid-de-la-instruccion",
  "extractedTexts": [
    "Video de tiktok:\nTítulo: [Título real]\n...\n--- TRANSCRIPCIÓN DEL AUDIO ---\n[Todo lo que se dice en el video]\n--- FIN DE TRANSCRIPCIÓN ---"
  ],
  "videoProcessing": {
    "success": true,
    "processedCount": 1,
    "videos": [
      {
        "platform": "tiktok",
        "originalUrl": "https://www.tiktok.com/@ac2ality/video/7558465231140244749",
        "filename": "video_timestamp_title.mp4",
        "title": "[Título del TikTok]",
        "duration": 30
      }
    ]
  }
}
EOF

echo ""
echo "🔧 Para hacer la prueba real:"
echo "============================"
echo "1. Obtén un token JWT válido"
echo "2. Obtén un personalityId válido"
echo "3. Reemplaza TU_TOKEN_JWT_AQUI y tu-personality-id-uuid"
echo "4. Ejecuta el comando cURL"
echo "5. Verifica en la base de datos que se guardó la transcripción"

echo ""
echo "🎉 ¡El sistema está listo para transcribir automáticamente!"
