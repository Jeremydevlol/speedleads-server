#!/bin/bash

# test-docker-local.sh
# Script para probar el Docker localmente antes de desplegar

echo "🧪 Probando Docker localmente..."

# Detener contenedores existentes
echo "🛑 Deteniendo contenedores existentes..."
docker-compose down -v

# Construir imagen fresca
echo "🔨 Construyendo imagen Docker..."
docker-compose build --no-cache

# Iniciar contenedor
echo "🚀 Iniciando contenedor..."
docker-compose up -d

# Esperar a que arranque
echo "⏳ Esperando 10 segundos para que arranque..."
sleep 10

# Verificar logs
echo "📝 Logs del contenedor:"
docker-compose logs --tail 20

# Verificar health check
echo "🔍 Verificando health check..."
if curl -f -s http://localhost:5001/health; then
    echo "✅ Health check OK"
else
    echo "❌ Health check FAIL"
fi

# Verificar endpoint de leads
echo "🔍 Verificando endpoint de leads..."
if curl -f -s http://localhost:5001/api/leads/columns -H "x-user-id: test"; then
    echo "✅ Endpoint de leads OK"
else
    echo "❌ Endpoint de leads FAIL"
fi

# Mostrar estado del contenedor
echo "📊 Estado del contenedor:"
docker-compose ps

echo "🎉 Test completado. Si todo está OK, puedes desplegar a AWS."
echo "📋 Para ver logs en tiempo real: docker-compose logs -f"
echo "🛑 Para detener: docker-compose down"
