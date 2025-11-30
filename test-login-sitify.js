import { IgApiClient } from 'instagram-private-api';
import pino from 'pino';

const P = pino({ name: 'test-ig-login', level: 'info' });

async function testLoginSitify() {
  try {
    const username = 'sitify.io';
    const password = 'Dios2025';
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔐 PRUEBA DE LOGIN - CUENTA sitify.io');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📧 Usuario: ${username}`);
    console.log(`🕐 Hora de inicio: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
    console.log('');
    
    const ig = new IgApiClient();
    
    // Simular User-Agent de Android (como haría un cliente real)
    const deviceHeaders = {
      'user-agent': 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'accept-language': 'es-ES,es;q=0.9',
      'accept-encoding': 'gzip, deflate, br',
      'timezone': 'Europe/Madrid',
      'timezone-offset': '60',
      'timestamp': Date.now().toString()
    };
    
    console.log('📱 Configurando dispositivo Android...');
    
    // Detectar Android y configurar dispositivo
    const userAgent = deviceHeaders['user-agent'];
    const isAndroid = /Android/i.test(userAgent);
    
    if (isAndroid) {
      const androidMatch = userAgent.match(/Android\s+([\d.]+)/i);
      const androidVersion = androidMatch ? androidMatch[1].split('.')[0] : '30';
      
      const deviceInfo = userAgent.match(/\(Linux; Android [\d.]+; (.+?)\)/i);
      let manufacturer = 'samsung';
      let model = 'SM-G991B';
      
      if (deviceInfo && deviceInfo[1]) {
        const deviceParts = deviceInfo[1];
        if (/SM-/i.test(deviceParts)) {
          const smMatch = deviceParts.match(/SM-([A-Z0-9]+)/i);
          if (smMatch) model = `SM-${smMatch[1]}`;
        }
      }
      
      const version = androidVersion || '30';
      const release = `${androidVersion}.0.0`;
      const dpi = '420';
      const resolution = '1080x2400';
      
      const deviceString = `${version}/${release}; ${dpi}dpi; ${resolution}; ${manufacturer.toLowerCase()}; ${model}; ${model.toLowerCase()}; ${model.toLowerCase()}`;
      
      const deviceId = `android-${Math.random().toString(36).substring(2, 15)}`;
      
      ig.state.deviceString = deviceString;
      ig.state.deviceId = deviceId;
      ig.state.uuid = `${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
      ig.state.phoneId = `${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
      ig.state.adid = `${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
      ig.state.build = androidVersion || '30';
      
      ig.request.defaults.headers = {
        ...ig.request.defaults.headers,
        'User-Agent': userAgent,
        'Accept-Language': deviceHeaders['accept-language'],
        'Accept-Encoding': deviceHeaders['accept-encoding']
      };
      
      console.log(`✅ Dispositivo configurado: ${deviceString}`);
      console.log(`   Device ID: ${deviceId}`);
      console.log('');
    } else {
      ig.state.generateDevice(username);
      console.log(`✅ Dispositivo generado por defecto`);
      console.log('');
    }
    
    // Configurar IP (simulando IP del cliente)
    const clientIP = '127.0.0.1'; // En producción sería la IP real
    if (clientIP && clientIP !== 'unknown') {
      ig.request.defaults.headers = {
        ...ig.request.defaults.headers,
        'X-Forwarded-For': clientIP,
        'X-Real-IP': clientIP
      };
      console.log(`📍 IP configurada: ${clientIP}`);
    }
    
    // Configurar timezone
    const now = new Date();
    const timezoneOffset = deviceHeaders['timezone-offset'] ? parseInt(deviceHeaders['timezone-offset']) : -now.getTimezoneOffset();
    
    ig.request.defaults.headers = {
      ...ig.request.defaults.headers,
      'Date': now.toUTCString(),
      'X-Timezone-Offset': timezoneOffset.toString(),
      'X-Timezone': deviceHeaders['timezone'] || 'Europe/Madrid'
    };
    
    console.log(`🕐 Timezone configurado: ${deviceHeaders['timezone']} (${timezoneOffset} minutos)`);
    console.log('');
    
    // Simular comportamiento de navegador ANTES del login
    console.log('🌐 Simulando comportamiento de navegador...');
    console.log('   ⏳ Esperando 2-4 segundos (carga de página)...');
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));
    
    console.log('   📱 Intentando acceso a endpoint público...');
    try {
      await ig.feed.timeline().request();
      console.log('   ✅ Simulación de navegación exitosa');
    } catch (navError) {
      console.log('   📱 Navegación simulada (esperado sin login)');
    }
    
    console.log('   ⏳ Esperando 3-6 segundos (tiempo de usuario ingresando datos)...');
    await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 3000));
    
    console.log('');
    console.log('🔐 Intentando login final...');
    console.log('');
    
    const startTime = Date.now();
    
    try {
      const loginResult = await ig.account.login(username, password);
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ LOGIN EXITOSO');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`Usuario ID: ${loginResult.pk}`);
      console.log(`Username: ${loginResult.username}`);
      console.log(`Tiempo de login: ${duration} segundos`);
      console.log('');
      
      // Obtener información del usuario
      const user = await ig.account.currentUser();
      console.log('👤 Información del usuario:');
      console.log(`   Nombre: ${user.full_name || 'N/A'}`);
      console.log(`   Usuario: ${user.username}`);
      console.log(`   User ID: ${user.pk}`);
      
      // Obtener información del perfil
      if (user.follower_count !== undefined) {
        console.log(`   Seguidores: ${user.follower_count}`);
      }
      if (user.following_count !== undefined) {
        console.log(`   Siguiendo: ${user.following_count}`);
      }
      if (user.media_count !== undefined) {
        console.log(`   Posts: ${user.media_count}`);
      }
      console.log('');
      
      console.log('🕐 Hora del login:');
      console.log(`   ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
      console.log('');
      
      console.log('📱 Dispositivo usado:');
      console.log(`   ${ig.state.deviceString}`);
      console.log('');
      
      console.log('✅ Login completado exitosamente');
      process.exit(0);
      
    } catch (loginError) {
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log('═══════════════════════════════════════════════════════════');
      console.log('❌ ERROR EN LOGIN');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`Tiempo hasta error: ${duration} segundos`);
      console.log(`Mensaje: ${loginError.message}`);
      console.log('');
      
      if (loginError.response) {
        const errorBody = loginError.response.body || {};
        console.log('📋 Detalles del error:');
        console.log(`   Error Type: ${errorBody.error_type || 'N/A'}`);
        console.log(`   Status: ${errorBody.status || 'N/A'}`);
        console.log(`   Invalid Credentials: ${errorBody.invalid_credentials || false}`);
        console.log('');
        
        if (errorBody.message) {
          console.log(`   Mensaje: ${errorBody.message}`);
        }
        
        if (errorBody.challenge) {
          console.log('   ⚠️ Challenge requerido:', errorBody.challenge);
        }
        
        if (errorBody.buttons) {
          console.log('   Botones disponibles:');
          errorBody.buttons.forEach((btn, idx) => {
            console.log(`     ${idx + 1}. ${btn.title} (${btn.action})`);
          });
        }
      }
      
      console.log('');
      console.log('🔍 Información de debug:');
      console.log(`   Device: ${ig.state.deviceString}`);
      console.log(`   User-Agent: ${ig.request.defaults.headers?.['User-Agent']?.substring(0, 80) || 'No configurado'}...`);
      
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testLoginSitify();

