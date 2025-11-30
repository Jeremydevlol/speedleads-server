# 📱 Código Encargado de Detectar Dispositivo Real

## 🔍 Archivos y Funciones Clave

---

## 1. **Extracción de Headers del Cliente** 

### Archivo: `dist/app.js` (Líneas 2229-2285)

**Función que extrae la información del dispositivo real del cliente:**

```javascript
// ⭐ Extraer información REAL del dispositivo del cliente en tiempo real
function getRealClientIP(req) {
  const ip = 
    req.headers['cf-connecting-ip'] ||        // Cloudflare
    req.headers['x-real-ip'] ||                // Nginx
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() || // Proxy chain
    req.headers['x-client-ip'] ||              // Apache
    req.connection?.remoteAddress ||           // Conexión directa
    req.socket?.remoteAddress ||               // Socket
    req.ip ||                                  // Express
    'unknown';
  
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    return '127.0.0.1';
  }
  return ip.replace('::ffff:', '');
}

const clientIP = getRealClientIP(req);
const userAgent = req.headers['user-agent'] || req.headers['User-Agent'] || '';
const timezoneOffset = req.headers['x-timezone-offset'] || null;
const timezone = req.headers['x-timezone'] || null;
const country = req.headers['cf-ipcountry'] || req.headers['x-country'] || null;
const city = req.headers['cf-ipcity'] || req.headers['x-city'] || null;

const deviceHeaders = {
  'user-agent': userAgent,
  'accept-language': req.headers['accept-language'] || 'es-ES,es;q=0.9',
  'accept-encoding': req.headers['accept-encoding'] || 'gzip, deflate, br',
  'sec-ch-ua': req.headers['sec-ch-ua'] || '',
  'sec-ch-ua-platform': req.headers['sec-ch-ua-platform'] || '',
  'sec-ch-ua-mobile': req.headers['sec-ch-ua-mobile'] || '',
  'timezone-offset': timezoneOffset,
  'timezone': timezone,
  'country': country,
  'city': city,
  'timestamp': Date.now().toString()
};

// Pasar al login
const loginResult = await session.login({ 
  username, 
  password, 
  clientIP, 
  deviceHeaders 
});
```

**Ubicación:** `dist/app.js` líneas 2229-2285

---

## 2. **Detección y Generación del Dispositivo Real**

### Archivo: `dist/services/instagramService.js` (Líneas 121-256)

**Función que detecta y configura el dispositivo basado en el User-Agent real:**

