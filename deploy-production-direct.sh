#!/bin/bash

echo "🚀 DESPLIEGUE DIRECTO A PRODUCCIÓN - UNICLICK API"
echo "=================================================="

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ Error: No se encontró package.json. Ejecuta desde el directorio raíz del proyecto."
    exit 1
fi

# Verificar que el servidor local está funcionando
echo "🔍 Verificando servidor local..."
if ! curl -s http://localhost:5001/api/health > /dev/null; then
    echo "❌ Error: El servidor local no está funcionando en puerto 5001"
    echo "💡 Ejecuta: node dist/app.js"
    exit 1
fi

echo "✅ Servidor local funcionando correctamente"

# Crear directorio de despliegue
echo "📦 Preparando paquete de despliegue..."
rm -rf deploy-package
mkdir -p deploy-package

# Copiar archivos necesarios
echo "📋 Copiando archivos..."
cp -r dist deploy-package/
cp package.json deploy-package/
cp package-lock.json deploy-package/
cp -r config deploy-package/ 2>/dev/null || echo "⚠️  Directorio config no encontrado"
cp -r lib deploy-package/ 2>/dev/null || echo "⚠️  Directorio lib no encontrado"
cp -r db deploy-package/ 2>/dev/null || echo "⚠️  Directorio db no encontrado"

# Crear archivo de inicio
cat > deploy-package/start.sh << 'EOF'
#!/bin/bash
echo "🚀 Iniciando Uniclick API..."
export NODE_ENV=production
export PORT=5001
node dist/app.js
EOF

chmod +x deploy-package/start.sh

# Crear package.json optimizado para producción
cat > deploy-package/package.json << 'EOF'
{
  "name": "uniclick-api",
  "version": "1.0.0",
  "description": "Uniclick API - Production Ready",
  "main": "dist/app.js",
  "scripts": {
    "start": "node dist/app.js",
    "dev": "node dist/app.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "morgan": "^1.10.0",
    "dotenv": "^16.3.1",
    "@supabase/supabase-js": "^2.38.4",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.32.6",
    "openai": "^4.20.1",
    "axios": "^1.6.2",
    "form-data": "^4.0.0",
    "puppeteer": "^21.5.2",
    "ffmpeg-static": "^5.2.0",
    "fluent-ffmpeg": "^2.1.2",
    "openai-whisper": "^1.0.0",
    "uuid": "^9.0.1",
    "moment": "^2.29.4",
    "nodemailer": "^6.9.7",
    "stripe": "^14.7.0",
    "bcryptjs": "^2.4.3",
    "express-rate-limit": "^7.1.5",
    "compression": "^1.7.4"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

# Crear archivo .env de ejemplo
cat > deploy-package/.env.example << 'EOF'
# Configuración de producción
NODE_ENV=production
PORT=5001

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# JWT
JWT_SECRET=your_jwt_secret

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Otros servicios
STRIPE_SECRET_KEY=your_stripe_secret_key
EMAIL_SERVICE_API_KEY=your_email_api_key
EOF

# Crear README de despliegue
cat > deploy-package/README-DEPLOYMENT.md << 'EOF'
# Despliegue de Uniclick API

## Instrucciones de Despliegue

1. **Subir archivos al servidor:**
   ```bash
   # Subir el paquete completo al servidor
   scp -r deploy-package/* user@server:/path/to/api/
   ```

2. **Instalar dependencias:**
   ```bash
   cd /path/to/api
   npm install --production
   ```

3. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env
   # Editar .env con las credenciales reales
   nano .env
   ```

4. **Iniciar la aplicación:**
   ```bash
   chmod +x start.sh
   ./start.sh
   ```

5. **Configurar PM2 (recomendado):**
   ```bash
   npm install -g pm2
   pm2 start dist/app.js --name "uniclick-api"
   pm2 save
   pm2 startup
   ```

## Verificación

- Health check: `curl http://localhost:5001/api/health`
- Logs: `pm2 logs uniclick-api`

## Correcciones Incluidas

✅ Autenticación mejorada para cuentas nuevas
✅ Endpoints de debug y limpieza de caché
✅ Manejo robusto de usuarios en listWebsites
✅ Corrección de sintaxis en JWT
✅ Endpoints de búsqueda por slug
✅ CORS configurado correctamente
✅ Logging detallado para debugging
EOF

# Crear archivo tar.gz
echo "📦 Creando paquete comprimido..."
tar -czf uniclick-api-production-$(date +%Y%m%d-%H%M%S).tar.gz -C deploy-package .

echo ""
echo "✅ PAQUETE DE DESPLIEGUE CREADO EXITOSAMENTE"
echo "============================================="
echo "📁 Archivo: uniclick-api-production-$(date +%Y%m%d-%H%M%S).tar.gz"
echo "📋 Tamaño: $(du -h uniclick-api-production-*.tar.gz | cut -f1)"
echo ""
echo "🚀 PRÓXIMOS PASOS:"
echo "1. Subir el archivo .tar.gz al servidor de producción"
echo "2. Extraer: tar -xzf uniclick-api-production-*.tar.gz"
echo "3. Instalar dependencias: npm install --production"
echo "4. Configurar .env con las credenciales reales"
echo "5. Iniciar: ./start.sh o usar PM2"
echo ""
echo "🔧 CORRECCIONES INCLUIDAS:"
echo "✅ Autenticación mejorada para cuentas nuevas"
echo "✅ Endpoints de debug y limpieza de caché"
echo "✅ Manejo robusto de usuarios en listWebsites"
echo "✅ Corrección de sintaxis en JWT"
echo "✅ Endpoints de búsqueda por slug"
echo "✅ CORS configurado correctamente"
echo "✅ Logging detallado para debugging"
echo ""
echo "📖 Ver README-DEPLOYMENT.md para instrucciones detalladas"
