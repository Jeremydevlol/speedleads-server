#!/bin/bash

echo "🚀 DESPLIEGUE DE UNICLICK API CON YT-DLP"
echo "========================================"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables (personaliza según tu configuración)
IMAGE_NAME="uniclick-api"
ECR_REPO="" # Ejemplo: 123456789012.dkr.ecr.us-east-1.amazonaws.com/uniclick-api
AWS_REGION="" # Ejemplo: us-east-1
ECS_CLUSTER="" # Ejemplo: uniclick-cluster
ECS_SERVICE="" # Ejemplo: uniclick-api-service

# Verificar si estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: No se encontró package.json${NC}"
    echo "   Ejecuta este script desde el directorio raíz del proyecto"
    exit 1
fi

echo -e "${BLUE}📋 Verificando cambios en Dockerfile...${NC}"
if grep -q "yt-dlp" Dockerfile.production; then
    echo -e "${GREEN}✅ yt-dlp encontrado en Dockerfile.production${NC}"
else
    echo -e "${RED}❌ yt-dlp no encontrado en Dockerfile.production${NC}"
    echo "   Por favor, agrega yt-dlp al Dockerfile"
    exit 1
fi
echo ""

# Menú de opciones
echo "Selecciona el tipo de despliegue:"
echo ""
echo "1) 🐳 Build local (solo construir imagen)"
echo "2) 🧪 Build + Test local"
echo "3) ☁️  Build + Deploy a AWS ECR"
echo "4) 🚀 Build + Deploy a AWS ECR + Update ECS"
echo "5) 💻 Instrucciones para servidor manual"
echo ""
read -p "Opción (1-5): " option

