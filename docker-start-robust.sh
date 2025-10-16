#!/bin/bash

# docker-start-robust.sh
# Script de inicio ultra robusto para AWS ECS

set -e  # Exit on any error

echo "🚀 Iniciando sistema completo de leads (VERSIÓN ROBUSTA)..."

# Función para logging con timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Función para verificar comandos
check_command() {
    if command -v $1 >/dev/null 2>&1; then
        log "✅ $1 disponible"
    else
        log "❌ ERROR: $1 no encontrado"
        exit 1
    fi
}

# Verificar comandos críticos
log "🔍 Verificando comandos necesarios..."
check_command node
check_command npm
check_command curl

# Mostrar información del sistema
log "📊 Información del sistema:"
log "   Node.js: $(node --version)"
log "   NPM: $(npm --version)"
log "   Working Dir: $(pwd)"
log "   Usuario: $(whoami)"
log "   Memoria: $(free -h 2>/dev/null | grep Mem | awk '{print $2}' || echo 'N/A')"

# Verificar variables de entorno críticas
log "🔍 Verificando variables de entorno..."
if [ -z "$DATABASE_URL" ]; then
    log "⚠️ WARNING: DATABASE_URL no configurada"
fi

if [ -z "$JWT_SECRET" ]; then
    log "⚠️ WARNING: JWT_SECRET no configurada"
fi

# Configurar variables de entorno para producción
export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
export PORT=5001
export HOST=0.0.0.0

log "✅ Variables configuradas:"
log "   NODE_ENV=$NODE_ENV"
log "   PORT=$PORT"
log "   HOST=$HOST"

# Crear directorios necesarios con permisos correctos
log "📁 Creando directorios..."
mkdir -p /app/temp /app/uploads /app/.next /app/whatsapp-sessions
chmod 755 /app/temp /app/uploads /app/.next /app/whatsapp-sessions

# Verificar que las dependencias estén instaladas
log "📦 Verificando dependencias..."
if [ ! -d "node_modules" ]; then
    log "📦 Instalando dependencias..."
    npm ci --production --silent
fi

# Verificar archivos críticos
log "🔍 Verificando archivos críticos..."
if [ ! -d "dist" ]; then
    log "🔨 Directorio dist no encontrado, compilando..."
    if [ -f "tsconfig.json" ]; then
        npm run build
    else
        log "❌ ERROR: No se puede compilar, tsconfig.json no encontrado"
        exit 1
    fi
fi

if [ ! -f "dist/app.js" ]; then
    log "❌ ERROR: dist/app.js no encontrado después de build"
    exit 1
fi

# Verificar que el puerto esté libre
log "🔍 Verificando puerto $PORT..."
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    log "⚠️ WARNING: Puerto $PORT ya está en uso, intentando liberar..."
    pkill -f "node.*app.js" || true
    sleep 2
fi

# Mostrar archivos disponibles
log "📋 Archivos en dist:"
ls -la dist/ | head -10

# Configurar timeout para el health check
HEALTH_CHECK_TIMEOUT=30
HEALTH_CHECK_INTERVAL=2

log "🚀 Iniciando servidor Express..."
log "🔗 Servidor estará disponible en: http://localhost:$PORT"
log "🔗 Health check en: http://localhost:$PORT/health"

# Iniciar el servidor en background
log "🚀 Ejecutando: node dist/app.js"
node dist/app.js &
SERVER_PID=$!

log "✅ Servidor iniciado con PID: $SERVER_PID"

# Función para cleanup
cleanup() {
    log "🛑 Recibida señal de terminación, limpiando..."
    if kill -0 $SERVER_PID 2>/dev/null; then
        log "🛑 Terminando servidor (PID: $SERVER_PID)..."
        kill -TERM $SERVER_PID
        wait $SERVER_PID
    fi
    exit 0
}

# Configurar trap para cleanup
trap cleanup SIGTERM SIGINT

# Esperar a que el servidor arranque con timeout
log "⏳ Esperando a que el servidor arranque (timeout: ${HEALTH_CHECK_TIMEOUT}s)..."
for i in $(seq 1 $((HEALTH_CHECK_TIMEOUT / HEALTH_CHECK_INTERVAL))); do
    sleep $HEALTH_CHECK_INTERVAL
    
    if curl -f -s --max-time 5 http://localhost:$PORT/health > /dev/null 2>&1; then
        log "✅ Servidor funcionando correctamente en puerto $PORT"
        log "✅ Health check OK"
        break
    else
        if [ $i -eq $((HEALTH_CHECK_TIMEOUT / HEALTH_CHECK_INTERVAL)) ]; then
            log "❌ ERROR: Servidor no responde después de ${HEALTH_CHECK_TIMEOUT}s"
            log "❌ Health check FAIL"
            
            # Mostrar logs del proceso para debugging
            log "📝 Últimas líneas de log del servidor:"
            if kill -0 $SERVER_PID 2>/dev/null; then
                log "📝 Servidor aún está ejecutándose, pero no responde"
            else
                log "📝 Servidor ha terminado inesperadamente"
            fi
            
            # Cleanup y exit
            cleanup
            exit 1
        fi
        log "⏳ Intento $i/$((HEALTH_CHECK_TIMEOUT / HEALTH_CHECK_INTERVAL)): esperando respuesta..."
    fi
done

# Verificar endpoints adicionales
log "🔍 Verificando endpoints adicionales..."
if curl -f -s --max-time 5 http://localhost:$PORT/ > /dev/null 2>&1; then
    log "✅ Endpoint raíz OK"
else
    log "⚠️ WARNING: Endpoint raíz no responde"
fi

# Mostrar información final
log "🎉 Servidor completamente iniciado y funcionando"
log "📊 Información final:"
log "   PID del servidor: $SERVER_PID"
log "   Puerto: $PORT"
log "   Health check: http://localhost:$PORT/health"
log "   API: http://localhost:$PORT/api/"
log ""
log "🔗 Rutas principales disponibles:"
log "   - GET  /health (AWS health check)"
log "   - GET  /api/whatsapp/get_conversations"
log "   - POST /api/whatsapp/send_message"
log "   - POST /api/leads/import_contacts"
log "   - POST /api/leads/sync_whatsapp_leads"
log "   - POST /api/leads/bulk_send"

# Mantener el servidor ejecutándose
log "🔄 Manteniendo servidor activo... (Ctrl+C para detener)"
wait $SERVER_PID
