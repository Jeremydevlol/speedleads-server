import { IgApiClient } from 'instagram-private-api';
import pino from 'pino';

const P = pino({ name: 'test-ig-login', level: 'info' });

async function testLoginCompleto() {
  try {
    const username = 'Yokiespana757@gmail.com';
    const password = 'Yoki2025.';
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔐 PRUEBA DE LOGIN DE INSTAGRAM - INFORMACIÓN COMPLETA');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    
    const ig = new IgApiClient();
    
    // Simular lo que hace el login real
    ig.state.generateDevice(username);
    
    console.log('📱 ═════════════ DISPOSITIVO GENERADO ═════════════');
    console.log(`Device String: ${ig.state.deviceString}`);
    console.log(`Device ID: ${ig.state.deviceId}`);
    console.log(`UUID: ${ig.state.uuid}`);
    console.log(`Phone ID: ${ig.state.phoneId}`);
    console.log(`ADID: ${ig.state.adid}`);
    console.log(`Build: ${ig.state.build}`);
    console.log('');
    
    console.log('🕐 ═════════════ INFORMACIÓN DE HORA ═════════════');
    const now = new Date();
    const timestampUnix = Math.floor(Date.now() / 1000);
    const timezoneOffset = -now.getTimezoneOffset(); // minutos
    const timezoneOffsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
    const timezoneOffsetMinutes = Math.abs(timezoneOffset) % 60;
    const timezoneSign = timezoneOffset >= 0 ? '+' : '-';
    const timezoneString = `UTC${timezoneSign}${String(timezoneOffsetHours).padStart(2, '0')}:${String(timezoneOffsetMinutes).padStart(2, '0')}`;
    
    console.log(`📅 Fecha/Hora UTC: ${now.toUTCString()}`);
    console.log(`📅 Fecha/Hora ISO: ${now.toISOString()}`);
    console.log(`📅 Fecha/Hora Local: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
    console.log(`⏰ Timestamp Unix: ${timestampUnix}`);
    console.log(`🌍 Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    console.log(`🌍 Timezone Offset: ${timezoneString} (${timezoneOffset} minutos)`);
    console.log('');
    
    console.log('🌐 ═════════════ HEADERS QUE SE USARÍAN ═════════════');
    const headers = ig.request.defaults.headers || {};
    console.log(`User-Agent: ${headers['User-Agent'] || 'Por defecto de IgApiClient'}`);
    console.log(`Accept-Language: ${headers['Accept-Language'] || 'Por defecto'}`);
    console.log('');
    
    console.log('📡 Intentando login...');
    console.log('');
    
    try {
      const loginResult = await ig.account.login(username, password);
      
      console.log('✅ ═════════════ LOGIN EXITOSO ═════════════');
      console.log(`Usuario ID: ${loginResult.pk}`);
      console.log(`Username: ${loginResult.username}`);
      console.log('');
      
      // Obtener info final
      const user = await ig.account.currentUser();
      console.log('👤 Usuario conectado:', user.username);
      console.log('');
      
    } catch (loginError) {
      console.log('❌ ═════════════ ERROR EN LOGIN ═════════════');
      console.log(`Mensaje: ${loginError.message}`);
      
      if (loginError.response?.body) {
        console.log(`Error Type: ${loginError.response.body.error_type || 'N/A'}`);
        console.log(`Status: ${loginError.response.body.status || 'N/A'}`);
      }
      console.log('');
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 RESUMEN FINAL');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📱 Dispositivo: ${ig.state.deviceString}`);
    console.log(`🕐 Hora: ${now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} (${timezoneString})`);
    console.log(`📍 Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    console.log(`⏰ Timestamp: ${timestampUnix}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testLoginCompleto();

