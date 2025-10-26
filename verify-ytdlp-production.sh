#!/bin/bash

echo "🔍 VERIFICACIÓN DE YT-DLP EN PRODUCCIÓN"
echo "========================================"
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para verificar en Docker
verify_docker() {
    echo "🐳 Verificando en contenedor Docker..."
    
    CONTAINER_NAME=$1
    if [ -z "$CONTAINER_NAME" ]; then
        echo -e "${YELLOW}⚠️  Nombre de contenedor no proporcionado${NC}"
        echo "💡 Uso: $0 docker <nombre-contenedor>"
        return 1
    fi
    
    echo "   📦 Contenedor: $CONTAINER_NAME"
    echo ""
    
    # Verificar que el contenedor existe
    if ! docker ps | grep -q "$CONTAINER_NAME"; then
        echo -e "${RED}❌ Contenedor '$CONTAINER_NAME' no está corriendo${NC}"
        echo ""
        echo "Contenedores disponibles:"
        docker ps --format "table {{.Names}}\t{{.Status}}"
        return 1
    fi
    
    echo "1. Verificando Python..."
    if docker exec "$CONTAINER_NAME" python3 --version 2>/dev/null; then
        echo -e "${GREEN}   ✅ Python disponible${NC}"
    else
        echo -e "${RED}   ❌ Python no disponible${NC}"
        return 1
    fi
    echo ""
    
    echo "2. Verificando pip..."
    if docker exec "$CONTAINER_NAME" /opt/venv/bin/pip --version 2>/dev/null; then
        echo -e "${GREEN}   ✅ pip disponible${NC}"
    else
        echo -e "${RED}   ❌ pip no disponible${NC}"
        return 1
    fi
    echo ""
    
    echo "3. Verificando yt-dlp..."
    if docker exec "$CONTAINER_NAME" yt-dlp --version 2>/dev/null; then
        VERSION=$(docker exec "$CONTAINER_NAME" yt-dlp --version 2>/dev/null)
        echo -e "${GREEN}   ✅ yt-dlp instalado: versión $VERSION${NC}"
    else
        echo -e "${RED}   ❌ yt-dlp no está instalado${NC}"
        echo ""
        echo "💡 Solución:"
        echo "   docker exec $CONTAINER_NAME /opt/venv/bin/pip install yt-dlp"
        return 1
    fi
    echo ""
    
    echo "4. Verificando ffmpeg..."
    if docker exec "$CONTAINER_NAME" which ffmpeg 2>/dev/null; then
        echo -e "${GREEN}   ✅ ffmpeg disponible${NC}"
    else
        echo -e "${YELLOW}   ⚠️  ffmpeg no encontrado${NC}"
    fi
    echo ""
    
    echo "5. Verificando PATH..."
    VENV_PATH=$(docker exec "$CONTAINER_NAME" echo '$PATH' 2>/dev/null | grep "/opt/venv/bin")
    if [ ! -z "$VENV_PATH" ]; then
        echo -e "${GREEN}   ✅ /opt/venv/bin está en el PATH${NC}"
    else
        echo -e "${YELLOW}   ⚠️  /opt/venv/bin podría no estar en el PATH${NC}"
        echo "   PATH actual:"
        docker exec "$CONTAINER_NAME" echo '$PATH'
    fi
    echo ""
    
    echo "6. Probando descarga de metadatos de YouTube..."
    TEST_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    if docker exec "$CONTAINER_NAME" yt-dlp --get-title "$TEST_URL" 2>/dev/null; then
        echo -e "${GREEN}   ✅ yt-dlp puede conectarse a YouTube${NC}"
    else
        echo -e "${RED}   ❌ Error conectándose a YouTube${NC}"
        return 1
    fi
    echo ""
    
    echo "7. Verificando directorio temporal..."
    if docker exec "$CONTAINER_NAME" ls -la /app/temp_downloads 2>/dev/null; then
        echo -e "${GREEN}   ✅ Directorio temporal existe${NC}"
    else
        echo -e "${YELLOW}   ⚠️  Directorio temporal no existe (se creará automáticamente)${NC}"
    fi
    echo ""
    
    echo -e "${GREEN}🎉 VERIFICACIÓN EXITOSA - yt-dlp está funcionando correctamente${NC}"
    return 0
}

