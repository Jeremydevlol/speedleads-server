#!/bin/bash

echo "🔍 DIAGNÓSTICO: ¿Por qué solo pasa en México?"
echo "============================================="

# Función para simular requests desde diferentes países
test_geo_response() {
    local country=$1
    local country_name=$2
    
    echo ""
    echo "🌍 Testing from $country_name ($country):"
    
    # Test DNS resolution
    echo "   DNS Resolution:"
    nslookup app.uniclick.io | grep -A1 "Name:" | head -2
    
    # Test con headers simulados
    echo "   HTTP Response:"
    response=$(curl -s -I -H "cf-ipcountry: $country" \
                     -H "accept-language: es-MX,es;q=0.9" \
                     -H "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
                     https://app.uniclick.io | head -10)
    
    # Extraer headers importantes
    echo "$response" | grep -i "server:"
    echo "$response" | grep -i "content-type:"
    echo "$response" | grep -i "cache-control:"
    echo "$response" | grep -i "cf-ray:"
    echo "$response" | grep -i "cf-cache-status:"
    
    # Verificar si devuelve HTML o JavaScript
    body=$(curl -s -H "cf-ipcountry: $country" \
               -H "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
               https://app.uniclick.io | head -c 500)
    
    if echo "$body" | grep -q "React.fragment\|static/chunks"; then
        echo "   ❌ PROBLEMA: Devuelve JavaScript crudo"
    elif echo "$body" | grep -q "<!DOCTYPE html\|<html"; then
        echo "   ✅ OK: Devuelve HTML"
    else
        echo "   ⚠️  UNKNOWN: Respuesta no identificada"
    fi
    
    echo "   Primeros 100 caracteres:"
    echo "   $body" | head -c 100
    echo ""
}

# Probar desde diferentes países
echo "🧪 Probando desde diferentes países..."
test_geo_response "US" "Estados Unidos"
test_geo_response "MX" "México"
test_geo_response "CA" "Canadá"
test_geo_response "BR" "Brasil"
test_geo_response "ES" "España"

echo ""
echo "🔍 Análisis de CloudFront:"
echo "========================="

# Verificar edge locations
echo "📍 Edge Locations detectadas:"
for country in US MX CA BR ES; do
    cf_ray=$(curl -s -I -H "cf-ipcountry: $country" https://app.uniclick.io | grep -i "cf-ray:" | cut -d' ' -f2)
    echo "$country: $cf_ray"
done

echo ""
echo "🏗️ Verificando configuración de dominios:"
echo "========================================"

# Verificar configuración DNS
echo "🔍 DNS Records:"
dig app.uniclick.io A +short
dig app.uniclick.io CNAME +short

echo ""
echo "🌐 Verificando desde diferentes resolvers:"
echo "US Google DNS (8.8.8.8):"
dig @8.8.8.8 app.uniclick.io A +short

echo "Cloudflare DNS (1.1.1.1):"
dig @1.1.1.1 app.uniclick.io A +short

echo ""
echo "🎯 DIAGNÓSTICO AVANZADO:"
echo "======================="

# Verificar headers específicos que CloudFront envía
echo "📋 Headers de CloudFront desde México:"
curl -s -I -H "cf-ipcountry: MX" https://app.uniclick.io | grep -i "cf-"

echo ""
echo "📋 Headers de CloudFront desde US:"
curl -s -I -H "cf-ipcountry: US" https://app.uniclick.io | grep -i "cf-"

echo ""
echo "💡 POSIBLES CAUSAS:"
echo "=================="
echo "1. 🌍 Geo-blocking: CloudFront puede tener restricciones por país"
echo "2. 🏗️ Edge Location: México puede usar un edge location diferente"
echo "3. 💰 Price Class: CloudFront puede excluir México de ciertos tiers"
echo "4. ⚙️ Cache Behavior: Reglas de cache específicas para México"
echo "5. 🔄 Origin Routing: México puede estar ruteado a un origen diferente"
echo ""
echo "📞 PRÓXIMOS PASOS:"
echo "=================="
echo "1. Verificar configuración de CloudFront en AWS Console"
echo "2. Revisar Geographic Restrictions en CloudFront"
echo "3. Verificar Cache Behaviors por región"
echo "4. Contactar soporte de CloudFront si es necesario"
echo ""
echo "🔗 Enlaces útiles:"
echo "- CloudFront Console: https://console.aws.amazon.com/cloudfront"
echo "- Tu Distribution ID: E1K074YQD62Q2W" 