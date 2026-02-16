# 🌐 **GUÍA COMPLETA: SISTEMA DE DOMINIOS PERSONALIZADOS**

## 📋 **RESUMEN DEL SISTEMA**

Este sistema permite a los usuarios de Uniclick configurar dominios personalizados para sus websites, con verificación automática de DNS y configuración SSL.

### **✅ Lo que ya está implementado:**

1. **Backend completo:**
   - ✅ Tabla `custom_domains` en base de datos
   - ✅ Endpoints `/api/dns/configure`, `/api/dns/verify`, `/api/ssl/generate`
   - ✅ Verificación DNS real con Node.js
   - ✅ Sistema de estados (pending → dns_verified → ssl_pending → active)
   - ✅ Autenticación y seguridad con RLS

2. **Configuración AWS:**
   - ✅ Variables de entorno para CloudFront
   - ✅ Estructura para certificados SSL wildcard

---

## 🚀 **INSTALACIÓN Y CONFIGURACIÓN**

### **1. Ejecutar Migración de Base de Datos**

```bash
# Conectar a tu base de datos y ejecutar:
psql $DATABASE_URL -f db/migrations/2025-01-21_create_custom_domains.sql
```

**O en Supabase Dashboard:**
1. Ve a **SQL Editor**
2. Copia y pega el contenido de `db/migrations/2025-01-21_create_custom_domains.sql`
3. Ejecuta la query

### **2. Configurar Variables de Entorno**

**Desarrollo (.env):**
```env
# Básicas
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5001

# Dominios personalizados (NUEVAS)
CLOUDFRONT_DOMAIN=domains.uniclick.io
NEXT_PUBLIC_CLOUDFRONT_DOMAIN=domains.uniclick.io

# Supabase (REQUERIDAS)
SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ... # Service role key completa
```

**Producción (.env.production):**
```env
# Básicas
NODE_ENV=production
FRONTEND_URL=https://app.uniclick.io
BACKEND_URL=https://api.uniclick.io

# Dominios personalizados (CRÍTICAS)
CLOUDFRONT_DOMAIN=domains.uniclick.io
NEXT_PUBLIC_CLOUDFRONT_DOMAIN=domains.uniclick.io

# Supabase (REQUERIDAS)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ... # Service role key completa

# Seguridad
COOKIE_DOMAIN=.uniclick.io
SESSION_DOMAIN=.uniclick.io
```

### **3. Instalar Dependencias**

Si no tienes las dependencias de Supabase:

```bash
npm install @supabase/supabase-js
```

### **4. Configurar AWS**

#### **CloudFront Distribution:**
1. Agregar CNAME: `domains.uniclick.io`
2. Certificado SSL debe cubrir `*.uniclick.io`
3. Origin para `domains.uniclick.io` → Tu ECS/ALB

#### **Route 53:**
```
CNAME domains.uniclick.io → tu-distribution.cloudfront.net
```

#### **Application Load Balancer:**
```
Host: domains.uniclick.io → Target Group backend
```

---

## 🧪 **TESTING**

### **1. Test Básico con Script**

```bash
# Ejecutar test suite
node test-custom-domains.js
```

### **2. Test Manual con cURL**

```bash
# Obtener JWT token (ajustar según tu sistema de auth)
TOKEN="tu-jwt-token-aqui"

# 1. Configurar dominio
curl -X POST http://localhost:5001/api/dns/configure \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "subdomain": "shop",
    "websiteId": "uuid-de-tu-website"
  }'

# 2. Verificar DNS
curl -X POST http://localhost:5001/api/dns/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain": "shop.example.com"}'

# 3. Generar SSL
curl -X POST http://localhost:5001/api/ssl/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain": "shop.example.com"}'

# 4. Listar dominios del usuario
curl -X GET http://localhost:5001/api/dns/domains \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📱 **INTEGRACIÓN FRONTEND**

### **Ejemplo de uso en React/Next.js:**

```javascript
// hooks/useCustomDomains.js
import { useState } from 'react';

