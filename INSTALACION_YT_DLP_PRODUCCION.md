# 🎬 Instalación de yt-dlp para Producción

## ✅ Cambios Realizados

Se ha actualizado la configuración de Docker para incluir **yt-dlp** en los contenedores de producción.

### Archivos Modificados:
1. ✅ `Dockerfile.production` - Instalación de yt-dlp agregada
2. ✅ `Dockerfile` - Instalación de yt-dlp agregada

### Qué se Instaló:
- **yt-dlp**: Herramienta para descargar videos de YouTube, TikTok, Instagram Reels y otras plataformas
- **FFmpeg**: Ya estaba instalado (necesario para procesamiento de video/audio)
- **Python 3 + pip**: Ya estaba instalado (necesario para ejecutar yt-dlp)

---

## 🚀 Despliegue a Producción

### Opción 1: Docker Build (Recomendado para ECS/ECR)

```bash
# 1. Construir la imagen con los cambios
docker build -f Dockerfile.production -t uniclick-api:latest .

# 2. Probar localmente
docker run -d -p 5001:5001 --name test-api uniclick-api:latest

# 3. Verificar que yt-dlp está instalado
docker exec test-api yt-dlp --version

# 4. Si todo funciona, detener el contenedor de prueba
docker stop test-api && docker rm test-api
```

### Opción 2: Despliegue a AWS ECS/ECR

```bash
# 1. Autenticarse con ECR
aws ecr get-login-password --region tu-region | docker login --username AWS --password-stdin tu-cuenta.dkr.ecr.tu-region.amazonaws.com

# 2. Construir y etiquetar la imagen
docker build -f Dockerfile.production -t uniclick-api:latest .
docker tag uniclick-api:latest tu-cuenta.dkr.ecr.tu-region.amazonaws.com/uniclick-api:latest

# 3. Subir a ECR
docker push tu-cuenta.dkr.ecr.tu-region.amazonaws.com/uniclick-api:latest

# 4. Actualizar el servicio ECS (opción 1: forzar nuevo despliegue)
aws ecs update-service \
  --cluster tu-cluster \
  --service uniclick-api-service \
  --force-new-deployment

# Opción 2: Actualizar task definition
aws ecs update-service \
  --cluster tu-cluster \
  --service uniclick-api-service \
  --task-definition uniclick-api-task:nueva-revision
```

### Opción 3: Servidor VPS/EC2 Manual

Si estás desplegando directamente en un servidor:

```bash
# 1. Conectarse al servidor
ssh usuario@tu-servidor

# 2. Actualizar el repositorio
cd /ruta/a/tu/api
git pull origin main

# 3. Instalar yt-dlp globalmente
pip3 install --upgrade yt-dlp

# 4. Verificar instalación
yt-dlp --version

# 5. Reiniciar la aplicación
pm2 restart uniclick-api
# O si usas systemd:
sudo systemctl restart uniclick-api
```

---

## 🧪 Verificación Post-Despliegue

### 1. Verificar que yt-dlp está disponible

Si usas Docker:
```bash
docker exec tu-contenedor yt-dlp --version
```

Si es un servidor:
```bash
yt-dlp --version
```

### 2. Probar la funcionalidad

Puedes usar el endpoint de la API para enviar una URL de video:

```bash
# Ejemplo con curl
curl -X POST https://tu-api.com/api/sendInstruction \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN" \
  -d '{
    "instruction": "Analiza este video",
    "media": [
      {
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "type": "video/url"
      }
    ]
  }'
```

### 3. Revisar logs

```bash
# Docker
docker logs tu-contenedor

# PM2
pm2 logs uniclick-api

# Buscar confirmación de yt-dlp
# Deberías ver: ✅ yt-dlp disponible: versión X.X.X
```

---

## 📋 Plataformas Soportadas

La API ahora puede procesar URLs de:
- ✅ **YouTube** (videos, shorts)
- ✅ **TikTok** (videos)
- ✅ **Instagram** (reels)

