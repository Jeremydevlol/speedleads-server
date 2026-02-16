#!/bin/bash

echo "🚀 Testing Mexico Fix - Frontend Raw Code Issue"
echo "=============================================="

# Función para probar una URL con headers específicos
test_url() {
    local country=$1
    local url=$2
    local description=$3
    
    echo ""
    echo "🌍 Testing from $country: $description"
    echo "URL: $url"
    
    # Hacer request con headers simulados
    response=$(curl -s -H "cf-ipcountry: $country" \
                    -H "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" \
                    -w "HTTP_STATUS:%{http_code}" \
                    "$url")
    
    # Extraer status code
    status_code=$(echo "$response" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    echo "Status: $status_code"
    
    # Verificar si es HTML o JavaScript crudo
    if echo "$body" | grep -q "<!DOCTYPE html>" || echo "$body" | grep -q "<html"; then
        echo "✅ Response is HTML (GOOD)"
    elif echo "$body" | grep -q "React.fragment" || echo "$body" | grep -q "static/chunks"; then
        echo "❌ Response is RAW JavaScript (BAD)"
        echo "First 200 chars: ${body:0:200}..."
    else
        echo "ℹ️ Response type: Unknown"
        echo "First 100 chars: ${body:0:100}..."
    fi
}

# Probar diferentes escenarios
echo "Testing backend health endpoint..."
test_url "US" "http://localhost:5001/api/health" "Health check from US"
test_url "MX" "http://localhost:5001/api/health" "Health check from Mexico"

echo ""
echo "Testing geo-debug endpoint..."
test_url "MX" "http://localhost:5001/api/geo-debug" "Geo debug from Mexico"

echo ""
echo "Testing frontend routes (these should redirect or serve HTML)..."
test_url "US" "http://localhost:5001" "Frontend root from US"
test_url "MX" "http://localhost:5001" "Frontend root from Mexico"
test_url "MX" "http://localhost:5001/dashboard" "Frontend dashboard from Mexico"

echo ""
echo "Testing with app.uniclick.io host..."
test_url "MX" "http://localhost:5001" "Frontend with app.uniclick.io host" 

echo ""
echo "🎯 Summary:"
echo "- If you see ✅ HTML responses: Fix is working!"
echo "- If you see ❌ RAW JavaScript: Issue persists"
echo "- Check server logs for 🌍 geo debugging info"
echo ""
echo "Next steps:"
echo "1. npm run build && npm start"
echo "2. Run this test script"
echo "3. Deploy to production"
echo "4. Test from Mexico with real users" 