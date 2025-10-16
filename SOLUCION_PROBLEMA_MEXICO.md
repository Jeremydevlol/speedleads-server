# 🚨 SOLUCIÓN: Frontend Muestra Código Crudo en México

## 🎯 **Problema Identificado**

Tu aplicación está mostrando código JavaScript/React crudo en lugar del frontend renderizado de Next.js. Esto es específico de ciertos países/regiones (como México).

## 🔍 **Diagnóstico Inmediato**

### 1. **Verificar URL de Acceso**
```bash
# Probar desde México vs otros países
curl -H "cf-ipcountry: MX" https://app.uniclick.io
curl -H "cf-ipcountry: US" https://app.uniclick.io
```

### 2. **Verificar Headers de Respuesta**
```bash
# Verificar content-type desde México
curl -I -H "cf-ipcountry: MX" https://app.uniclick.io
```

### 3. **Usar el Endpoint de Diagnóstico**
```bash
# Verificar información geográfica
curl https://app.uniclick.io/api/geo-debug
```

## 🔧 **Soluciones por Orden de Prioridad**

### **SOLUCIÓN 1: Problema de CloudFront (Más Probable)**

#### **A. Verificar Configuración de CloudFront**
```bash
# Si tienes acceso a AWS CLI
aws cloudfront get-distribution-config --id E1K074YQD62Q2W

# Buscar en la configuración:
# 1. Geographic restrictions
# 2. Cache behaviors
# 3. Origin configurations
```

#### **B. Cache Invalidation**
```bash
# Limpiar cache de CloudFront
aws cloudfront create-invalidation \
  --distribution-id E1K074YQD62Q2W \
  --paths "/*"
```

### **SOLUCIÓN 2: Problema de Ruteo Backend vs Frontend**

#### **A. Verificar Configuración de Rutas**
El problema puede ser que el backend está interceptando las rutas del frontend.

```javascript
// En dist/app.js, agregar ANTES de las rutas de API:
app.get('*', (req, res, next) => {
  // Si la ruta es de API, continuar
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // Si es una ruta de frontend, redirigir a CloudFront/Vercel
  if (req.get('host') === 'app.uniclick.io') {
    return res.redirect(301, `https://app.uniclick.io${req.path}`);
  }
  
  next();
});
```

### **SOLUCIÓN 3: Configuración de Variables de Entorno**

#### **A. Verificar Variables en Producción**
```bash
# En el contenedor de ECS, verificar:
echo $FRONTEND_URL
echo $NODE_ENV
echo $NEXT_PUBLIC_BACKEND_URL
```

#### **B. Actualizar Variables de Entorno**
```env
# En tu configuración de ECS:
NODE_ENV=production
FRONTEND_URL=https://app.uniclick.io
NEXT_PUBLIC_BACKEND_URL=https://api.uniclick.io
```

### **SOLUCIÓN 4: Problema de Content-Type Headers**

#### **A. Verificar Headers de Respuesta**
```bash
# Verificar que el content-type sea correcto
curl -I https://app.uniclick.io
# Debe devolver: Content-Type: text/html; charset=utf-8
```

#### **B. Forzar Headers Correctos**
```javascript
// En tu aplicación Next.js, asegurar headers correctos
// pages/_app.js o app/layout.js
export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

## 🚀 **Pasos de Implementación**

### **1. Implementar Cambios en el Backend**

```javascript
// Agregar en dist/app.js ANTES de las rutas de API
app.use((req, res, next) => {
  // Log para debugging geográfico
  const country = req.get('cf-ipcountry') || 'unknown';
  console.log(`🌍 Request from ${country}: ${req.method} ${req.path}`);
  
  // Si es app.uniclick.io y no es API, es frontend
  if (req.get('host') === 'app.uniclick.io' && !req.path.startsWith('/api/')) {
    // Asegurar que el content-type sea HTML
    res.set('Content-Type', 'text/html; charset=utf-8');
    
    // Si el usuario agente indica un navegador, redirigir
    const userAgent = req.get('user-agent') || '';
    if (userAgent.includes('Mozilla') || userAgent.includes('Chrome')) {
      console.log(`🔄 Redirecting frontend request from ${country}`);
      return res.redirect(301, `https://app.uniclick.io${req.path}`);
    }
  }
  
  next();
});
```

### **2. Verificar Configuración de Vercel/Next.js**

```javascript
// En tu next.config.js
const nextConfig = {
  trailingSlash: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://api.uniclick.io/api/:path*',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/html; charset=utf-8',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

### **3. Deployar y Verificar**

```bash
# 1. Hacer deploy del backend
npm run build
npm start

# 2. Verificar el endpoint de diagnóstico
curl https://api.uniclick.io/api/geo-debug

# 3. Verificar desde México
curl -H "cf-ipcountry: MX" https://app.uniclick.io
```

## 🔍 **Debugging Adicional**

### **1. Verificar Logs de CloudFront**
```bash
# Si tienes acceso a AWS CloudWatch
aws logs filter-log-events \
  --log-group-name /aws/cloudfront/distribution/E1K074YQD62Q2W \
  --filter-pattern "MX"
```

### **2. Verificar Configuración de DNS**
```bash
# Verificar resolución DNS desde México
nslookup app.uniclick.io
dig app.uniclick.io
```

### **3. Probar con VPN**
1. Usar VPN para simular acceso desde México
2. Verificar si el problema persiste
3. Comparar con acceso desde otros países

## 🎯 **Resultado Esperado**

Después de implementar estas soluciones:
- ✅ Frontend se renderiza correctamente en México
- ✅ No más código JavaScript crudo en el navegador
- ✅ Headers de content-type correctos
- ✅ Logs de debugging geográfico funcionando

## 📞 **Si el Problema Persiste**

1. **Verificar con tu proveedor de CDN** (CloudFront/Vercel)
2. **Revisar configuraciones de geolocalización**
3. **Contactar soporte técnico** con los logs de debugging

---

**Fecha:** Enero 2025  
**Prioridad:** ALTA - Afecta usuarios mexicanos  
**Tiempo estimado:** 2-4 horas para resolución completa 