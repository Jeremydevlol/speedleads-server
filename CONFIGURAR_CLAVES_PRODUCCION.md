# 🔑 **CONFIGURACIÓN DE CLAVES PARA PRODUCCIÓN**

## ⚠️ **IMPORTANTE: ACTUALIZAR VARIABLES DE ENTORNO**

El sistema actualmente tiene claves **TEST** configuradas. Necesitas actualizar a las claves **LIVE** para producción.

## **Variables a Actualizar en .env:**

```bash
# 🔄 CAMBIAR ESTAS VARIABLES:

# 1. Cambiar de test a live
STRIPE_SECRET_KEY=sk_live_***TU_CLAVE_DE_STRIPE_DASHBOARD***

# 2. Clave pública (para frontend)
STRIPE_PUBLISHABLE_KEY=pk_live_***TU_CLAVE_PUBLICA_STRIPE***

# 3. Configurar entorno de producción
APP_ENV=production

# 4. Webhook secret (obtendrás este de Stripe Dashboard después de configurar el webhook)
STRIPE_WEBHOOK_SECRET=whsec_[OBTENER_DE_STRIPE_DASHBOARD]

# 5. URLs de producción
FRONTEND_URL=https://app.uniclick.io
BACKEND_URL=https://api.uniclick.io
```

## **🔧 Pasos para Aplicar:**

### **1. Actualizar .env:**
```bash
# Editar manualmente tu archivo .env y cambiar estas líneas:
nano .env

# O usar sed para actualizar automáticamente:
sed -i '' 's/sk_test_[^=]*/sk_live_TU_CLAVE_AQUI/' .env
sed -i '' 's/APP_ENV=development/APP_ENV=production/' .env
```

### **2. Reiniciar el Servidor:**
```bash
# Matar proceso actual
pkill -f "node dist/app.js"

# Arrancar de nuevo
npm start
```

### **3. Configurar Webhook en Stripe Dashboard:**

1. **Ir a:** [https://dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. **Crear endpoint:** `https://api.uniclick.io/api/stripe/webhook`
3. **Seleccionar eventos:**
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. **Copiar webhook secret** y actualizar `STRIPE_WEBHOOK_SECRET` en .env

### **4. Verificar Configuración:**
```bash
# Test health check
curl https://api.uniclick.io/api/health

# Debe devolver:
{
  "ok": true,
  "env": "production",  ← Importante: debe ser "production"
  "status": "OK"
}
```

## **🛡️ Validaciones de Seguridad:**

### **Después de actualizar, el sistema validará:**
- ✅ **Claves live** configuradas correctamente
- ✅ **APP_ENV=production** activo
- ✅ **Webhooks** solo procesando eventos live
- ✅ **Logs seguros** sin exponer claves

### **Logs esperados en arranque:**
```
🎉 Sistema de Billing inicializado correctamente
📡 Webhook URL: https://api.uniclick.io/api/stripe/webhook
🌍 Entorno: production
```

## **⚡ DESPUÉS DE APLICAR:**

1. **Sistema funcionará en modo producción**
2. **Solo procesará eventos live de Stripe** 
3. **Webhooks seguros** con signature validation
4. **Logs sin claves expuestas**

**¡IMPORTANTE: Reiniciar el servidor después de cambiar las variables!**




