# 🔄 Forzar Deploy en Render al Último Commit

## ✅ Problema Resuelto

El workflow viejo de AWS ECS/ECR ha sido **eliminado**. Ahora solo existe el workflow de Render.

**Último commit**: `d48d4e3` - Remove AWS ECS/ECR workflow

## 🚀 Cómo Forzar el Deploy del Último Commit

### Opción 1: Deploy Manual desde Render Dashboard (Recomendado)

1. Ve a tu servicio en Render:
   ```
   https://dashboard.render.com/web/srv-d3occ13e5dus73aki5m0
   ```

2. Click en **"Manual Deploy"** (botón azul en la parte superior)

3. Selecciona **"Deploy latest commit"**

4. Render construirá y desplegará el commit `d48d4e3`

5. Espera 5-10 minutos y monitorea los logs

### Opción 2: Forzar con un Commit Vacío

Si Render no detecta el cambio, puedes forzarlo con un commit vacío:

```bash
cd "/Users/jeremyuniclick/api copia"
git commit --allow-empty -m "Force Render redeploy"
git push origin main
```

Esto disparará el workflow de GitHub Actions que llamará al Deploy Hook de Render.

### Opción 3: Usar el Deploy Hook Directamente

Si configuraste el secret `RENDER_DEPLOY_HOOK` en GitHub, puedes ejecutar el workflow manualmente:

1. Ve a: https://github.com/Jeremydevlol/speedleads-server/actions
2. Selecciona **"Deploy to Render"**
3. Click en **"Run workflow"**
4. Selecciona branch **"main"**
5. Click en **"Run workflow"**

## 🔍 Verificar que Render Usa el Commit Correcto

Una vez que el deploy termine, verifica en el Dashboard de Render:

1. Ve a: https://dashboard.render.com/web/srv-d3occ13e5dus73aki5m0
2. En la sección **"Events"** o **"Deploys"**, verifica que el commit sea `d48d4e3`
3. Debe decir: "Remove AWS ECS/ECR workflow - Use only Render deployment"

## 📊 Verificar que el Backend Funciona

```bash
# Health check
curl https://speedleads-server.onrender.com/api/health

# Debe responder:
# {"status":"ok","timestamp":"..."}
```

## 🐛 Si Render Sigue Usando el Commit Viejo

### Causa Posible 1: Render no está conectado al repositorio correcto
**Solución**:
1. Ve a Settings → Build & Deploy
2. Verifica que el repositorio sea: `https://github.com/Jeremydevlol/speedleads-server.git`
3. Verifica que la rama sea: `main`

### Causa Posible 2: Auto-Deploy está desactivado
**Solución**:
1. Ve a Settings → Build & Deploy
2. Activa **"Auto-Deploy"**: Yes

### Causa Posible 3: Render tiene el repositorio cacheado
**Solución**:
1. Ve a Settings
2. Scroll hasta **"Danger Zone"**
3. Click en **"Clear build cache & deploy"**

## ✨ Workflows Actuales

Ahora solo tienes **1 workflow** en GitHub:

```
.github/workflows/render-deploy.yml
```

Este workflow:
- ✅ Se ejecuta en cada push a `main`
- ✅ Llama al Deploy Hook de Render
- ✅ NO intenta desplegar a AWS
- ✅ Es rápido y simple

## 🎉 Próximos Deploys

De ahora en adelante, cada vez que hagas:

```bash
git push origin main
```

El workflow de Render se ejecutará automáticamente y desplegará la nueva versión. **No más AWS ECS/ECR**.

## 📝 Nota Importante

Si ves errores de "Build and Push to ECR" en GitHub Actions, ignóralos. Esos son de runs anteriores del workflow viejo. Los nuevos pushes solo ejecutarán el workflow de Render.
