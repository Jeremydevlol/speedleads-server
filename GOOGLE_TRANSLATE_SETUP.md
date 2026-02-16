# 🌐 Configuración de Google Cloud Translation API

Esta guía te ayudará a configurar Google Cloud Translation API para habilitar la traducción automática multilingüe en tu backend de Uniclick Web Creator.

## 📋 Requisitos Previos

- Una cuenta de Google Cloud Platform (GCP)
- Tarjeta de crédito para activar facturación (requerida aunque uses el nivel gratuito)
- Acceso a la consola de Google Cloud

## 🚀 Paso a Paso

### 1. Crear o Seleccionar un Proyecto en Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. En la barra superior, haz clic en el selector de proyectos
3. **Opción A - Crear nuevo proyecto:**
   - Haz clic en "Nuevo proyecto"
   - Nombre: `uniclick-translation` (o el que prefieras)
   - Organización: Deja por defecto
   - Haz clic en "Crear"
4. **Opción B - Usar proyecto existente:**
   - Selecciona tu proyecto actual de Uniclick

### 2. Habilitar la API de Cloud Translation

1. En la consola de Google Cloud, navega a **APIs y servicios > Biblioteca**
2. Busca "Cloud Translation API"
3. Selecciona "Cloud Translation API"
4. Haz clic en **"Habilitar"**
5. Espera unos segundos hasta que se active

### 3. Configurar Facturación (Obligatorio)

1. Ve a **Facturación** en el menú lateral
2. Si no tienes facturación configurada:
   - Haz clic en "Vincular cuenta de facturación"
   - Sigue los pasos para agregar tu tarjeta de crédito
   - ⚠️ **Tranquilo**: Google ofrece $300 USD de crédito gratuito y el Translation API tiene un nivel gratuito generoso

### 4. Crear una Clave de API

#### Método Recomendado: API Key

1. Ve a **APIs y servicios > Credenciales**
2. Haz clic en **"+ Crear credenciales"**
3. Selecciona **"Clave de API"**
4. Se generará tu clave - **¡CÓPIALA INMEDIATAMENTE!**
5. Haz clic en "Restringir clave" para mayor seguridad

#### Configurar Restricciones de Seguridad (Recomendado)

1. En la clave que acabas de crear, haz clic en el ícono de edición ✏️
2. **restricciones de API:**
   - Selecciona "Restringir clave"
   - Busca y selecciona "Cloud Translation API"
   - Guarda los cambios
3. **Restricciones de aplicación (opcional):**
   - Para desarrollo: Deja sin restricciones
   - Para producción: Agrega las IPs de tu servidor

### 5. Configurar Variables de Entorno

Añade la clave a tu archivo `.env` en la raíz del proyecto:

```env
# Google Translate API
GOOGLE_TRANSLATE_API_KEY=your_api_key_here_without_quotes

# Ejemplo:
# GOOGLE_TRANSLATE_API_KEY=AIzaSyD7xXXXXxXXXXXXXXXXXXXXXXXXXXXXXX
```

⚠️ **IMPORTANTE:** 
- NO incluyas comillas alrededor de la clave
- NO subas este archivo a GitHub (ya está en `.gitignore`)
- Para producción, configura esta variable en tu servidor/hosting

## 💰 Costos y Límites

### Nivel Gratuito
- **500,000 caracteres/mes gratis** 
- Más que suficiente para la mayoría de proyectos pequeños/medianos

### Precios después del nivel gratuito
- **$20 USD por millón de caracteres**
- Ejemplo: 1 millón de caracteres ≈ 200,000 palabras ≈ 400 páginas de texto

### Cómo Optimizar Costos
1. **Cache inteligente**: El frontend ya implementa cache para no traducir lo mismo dos veces
2. **Traducir solo cuando sea necesario**: Solo traducir cuando el usuario cambie de idioma
3. **Monitorear uso**: Revisa el uso en Google Cloud Console regularmente

## 🧪 Probar la Configuración

### 1. Verificar que el servidor esté corriendo
```bash
npm run dev
# o
npm start
```

### 2. Ejecutar el script de prueba
```bash
node test-translation.js
```