```121:256:dist/services/instagramService.js
  async generateRealDeviceFromHeaders(username, deviceHeaders = {}) {
    try {
      const userAgent = deviceHeaders['user-agent'] || '';
      
      if (!userAgent) {
        P.warn('⚠️ No se detectó User-Agent, usando generación por defecto');
        this.ig.state.generateDevice(username);
        return null;
      }

      // Detectar dispositivo móvil o desktop desde User-Agent
      const isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      const isAndroid = /Android/i.test(userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
      
      // Extraer información del User-Agent
      let deviceString = null;
      let androidVersion = null;
      let build = null;
      
      if (isAndroid && userAgent) {
        // Extraer versión de Android desde User-Agent
        const androidMatch = userAgent.match(/Android\s+([\d.]+)/i);
        if (androidMatch) {
          androidVersion = androidMatch[1].split('.')[0];
        }
        
        // Intentar extraer información del dispositivo
        const deviceInfo = userAgent.match(/\(Linux; Android [\d.]+; (.+?)\)/i);
        
        if (deviceInfo && deviceInfo[1]) {
          const deviceParts = deviceInfo[1].split(/[;)]/)[0].trim();
          P.info(`📱 Dispositivo Android detectado: ${deviceParts}`);
          
          // Construir deviceString en formato Instagram
          const version = androidVersion || '30';
          const release = androidVersion ? `${androidVersion}.0.0` : '13.0.0';
          const dpi = '420';
          const resolution = '1080x2400';
          
          // Intentar extraer manufacturer y model
          let manufacturer = 'samsung';
          let model = 'SM-G991B';
          
          if (/samsung/i.test(deviceParts) || /SM-/i.test(deviceParts)) {
            manufacturer = 'samsung';
            const smMatch = deviceParts.match(/SM-([A-Z0-9]+)/i);
            if (smMatch) model = `SM-${smMatch[1]}`;
          } else if (/xiaomi|redmi|mi/i.test(deviceParts)) {
            manufacturer = 'Xiaomi';
            model = deviceParts.match(/(Redmi|Mi|POCO)[\s-]?([A-Z0-9\s]+)/i)?.[0] || 'Mi 9T';
          } else if (/oneplus/i.test(deviceParts)) {
            manufacturer = 'OnePlus';
            model = deviceParts.match(/ONEPLUS\s+([A-Z0-9]+)/i)?.[1] || 'ONEPLUS A6003';
          }
          
          deviceString = `${version}/${release}; ${dpi}dpi; ${resolution}; ${manufacturer.toLowerCase()}; ${model}; ${model.toLowerCase()}; ${model.toLowerCase()}`;
        }
      }
      
      // Si no pudimos construir un deviceString específico, usar generación por defecto
      if (!deviceString) {
        P.info(`📱 Usando generación por defecto pero con User-Agent real del cliente`);
        this.ig.state.generateDevice(username);
        
        // Guardar User-Agent para referencia
        this.ig.request.defaults.headers = {
          ...this.ig.request.defaults.headers,
          'User-Agent': userAgent,
          'Accept-Language': deviceHeaders['accept-language'] || 'es-ES,es;q=0.9'
        };
        
        return {
          deviceString: this.ig.state.deviceString,
          deviceId: this.ig.state.deviceId,
          uuid: this.ig.state.uuid,
          phoneId: this.ig.state.phoneId,
          userAgent: userAgent,
          isRealDevice: true
        };
      }
      
      // Configurar dispositivo detectado
      const deviceId = `android-${this.generateRandomDeviceId()}`;
      const uuid = this.generateRandomUUID();
      const phoneId = this.generateRandomUUID();
      
      this.ig.state.deviceString = deviceString;
      this.ig.state.deviceId = deviceId;
      this.ig.state.uuid = uuid;
      this.ig.state.phoneId = phoneId;
      this.ig.state.adid = this.generateRandomUUID();
      this.ig.state.build = build || androidVersion || '30';
      
      // Configurar headers reales del cliente
      this.ig.request.defaults.headers = {
        ...this.ig.request.defaults.headers,
        'User-Agent': userAgent,
        'Accept-Language': deviceHeaders['accept-language'] || 'es-ES,es;q=0.9',
        'Accept-Encoding': deviceHeaders['accept-encoding'] || 'gzip, deflate, br'
      };
      
      if (deviceHeaders['sec-ch-ua']) {
        this.ig.request.defaults.headers['sec-ch-ua'] = deviceHeaders['sec-ch-ua'];
      }
      if (deviceHeaders['sec-ch-ua-platform']) {
        this.ig.request.defaults.headers['sec-ch-ua-platform'] = deviceHeaders['sec-ch-ua-platform'];
      }
      
      P.info(`📱 Dispositivo REAL detectado y configurado: ${deviceString.substring(0, 80)}...`);
      P.info(`   User-Agent: ${userAgent.substring(0, 100)}...`);
      
      return {
        deviceString: deviceString,
        deviceId: deviceId,
        uuid: uuid,
        phoneId: phoneId,
        adid: this.ig.state.adid,
        build: build || androidVersion || '30',
        userAgent: userAgent,
        isRealDevice: true
      };
      
    } catch (error) {
      P.warn(`⚠️ Error detectando dispositivo real: ${error.message}, usando generación por defecto`);
      this.ig.state.generateDevice(username);
      return null;
    }
  }
```

**Ubicación:** `dist/services/instagramService.js` líneas 121-256

---

## 3. **Uso del Dispositivo Real en el Login**

### Archivo: `dist/services/instagramService.js` (Líneas 610-639)

**Función que usa el dispositivo real durante el login:**

```610:639:dist/services/instagramService.js
      // Login normal - con manejo mejorado de challenges
      try {
        // ⭐ SIEMPRE usar dispositivo REAL del cliente en tiempo real
        // NO usar dispositivo guardado - detectar en tiempo real
        
        // Verificar si deviceHeaders existe y tiene user-agent
        if (deviceHeaders && deviceHeaders['user-agent'] && deviceHeaders['user-agent'].trim() !== '') {
          P.info(`📱 Detectando dispositivo REAL del cliente en tiempo real...`);
          P.info(`   User-Agent recibido: ${deviceHeaders['user-agent'].substring(0, 100)}...`);
          await this.generateRealDeviceFromHeaders(username, deviceHeaders);
        } else {
          P.warn('⚠️ No se recibió User-Agent en deviceHeaders');
          P.warn(`   deviceHeaders existe: ${!!deviceHeaders}`);
          P.warn(`   user-agent en deviceHeaders: ${deviceHeaders?.['user-agent'] || 'NO EXISTE'}`);
          
          // Intentar usar generación por defecto pero con información mínima
          this.ig.state.generateDevice(username);
          
          // Si hay deviceHeaders pero sin user-agent, al menos configurar otros headers
          if (deviceHeaders) {
            if (deviceHeaders['accept-language']) {
              this.ig.request.defaults.headers['Accept-Language'] = deviceHeaders['accept-language'];
            }
          }
        }
        
        // 🕐 Configurar timestamp actual en tiempo real para el login
        const loginTimestamp = Math.floor(Date.now() / 1000);
        P.info(`🕐 Login iniciado en tiempo real - Timestamp: ${loginTimestamp}`);
```

**Ubicación:** `dist/services/instagramService.js` líneas 610-639

---

## 4. **Configuración de Ubicación y Hora en Tiempo Real**

