import { IgApiClient } from 'instagram-private-api';
import pino from 'pino';

const P = pino({ name: 'test-ig-login', level: 'info' });

// Simular User-Agent de un dispositivo real (ejemplo: Chrome en Mac)
const SIMULATED_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// O User-Agent de Android real
const SIMULATED_ANDROID_UA = 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function testLoginConUserAgent() {
  try {
    const username = 'Yokiespana757@gmail.com';
    const password = 'Yoki2025.';
    
    // Simular headers que vendrían del cliente
    const deviceHeaders = {
      'user-agent': SIMULATED_ANDROID_UA, // Cambiar a SIMULATED_USER_AGENT para desktop
      'accept-language': 'es-ES,es;q=0.9',
      'accept-encoding': 'gzip, deflate, br',
      'timestamp': Date.now().toString()
    };
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔐 PRUEBA DE LOGIN CON USER-AGENT SIMULADO');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('📱 User-Agent simulado (del cliente):');
    console.log(`   ${deviceHeaders['user-agent'].substring(0, 100)}...`);
    console.log('');
    
    const ig = new IgApiClient();
    
    // Detectar si es Android
    const userAgent = deviceHeaders['user-agent'];
    const isAndroid = /Android/i.test(userAgent);
    
    console.log(`🔍 Tipo detectado: ${isAndroid ? 'Android' : 'Desktop/No-Android'}`);
    console.log('');
    
    if (isAndroid && userAgent) {
      console.log('✅ Es Android - Detectando dispositivo real...');
      
      // Extraer versión de Android
      const androidMatch = userAgent.match(/Android\s+([\d.]+)/i);
      const androidVersion = androidMatch ? androidMatch[1].split('.')[0] : null;
      console.log(`   Versión Android: ${androidVersion || 'No detectada'}`);
      
      // Extraer modelo
      const deviceInfo = userAgent.match(/\(Linux; Android [\d.]+; (.+?)\)/i);
      if (deviceInfo) {
        console.log(`   Modelo detectado: ${deviceInfo[1]}`);
      }
      
      // Generar deviceString realista
      const version = androidVersion || '30';
      const release = androidVersion ? `${androidVersion}.0.0` : '12.0.0';
      const dpi = '420';
      const resolution = '1080x2400';
      
      // Detectar manufacturer
      let manufacturer = 'samsung';
      let model = 'SM-G991B';
      
      if (deviceInfo && deviceInfo[1]) {
        const deviceParts = deviceInfo[1];
        if (/SM-/i.test(deviceParts)) {
          const smMatch = deviceParts.match(/SM-([A-Z0-9]+)/i);
          if (smMatch) model = `SM-${smMatch[1]}`;
        }
      }
      
      const deviceString = `${version}/${release}; ${dpi}dpi; ${resolution}; ${manufacturer.toLowerCase()}; ${model}; ${model.toLowerCase()}; ${model.toLowerCase()}`;
      
      // Configurar dispositivo
      const deviceId = `android-${Math.random().toString(36).substring(2, 15)}`;
      ig.state.deviceString = deviceString;
      ig.state.deviceId = deviceId;
      
      // Configurar User-Agent real
      ig.request.defaults.headers = {
        ...ig.request.defaults.headers,
        'User-Agent': userAgent
      };
      
      console.log(`   Device String generado: ${deviceString}`);
      console.log(`   Device ID: ${deviceId}`);
      console.log(`   ✅ User-Agent Android real configurado`);
      
    } else {
      console.log('⚠️ No es Android - Usando generación por defecto');
      ig.state.generateDevice(username);
      console.log(`   Device String: ${ig.state.deviceString}`);
      console.log(`   ⚠️ NO cambiando User-Agent (dejando por defecto de IgApiClient)`);
    }
    
    console.log('');
    console.log('🕐 ═════════════ INFORMACIÓN DE HORA ═════════════');
    const now = new Date();
    const timestampUnix = Math.floor(Date.now() / 1000);
    const timezoneOffset = -now.getTimezoneOffset();
    const timezoneOffsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
    const timezoneOffsetMinutes = Math.abs(timezoneOffset) % 60;
    const timezoneSign = timezoneOffset >= 0 ? '+' : '-';
    const timezoneString = `UTC${timezoneSign}${String(timezoneOffsetHours).padStart(2, '0')}:${String(timezoneOffsetMinutes).padStart(2, '0')}`;
    
    console.log(`📅 Fecha/Hora Local: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
    console.log(`⏰ Timestamp Unix: ${timestampUnix}`);
    console.log(`🌍 Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone} (${timezoneString})`);
    console.log('');
    
    console.log('📡 Intentando login...');
    console.log('');
    
    try {
      const loginResult = await ig.account.login(username, password);
      console.log('✅ Login exitoso');
      console.log(`Usuario: ${loginResult.username}`);
    } catch (loginError) {
      console.log('❌ Error en login:');
      console.log(`   ${loginError.message}`);
      if (loginError.response?.body?.error_type) {
        console.log(`   Tipo: ${loginError.response.body.error_type}`);
      }
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 RESUMEN FINAL DE LO QUE INSTAGRAM VIO');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📱 Device String: ${ig.state.deviceString}`);
    console.log(`📱 Device ID: ${ig.state.deviceId}`);
    console.log(`🌐 User-Agent: ${ig.request.defaults.headers?.['User-Agent'] || 'Por defecto de IgApiClient'}`);
    console.log(`🕐 Hora: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} (${timezoneString})`);
    console.log(`⏰ Timestamp: ${timestampUnix}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testLoginConUserAgent();

