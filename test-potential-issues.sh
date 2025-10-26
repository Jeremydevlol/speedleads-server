#!/bin/bash

# test-potential-issues.sh
# Script para probar posibles problemas que causan el rollback

echo "🔍 Probando posibles problemas que causan rollback en ECS..."

# Construir imagen con el script robusto
echo "🔨 Construyendo imagen con script robusto..."
docker build -t leads-api-test .

# Test 1: Verificar que el contenedor arranca
echo ""
echo "🧪 TEST 1: Verificar arranque del contenedor"
docker run --rm -d --name leads-test -p 5001:5001 leads-api-test
sleep 10

# Verificar si está ejecutándose
if docker ps | grep leads-test > /dev/null; then
    echo "✅ Contenedor está ejecutándose"
    
    # Test 2: Health check
    echo ""
    echo "🧪 TEST 2: Health check"
    if curl -f -s http://localhost:5001/health; then
        echo "✅ Health check OK"
    else
        echo "❌ Health check FAIL"
        echo "📝 Logs del contenedor:"
        docker logs leads-test --tail 20
    fi
    
    # Test 3: Endpoint principal
    echo ""
    echo "🧪 TEST 3: Endpoint principal"
    if curl -f -s http://localhost:5001/; then
        echo "✅ Endpoint principal OK"
    else
        echo "❌ Endpoint principal FAIL"
    fi
    
    # Test 4: API endpoints
    echo ""
    echo "🧪 TEST 4: API endpoints"
    if curl -f -s http://localhost:5001/api/leads/columns -H "x-user-id: test"; then
        echo "✅ API endpoints OK"
    else
        echo "⚠️ API endpoints pueden fallar (normal sin DB)"
    fi
    
    # Mostrar logs finales
    echo ""
    echo "📝 Últimos logs del contenedor:"
    docker logs leads-test --tail 30
    
    # Limpiar
    docker stop leads-test
else
    echo "❌ Contenedor no está ejecutándose"
    echo "📝 Logs del contenedor fallido:"
    docker logs leads-test --tail 50
fi

# Test 5: Verificar tamaño de imagen
echo ""
echo "🧪 TEST 5: Tamaño de imagen"
docker images leads-api-test --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

# Test 6: Verificar archivos en la imagen
echo ""
echo "🧪 TEST 6: Archivos críticos en la imagen"
docker run --rm leads-api-test ls -la /app/dist/ | head -10

# Test 7: Verificar variables de entorno
echo ""
echo "🧪 TEST 7: Variables de entorno"
docker run --rm leads-api-test env | grep -E "(NODE_ENV|PORT|PATH)"

# Test 8: Simular condiciones de AWS
echo ""
echo "🧪 TEST 8: Simular condiciones de AWS ECS"
echo "Ejecutando con límites de memoria similares a Fargate..."
docker run --rm -d --name leads-aws-test \
    --memory=1g \
    --cpus=0.5 \
    -p 5001:5001 \
    -e DATABASE_URL="postgres://fake:fake@fake:5432/fake" \
    -e JWT_SECRET="test-secret" \
    leads-api-test

sleep 15

if docker ps | grep leads-aws-test > /dev/null; then
    echo "✅ Contenedor funciona con límites de AWS"
    
    # Health check con timeout más estricto (como AWS)
    if timeout 10s curl -f -s http://localhost:5001/health; then
        echo "✅ Health check OK con timeout estricto"
    else
        echo "❌ Health check FAIL con timeout estricto"
    fi
    
    docker stop leads-aws-test
else
    echo "❌ Contenedor falla con límites de AWS"
    docker logs leads-aws-test --tail 50
fi

echo ""
echo "🎯 RESUMEN DE TESTS:"
echo "Si todos los tests pasan, el problema puede ser:"
echo "1. Variables de entorno faltantes en ECS"
echo "2. Timeout muy estricto en el Load Balancer"
echo "3. Problemas de red en AWS"
echo "4. Task Definition incorrecta"
echo ""
echo "💡 Ejecuta './debug-ecs-failure.sh' para ver logs específicos de AWS"
