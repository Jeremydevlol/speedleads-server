# 🎬 Resumen: Instalación de yt-dlp para Producción

## ✅ ¿Qué se hizo?

He actualizado tu proyecto para que **yt-dlp esté instalado automáticamente en producción**.

### Archivos Modificados:

1. ✅ **`Dockerfile.production`** - Agregada instalación de yt-dlp
2. ✅ **`Dockerfile`** - Agregada instalación de yt-dlp

### Archivos Creados:

1. 📄 **`INSTALACION_YT_DLP_PRODUCCION.md`** - Guía completa de instalación y troubleshooting
2. 🔧 **`verify-ytdlp-production.sh`** - Script para verificar que yt-dlp está funcionando
3. 🚀 **`deploy-with-ytdlp.sh`** - Script automatizado de despliegue

---

## 🚀 Próximos Pasos

### Opción 1: Despliegue Rápido (Recomendado)

```bash
# Usa el script automatizado
./deploy-with-ytdlp.sh
```

El script te dará opciones para:
1. Build local
2. Build + test local
3. Deploy a AWS ECR
4. Deploy completo (ECR + ECS)
5. Instrucciones para servidor manual

### Opción 2: Despliegue Manual

#### Si usas Docker + AWS ECS:

```bash
# 1. Construir imagen
docker build -f Dockerfile.production -t uniclick-api:latest .

# 2. Etiquetar para ECR (reemplaza con tu info)
docker tag uniclick-api:latest TU-CUENTA.dkr.ecr.REGION.amazonaws.com/uniclick-api:latest

# 3. Autenticar con ECR
aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin TU-CUENTA.dkr.ecr.REGION.amazonaws.com

# 4. Subir imagen
docker push TU-CUENTA.dkr.ecr.REGION.amazonaws.com/uniclick-api:latest

# 5. Actualizar servicio ECS
aws ecs update-service --cluster TU-CLUSTER --service TU-SERVICIO --force-new-deployment
```

#### Si usas un Servidor VPS/EC2 Manual:

```bash
# 1. Conectarse al servidor
ssh usuario@tu-servidor

# 2. Ir al directorio del proyecto
cd /ruta/a/tu/api

# 3. Actualizar código
git pull origin main

# 4. Instalar yt-dlp
pip3 install --upgrade yt-dlp

# 5. Verificar instalación
yt-dlp --version

# 6. Reiniciar aplicación
pm2 restart uniclick-api
# O: sudo systemctl restart uniclick-api
```

---

## 🧪 Verificación

Después del despliegue, verifica que yt-dlp está funcionando:

### Opción 1: Script Automatizado

```bash
# Para Docker local:
./verify-ytdlp-production.sh docker nombre-contenedor

# Para servidor local:
./verify-ytdlp-production.sh local

# Para AWS ECS:
./verify-ytdlp-production.sh ecs nombre-cluster nombre-servicio
```

### Opción 2: Manual

```bash
# En Docker:
docker exec tu-contenedor yt-dlp --version

# En servidor local:
yt-dlp --version

# Probar descarga:
yt-dlp "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --get-title
```

### Opción 3: Desde tu API

```bash
curl -X POST https://tu-api.com/api/sendInstruction \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN" \
  -d '{
    "instruction": "Analiza este video",
    "media": [{
      "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "type": "video/url"
    }]
  }'
```

---

## 📋 Checklist de Despliegue

Antes de considerar el despliegue completo:

- [ ] **Build exitoso** - La imagen Docker se construyó sin errores
- [ ] **Test local** - El contenedor corre localmente y responde
- [ ] **yt-dlp disponible** - `yt-dlp --version` funciona en el contenedor
- [ ] **Health check OK** - El endpoint `/api/health` responde
- [ ] **Imagen en ECR** - La imagen se subió correctamente (si usas AWS)
- [ ] **Servicio actualizado** - ECS está usando la nueva imagen (si usas ECS)
- [ ] **Verificación en producción** - yt-dlp funciona en producción
- [ ] **Test con video real** - Una URL de video se procesa correctamente
- [ ] **Logs revisados** - No hay errores relacionados con yt-dlp
- [ ] **Monitoreo 24h** - Sistema estable después de 24 horas

---

## 📊 Plataformas Soportadas

Tu API ahora puede procesar videos de:

