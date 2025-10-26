# 🔄 Configuración de GitHub Actions para Deploy Automático a Render

## ✅ GitHub Action Configurado

Se ha creado un workflow en `.github/workflows/render-deploy.yml` que desplegará automáticamente a Render cada vez que hagas push a la rama `main`.

## 🔧 Configuración Requerida

### Paso 1: Obtener el Deploy Hook de Render

1. Ve al Dashboard de Render:
   ```
   https://dashboard.render.com/web/srv-d3occ13e5dus73aki5m0
   ```

2. Ve a **Settings** → **Deploy Hook**

3. Copia la URL completa del Deploy Hook. Debe verse así:
   ```
   https://api.render.com/deploy/srv-d3occ13e5dus73aki5m0?key=XXXXXXXXXXXXXXXX
   ```

4. **Extrae solo la KEY** (la parte después de `?key=`):
   ```
   XXXXXXXXXXXXXXXX
   ```

### Paso 2: Agregar el Secret en GitHub

1. Ve a tu repositorio en GitHub:
   ```
   https://github.com/Jeremydevlol/speedleads-server
   ```

2. Ve a **Settings** → **Secrets and variables** → **Actions**

3. Click en **New repository secret**

4. Agrega el secret:
   - **Name**: `RENDER_DEPLOY_HOOK`
   - **Value**: `XXXXXXXXXXXXXXXX` (la key que copiaste)

5. Click en **Add secret**

## 🚀 Cómo Funciona

### Deploy Automático
Cada vez que hagas push a `main`:

```bash
git add .
git commit -m "Update backend"
git push origin main
```

El workflow se ejecutará automáticamente y:
1. ✅ Disparará el deploy en Render
2. ✅ Mostrará información del deployment
3. ✅ Te dará el link para monitorear el progreso

### Deploy Manual
También puedes ejecutar el workflow manualmente desde GitHub:

1. Ve a **Actions** en tu repositorio
2. Selecciona **Deploy to Render**
3. Click en **Run workflow**
4. Selecciona la rama `main`
5. Click en **Run workflow**

## 📊 Monitoreo

### Ver el Workflow en GitHub
```
https://github.com/Jeremydevlol/speedleads-server/actions
```

### Ver el Deploy en Render
```
https://dashboard.render.com/web/srv-d3occ13e5dus73aki5m0/logs
```

## 🔍 Verificación

Una vez que el deploy termine (5-10 minutos), verifica que funcione:

```bash
# Health check
curl https://speedleads-server.onrender.com/api/health

# Debe responder:
# {"status":"ok","timestamp":"..."}
```

## ⚡ Ventajas del Deploy Automático

1. **Sin configuración de AWS** - No más ECS, ECR, ni configuraciones complejas
2. **Deploy rápido** - Solo hace push y Render se encarga del resto
3. **Logs en tiempo real** - Monitorea el progreso desde el dashboard
4. **Rollback fácil** - Puedes volver a versiones anteriores desde Render
5. **Sin costos de CI/CD** - GitHub Actions es gratis para repos públicos

## 🐛 Troubleshooting

### Error: "Deploy hook failed"
**Causa**: El secret `RENDER_DEPLOY_HOOK` no está configurado o es incorrecto

**Solución**:
1. Verifica que el secret esté en GitHub Settings → Secrets
2. Verifica que la key sea correcta (cópiala de nuevo desde Render)
3. Asegúrate de que el nombre sea exactamente `RENDER_DEPLOY_HOOK`

### Error: "Service not found"
**Causa**: El Service ID en el workflow es incorrecto

**Solución**:
1. Verifica que el Service ID sea `srv-d3occ13e5dus73aki5m0`
2. Si cambiaste de servicio, actualiza el ID en `.github/workflows/render-deploy.yml`

## 📝 Notas Importantes

- ⚠️ **NO subas la key del deploy hook al código** - Siempre usa GitHub Secrets
- ⚠️ **El deploy tarda 5-10 minutos** - Ten paciencia, Render está construyendo la imagen Docker
- ✅ **Auto-deploy está habilitado** - Render también desplegará automáticamente cuando detecte cambios
- ✅ **Puedes desactivar el workflow** - Si prefieres solo usar auto-deploy de Render, puedes eliminar el archivo `.github/workflows/render-deploy.yml`

## 🎯 Flujo Completo

```
1. Haces cambios en el código
   ↓
2. git push origin main
   ↓
3. GitHub Actions ejecuta el workflow
   ↓
4. Workflow dispara el deploy en Render
   ↓
5. Render construye la imagen Docker
   ↓
6. Render despliega la nueva versión
   ↓
7. Backend actualizado en https://speedleads-server.onrender.com
```

## 🎉 ¡Listo!

Una vez configurado el secret `RENDER_DEPLOY_HOOK`, el deploy automático estará funcionando. Cada push a `main` desplegará automáticamente a Render.
