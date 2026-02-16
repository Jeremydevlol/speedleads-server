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
