#!/bin/bash

# docker-start.sh
# Script de inicio para Docker con soporte completo de leads

echo "🚀 Iniciando sistema completo de leads..."

# Verificar variables de entorno críticas
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️ WARNING: DATABASE_URL no configurada"
fi

if [ -z "$JWT_SECRET" ]; then
    echo "⚠️ WARNING: JWT_SECRET no configurada"
fi

# Crear directorios necesarios si no existen
mkdir -p /app/temp
mkdir -p /app/uploads
mkdir -p /app/.next
chmod 777 /app/temp /app/uploads /app/.next

# Verificar que las dependencias estén instaladas
echo "📦 Verificando dependencias..."
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
fi

# Compilar TypeScript si es necesario
if [ -f "tsconfig.json" ] && [ ! -d "dist" ]; then
    echo "🔨 Compilando TypeScript..."
    npm run build
fi

# Verificar que el directorio dist existe
if [ ! -d "dist" ]; then
    echo "❌ ERROR: Directorio dist no encontrado. Ejecutar npm run build primero."
    exit 1
fi

# Verificar archivos críticos
if [ ! -f "dist/app.js" ]; then
    echo "❌ ERROR: dist/app.js no encontrado"
    exit 1
fi

# Mostrar información del sistema
echo "📊 Información del sistema:"
echo "   Node.js: $(node --version)"
echo "   NPM: $(npm --version)"
echo "   Working Dir: $(pwd)"
echo "   Puerto configurado: $PORT"
echo "   Files in dist: $(ls -la dist/ | head -5)"

# Verificar que el puerto esté libre
echo "🔍 Verificando puerto $PORT..."
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️ WARNING: Puerto $PORT ya está en uso"
else
    echo "✅ Puerto $PORT disponible"
fi

# Configurar variables de entorno para producción
export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
export PORT=5001

# Iniciar el servidor principal
echo "🚀 Iniciando servidor Express en puerto 5001 (AWS ECS)..."
echo "📱 WhatsApp, Leads, y todas las funcionalidades disponibles"
echo "🔗 Rutas disponibles:"
echo "   - POST /api/leads/import_contacts"
echo "   - POST /api/leads/sync_whatsapp_leads" 
echo "   - POST /api/leads/sync_columns"
echo "   - POST /api/leads/bulk_send"
echo "   - POST /api/leads/move"
echo "   - GET  /api/whatsapp/get_conversations"
echo "   - POST /api/whatsapp/send_message"

# Ejecutar el servidor con verificación
echo "🚀 Ejecutando: node dist/app.js"
echo "🔗 Health check disponible en: http://localhost:$PORT/health"
echo "🔗 API disponible en: http://localhost:$PORT/api/"

# Iniciar el servidor en background para poder hacer verificaciones
node dist/app.js &
SERVER_PID=$!

# Esperar un momento para que el servidor arranque
sleep 5

# Verificar que el servidor esté respondiendo
echo "🔍 Verificando que el servidor esté funcionando..."
if curl -f -s http://localhost:$PORT/health > /dev/null; then
    echo "✅ Servidor funcionando correctamente en puerto $PORT"
    echo "✅ Health check OK"
else
    echo "❌ ERROR: Servidor no responde en puerto $PORT"
    echo "❌ Health check FAIL"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# Traer el servidor al foreground
wait $SERVER_PID