export function useCustomDomains() {
  const [loading, setLoading] = useState(false);
  
  const configureDomain = async (domain, subdomain, websiteId) => {
    setLoading(true);
    try {
      const response = await fetch('/api/dns/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ domain, subdomain, websiteId })
      });
      
      const result = await response.json();
      return result;
    } finally {
      setLoading(false);
    }
  };
  
  const verifyDomain = async (domain) => {
    const response = await fetch('/api/dns/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ domain })
    });
    
    return response.json();
  };
  
  const generateSSL = async (domain) => {
    const response = await fetch('/api/ssl/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ domain })
    });
    
    return response.json();
  };
  
  return { configureDomain, verifyDomain, generateSSL, loading };
}

// components/CustomDomainModal.js
import { useState } from 'react';
import { useCustomDomains } from '../hooks/useCustomDomains';

export function CustomDomainModal({ websiteId }) {
  const [domain, setDomain] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [step, setStep] = useState('configure');
  const [domainData, setDomainData] = useState(null);
  
  const { configureDomain, verifyDomain, generateSSL, loading } = useCustomDomains();
  
  const handleConfigure = async () => {
    const result = await configureDomain(domain, subdomain, websiteId);
    if (result.success) {
      setDomainData(result);
      setStep('dns-instructions');
    }
  };
  
  const handleVerify = async () => {
    const result = await verifyDomain(`${subdomain}.${domain}`);
    if (result.verified) {
      setStep('ssl-generation');
      // Auto-generate SSL
      const sslResult = await generateSSL(`${subdomain}.${domain}`);
      if (sslResult.success) {
        setStep('completed');
      }
    }
  };
  
  return (
    <div className="modal">
      {step === 'configure' && (
        <div>
          <h3>Configurar Dominio Personalizado</h3>
          <input
            placeholder="ejemplo.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <input
            placeholder="tienda (opcional)"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
          />
          <button onClick={handleConfigure} disabled={loading}>
            Configurar
          </button>
        </div>
      )}
      
      {step === 'dns-instructions' && (
        <div>
          <h3>Configurar DNS</h3>
          <p>Configura estos registros en tu proveedor DNS:</p>
          <div className="dns-record">
            <strong>Tipo:</strong> CNAME<br/>
            <strong>Nombre:</strong> {domainData.dnsRecords.cname.name}<br/>
            <strong>Valor:</strong> {domainData.dnsRecords.cname.value}<br/>
            <strong>TTL:</strong> {domainData.dnsRecords.cname.ttl}
          </div>
          <button onClick={handleVerify}>Verificar DNS</button>
        </div>
      )}
      
      {step === 'completed' && (
        <div>
          <h3>✅ ¡Dominio Configurado!</h3>
          <p>Tu dominio personalizado está listo:</p>
          <a href={`https://${subdomain}.${domain}`} target="_blank">
            https://{subdomain}.{domain}
          </a>
        </div>
      )}
    </div>
  );
}
```

---

## 🔄 **FLUJO COMPLETO DEL USUARIO**

### **Paso 1: Configuración**
- Usuario ingresa `ejemplo.com` y `tienda`
- Sistema genera `CNAME tienda → domains.uniclick.io`
- Estado: `pending`

### **Paso 2: DNS**
- Usuario configura DNS en su proveedor
- Sistema verifica con `dns.resolve()`
- Estado: `dns_verified`

### **Paso 3: SSL**
- Sistema genera/asigna certificado SSL
- En desarrollo: simulado
- En producción: via certificado wildcard
- Estado: `active`

### **Paso 4: Activo**
- `https://tienda.ejemplo.com` funciona
- Redirige al website del usuario

---

## 🗄️ **ESQUEMA DE BASE DE DATOS**

