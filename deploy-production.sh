#!/bin/bash

# Script de despliegue para producción
set -e

echo "🚀 Iniciando despliegue de producción..."

# Variables
IMAGE_NAME="uniclick-api"
TAG="latest"
REGISTRY="your-registry.com"  # Cambia por tu registry

echo "📦 Construyendo imagen Docker..."

# Construir imagen con el Dockerfile de producción
docker build -f Dockerfile.production -t $IMAGE_NAME:$TAG .

echo "✅ Imagen construida exitosamente"

# Verificar que la imagen se construyó correctamente
echo "🔍 Verificando imagen..."
docker images | grep $IMAGE_NAME

echo "🧪 Probando imagen localmente..."
# Ejecutar un test rápido
docker run --rm -d --name test-container -p 5001:5001 $IMAGE_NAME:$TAG

# Esperar un poco para que arranque
sleep 10

# Verificar que el health check funciona
echo "🏥 Verificando health check..."
if curl -f http://localhost:5001/api/health; then
    echo "✅ Health check exitoso"
else
    echo "❌ Health check falló"
    docker logs test-container
    docker stop test-container
    exit 1
fi

# Detener el contenedor de prueba
docker stop test-container

echo "✅ Imagen lista para producción"

# Si tienes un registry, descomenta estas líneas:
# echo "📤 Subiendo imagen al registry..."
# docker tag $IMAGE_NAME:$TAG $REGISTRY/$IMAGE_NAME:$TAG
# docker push $REGISTRY/$IMAGE_NAME:$TAG

echo "🎉 Despliegue completado exitosamente"
echo "📋 Para desplegar en ECS:"
echo "   1. Sube la imagen a tu registry"
echo "   2. Actualiza el task definition en ECS"
echo "   3. Actualiza el servicio ECS"