case $option in
    1)
        echo ""
        echo -e "${BLUE}🐳 Construyendo imagen Docker...${NC}"
        docker build -f Dockerfile.production -t $IMAGE_NAME:latest .
        
        if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}✅ Imagen construida exitosamente${NC}"
            echo ""
            echo "Para probar localmente:"
            echo "  docker run -d -p 5001:5001 --name test-$IMAGE_NAME $IMAGE_NAME:latest"
            echo "  docker exec test-$IMAGE_NAME yt-dlp --version"
        else
            echo -e "${RED}❌ Error construyendo imagen${NC}"
            exit 1
        fi
        ;;
        
    2)
        echo ""
        echo -e "${BLUE}🐳 Construyendo imagen Docker...${NC}"
        docker build -f Dockerfile.production -t $IMAGE_NAME:latest .
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ Error construyendo imagen${NC}"
            exit 1
        fi
        
        echo ""
        echo -e "${BLUE}🧪 Iniciando contenedor de prueba...${NC}"
        docker run -d -p 5001:5001 --name test-$IMAGE_NAME $IMAGE_NAME:latest
        
        echo "Esperando que el contenedor inicie..."
        sleep 5
        
        echo ""
        echo -e "${BLUE}🔍 Verificando yt-dlp...${NC}"
        if docker exec test-$IMAGE_NAME yt-dlp --version; then
            echo -e "${GREEN}✅ yt-dlp está funcionando${NC}"
        else
            echo -e "${RED}❌ yt-dlp no está disponible${NC}"
            docker stop test-$IMAGE_NAME
            docker rm test-$IMAGE_NAME
            exit 1
        fi
        
        echo ""
        echo -e "${BLUE}🏥 Verificando health check...${NC}"
        sleep 10
        
        if curl -f http://localhost:5001/api/health 2>/dev/null; then
            echo ""
            echo -e "${GREEN}✅ Health check exitoso${NC}"
        else
            echo ""
            echo -e "${RED}❌ Health check falló${NC}"
            echo "Ver logs:"
            docker logs test-$IMAGE_NAME
        fi
        
        echo ""
        read -p "¿Detener y eliminar contenedor de prueba? (y/n): " cleanup
        if [ "$cleanup" = "y" ]; then
            docker stop test-$IMAGE_NAME
            docker rm test-$IMAGE_NAME
            echo -e "${GREEN}✅ Contenedor de prueba eliminado${NC}"
        else
            echo -e "${YELLOW}⚠️  Contenedor test-$IMAGE_NAME sigue corriendo${NC}"
            echo "   Para detenerlo: docker stop test-$IMAGE_NAME && docker rm test-$IMAGE_NAME"
        fi
        ;;
        
    3)
        echo ""
        if [ -z "$ECR_REPO" ] || [ -z "$AWS_REGION" ]; then
            echo -e "${YELLOW}⚠️  Configura ECR_REPO y AWS_REGION en el script${NC}"
            echo ""
            read -p "ECR Repository URL: " ECR_REPO
            read -p "AWS Region: " AWS_REGION
        fi
        
        echo -e "${BLUE}🔐 Autenticando con ECR...${NC}"
        aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ Error autenticando con ECR${NC}"
            exit 1
        fi
        
        echo ""
        echo -e "${BLUE}🐳 Construyendo imagen...${NC}"
        docker build -f Dockerfile.production -t $IMAGE_NAME:latest .
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ Error construyendo imagen${NC}"
            exit 1
        fi
        
        echo ""
        echo -e "${BLUE}🏷️  Etiquetando imagen...${NC}"
        docker tag $IMAGE_NAME:latest $ECR_REPO:latest
        
        echo ""
        echo -e "${BLUE}📤 Subiendo imagen a ECR...${NC}"
        docker push $ECR_REPO:latest
        
        if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}✅ Imagen subida exitosamente a ECR${NC}"
            echo ""
            echo "Para actualizar ECS:"
            echo "  aws ecs update-service --cluster $ECS_CLUSTER --service $ECS_SERVICE --force-new-deployment"
        else
            echo -e "${RED}❌ Error subiendo imagen a ECR${NC}"
            exit 1
        fi
        ;;
        
    4)
        echo ""
        if [ -z "$ECR_REPO" ] || [ -z "$AWS_REGION" ] || [ -z "$ECS_CLUSTER" ] || [ -z "$ECS_SERVICE" ]; then
            echo -e "${YELLOW}⚠️  Configura las variables en el script${NC}"
            echo ""
            read -p "ECR Repository URL: " ECR_REPO
            read -p "AWS Region: " AWS_REGION
            read -p "ECS Cluster: " ECS_CLUSTER
            read -p "ECS Service: " ECS_SERVICE
        fi
        
        echo -e "${BLUE}🔐 Autenticando con ECR...${NC}"
        aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ Error autenticando con ECR${NC}"
            exit 1
        fi
        
        echo ""
        echo -e "${BLUE}🐳 Construyendo imagen...${NC}"
        docker build -f Dockerfile.production -t $IMAGE_NAME:latest .
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ Error construyendo imagen${NC}"
            exit 1
        fi
        
        echo ""
        echo -e "${BLUE}🏷️  Etiquetando imagen...${NC}"
        docker tag $IMAGE_NAME:latest $ECR_REPO:latest
        
        echo ""
        echo -e "${BLUE}📤 Subiendo imagen a ECR...${NC}"
        docker push $ECR_REPO:latest
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ Error subiendo imagen a ECR${NC}"
            exit 1
        fi
        
        echo ""
        echo -e "${BLUE}🔄 Actualizando servicio ECS...${NC}"
        aws ecs update-service \
            --cluster $ECS_CLUSTER \
            --service $ECS_SERVICE \
            --force-new-deployment \
            --region $AWS_REGION
        
        if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}✅ Despliegue iniciado exitosamente${NC}"
            echo ""
            echo "Monitoreando despliegue..."
            echo "  aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION"
            echo ""
            echo "Para verificar yt-dlp después del despliegue:"
            echo "  ./verify-ytdlp-production.sh ecs $ECS_CLUSTER $ECS_SERVICE"
        else
            echo -e "${RED}❌ Error actualizando servicio ECS${NC}"
            exit 1
        fi
        ;;
        
    5)
        echo ""
        echo -e "${BLUE}💻 Instrucciones para Servidor Manual (VPS/EC2)${NC}"
        echo ""
        echo "1. Conectarse al servidor:"
        echo "   ssh usuario@tu-servidor"
        echo ""
        echo "2. Actualizar código:"
        echo "   cd /ruta/a/tu/api"
        echo "   git pull origin main"
        echo ""
        echo "3. Instalar yt-dlp:"
        echo "   pip3 install --upgrade yt-dlp"
        echo ""
        echo "4. Verificar instalación:"
        echo "   yt-dlp --version"
        echo ""
        echo "5. Reconstruir aplicación (si usas TypeScript):"
        echo "   npm run build"
        echo ""
        echo "6. Reiniciar aplicación:"
        echo "   # Con PM2:"
        echo "   pm2 restart uniclick-api"
        echo ""
        echo "   # Con systemd:"
        echo "   sudo systemctl restart uniclick-api"
        echo ""
        echo "7. Verificar logs:"
        echo "   pm2 logs uniclick-api"
        echo "   # Buscar: ✅ yt-dlp disponible"
        echo ""
        echo "8. Probar:"
        echo "   curl http://localhost:5001/api/health"
        echo ""
        ;;
        
    *)
        echo -e "${RED}❌ Opción inválida${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}🎉 Proceso completado${NC}"
echo ""
echo "📋 Próximos pasos:"
echo "1. Verificar que yt-dlp está disponible"
echo "2. Probar con una URL de video"
echo "3. Monitorear logs por 24 horas"
echo ""
echo "📖 Ver documentación completa:"
echo "   cat INSTALACION_YT_DLP_PRODUCCION.md"