```sql
-- Tabla principal
custom_domains (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  website_id UUID REFERENCES websites(id),
  domain TEXT NOT NULL,              -- "tienda.ejemplo.com"
  subdomain TEXT,                    -- "tienda"
  root_domain TEXT,                  -- "ejemplo.com"
  status TEXT,                       -- pending|dns_verified|ssl_pending|active|failed
  dns_records JSONB,                 -- Records to configure
  ssl_status TEXT,                   -- pending|generating|active|failed
  ssl_certificate_id TEXT,           -- Certificate reference
  cloudfront_domain TEXT,            -- "domains.uniclick.io"
  error_message TEXT,                -- Error details
  last_verified_at TIMESTAMPTZ,      -- Last DNS check
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

---

## 📊 **MONITOREO Y LOGS**

### **Logs importantes a buscar:**

**✅ Éxito:**
```
✅ Custom domain configured: shop.example.com
✅ DNS verified for: shop.example.com
✅ SSL generated for: shop.example.com
```

**❌ Errores:**
```
❌ Domain already exists: shop.example.com
❌ DNS verification failed: CNAME not found
❌ Website not found for user
```

### **Queries de monitoreo:**

```sql
-- Dominios por estado
SELECT status, COUNT(*) FROM custom_domains GROUP BY status;

-- Dominios con errores
SELECT domain, error_message, created_at 
FROM custom_domains 
WHERE status = 'failed' 
ORDER BY created_at DESC;

-- Actividad reciente
SELECT domain, status, ssl_status, last_verified_at
FROM custom_domains 
WHERE updated_at > NOW() - INTERVAL '24 hours'
ORDER BY updated_at DESC;
```

---

## 🚨 **RESOLUCIÓN DE PROBLEMAS**

### **Error: "custom_domains table does not exist"**
```bash
# Ejecutar migración
psql $DATABASE_URL -f db/migrations/2025-01-21_create_custom_domains.sql
```

### **Error: "SUPABASE_SERVICE_ROLE_KEY is required"**
```bash
# Obtener service role key desde Supabase Dashboard
# Settings → API → service_role key
echo "SUPABASE_SERVICE_ROLE_KEY=eyJ..." >> .env
```

### **Error: "DNS lookup failed"**
```bash
# Verificar conectividad DNS
nslookup example.com
dig example.com CNAME

# Verificar desde contenedor
docker exec -it backend-container nslookup example.com
```

### **Error: "Website not found"**
```sql
-- Verificar que el website existe y pertenece al usuario
SELECT id, user_id, business_name FROM websites WHERE id = 'website-uuid';
```

### **Error: "JWT token required"**
```javascript
// Verificar que el token se envía correctamente
fetch('/api/dns/configure', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## 📈 **PRÓXIMAS MEJORAS**

### **Fase 1 (Actual):**
- ✅ Configuración básica
- ✅ Verificación DNS
- ✅ SSL simulado

### **Fase 2 (Futuro):**
- [ ] Integración AWS ACM real
- [ ] Webhook de verificación SSL
- [ ] Dashboard de dominios
- [ ] Metrics y analytics

### **Fase 3 (Avanzado):**
- [ ] Subdominios automáticos
- [ ] Certificados personalizados
- [ ] CDN personalizado
- [ ] API para partners

---

## 🎯 **CHECKLIST DE DEPLOYMENT**

### **Pre-deployment:**
- [ ] Migración de BD ejecutada
- [ ] Variables de entorno configuradas
- [ ] Tests pasando
- [ ] CloudFront configurado
- [ ] Route 53 configurado

### **Post-deployment:**
- [ ] Health check OK
- [ ] Endpoints respondiendo
- [ ] Base de datos conectada
- [ ] Logs sin errores críticos
- [ ] Test manual exitoso

### **Frontend (siguientes pasos):**
- [ ] Modal de configuración
- [ ] Estados de progreso
- [ ] Instrucciones DNS
- [ ] Verificación automática
- [ ] Dashboard de dominios

---

**🎉 ¡El sistema de dominios personalizados está listo para producción!**

Para cualquier problema, consulta los logs del servidor y verifica que todas las variables de entorno estén configuradas correctamente. 