---

## 🔧 Troubleshooting

### Error: "yt-dlp no está instalado o no está en el PATH"

**Causa**: yt-dlp no está disponible en el PATH del contenedor/servidor.

**Soluciones**:

1. **Docker**: Reconstruir la imagen con los cambios:
   ```bash
   docker build -f Dockerfile.production -t uniclick-api:latest .
   ```

2. **Servidor Manual**: Instalar yt-dlp:
   ```bash
   pip3 install --upgrade yt-dlp
   ```

3. **Verificar PATH**: Asegurarse de que `/opt/venv/bin` está en el PATH:
   ```bash
   export PATH="/opt/venv/bin:$PATH"
   ```

### Error: "Error descargando video"

**Causas posibles**:
- Video privado o no disponible
- Límites de la plataforma (rate limiting)
- Video demasiado grande

**Solución**: Revisar los logs para el error específico:
```bash
docker logs tu-contenedor | grep "yt-dlp"
```

### Error: "ffmpeg no encontrado"

**Causa**: FFmpeg no está instalado (necesario para procesamiento de audio/video).

**Solución**: FFmpeg ya está incluido en el Dockerfile. Si persiste el error, verificar:
```bash
docker exec tu-contenedor which ffmpeg
```

---

## 📊 Recursos del Sistema

### Espacio en Disco

Los videos se descargan temporalmente en `/app/temp_downloads`. El sistema limpia automáticamente archivos más antiguos de 2 horas.

**Recomendaciones**:
- Mínimo: 10 GB de espacio libre
- Recomendado: 20+ GB para múltiples usuarios simultáneos

### Memoria

Descargar y procesar videos consume memoria adicional:
- Videos cortos (<5 min): ~200-500 MB
- Videos medianos (5-15 min): ~500 MB - 1 GB
- Videos largos (>15 min): 1-2 GB+

**Recomendaciones ECS**:
- Task Memory: Mínimo 2 GB, recomendado 4 GB
- Task CPU: Mínimo 1 vCPU, recomendado 2 vCPU

---

## 🔄 Actualizaciones Futuras

Para actualizar yt-dlp en el futuro:

```bash
# En Docker (reconstruir imagen)
docker build -f Dockerfile.production -t uniclick-api:latest .

# En servidor manual
pip3 install --upgrade yt-dlp
pm2 restart uniclick-api
```

---

## 📞 Soporte

Si tienes problemas:

1. Revisar logs del contenedor/servicio
2. Verificar que yt-dlp está en el PATH
3. Probar yt-dlp manualmente:
   ```bash
   docker exec tu-contenedor yt-dlp --version
   docker exec tu-contenedor yt-dlp "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --get-title
   ```

---

## ✅ Checklist de Despliegue

- [ ] Dockerfiles actualizados con yt-dlp
- [ ] Imagen Docker construida con los cambios
- [ ] Prueba local exitosa
- [ ] Imagen subida a ECR/Docker Registry
- [ ] Servicio ECS actualizado con nueva imagen
- [ ] Verificación de yt-dlp en producción (`yt-dlp --version`)
- [ ] Prueba de URL de video en API de producción
- [ ] Monitoreo de logs por 24 horas
- [ ] Verificación de espacio en disco disponible

---

## 📝 Notas Importantes

1. **Límites de Uso**: Respeta los términos de servicio de YouTube, TikTok e Instagram
2. **Rate Limiting**: Las plataformas pueden limitar descargas frecuentes desde la misma IP
3. **Seguridad**: No exponer públicamente endpoints que permitan descargar videos arbitrarios
4. **Limpieza**: El sistema limpia automáticamente archivos temporales cada 2 horas
5. **Tamaño**: Los videos se descargan en calidad máxima 720p para optimizar espacio

---

**Fecha de actualización**: $(date)
**Versión de yt-dlp requerida**: 2024.x o superior
**Versión de Python requerida**: 3.8 o superior

