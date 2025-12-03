#!/usr/bin/env node

/**
 * Script de prueba para login de Instagram con sitify.io y Yokiespana757
 * Prueba la detección de IP real y dispositivo en tiempo real
 */

import { IgApiClient } from 'instagram-private-api';
import pino from 'pino';

const P = pino({ name: 'test-ig-login', level: 'info' });

// Cuentas a probar
const CUENTAS = [
  {
    name: 'sitify.io',
    username: 'sitify.io',
    password: 'Dios2025',
    description: 'Cuenta antigua'
  },
  {
    name: 'Yokiespana757',
    username: 'Yokiespana757@gmail.com',
    password: 'Yoki2025.',
    description: 'Cuenta nueva'
  }
];

/**
 * Función para probar login de una cuenta
 */
async function testLogin(cuenta) {
  try {
    console.log('\n' + '═'.repeat(80));
    console.log(`🔐 PRUEBA DE LOGIN - CUENTA: ${cuenta.name}`);
    console.log('═'.repeat(80));
    console.log(`📧 Usuario: ${cuenta.username}`);
    console.log(`📝 Descripción: ${cuenta.description}`);
    console.log(`🕐 Hora de inicio: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
    console.log('');
    
    const ig = new IgApiClient();
    
    // Simular headers del cliente real (desktop Mac)
    const deviceHeaders = {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
      'accept-encoding': 'gzip, deflate, br',
      'timezone': 'Europe/Madrid',
      'timezone-offset': '60',
      'timestamp': Date.now().toString(),
      'country': 'ES',
      'city': 'Madrid'
    };
    
    console.log('📱 Configurando dispositivo desde headers del cliente...');
    console.log(`   User-Agent: ${deviceHeaders['user-agent'].substring(0, 80)}...`);
    console.log(`   IP simulada: 127.0.0.1 (en producción sería la IP real del cliente)`);
    console.log(`   Timezone: ${deviceHeaders['timezone']}`);
    console.log('');
    
    // Detectar si es Android o Desktop
    const userAgent = deviceHeaders['user-agent'];
    const isAndroid = /Android/i.test(userAgent);
    
    if (isAndroid) {
      console.log('📱 Dispositivo Android detectado...');
      
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
      
      ig.state.deviceString = deviceString;
      ig.state.deviceId = `android-${Math.random().toString(36).substring(2, 15)}`;
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
      
      console.log(`✅ Dispositivo Android configurado: ${deviceString.substring(0, 60)}...`);
    } else {
      console.log('💻 Dispositivo Desktop detectado...');
      // Para desktop, generar dispositivo Android estándar (requerido por Instagram API)
      ig.state.generateDevice(cuenta.username);
      console.log(`✅ Dispositivo Android estándar generado (requerido por Instagram API)`);
      console.log(`   Device String: ${ig.state.deviceString?.substring(0, 60)}...`);
      console.log(`   Nota: User-Agent se mantiene como Instagram Android por defecto`);
    }
    
    // Configurar IP real del cliente
    const clientIP = '127.0.0.1'; // En producción sería la IP real detectada
    if (clientIP && clientIP !== 'unknown') {
      ig.request.defaults.headers = {
        ...ig.request.defaults.headers,
        'X-Forwarded-For': clientIP,
        'X-Real-IP': clientIP,
        'CF-Connecting-IP': clientIP
      };
      console.log(`📍 IP configurada: ${clientIP}`);
    }
    
    // Configurar timezone en tiempo real
    const now = new Date();
    const timezoneOffset = deviceHeaders['timezone-offset'] ? parseInt(deviceHeaders['timezone-offset']) : -now.getTimezoneOffset();
    
    ig.request.defaults.headers = {
      ...ig.request.defaults.headers,
      'Date': now.toUTCString(),
      'X-Request-Time': Math.floor(Date.now() / 1000).toString(),
      'X-Client-Time': Math.floor(parseInt(deviceHeaders['timestamp']) / 1000).toString(),
      'X-Timezone-Offset': timezoneOffset.toString(),
      'X-Timezone': deviceHeaders['timezone'] || 'Europe/Madrid'
    };
    
    if (deviceHeaders['country']) {
      ig.request.defaults.headers['X-Country'] = deviceHeaders['country'];
    }
    if (deviceHeaders['city']) {
      ig.request.defaults.headers['X-City'] = deviceHeaders['city'];
    }
    
    console.log(`🕐 Timezone configurado: ${deviceHeaders['timezone']} (${timezoneOffset} minutos)`);
    if (deviceHeaders['country']) {
      console.log(`🌍 Ubicación: ${deviceHeaders['country']}${deviceHeaders['city'] ? ` - ${deviceHeaders['city']}` : ''}`);
    }
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
      const loginResult = await ig.account.login(cuenta.username, cuenta.password);
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log('═'.repeat(80));
      console.log('✅ LOGIN EXITOSO');
      console.log('═'.repeat(80));
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
      
      console.log('📍 IP y ubicación:');
      console.log(`   IP: ${clientIP}`);
      console.log(`   Timezone: ${deviceHeaders['timezone']}`);
      if (deviceHeaders['country']) {
        console.log(`   País: ${deviceHeaders['country']}`);
      }
      console.log('');
      
      return {
        success: true,
        cuenta: cuenta.name,
        username: user.username,
        userId: user.pk,
        duration,
        device: ig.state.deviceString,
        ip: clientIP,
        timezone: deviceHeaders['timezone']
      };
      
    } catch (loginError) {
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log('═'.repeat(80));
      console.log('❌ ERROR EN LOGIN');
      console.log('═'.repeat(80));
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
          
          // Detectar si es cuenta nueva
          if (errorBody.message.includes('We can send you an email') || 
              errorBody.message.includes('email to help you get back') ||
              (errorBody.error_type === 'bad_password' && errorBody.invalid_credentials)) {
            console.log('');
            console.log('⚠️  CUENTA NUEVA O RECUPERACIÓN REQUERIDA:');
            console.log('   Esta cuenta puede ser nueva o requerir verificación.');
            console.log('   Las cuentas nuevas requieren 24-48 horas de uso manual antes de login desde API.');
          }
        }
        
        if (errorBody.challenge) {
          console.log('   ⚠️ Challenge requerido:', errorBody.challenge);
        }
      }
      
      console.log('');
      console.log('🔍 Información de debug:');
      console.log(`   Device: ${ig.state.deviceString}`);
      console.log(`   User-Agent: ${ig.request.defaults.headers?.['User-Agent']?.substring(0, 80) || 'No configurado'}...`);
      console.log(`   IP: ${clientIP}`);
      
      return {
        success: false,
        cuenta: cuenta.name,
        duration,
        error: loginError.message,
        errorType: loginError.response?.body?.error_type,
        status: loginError.response?.body?.status
      };
    }
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
    console.error(error.stack);
    return {
      success: false,
      cuenta: cuenta.name,
      error: error.message
    };
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🚀 Script de Prueba de Login de Instagram');
  console.log('═'.repeat(80));
  console.log(`📅 Fecha/Hora: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
  console.log(`📋 Total de cuentas: ${CUENTAS.length}`);
  console.log('═'.repeat(80));
  
  const resultados = [];
  
  // Probar cada cuenta
  for (let i = 0; i < CUENTAS.length; i++) {
    const cuenta = CUENTAS[i];
    
    const resultado = await testLogin(cuenta);
    resultados.push(resultado);
    
    // Esperar entre pruebas (simular comportamiento humano)
    if (i < CUENTAS.length - 1) {
      const delay = 3000 + Math.random() * 2000; // 3-5 segundos
      console.log(`\n⏳ Esperando ${(delay / 1000).toFixed(1)} segundos antes de la siguiente prueba...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Resumen final
  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 RESUMEN FINAL');
  console.log('═'.repeat(80));
  
  const exitosos = resultados.filter(r => r.success);
  const fallidos = resultados.filter(r => !r.success);
  
  console.log(`\n✅ Exitosos: ${exitosos.length}/${resultados.length}`);
  console.log(`❌ Fallidos: ${fallidos.length}/${resultados.length}`);
  
  if (exitosos.length > 0) {
    console.log(`\n✅ LOGINS EXITOSOS:`);
    exitosos.forEach(r => {
      console.log(`   • ${r.cuenta} (@${r.username}) - ${r.duration}s`);
      console.log(`     Device: ${r.device?.substring(0, 60)}...`);
      console.log(`     IP: ${r.ip} | Timezone: ${r.timezone}`);
    });
  }
  
  if (fallidos.length > 0) {
    console.log(`\n❌ LOGINS FALLIDOS:`);
    fallidos.forEach(r => {
      console.log(`   • ${r.cuenta} - Error: ${r.error || 'Desconocido'}`);
      if (r.errorType) {
        console.log(`     Tipo: ${r.errorType} | Status: ${r.status || 'N/A'}`);
      }
    });
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log(`✨ Pruebas completadas a las ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
  console.log('═'.repeat(80) + '\n');
  
  // Exit code según resultados
  process.exit(fallidos.length > 0 ? 1 : 0);
}

// Ejecutar
main().catch(error => {
  console.error('\n❌ Error fatal:', error);
  process.exit(1);
});





