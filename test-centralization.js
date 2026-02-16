#!/usr/bin/env node

/**
 * Script de prueba para verificar la centralización de autenticación en app.uniclick.io
 * 
 * Este script prueba que:
 * 1. Login desde subdominios redirige a app.uniclick.io
 * 2. Rutas sensibles redirigen a app.uniclick.io
 * 3. APIs siguen funcionando desde subdominios
 * 4. Websites siguen funcionando desde subdominios
 */

const https = require('https');
const http = require('http');

// Configuración
const config = {
  baseUrl: process.env.BASE_URL || 'http://localhost:5001',
  testSubdomain: process.env.TEST_SUBDOMAIN || 'test',
  testEmail: process.env.TEST_EMAIL || 'test@example.com',
  testPassword: process.env.TEST_PASSWORD || 'test123'
};

// Colores para console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;
    
    const requestOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      ...options
    };

    const req = client.request(url, requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testLoginRedirect() {
  log('\n🔐 TEST 1: Verificar redirección de login desde subdominio', 'cyan');
  
  try {
    const loginUrl = `${config.baseUrl.replace('localhost:5001', `${config.testSubdomain}.uniclick.io`)}/api/login`;
    log(`   URL: ${loginUrl}`, 'blue');
    
    const response = await makeRequest(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': `${config.testSubdomain}.uniclick.io`
      },
      body: JSON.stringify({
        email: config.testEmail,
        password: config.testPassword
      })
    });
    
    log(`   Status: ${response.statusCode}`, response.statusCode === 200 ? 'green' : 'yellow');
    
    if (response.statusCode === 200) {
      try {
        const data = JSON.parse(response.data);
        if (data.redirect && data.redirect.includes('app.uniclick.io')) {
          log(`   ✅ REDIRECT: ${data.redirect}`, 'green');
        } else {
          log(`   ❌ NO hay redirect a app.uniclick.io`, 'red');
        }
      } catch (e) {
        log(`   ⚠️  No se pudo parsear respuesta JSON`, 'yellow');
      }
    }
    
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
  }
}

async function testSensitiveRouteRedirect() {
  log('\n🚫 TEST 2: Verificar redirección de rutas sensibles', 'cyan');
  
  const sensitiveRoutes = ['/dashboard', '/settings', '/account', '/profile'];
  
  for (const route of sensitiveRoutes) {
    try {
      const testUrl = `${config.baseUrl.replace('localhost:5001', `${config.testSubdomain}.uniclick.io`)}${route}`;
      log(`   Probando: ${route}`, 'blue');
      
      const response = await makeRequest(testUrl, {
        headers: {
          'Host': `${config.testSubdomain}.uniclick.io`
        }
      });
      
      if (response.statusCode === 302 || response.statusCode === 301) {
        const location = response.headers.location;
        if (location && location.includes('app.uniclick.io')) {
          log(`   ✅ REDIRECT: ${response.statusCode} → ${location}`, 'green');
        } else {
          log(`   ❌ REDIRECT incorrecto: ${location}`, 'red');
        }
      } else {
        log(`   ⚠️  Status inesperado: ${response.statusCode}`, 'yellow');
      }
      
    } catch (error) {
      log(`   ❌ Error en ${route}: ${error.message}`, 'red');
    }
  }
}

async function testApiAccess() {
  log('\n🔌 TEST 3: Verificar acceso a APIs desde subdominios', 'cyan');
  
  try {
    const apiUrl = `${config.baseUrl.replace('localhost:5001', `${config.testSubdomain}.uniclick.io`)}/api/health`;
    log(`   URL: ${apiUrl}`, 'blue');
    
    const response = await makeRequest(apiUrl, {
      headers: {
        'Host': `${config.testSubdomain}.uniclick.io`
      }
    });
    
    log(`   Status: ${response.statusCode}`, response.statusCode === 200 ? 'green' : 'yellow');
    
    if (response.statusCode === 200) {
      log(`   ✅ API accesible desde subdominio`, 'green');
    } else {
      log(`   ⚠️  API no accesible: ${response.statusCode}`, 'yellow');
    }
    
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
  }
}

async function testWebsiteAccess() {
  log('\n🌐 TEST 4: Verificar acceso a website desde subdominio', 'cyan');
  
  try {
    const websiteUrl = `${config.baseUrl.replace('localhost:5001', `${config.testSubdomain}.uniclick.io`)}/`;
    log(`   URL: ${websiteUrl}`, 'blue');
    
    const response = await makeRequest(websiteUrl, {
      headers: {
        'Host': `${config.testSubdomain}.uniclick.io`
      }
    });
    
    log(`   Status: ${response.statusCode}`, response.statusCode === 200 ? 'green' : 'yellow');
    
    if (response.statusCode === 200) {
      log(`   ✅ Website accesible desde subdominio`, 'green');
    } else if (response.statusCode === 404) {
      log(`   ⚠️  Website no encontrado (esperado si no existe)`, 'yellow');
    } else {
      log(`   ⚠️  Status inesperado: ${response.statusCode}`, 'yellow');
    }
    
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
  }
}

async function testMainDomainAccess() {
  log('\n🏠 TEST 5: Verificar acceso a app.uniclick.io', 'cyan');
  
  try {
    const mainUrl = `${config.baseUrl.replace('localhost:5001', 'app.uniclick.io')}/dashboard`;
    log(`   URL: ${mainUrl}`, 'blue');
    
    const response = await makeRequest(mainUrl, {
      headers: {
        'Host': 'app.uniclick.io'
      }
    });
    
    log(`   Status: ${response.statusCode}`, response.statusCode === 200 ? 'green' : 'yellow');
    
    if (response.statusCode === 200) {
      log(`   ✅ app.uniclick.io accesible`, 'green');
    } else {
      log(`   ⚠️  Status: ${response.statusCode}`, 'yellow');
    }
    
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
  }
}

async function runAllTests() {
  log('🧪 INICIANDO PRUEBAS DE CENTRALIZACIÓN', 'bright');
  log('=====================================', 'bright');
  
  log(`\n📋 Configuración:`, 'magenta');
  log(`   Base URL: ${config.baseUrl}`, 'blue');
  log(`   Subdominio de prueba: ${config.testSubdomain}.uniclick.io`, 'blue');
  log(`   Email de prueba: ${config.testEmail}`, 'blue');
  
  await testLoginRedirect();
  await testSensitiveRouteRedirect();
  await testApiAccess();
  await testWebsiteAccess();
  await testMainDomainAccess();
  
  log('\n🎯 RESUMEN DE PRUEBAS', 'bright');
  log('====================', 'bright');
  log('✅ Login desde subdominios debe redirigir a app.uniclick.io', 'green');
  log('✅ Rutas sensibles deben redirigir a app.uniclick.io', 'green');
  log('✅ APIs deben ser accesibles desde subdominios', 'green');
  log('✅ Websites deben ser accesibles desde subdominios', 'green');
  log('✅ app.uniclick.io debe ser accesible', 'green');
  
  log('\n🚀 Para ejecutar en producción:', 'cyan');
  log('   BASE_URL=https://api.uniclick.io node test-centralization.js', 'blue');
}

// Ejecutar pruebas
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testLoginRedirect,
  testSensitiveRouteRedirect,
  testApiAccess,
  testWebsiteAccess,
  testMainDomainAccess
};