- ✅ **YouTube** (videos normales y shorts)
  - Ejemplo: `https://www.youtube.com/watch?v=VIDEO_ID`
  - Ejemplo: `https://youtu.be/VIDEO_ID`

- ✅ **TikTok**
  - Ejemplo: `https://www.tiktok.com/@user/video/123456`

- ✅ **Instagram Reels**
  - Ejemplo: `https://www.instagram.com/reel/ABC123/`

---

## ⚙️ Configuración Técnica

### Recursos Necesarios:

**Disco:**
- Mínimo: 10 GB libres
- Recomendado: 20+ GB

**Memoria (para ECS Task):**
- Mínimo: 2 GB
- Recomendado: 4 GB

**CPU (para ECS Task):**
- Mínimo: 1 vCPU
- Recomendado: 2 vCPU

### Limpieza Automática:

El sistema limpia automáticamente los archivos temporales cada 2 horas.
Los videos se almacenan temporalmente en `/app/temp_downloads`.

### Límites:

- Calidad máxima de video: 720p (para optimizar espacio)
- Timeout de descarga: 5 minutos
- Limpieza automática: archivos > 2 horas

---

## 🔧 Troubleshooting

### Error: "yt-dlp no está instalado"

**Solución 1** (Docker):
```bash
# Reconstruir imagen
docker build -f Dockerfile.production -t uniclick-api:latest .
```

**Solución 2** (Servidor):
```bash
# Instalar yt-dlp
pip3 install --upgrade yt-dlp
```

### Error: "Error descargando video"

Posibles causas:
- Video privado o eliminado
- Rate limiting de la plataforma
- Video muy grande (>500MB)
- Problemas de red

**Solución**: Revisar logs específicos:
```bash
docker logs tu-contenedor | grep "yt-dlp"
```

### Verificar PATH

Si yt-dlp está instalado pero no se encuentra:

```bash
# Verificar PATH en Docker
docker exec tu-contenedor echo $PATH

# Debe incluir: /opt/venv/bin
```

---

## 📞 Soporte

### Comandos Útiles:

```bash
# Ver logs del contenedor
docker logs tu-contenedor

# Entrar al contenedor
docker exec -it tu-contenedor /bin/bash

# Verificar espacio en disco
docker exec tu-contenedor df -h

# Ver archivos temporales
docker exec tu-contenedor ls -lh /app/temp_downloads

# Probar yt-dlp directamente
docker exec tu-contenedor yt-dlp --version
docker exec tu-contenedor yt-dlp "URL" --get-title
```

### Logs a Revisar:

Busca estos mensajes en los logs:

✅ **Exitoso**:
```
✅ yt-dlp disponible: 2024.x.x
📥 Descargando video desde YouTube: URL
✅ Descarga completada para YouTube
```

❌ **Error**:
```
❌ yt-dlp no está instalado o no está en el PATH
❌ Error descargando video: [mensaje de error]
```

---

## 📚 Documentación Adicional

- 📄 **Guía Completa**: `INSTALACION_YT_DLP_PRODUCCION.md`
- 🔧 **Script de Verificación**: `./verify-ytdlp-production.sh`
- 🚀 **Script de Despliegue**: `./deploy-with-ytdlp.sh`
- 📖 **Guía Original**: `VIDEO_URL_SUPPORT_GUIDE.md`

---

## ⚠️ Notas Importantes

1. **Términos de Servicio**: Respeta los ToS de YouTube, TikTok e Instagram
2. **Rate Limiting**: Las plataformas pueden limitar descargas frecuentes
3. **Privacidad**: No expongas públicamente endpoints que descarguen videos
4. **Espacio**: Monitorea el uso de disco regularmente
5. **Actualizaciones**: yt-dlp se actualiza frecuentemente, considera actualizarlo cada mes

---

## ✅ Estado Actual

- ✅ Dockerfiles actualizados con yt-dlp
- ✅ Scripts de despliegue y verificación creados
- ✅ Documentación completa generada
- ⏳ **Pendiente**: Desplegar a producción y verificar

---

## 🎯 Siguiente Acción

**¡Todo está listo para desplegar!**

Ejecuta:
```bash
./deploy-with-ytdlp.sh
```

O sigue las instrucciones manuales según tu infraestructura.

---

**Fecha**: $(date)
**Cambios**: Agregado yt-dlp a Dockerfile.production y Dockerfile
**Versión yt-dlp**: Se instalará la última versión disponible
**Python**: 3.x (ya incluido en el Dockerfile)

