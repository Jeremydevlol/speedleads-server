#!/bin/bash

# Script de verificación rápida para el sistema de autenticación
# Verifica que los cambios del fix de relogin funcionen correctamente

echo "🔍 VERIFICACIÓN RÁPIDA DEL SISTEMA DE AUTENTICACIÓN"
echo "=================================================="

# Verificar que el servidor esté corriendo
echo "1. Verificando que el servidor esté corriendo..."
if curl -s http://localhost:5001/health > /dev/null; then
    echo "✅ Servidor corriendo en puerto 5001"
else
    echo "❌ Servidor no está corriendo en puerto 5001"
    exit 1
fi

# Verificar endpoints críticos
echo ""
echo "2. Verificando endpoints críticos..."

# Endpoint de login
echo "   - POST /api/login"
if curl -s -X POST http://localhost:5001/api/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test"}' > /dev/null; then
    echo "   ✅ Endpoint de login responde"
else
    echo "   ❌ Endpoint de login no responde"
fi

# Endpoint de Google OAuth
echo "   - POST /api/google-auth"
if curl -s -X POST http://localhost:5001/api/google-auth \
    -H "Content-Type: application/json" \
    -d '{"token":"test","user":{"email":"test@example.com"}}' > /dev/null; then
    echo "   ✅ Endpoint de Google OAuth responde"
else
    echo "   ❌ Endpoint de Google OAuth no responde"
fi

# Endpoint de diagnóstico
echo "   - GET /api/diagnostics/profilesusers"
if curl -s -X GET http://localhost:5001/api/diagnostics/profilesusers > /dev/null; then
    echo "   ✅ Endpoint de diagnóstico responde"
else
    echo "   ❌ Endpoint de diagnóstico no responde"
fi

# Verificar configuración de cookies
echo ""
echo "3. Verificando configuración de cookies..."

# Verificar variables de entorno críticas
if [ -n "$COOKIE_DOMAIN" ]; then
    echo "   ✅ COOKIE_DOMAIN configurado: $COOKIE_DOMAIN"
else
    echo "   ⚠️  COOKIE_DOMAIN no configurado (OK para desarrollo)"
fi

if [ -n "$JWT_SECRET" ]; then
    echo "   ✅ JWT_SECRET configurado"
else
    echo "   ❌ JWT_SECRET no configurado"
fi

if [ -n "$SESSION_SECRET" ]; then
    echo "   ✅ SESSION_SECRET configurado"
else
    echo "   ❌ SESSION_SECRET no configurado"
fi

# Verificar archivos críticos
echo ""
echo "4. Verificando archivos críticos..."

files=(
    "dist/controllers/authController.js"
    "dist/routes/authRoutes.js"
    "dist/config/jwt.js"
    "CONFIGURACION_PRODUCCION.md"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file existe"
    else
        echo "   ❌ $file no existe"
    fi
done

# Verificar funciones críticas en el código
echo ""
echo "5. Verificando funciones críticas..."

# Verificar getUserIdFromToken mejorado
if grep -q "req.cookies && req.cookies.auth_token" dist/controllers/authController.js; then
    echo "   ✅ getUserIdFromToken busca en cookies"
else
    echo "   ❌ getUserIdFromToken no busca en cookies"
fi

# Verificar endpoint de diagnóstico
if grep -q "diagnosProfilesusers" dist/routes/authRoutes.js; then
    echo "   ✅ Endpoint de diagnóstico configurado"
else
    echo "   ❌ Endpoint de diagnóstico no configurado"
fi

# Verificar manejo robusto de profilesusers
if grep -q "no crítico" dist/controllers/authController.js; then
    echo "   ✅ Manejo robusto de profilesusers implementado"
else
    echo "   ❌ Manejo robusto de profilesusers no implementado"
fi

echo ""
echo "=================================================="
echo "✅ VERIFICACIÓN COMPLETA"
echo ""
echo "🚀 Para probar el fix completo:"
echo "1. Haz login con Google o email"
echo "2. Verifica que no necesites relogin"
echo "3. Revisa los logs para ver mensajes de diagnóstico"
echo "4. Usa /api/diagnostics/profilesusers si hay problemas"
echo ""
echo "📚 Documentación completa: CONFIGURACION_PRODUCCION.md"
