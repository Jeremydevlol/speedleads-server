#!/bin/bash

# Script de inicio rápido para el sistema de WhatsApp
# Colores para la consola
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Iniciando Sistema de WhatsApp...${NC}\n"

# Función para mostrar mensajes de estado
show_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

show_error() {
    echo -e "${RED}❌ $1${NC}"
}

show_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

show_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Verificar si Node.js está instalado
if ! command -v node &> /dev/null; then
    show_error "Node.js no está instalado. Por favor, instálalo primero."
    exit 1
fi

show_status "Node.js encontrado: $(node --version)"

# Verificar si npm está instalado
if ! command -v npm &> /dev/null; then
    show_error "npm no está instalado. Por favor, instálalo primero."
    exit 1
fi

show_status "npm encontrado: $(npm --version)"

# Verificar si el archivo package.json existe
if [ ! -f "package.json" ]; then
    show_error "package.json no encontrado. Asegúrate de estar en el directorio correcto."
    exit 1
fi

# Verificar si node_modules existe
if [ ! -d "node_modules" ]; then
    show_warning "node_modules no encontrado. Instalando dependencias..."
    npm install
    if [ $? -eq 0 ]; then
        show_status "Dependencias instaladas correctamente"
    else
        show_error "Error instalando dependencias"
        exit 1
    fi
else
    show_status "Dependencias ya instaladas"
fi

# Verificar archivo .env
if [ ! -f ".env" ]; then
    show_warning "Archivo .env no encontrado"
    echo -e "${YELLOW}Por favor, crea un archivo .env con las siguientes variables:${NC}"
    echo "DATABASE_URL=postgresql://user:password@localhost:5432/database"
    echo "JWT_SECRET=your-jwt-secret"
    echo "SUPABASE_URL=https://your-project.supabase.co"
    echo "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
    echo ""
    read -p "¿Deseas continuar sin .env? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    show_status "Archivo .env encontrado"
fi

# Verificar si el directorio dist existe
if [ ! -d "dist" ]; then
    show_warning "Directorio dist no encontrado. Compilando TypeScript..."
    if [ -f "tsconfig.json" ]; then
        npm run build
        if [ $? -eq 0 ]; then
            show_status "Compilación completada"
        else
            show_error "Error en la compilación"
            exit 1
        fi
    else
        show_error "tsconfig.json no encontrado. No se puede compilar."
        exit 1
    fi
else
    show_status "Directorio dist encontrado"
fi

# Verificar archivos críticos
critical_files=(
    "dist/app.js"
    "dist/services/whatsappService.js"
    "dist/controllers/whatsappController.js"
    "dist/routes/whatsappRoutes.js"
)

missing_files=()
for file in "${critical_files[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -gt 0 ]; then
    show_error "Archivos críticos faltantes:"
    for file in "${missing_files[@]}"; do
        echo "  - $file"
    done
    exit 1
fi

show_status "Todos los archivos críticos están presentes"

# Verificar puerto disponible
PORT=${PORT:-5001}
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    show_warning "Puerto $PORT ya está en uso"
    read -p "¿Deseas usar otro puerto? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Ingresa el nuevo puerto: " new_port
        PORT=$new_port
        export PORT=$PORT
    else
        show_error "No se puede continuar. Puerto $PORT ocupado."
        exit 1
    fi
fi

# Verificar base de datos
show_info "Verificando conexión a la base de datos..."
if [ -f "check-db.js" ]; then
    node check-db.js
    if [ $? -eq 0 ]; then
        show_status "Conexión a la base de datos exitosa"
    else
        show_warning "Problemas con la base de datos. El sistema puede no funcionar correctamente."
    fi
else
    show_warning "Script check-db.js no encontrado. No se puede verificar la base de datos."
fi

# Mostrar información del sistema
echo ""
show_info "Información del sistema:"
echo "  - Puerto: $PORT"
echo "  - Entorno: ${NODE_ENV:-development}"
echo "  - Directorio: $(pwd)"
echo "  - Usuario: $(whoami)"
echo "  - Fecha: $(date)"

# Opciones de inicio
echo ""
echo -e "${BLUE}📋 Opciones de inicio:${NC}"
echo "1. Iniciar servidor en primer plano"
echo "2. Iniciar servidor en segundo plano"
echo "3. Ejecutar verificación del sistema"
echo "4. Ejecutar pruebas de WhatsApp"
echo "5. Salir"

read -p "Selecciona una opción (1-5): " choice

case $choice in
    1)
        echo ""
        show_info "Iniciando servidor en primer plano..."
        show_info "Presiona Ctrl+C para detener el servidor"
        echo ""
        node dist/app.js
        ;;
    2)
        echo ""
        show_info "Iniciando servidor en segundo plano..."
        nohup node dist/app.js > whatsapp-server.log 2>&1 &
        server_pid=$!
        echo $server_pid > whatsapp-server.pid
        show_status "Servidor iniciado con PID: $server_pid"
        show_info "Logs guardados en: whatsapp-server.log"
        show_info "Para detener: kill $server_pid"
        ;;
    3)
        echo ""
        show_info "Ejecutando verificación del sistema..."
        if [ -f "verify-whatsapp-setup.js" ]; then
            node verify-whatsapp-setup.js
        else
            show_error "Script de verificación no encontrado"
        fi
        ;;
    4)
        echo ""
        show_info "Ejecutando pruebas de WhatsApp..."
        if [ -f "test-whatsapp-complete.js" ]; then
            show_warning "Asegúrate de tener un token JWT válido en el archivo de prueba"
            node test-whatsapp-complete.js
        else
            show_error "Script de pruebas no encontrado"
        fi
        ;;
    5)
        echo ""
        show_info "Saliendo..."
        exit 0
        ;;
    *)
        show_error "Opción inválida"
        exit 1
        ;;
esac

echo ""
show_info "Para más información, consulta:"
echo "  - WHATSAPP_IMPLEMENTATION_GUIDE.md"
echo "  - verify-whatsapp-setup.js"
echo "  - test-whatsapp-complete.js"

echo ""
show_status "¡Sistema de WhatsApp listo! 🎉"