# Función para verificar en servidor local
verify_local() {
    echo "💻 Verificando en servidor local..."
    echo ""
    
    echo "1. Verificando Python..."
    if python3 --version 2>/dev/null; then
        echo -e "${GREEN}   ✅ Python disponible${NC}"
    else
        echo -e "${RED}   ❌ Python no disponible${NC}"
        return 1
    fi
    echo ""
    
    echo "2. Verificando pip..."
    if pip3 --version 2>/dev/null; then
        echo -e "${GREEN}   ✅ pip disponible${NC}"
    else
        echo -e "${RED}   ❌ pip no disponible${NC}"
        return 1
    fi
    echo ""
    
    echo "3. Verificando yt-dlp..."
    if yt-dlp --version 2>/dev/null; then
        VERSION=$(yt-dlp --version 2>/dev/null)
        echo -e "${GREEN}   ✅ yt-dlp instalado: versión $VERSION${NC}"
    else
        echo -e "${RED}   ❌ yt-dlp no está instalado${NC}"
        echo ""
        echo "💡 Solución:"
        echo "   pip3 install --upgrade yt-dlp"
        return 1
    fi
    echo ""
    
    echo "4. Verificando ffmpeg..."
    if which ffmpeg 2>/dev/null; then
        echo -e "${GREEN}   ✅ ffmpeg disponible${NC}"
    else
        echo -e "${YELLOW}   ⚠️  ffmpeg no encontrado${NC}"
    fi
    echo ""
    
    echo "5. Probando descarga de metadatos de YouTube..."
    TEST_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    if yt-dlp --get-title "$TEST_URL" 2>/dev/null; then
        echo -e "${GREEN}   ✅ yt-dlp puede conectarse a YouTube${NC}"
    else
        echo -e "${RED}   ❌ Error conectándose a YouTube${NC}"
        return 1
    fi
    echo ""
    
    echo "6. Verificando directorio temporal..."
    if [ -d "./temp_downloads" ]; then
        echo -e "${GREEN}   ✅ Directorio temporal existe${NC}"
        echo "   Archivos: $(ls -1 ./temp_downloads 2>/dev/null | wc -l)"
    else
        echo -e "${YELLOW}   ⚠️  Directorio temporal no existe (se creará automáticamente)${NC}"
    fi
    echo ""
    
    echo -e "${GREEN}🎉 VERIFICACIÓN EXITOSA - yt-dlp está funcionando correctamente${NC}"
    return 0
}

# Función para verificar en ECS
verify_ecs() {
    echo "☁️  Verificando en AWS ECS..."
    
    CLUSTER=$1
    SERVICE=$2
    
    if [ -z "$CLUSTER" ] || [ -z "$SERVICE" ]; then
        echo -e "${YELLOW}⚠️  Cluster o servicio no proporcionado${NC}"
        echo "💡 Uso: $0 ecs <cluster-name> <service-name>"
        return 1
    fi
    
    echo "   🌐 Cluster: $CLUSTER"
    echo "   📦 Service: $SERVICE"
    echo ""
    
    # Verificar que AWS CLI está instalado
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI no está instalado${NC}"
        echo "💡 Instala: https://aws.amazon.com/cli/"
        return 1
    fi
    
    echo "1. Obteniendo task ARN..."
    TASK_ARN=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" --query 'taskArns[0]' --output text)
    
    if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" == "None" ]; then
        echo -e "${RED}   ❌ No se encontraron tasks corriendo${NC}"
        return 1
    fi
    
    echo -e "${GREEN}   ✅ Task encontrada: ${TASK_ARN##*/}${NC}"
    echo ""
    
    echo "2. Obteniendo detalles de la task..."
    CONTAINER_ARN=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --query 'tasks[0].containers[0].runtimeId' --output text)
    
    if [ -z "$CONTAINER_ARN" ]; then
        echo -e "${RED}   ❌ No se pudo obtener información del contenedor${NC}"
        return 1
    fi
    
    echo -e "${GREEN}   ✅ Contenedor encontrado${NC}"
    echo ""
    
    echo "3. Para verificar yt-dlp en ECS, usa ECS Exec:"
    echo ""
    echo -e "${YELLOW}   aws ecs execute-command \\${NC}"
    echo -e "${YELLOW}     --cluster $CLUSTER \\${NC}"
    echo -e "${YELLOW}     --task $TASK_ARN \\${NC}"
    echo -e "${YELLOW}     --container uniclick-api \\${NC}"
    echo -e "${YELLOW}     --interactive \\${NC}"
    echo -e "${YELLOW}     --command \"yt-dlp --version\"${NC}"
    echo ""
    
    echo "💡 Nota: ECS Exec debe estar habilitado en tu servicio"
    echo "   Para habilitar: aws ecs update-service --cluster $CLUSTER --service $SERVICE --enable-execute-command"
    echo ""
    
    return 0
}

# Main script
case "$1" in
    docker)
        verify_docker "$2"
        ;;
    local)
        verify_local
        ;;
    ecs)
        verify_ecs "$2" "$3"
        ;;
    *)
        echo "🔍 Script de Verificación de yt-dlp"
        echo ""
        echo "Uso:"
        echo "  $0 docker <nombre-contenedor>    # Verificar en contenedor Docker local"
        echo "  $0 local                          # Verificar en servidor local"
        echo "  $0 ecs <cluster> <service>        # Verificar en AWS ECS"
        echo ""
        echo "Ejemplos:"
        echo "  $0 docker uniclick-api"
        echo "  $0 local"
        echo "  $0 ecs my-cluster uniclick-api-service"
        echo ""
        exit 1
        ;;
esac

exit $?

