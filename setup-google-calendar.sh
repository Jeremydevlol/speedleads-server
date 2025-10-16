#!/bin/bash
# setup-google-calendar.sh

echo "🔧 Configurando Google Calendar Integration..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para mostrar mensajes
log_info() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 1. Verificar variables de entorno
echo "📋 Verificando variables de entorno..."

if [ -z "$GOOGLE_CLIENT_ID" ]; then
    log_error "GOOGLE_CLIENT_ID no está configurado"
    echo "   Configura tu Google Client ID en el archivo .env"
    exit 1
fi

if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    log_error "GOOGLE_CLIENT_SECRET no está configurado"
    echo "   Configura tu Google Client Secret en el archivo .env"
    exit 1
fi

log_info "Variables de Google OAuth configuradas"

# 2. Verificar conexión a base de datos
echo "🔌 Verificando conexión a base de datos..."

if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL no está configurado"
    exit 1
fi

# Intentar conectar a la base de datos
if command -v psql &> /dev/null; then
    if psql "$DATABASE_URL" -c "SELECT 1;" &> /dev/null; then
        log_info "Conexión a base de datos exitosa"
    else
        log_error "No se pudo conectar a la base de datos"
        exit 1
    fi
else
    log_warn "psql no está instalado, saltando verificación de conexión"
fi

# 3. Aplicar migración de base de datos
echo "📊 Aplicando migración de base de datos..."

MIGRATION_FILE="db/migrations/2025-01-23_google_calendar_complete.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    log_error "Archivo de migración no encontrado: $MIGRATION_FILE"
    exit 1
fi

if command -v psql &> /dev/null; then
    if psql "$DATABASE_URL" -f "$MIGRATION_FILE"; then
        log_info "Migración aplicada correctamente"
    else
        log_error "Error aplicando migración"
        exit 1
    fi
else
    log_warn "psql no disponible, aplica manualmente el archivo: $MIGRATION_FILE"
fi

# 4. Verificar instalación de dependencias
echo "📦 Verificando dependencias de Node.js..."

if [ ! -f "package.json" ]; then
    log_error "package.json no encontrado"
    exit 1
fi

# Verificar que las dependencias de Google estén instaladas
if npm list googleapis &> /dev/null; then
    log_info "googleapis instalado"
else
    log_warn "googleapis no está instalado, ejecutando npm install..."
    npm install
fi

if npm list google-auth-library &> /dev/null; then
    log_info "google-auth-library instalado"
else
    log_warn "google-auth-library no está instalado, ejecutando npm install..."
    npm install
fi

# 5. Compilar TypeScript
echo "🔨 Compilando TypeScript..."

if [ -f "tsconfig.json" ]; then
    if npm run build; then
        log_info "Compilación exitosa"
    else
        log_error "Error en compilación"
        exit 1
    fi
else
    log_warn "tsconfig.json no encontrado, saltando compilación"
fi

# 6. Verificar configuración de webhooks
echo "🌐 Verificando configuración de webhooks..."

if [ "$ENABLE_GCAL_WEBHOOKS" = "true" ]; then
    if [ -z "$PUBLIC_BASE_URL" ]; then
        log_warn "PUBLIC_BASE_URL no configurada - webhooks deshabilitados"
        echo "   Para habilitar webhooks en desarrollo:"
        echo "   1. Instala Cloudflare Tunnel: npm install -g cloudflared"
        echo "   2. Ejecuta: cloudflared tunnel --url http://localhost:5001"
        echo "   3. Copia la URL HTTPS y configúrala como PUBLIC_BASE_URL"
    else
        log_info "Configuración de webhooks lista"
        echo "   Webhook URL: $PUBLIC_BASE_URL/webhooks/google/calendar"
    fi
else
    log_info "Webhooks deshabilitados (ENABLE_GCAL_WEBHOOKS=false)"
fi

# 7. Crear archivo de configuración de ejemplo si no existe
if [ ! -f ".env.example" ]; then
    echo "📝 Creando archivo de configuración de ejemplo..."
    cat > .env.example << 'EOF'
# ===================================
# GOOGLE OAUTH Y CALENDAR
# ===================================
GOOGLE_CLIENT_ID=tu-google-client-id
GOOGLE_CLIENT_SECRET=tu-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5001/api/auth/google/calendar/callback

# ===================================
# WEBHOOKS DE GOOGLE CALENDAR
# ===================================
PUBLIC_BASE_URL=https://tu-tunel.trycloudflare.com
ENABLE_GCAL_WEBHOOKS=true
GOOGLE_CALENDAR_WEBHOOK_PATH=/webhooks/google/calendar
EOF
    log_info "Archivo .env.example creado"
fi

# 8. Mostrar resumen final
echo ""
echo "🎉 ¡Configuración de Google Calendar completada!"
echo ""
echo "📋 Pasos siguientes:"
echo "   1. Asegúrate de que todas las variables de entorno estén configuradas"
echo "   2. Para webhooks, configura PUBLIC_BASE_URL con una URL HTTPS"
echo "   3. Ejecuta 'npm start' para iniciar el servidor"
echo "   4. Visita /api/auth/google/calendar/connect?userId=UUID para conectar una cuenta"
echo ""

if [ "$ENABLE_GCAL_WEBHOOKS" = "true" ] && [ -n "$PUBLIC_BASE_URL" ]; then
    echo "🔗 URLs importantes:"
    echo "   OAuth Callback: $PUBLIC_BASE_URL/api/auth/google/calendar/callback"
    echo "   Webhook URL: $PUBLIC_BASE_URL/webhooks/google/calendar"
    echo ""
fi

log_info "¡Configuración completada exitosamente!"

