#!/usr/bin/env node

/**
 * Script de prueba para login de Instagram usando el endpoint real
 * Prueba con sitify.io y Yokiespana757@gmail.com
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const TEST_USER_ID = '68eec7b4-8e52-462b-bb46-76d69985f09a'; // userId de prueba

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
 * Función helper para hacer peticiones HTTP
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + (urlObj.search || ''),
        method: options.method || 'GET',
        headers: {
          'Connection': 'close',
          ...options.headers
        },
        timeout: 60000 // 60 segundos de timeout
      };
      
      const req = httpModule.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const jsonData = data ? JSON.parse(data) : {};
            resolve({
              status: res.statusCode,
              ok: res.statusCode >= 200 && res.statusCode < 300,
              json: () => Promise.resolve(jsonData),
              headers: res.headers
            });
          } catch (error) {
            resolve({
              status: res.statusCode,
              ok: res.statusCode >= 200 && res.statusCode < 300,
              json: () => Promise.resolve({ error: 'Error parsing JSON', raw: data.substring(0, 200) }),
              headers: res.headers
            });
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Función para hacer login usando el endpoint real
 */
async function testLoginViaEndpoint(cuenta) {
  try {
    console.log('\n' + '═'.repeat(80));
    console.log(`🔐 PRUEBA DE LOGIN - CUENTA: ${cuenta.name}`);
    console.log('═'.repeat(80));
    console.log(`📧 Usuario: ${cuenta.username}`);
    console.log(`📝 Descripción: ${cuenta.description}`);
    console.log(`🕐 Hora de inicio: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
    console.log(`🌐 Endpoint: ${BASE_URL}/api/instagram/login`);
    console.log('');
    
    const startTime = Date.now();
    
    // Simular headers del navegador real
    const response = await makeRequest(`${BASE_URL}/api/instagram/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'X-Timezone-Offset': '60',
        'X-Timezone': 'Europe/Madrid',
        'X-Country': 'ES',
        'X-City': 'Madrid'
      },
      body: JSON.stringify({
        username: cuenta.username,
        password: cuenta.password,
        userId: TEST_USER_ID
      })
    });
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    const data = await response.json();
    
    console.log(`⏱️ Tiempo de respuesta: ${duration} segundos`);
    console.log(`📊 Status HTTP: ${response.status}`);
    console.log('');
    
    // Verificar si requiere 2FA
    if (data.status === '2FA_REQUIRED' || data.twoFA_required === true) {
      console.log('═'.repeat(80));
      console.log('🔐 2FA REQUERIDO');
      console.log('═'.repeat(80));
      console.log(`Mensaje: ${data.message || 'Instagram requiere código de verificación'}`);
      console.log(`Método: ${data.via || 'sms'}`);
      console.log(`Username: ${data.username || cuenta.username}`);
      console.log('');
      console.log('⚠️ Esta cuenta requiere código 2FA.');
      console.log('   Para completar el login, usa el endpoint /api/instagram/2fa con el código.');
      console.log('');
      
      return {
        success: false,
        cuenta: cuenta.name,
        twoFA_required: true,
        via: data.via,
        username: data.username,
        duration
      };
    }
    
    // Verificar si fue exitoso
    if (data.success === true) {
      console.log('═'.repeat(80));
      console.log('✅ LOGIN EXITOSO');
      console.log('═'.repeat(80));
      console.log(`Mensaje: ${data.message || 'Login exitoso'}`);
      console.log(`Username: ${data.username || cuenta.username}`);
      console.log(`Restaurado desde sesión guardada: ${data.restored || false}`);
      console.log(`Usuario ID: ${TEST_USER_ID}`);
      console.log('');
      console.log('📊 Detalles:');
      console.log(`   ✅ Sesión activa`);
      console.log(`   ✅ Cookies guardadas`);
      console.log(`   ✅ Listo para usar`);
      console.log('');
      
      return {
        success: true,
        cuenta: cuenta.name,
        username: data.username || cuenta.username,
        restored: data.restored || false,
        duration
      };
    }
    
    // Si no fue exitoso
    console.log('═'.repeat(80));
    console.log('❌ LOGIN FALLIDO');
    console.log('═'.repeat(80));
    console.log(`Error: ${data.error || 'Error desconocido'}`);
    console.log(`Mensaje: ${data.message || 'Sin mensaje adicional'}`);
    console.log('');
    
    if (data.challenge === true) {
      console.log('⚠️ Challenge requerido:');
      console.log(`   ${data.message || 'Instagram requiere verificación'}`);
      if (data.needs_code === true) {
        console.log(`   Se requiere código de verificación`);
      }
      if (data.needsManualRetry === true) {
        console.log(`   Se requiere acción manual del usuario`);
      }
      console.log('');
    }
    
    if (data.recovery_required === true) {
      console.log('⚠️ Recuperación de cuenta requerida:');
      console.log(`   ${data.message || 'Instagram requiere recuperación de cuenta'}`);
      console.log('');
    }
    
    if (data.suspicious_login_blocked === true) {
      console.log('⚠️ Login bloqueado como sospechoso:');
      console.log(`   ${data.message || 'Instagram bloqueó el login'}`);
      console.log('');
    }
    
    if (data.is_new_account === true) {
      console.log('⚠️ Cuenta nueva detectada:');
      console.log(`   Las cuentas nuevas requieren uso manual por 24-48 horas`);
      console.log('');
    }
    
    return {
      success: false,
      cuenta: cuenta.name,
      error: data.error || 'Error desconocido',
      message: data.message,
      challenge: data.challenge,
      recovery_required: data.recovery_required,
      suspicious_login_blocked: data.suspicious_login_blocked,
      is_new_account: data.is_new_account,
      duration
    };
    
  } catch (error) {
    console.log('═'.repeat(80));
    console.log('❌ ERROR DE CONEXIÓN');
    console.log('═'.repeat(80));
    console.log(`Error: ${error.message}`);
    console.log('');
    console.log('🔍 Posibles causas:');
    console.log('   1. El servidor no está corriendo en', BASE_URL);
    console.log('   2. Problema de conexión de red');
    console.log('   3. Error en el servidor');
    console.log('');
    
    return {
      success: false,
      cuenta: cuenta.name,
      error: error.message,
      connection_error: true
    };
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('🚀 Script de Prueba de Login de Instagram (Endpoint Real)');
  console.log('═'.repeat(80));
  console.log(`📅 Fecha/Hora: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
  console.log(`🌐 Servidor: ${BASE_URL}`);
  console.log(`👤 User ID de prueba: ${TEST_USER_ID}`);
  console.log(`📋 Total de cuentas: ${CUENTAS.length}`);
  console.log('═'.repeat(80));
  
  // Verificar que el servidor esté disponible
  try {
    console.log('\n🔍 Verificando que el servidor esté disponible...');
    const healthCheck = await makeRequest(`${BASE_URL}/health`);
    if (healthCheck.ok) {
      console.log('✅ Servidor disponible');
    } else {
      console.log('⚠️ Servidor responde pero /health no está OK');
    }
  } catch (error) {
    console.log(`⚠️ No se pudo verificar el servidor: ${error.message}`);
    console.log('   Continuando de todos modos...');
  }
  
  const resultados = [];
  
  // Probar cada cuenta
  for (let i = 0; i < CUENTAS.length; i++) {
    const cuenta = CUENTAS[i];
    
    const resultado = await testLoginViaEndpoint(cuenta);
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
  const fallidos = resultados.filter(r => !r.success && !r.twoFA_required);
  const dosFA = resultados.filter(r => r.twoFA_required === true);
  
  console.log(`\n✅ Exitosos: ${exitosos.length}/${resultados.length}`);
  if (dosFA.length > 0) {
    console.log(`🔐 Requieren 2FA: ${dosFA.length}/${resultados.length}`);
  }
  console.log(`❌ Fallidos: ${fallidos.length}/${resultados.length}`);
  
  if (exitosos.length > 0) {
    console.log(`\n✅ LOGINS EXITOSOS:`);
    exitosos.forEach(r => {
      console.log(`   • ${r.cuenta} (@${r.username || 'N/A'}) - ${r.duration}s`);
      if (r.restored) {
        console.log(`     ℹ️ Sesión restaurada desde archivo guardado`);
      }
    });
  }
  
  if (dosFA.length > 0) {
    console.log(`\n🔐 REQUIEREN 2FA:`);
    dosFA.forEach(r => {
      console.log(`   • ${r.cuenta} (@${r.username || 'N/A'})`);
      console.log(`     Método: ${r.via || 'sms'}`);
      console.log(`     Usa: POST /api/instagram/2fa con el código`);
    });
  }
  
  if (fallidos.length > 0) {
    console.log(`\n❌ LOGINS FALLIDOS:`);
    fallidos.forEach(r => {
      console.log(`   • ${r.cuenta} - Error: ${r.error || 'Desconocido'}`);
      if (r.challenge) {
        console.log(`     ⚠️ Challenge requerido`);
      }
      if (r.recovery_required) {
        console.log(`     ⚠️ Recuperación de cuenta requerida`);
      }
      if (r.suspicious_login_blocked) {
        console.log(`     ⚠️ Login bloqueado como sospechoso`);
      }
      if (r.is_new_account) {
        console.log(`     ⚠️ Cuenta nueva (requiere uso manual primero)`);
      }
      if (r.connection_error) {
        console.log(`     ⚠️ Error de conexión con el servidor`);
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
  console.error(error.stack);
  process.exit(1);
});

