#!/bin/bash

echo "🚀 Generando archivo .env para PRODUCCIÓN..."

# Generar .env para producción basado en el actual
sed "s/NODE_ENV=development/NODE_ENV=production/" .env | \
sed "s|FRONTEND_URL=http://localhost:3000|FRONTEND_URL=https://app.uniclick.io|" | \
sed "s/# COOKIE_DOMAIN=.uniclick.io/COOKIE_DOMAIN=.uniclick.io/" | \
sed "s/# SESSION_DOMAIN=.uniclick.io/SESSION_DOMAIN=.uniclick.io/" | \
sed "s/# BACKEND_URL=https://api.uniclick.io/BACKEND_URL=https://api.uniclick.io/" > .env.production

echo "✅ Archivo .env.production generado"
echo ""
echo "🔧 Para usar en producción:"
echo "1. Copia el contenido de .env.production"
echo "2. Reemplaza tu .env en el servidor de producción"
echo "3. Redeploya tu aplicación"
echo ""
echo "📄 Contenido del archivo .env.production:"
echo "======================================="
cat .env.production 