### 3. Qué esperar en la salida
```
🔧 Prueba del Endpoint de Traducción
===================================

🎯 URL del endpoint: http://localhost:5001/api/ai/translate

🔍 Verificando configuración...
   BACKEND_URL: http://localhost:5001
   GOOGLE_TRANSLATE_API_KEY: ✅ CONFIGURADA

🌐 Probando conectividad con el servidor...
✅ Servidor disponible (Status: 200)

🚀 Iniciando pruebas...

📋 Prueba: Traducir string simple
✅ Estado: 200
📥 Respuesta: {
  "success": true,
  "translatedText": "Hello, welcome to our restaurant"
}
```

## 🔧 Troubleshooting

### Error: "API key not found"
```
❌ Error: GOOGLE_TRANSLATE_API_KEY no está configurada
```
**Solución:** Verifica que hayas añadido la clave al archivo `.env`

### Error: "API not enabled"
```
❌ Error: Cloud Translation API has not been used in project...
```
**Solución:** Ve a Google Cloud Console y habilita la Cloud Translation API

### Error: "Permission denied"
```
❌ Error: The request is missing a valid API key
```
**Solución:** 
1. Verifica que la clave sea correcta
2. Asegúrate de que tenga permisos para Cloud Translation API
3. Verifica las restricciones de la clave

### Error: "Quota exceeded"
```
❌ Error: Quota exceeded for quota metric 'characters'
```
**Solución:** Has superado el límite mensual de 500,000 caracteres gratuitos

### Error de facturación
```
❌ Error: Cloud Translation API has not been used in project before or it is disabled
```
**Solución:** Habilita la facturación en tu proyecto de Google Cloud

## 🌍 Idiomas Soportados

El servicio soporta más de 100 idiomas. Los códigos más comunes:

| Idioma | Código | Idioma | Código |
|--------|---------|--------|---------|
| Español | `es` | Inglés | `en` |
| Francés | `fr` | Alemán | `de` |
| Italiano | `it` | Portugués | `pt` |
| Chino (Simplificado) | `zh` | Japonés | `ja` |
| Coreano | `ko` | Árabe | `ar` |
| Ruso | `ru` | Hindi | `hi` |

Lista completa: [Google Translate Supported Languages](https://cloud.google.com/translate/docs/languages)

## 📊 Monitoreo

### Ver el uso de la API
1. Ve a **APIs y servicios > Dashboard**
2. Selecciona "Cloud Translation API"
3. Podrás ver:
   - Número de requests
   - Caracteres traducidos
   - Errores
   - Latencia promedio

### Configurar alertas de cuota
1. Ve a **IAM y administración > Cuotas**
2. Busca "Cloud Translation API"
3. Configura alertas cuando llegues al 80% del límite

## 🔒 Seguridad en Producción

### Para el servidor de producción:
1. **Nunca hardcodees** la API key en el código
2. **Usa variables de entorno** del sistema o servicio de hosting
3. **Restringe la clave** por IP si es posible
4. **Rota las claves** regularmente (cada 3-6 meses)
5. **Monitorea el uso** para detectar uso anómalo

### Ejemplo para diferentes plataformas:

#### Heroku
```bash
heroku config:set GOOGLE_TRANSLATE_API_KEY=your_key_here
```

#### AWS/DigitalOcean/VPS
```bash
export GOOGLE_TRANSLATE_API_KEY=your_key_here
# O añadirlo al ~/.bashrc o ~/.profile
```

#### Docker
```bash
docker run -e GOOGLE_TRANSLATE_API_KEY=your_key_here your-app
```

## ✅ Verificación Final

Una vez completada la configuración, deberías poder:

1. ✅ Traducir textos desde el frontend
2. ✅ Ver traducciones en tiempo real
3. ✅ Cambiar entre idiomas fluidamente
4. ✅ Monitorear el uso en Google Cloud Console

## 📞 Soporte

Si tienes problemas:

1. **Revisa los logs** del servidor backend
2. **Ejecuta el script de prueba** (`test-translation.js`)
3. **Verifica la configuración** en Google Cloud Console
4. **Consulta la documentación oficial**: [Cloud Translation API Docs](https://cloud.google.com/translate/docs)

---

🎉 **¡Felicidades!** Ahora tienes traducción automática multilingüe funcionando en tu aplicación Uniclick. 