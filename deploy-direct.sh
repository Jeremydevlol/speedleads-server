#!/bin/bash

# Script de despliegue directo sin Docker
set -e

echo "🚀 Iniciando despliegue directo para producción..."

# Variables
PROJECT_NAME="uniclick-api"
BACKUP_DIR="backup-$(date +%Y%m%d-%H%M%S)"

echo "📦 Preparando archivos para despliegue..."

# Crear directorio de backup
mkdir -p $BACKUP_DIR

# Verificar que el servidor esté funcionando
echo "🔍 Verificando servidor local..."
if curl -f http://localhost:5001/api/health > /dev/null 2>&1; then
    echo "✅ Servidor local funcionando correctamente"
else
    echo "❌ Servidor local no está funcionando"
    exit 1
fi

# Crear archivo de configuración de producción
echo "⚙️ Creando configuración de producción..."
cat > .env.production << EOF
NODE_ENV=production
PORT=5001
HOST=0.0.0.0
JWT_SECRET=${JWT_SECRET:-clave-secreta-de-produccion}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
OPENAI_API_KEY=${OPENAI_API_KEY}
EOF

echo "📋 Archivos listos para despliegue:"
echo "   - Código compilado: dist/"
echo "   - Configuración: .env.production"
echo "   - Scripts: docker-start-*.sh"

echo ""
echo "🎯 Para desplegar en ECS:"
echo "   1. Sube estos archivos a tu servidor ECS:"
echo "      - dist/ (directorio completo)"
echo "      - package.json"
echo "      - .env.production"
echo "      - docker-start-fast.sh"
echo ""
echo "   2. En el servidor ECS, ejecuta:"
echo "      npm install --production"
echo "      node dist/app.js"
echo ""
echo "   3. Verifica que funcione:"
echo "      curl http://localhost:5001/api/health"
echo ""
echo "✅ Despliegue preparado exitosamente"