### Archivo: `dist/services/instagramService.js` (Líneas 461-528)

**Código que configura ubicación (IP) y hora en tiempo real:**

```461:528:dist/services/instagramService.js
      // 📍 CONFIGURAR UBICACIÓN EN TIEMPO REAL
      if (clientIP && clientIP !== 'unknown') {
        try {
          // Establecer la IP del cliente en los headers de Instagram (tiempo real)
          this.ig.request.defaults.headers = {
            ...this.ig.request.defaults.headers,
            'X-Forwarded-For': clientIP,
            'X-Real-IP': clientIP,
            'CF-Connecting-IP': clientIP
          };
          P.info(`📍 Ubicación REAL configurada - IP del cliente: ${clientIP}`);
        } catch (ipError) {
          P.warn(`⚠️ No se pudo configurar IP del cliente: ${ipError.message}`);
        }
      }
      
      // 🕐 CONFIGURAR HORA/TIMEZONE EN TIEMPO REAL
      const now = new Date();
      
      // Usar timezone del cliente si está disponible, sino usar del servidor
      let timezoneOffset = deviceHeaders && deviceHeaders['timezone-offset'] 
        ? parseInt(deviceHeaders['timezone-offset']) 
        : -now.getTimezoneOffset();
      
      const timezone = deviceHeaders && deviceHeaders['timezone'] 
        ? deviceHeaders['timezone'] 
        : `UTC${timezoneOffset >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0')}:${String(Math.abs(timezoneOffset) % 60).padStart(2, '0')}`;
      
      const timezoneOffsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
      const timezoneOffsetMinutes = Math.abs(timezoneOffset) % 60;
      const timezoneSign = timezoneOffset >= 0 ? '+' : '-';
      const timezoneString = `UTC${timezoneSign}${String(timezoneOffsetHours).padStart(2, '0')}:${String(timezoneOffsetMinutes).padStart(2, '0')}`;
      
      // Timestamp actual en tiempo real (segundos Unix)
      const currentTimestamp = Math.floor(Date.now() / 1000);
      
      // Usar timestamp del cliente si está disponible
      const clientTimestamp = deviceHeaders && deviceHeaders['timestamp'] 
        ? Math.floor(parseInt(deviceHeaders['timestamp']) / 1000) 
        : currentTimestamp;
      
      // Configurar headers de tiempo en tiempo real
      this.ig.request.defaults.headers = {
        ...this.ig.request.defaults.headers,
        'Date': now.toUTCString(),
        'X-Request-Time': currentTimestamp.toString(),
        'X-Client-Time': clientTimestamp.toString(),
        'X-Timezone-Offset': timezoneOffset.toString(),
        'X-Timezone': timezone
      };
      
      // Configurar headers de ubicación si están disponibles
      if (deviceHeaders && deviceHeaders['country']) {
        this.ig.request.defaults.headers['X-Country'] = deviceHeaders['country'];
      }
      if (deviceHeaders && deviceHeaders['city']) {
        this.ig.request.defaults.headers['X-City'] = deviceHeaders['city'];
      }
      
      P.info(`🕐 Hora REAL configurada - Timestamp: ${currentTimestamp}, Timezone: ${timezoneString}${deviceHeaders && deviceHeaders['country'] ? `, País: ${deviceHeaders['country']}` : ''}`);
```

**Ubicación:** `dist/services/instagramService.js` líneas 461-528

---

## 📋 **Resumen del Flujo**

1. **`dist/app.js` (línea 2229)** → Extrae User-Agent, IP y headers del cliente
2. **`dist/app.js` (línea 2281)** → Pasa `deviceHeaders` y `clientIP` al login
3. **`dist/services/instagramService.js` (línea 314)** → Recibe `deviceHeaders` y `clientIP`
4. **`dist/services/instagramService.js` (línea 461)** → Configura ubicación (IP) en tiempo real
5. **`dist/services/instagramService.js` (línea 477)** → Configura hora/timezone en tiempo real
6. **`dist/services/instagramService.js` (línea 615)** → Detecta dispositivo real del User-Agent
7. **`dist/services/instagramService.js` (línea 121)** → Genera device fingerprint real

---

## 🔧 **Archivos a Revisar**

1. **`dist/app.js`** - Líneas 2229-2285 (Extracción de headers)
2. **`dist/services/instagramService.js`** - Líneas 121-256 (Detección de dispositivo)
3. **`dist/services/instagramService.js`** - Líneas 461-528 (Configuración tiempo/ubicación)
4. **`dist/services/instagramService.js`** - Líneas 610-639 (Uso en login)

---

## 🎯 **Puntos Clave**

- ✅ **User-Agent** se extrae de `req.headers['user-agent']`
- ✅ **IP del cliente** se extrae con `getRealClientIP(req)`
- ✅ **Timezone** se detecta del cliente o servidor
- ✅ **Device fingerprint** se genera desde el User-Agent real
- ✅ **TODO en tiempo real** - no usa valores guardados

