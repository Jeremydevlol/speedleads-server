#!/bin/bash

echo "🧪 TEST COMPLETO CON cURL - Transcripción de Video"
echo "================================================="
echo ""

# Verificar que el servidor esté corriendo
echo "🔍 Verificando servidor..."
if ! curl -s http://localhost:5001/health > /dev/null 2>&1; then
    echo "❌ Servidor no está corriendo en puerto 5001"
    echo "💡 Inicia el servidor con: npm start"
    exit 1
fi

echo "✅ Servidor corriendo"
echo ""

# URL del video a probar
VIDEO_URL="https://youtu.be/T_KNzWdzsok"
echo "📋 URL a procesar: $VIDEO_URL"
echo ""

# Necesitas reemplazar estos valores:
echo "⚠️ IMPORTANTE: Necesitas reemplazar estos valores:"
echo "   - TU_TOKEN_JWT: Token de autenticación válido"
echo "   - TU_PERSONALITY_ID: UUID de tu personalidad"
echo ""

# Comando cURL completo
echo "📝 Comando cURL a ejecutar:"
echo "=========================="
cat << 'EOF'
curl -X POST http://localhost:5001/api/personalities/instructions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_JWT_AQUI" \
  -d '{
    "personalityId": "TU_PERSONALITY_ID_AQUI",
    "instruction": "Analiza este video de YouTube",
    "media": [
      {
        "url": "https://youtu.be/T_KNzWdzsok",
        "type": "video_url",
        "platform": "youtube",
        "filename": "youtube_test_video"
      }
    ]
  }' \
  -v
EOF

echo ""
echo ""
echo "🎯 LO QUE DEBERÍA PASAR:"
echo "======================="
echo "1. 🔍 El sistema detectará que es un video de YouTube"
echo "2. 📥 Descargará el video usando yt-dlp"
echo "3. 🎵 Extraerá el audio con ffmpeg"
echo "4. 🎤 Transcribirá con OpenAI Whisper"
echo "5. 🤖 Procesará la transcripción con IA"
echo "6. ☁️ Intentará subir a Supabase (puede fallar)"
echo "7. 💾 Guardará en base de datos con transcripción completa"
echo "8. ✅ Responderá con éxito"

echo ""
echo "📊 RESPUESTA ESPERADA:"
echo "====================="
cat << 'EOF'
{
  "success": true,
  "instructionId": "uuid-de-la-instruccion",
  "extractedTexts": [
    "Video de youtube:\nTítulo: BORRARÉ ESTE VÍDEO EN 24 HORAS 😔\n...\n--- INSTRUCCIONES PROCESADAS ---\n[Instrucciones estructuradas por IA]\n--- FIN DE INSTRUCCIONES ---"
  ],
  "videoProcessing": {
    "success": true,
    "processedCount": 1,
    "videos": [
      {
        "platform": "youtube",
        "originalUrl": "https://youtu.be/T_KNzWdzsok",
        "filename": "video_timestamp_title.mp4",
        "title": "BORRARÉ ESTE VÍDEO EN 24 HORAS 😔"
      }
    ]
  }
}
EOF

echo ""
echo "🔧 PARA OBTENER TOKEN Y PERSONALITY_ID:"
echo "======================================="
echo "1. Ve al frontend en http://localhost:3000"
echo "2. Abre DevTools (F12)"
echo "3. Console → localStorage.getItem('token')"
echo "4. Ve a una personalidad → URL contiene el personalityId"
echo ""

echo "🚀 EJEMPLO CON VALORES REALES:"
echo "=============================="
echo "Reemplaza TU_TOKEN_JWT_AQUI y TU_PERSONALITY_ID_AQUI con valores reales"
echo "y ejecuta el comando cURL"
echo ""

echo "✅ ¡El sistema está listo para transcribir automáticamente!"
