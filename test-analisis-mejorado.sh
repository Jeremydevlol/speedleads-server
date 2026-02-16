#!/bin/bash

echo "🤖 TEST ANÁLISIS MEJORADO - IA más Natural"
echo "=========================================="
echo ""

# Datos reales
TOKEN="eyJhbGciOiJIUzI1NiIsImtpZCI6Ik55eUJueVpCL3h0LzdJUnMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2puenNhYmhiZm5pdmRpY2VvZWZnLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJjYjQxNzFlOS1hMjAwLTQxNDctYjhjMS0yY2M0NzIxMTM3NWIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU5ODczNzQ2LCJpYXQiOjE3NTk4NzAxNDYsImVtYWlsIjoiMjAyNUBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoiMjAyNUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZnVsbF9uYW1lIjoiZGRzIiwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJjYjQxNzFlOS1hMjAwLTQxNDctYjhjMS0yY2M0NzIxMTM3NWIiLCJ1c2VybmFtZSI6InNkZHMifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc1OTg3MDE0Nn1dLCJzZXNzaW9uX2lkIjoiN2IyMmY2ZjYtMTgzYy00NzYxLTliM2YtOTg4NTk1MWJmZmZmIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.l_YpWCK75fD1rGGjaXduDw_zpDH-XmHMatK_fxfDdz0"
PERSONALITY_ID="856"

# Probar con el mismo video para ver la diferencia
VIDEO_URL="https://youtu.be/T_KNzWdzsok"

echo "📋 Probando análisis mejorado:"
echo "=============================="
echo "🎬 Video: $VIDEO_URL"
echo "🤖 Personality ID: $PERSONALITY_ID"
echo ""

echo "🚀 Ejecutando con IA mejorada..."
echo "================================"

curl -X POST http://localhost:5001/api/personalities/instructions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"personalityId\": \"$PERSONALITY_ID\",
    \"instruction\": \"Analiza este video y dime de qué trata\",
    \"media\": [
      {
        \"url\": \"$VIDEO_URL\",
        \"type\": \"video_url\",
        \"platform\": \"youtube\",
        \"filename\": \"test_analisis_mejorado\"
      }
    ]
  }" \
  -w "\n\n📊 Status: %{http_code}\n⏱️ Tiempo: %{time_total}s\n" \
  -s

echo ""
echo "🎯 AHORA DEBERÍAS VER:"
echo "====================="
echo "❌ ANTES: 'El video contiene instrucciones sobre...'"
echo "✅ AHORA: 'Este video trata sobre un youtuber que...'"
echo ""
echo "❌ ANTES: Listas formales con viñetas"
echo "✅ AHORA: Explicación natural y conversacional"
echo ""
echo "🎉 ¡Análisis más inteligente y natural!"
