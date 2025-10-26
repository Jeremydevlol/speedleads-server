#!/bin/bash

# docker-start-fast.sh
# Script de inicio optimizado para arranque rápido en Render

set -e

echo "⚡ INICIO RÁPIDO PARA RENDER"

# Configurar variables críticas INMEDIATAMENTE
export NODE_ENV=production
# Render proporciona PORT dinámicamente, usar 5001 como fallback
export PORT=${PORT:-5001}
export HOST=0.0.0.0

echo "🚀 Configuración:"
echo "   Puerto: $PORT"
echo "   Modo: $NODE_ENV"
echo "   PID: $$"

# Verificar archivo crítico
if [ ! -f "dist/app.js" ]; then
    echo "❌ FATAL: dist/app.js no encontrado"
    exit 1
fi

echo "✅ Archivo principal encontrado"

# Crear directorios mínimos necesarios
mkdir -p /app/temp /app/uploads >/dev/null 2>&1 || true

echo "✅ Directorios creados"

# ARRANCAR SERVIDOR INMEDIATAMENTE (sin esperas ni verificaciones complejas)
echo "🚀 ARRANCANDO SERVIDOR INMEDIATAMENTE..."
echo "⚡ Health checks disponibles en:"
echo "   - http://localhost:$PORT/health"
echo "   - http://localhost:$PORT/ping"
echo "   - http://localhost:$PORT/status"

# Ejecutar servidor con manejo de señales
cleanup() {
    echo "🛑 Terminando servidor..."
    exit 0
}

trap cleanup SIGTERM SIGINT

# INICIAR SERVIDOR SIN VERIFICACIONES PREVIAS
exec node dist/app.js
