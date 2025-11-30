import { IgApiClient } from 'instagram-private-api';
import pino from 'pino';

const P = pino({ name: 'test-ig-login', level: 'info' });

async function testInstagramLogin() {
  try {
    const username = 'Yokiespana757@gmail.com';
    const password = 'Yoki2025.';
    
    console.log('🔐 Iniciando prueba de login de Instagram...');
    console.log(`📧 Usuario: ${username}`);
    console.log(`🕐 Hora de inicio: ${new Date().toISOString()}`);
    console.log('');
    
    const ig = new IgApiClient();
    
    // Generar dispositivo
    ig.state.generateDevice(username);
    
    console.log('📱 === INFORMACIÓN DEL DISPOSITIVO ===');
    console.log(`Device String: ${ig.state.deviceString}`);
    console.log(`Device ID: ${ig.state.deviceId}`);
    console.log(`UUID: ${ig.state.uuid}`);
    console.log(`Phone ID: ${ig.state.phoneId}`);
    console.log(`ADID: ${ig.state.adid}`);
    console.log(`Build: ${ig.state.build}`);
    console.log('');
    
    console.log('🕐 === INFORMACIÓN DE TIEMPO ===');
    const now = new Date();
    console.log(`Fecha/Hora actual: ${now.toISOString()}`);
    console.log(`Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    console.log(`Timezone Offset: ${-now.getTimezoneOffset()} minutos`);
    console.log(`Timestamp Unix: ${Math.floor(Date.now() / 1000)}`);
    console.log('');
    
    console.log('🌍 === INFORMACIÓN DE UBICACIÓN ===');
    // Intentar obtener IP local
    const os = await import('os');
    const networkInterfaces = os.networkInterfaces();
    const localIPs = [];
    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        if (!iface.internal && iface.family === 'IPv4') {
          localIPs.push(iface.address);
        }
      }
    }
    console.log(`IP local detectada: ${localIPs[0] || 'No disponible'}`);
    console.log('');
    
    console.log('📡 Intentando login a Instagram...');
    console.log('');
    
    const startTime = Date.now();
    
    try {
      const loginResult = await ig.account.login(username, password);
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log('✅ === LOGIN EXITOSO ===');
      console.log(`Usuario ID: ${loginResult.pk}`);
      console.log(`Username: ${loginResult.username}`);
      console.log(`Tiempo de login: ${duration} segundos`);
      console.log('');
      
      // Obtener información del usuario
      const user = await ig.account.currentUser();
      console.log('👤 === INFORMACIÓN DEL USUARIO ===');
      console.log(`Nombre: ${user.full_name || 'N/A'}`);
      console.log(`Usuario: ${user.username}`);
      console.log(`User ID: ${user.pk}`);
      console.log('');
      
      // Verificar headers que se están usando
      console.log('📋 === HEADERS CONFIGURADOS ===');
      const headers = ig.request.defaults.headers || {};
      console.log(`User-Agent: ${headers['User-Agent'] || 'No configurado'}`);
      console.log(`Accept-Language: ${headers['Accept-Language'] || 'No configurado'}`);
      console.log(`X-Forwarded-For: ${headers['X-Forwarded-For'] || 'No configurado'}`);
      console.log('');
      
      console.log('🕐 === HORA DEL LOGIN ===');
      const loginTime = new Date();
      console.log(`Hora exacta: ${loginTime.toISOString()}`);
      console.log(`Hora local: ${loginTime.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
      console.log('');
      
      console.log('✅ Login completado exitosamente');
      
      process.exit(0);
      
    } catch (loginError) {
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log('❌ === ERROR EN LOGIN ===');
      console.log(`Tiempo hasta error: ${duration} segundos`);
      console.log(`Error: ${loginError.message}`);
      console.log('');
      
      if (loginError.response) {
        console.log('📋 === RESPUESTA DEL ERROR ===');
        console.log(`Status: ${loginError.response?.status || 'N/A'}`);
        console.log(`Body: ${JSON.stringify(loginError.response?.body || {}, null, 2)}`);
      }
      
      console.log('');
      console.log('🔍 === INFORMACIÓN DE DEBUG ===');
      console.log(`Device usado: ${ig.state.deviceString}`);
      console.log(`User-Agent: ${ig.request.defaults.headers?.['User-Agent'] || 'No configurado'}`);
      
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar prueba
testInstagramLogin();

