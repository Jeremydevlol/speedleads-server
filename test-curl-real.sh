#!/bin/bash

echo "🚀 TEST REAL CON cURL - Transcripción de YouTube"
echo "==============================================="
echo ""

# Datos reales
TOKEN="eyJhbGciOiJIUzI1NiIsImtpZCI6Ik55eUJueVpCL3h0LzdJUnMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2puenNhYmhiZm5pdmRpY2VvZWZnLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJjYjQxNzFlOS1hMjAwLTQxNDctYjhjMS0yY2M0NzIxMTM3NWIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU5ODczNzQ2LCJpYXQiOjE3NTk4NzAxNDYsImVtYWlsIjoiMjAyNUBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoiMjAyNUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZnVsbF9uYW1lIjoiZGRzIiwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJjYjQxNzFlOS1hMjAwLTQxNDctYjhjMS0yY2M0NzIxMTM3NWIiLCJ1c2VybmFtZSI6InNkZHMifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc1OTg3MDE0Nn1dLCJzZXNzaW9uX2lkIjoiN2IyMmY2ZjYtMTgzYy00NzYxLTliM2YtOTg4NTk1MWJmZmZmIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.l_YpWCK75fD1rGGjaXduDw_zpDH-XmHMatK_fxfDdz0"
PERSONALITY_ID="856"
VIDEO_URL="https://youtu.be/T_KNzWdzsok"

echo "📋 Datos de la prueba:"
echo "====================="
echo "🎬 Video: $VIDEO_URL"
echo "🤖 Personality ID: $PERSONALITY_ID"
echo "🔑 Token: ${TOKEN:0:50}..."
echo ""

echo "🚀 Ejecutando cURL..."
echo "===================="

curl -X POST http://localhost:5001/api/personalities/instructions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"personalityId\": \"$PERSONALITY_ID\",
    \"instruction\": \"Analiza este video de YouTube y transcribe todo su contenido\",
    \"media\": [
      {
        \"url\": \"$VIDEO_URL\",
        \"type\": \"video_url\",
        \"platform\": \"youtube\",
        \"filename\": \"youtube_test_transcription\"
      }
    ]
  }" \
  -w "\n\n📊 Status: %{http_code}\n⏱️ Tiempo: %{time_total}s\n" \
  -s

echo ""
echo "🎯 SI FUNCIONA CORRECTAMENTE VERÁS:"
echo "==================================="
echo "✅ Status: 200"
echo "✅ success: true"
echo "✅ instructionId: [uuid]"
echo "✅ extractedTexts: [transcripción completa]"
echo "✅ videoProcessing.success: true"
echo ""

echo "📝 Y en el frontend aparecerá:"
echo "=============================="
echo "- La instrucción con la transcripción completa"
echo "- Las instrucciones procesadas por IA"
echo "- Todo el contenido del video analizado"
echo ""

echo "🎉 ¡Probando transcripción automática en tiempo real!"
