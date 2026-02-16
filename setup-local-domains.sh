#!/bin/bash

# Script para configurar dominios locales para testing
echo "🔧 Configurando dominios locales para testing de subdominios..."

# Detectar sistema operativo
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    HOSTS_FILE="/etc/hosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    HOSTS_FILE="/etc/hosts"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Windows
    HOSTS_FILE="/c/Windows/System32/drivers/etc/hosts"
else
    echo "❌ Sistema operativo no soportado"
    exit 1
fi

echo "📁 Archivo hosts: $HOSTS_FILE"

# Verificar si ya existen las entradas
if grep -q "uniclick.io" "$HOSTS_FILE"; then
    echo "⚠️  Las entradas ya existen en $HOSTS_FILE"
    echo "🔍 Entradas actuales:"
    grep "uniclick.io" "$HOSTS_FILE"
else
    echo "➕ Agregando entradas al archivo hosts..."
    
    # Crear backup
    sudo cp "$HOSTS_FILE" "$HOSTS_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    echo "💾 Backup creado: $HOSTS_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Agregar entradas
    echo "" | sudo tee -a "$HOSTS_FILE"
    echo "# Uniclick.io - Local Development" | sudo tee -a "$HOSTS_FILE"
    echo "127.0.0.1 uniclick.io" | sudo tee -a "$HOSTS_FILE"
    echo "127.0.0.1 app.uniclick.io" | sudo tee -a "$HOSTS_FILE"
    echo "127.0.0.1 api.uniclick.io" | sudo tee -a "$HOSTS_FILE"
    echo "127.0.0.1 ariel.uniclick.io" | sudo tee -a "$HOSTS_FILE"
    echo "127.0.0.1 test.uniclick.io" | sudo tee -a "$HOSTS_FILE"
    echo "# End Uniclick.io" | sudo tee -a "$HOSTS_FILE"
    
    echo "✅ Entradas agregadas correctamente"
fi

echo ""
echo "🚀 Configuración completada!"
echo ""
echo "📋 PRÓXIMOS PASOS:"
echo "1. Ejecuta: npm run dev"
echo "2. Abre en tu navegador:"
echo "   - http://uniclick.io:5001"
echo "   - http://app.uniclick.io:5001"
echo "   - http://ariel.uniclick.io:5001"
echo ""
echo "🧪 TESTING:"
echo "1. Haz login en: http://uniclick.io:5001/api/login"
echo "2. Ve a: http://ariel.uniclick.io:5001/api/user"
echo "3. Deberías mantener la sesión sin hacer login otra vez"
echo ""
echo "🔄 Para deshacer los cambios:"
echo "sudo cp $HOSTS_FILE.backup.* $HOSTS_FILE" 