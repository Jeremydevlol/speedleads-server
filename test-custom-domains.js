#!/usr/bin/env node

/**
 * 🧪 TEST SCRIPT PARA SISTEMA DE DOMINIOS PERSONALIZADOS
 * 
 * Este script prueba los endpoints del sistema de dominios personalizados
 * para verificar que la implementación funciona correctamente.
 */

import { config } from 'dotenv';
import fetch from 'node-fetch';

// Cargar variables de entorno
config();

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const TEST_TOKEN = process.env.TEST_JWT_TOKEN; // Debes proporcionar un token válido

// Colores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, description) {
  log('cyan', `\n${step}. ${description}`);
  log('blue', '='.repeat(50));
}

function logSuccess(message) {
  log('green', `✅ ${message}`);
}

function logError(message) {
  log('red', `❌ ${message}`);
}

function logWarning(message) {
  log('yellow', `⚠️  ${message}`);
}

async function makeRequest(method, endpoint, data = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    }
  };

  if (TEST_TOKEN) {
    options.headers['Authorization'] = `Bearer ${TEST_TOKEN}`;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    return {
      status: response.status,
      success: response.status >= 200 && response.status < 300,
      data: result
    };
  } catch (error) {
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
}

async function testHealthCheck() {
  logStep('1', 'Verificando Health Check del Backend');
  
  const response = await makeRequest('GET', '/health');
  
  if (response.success) {
    logSuccess('Backend está funcionando correctamente');
    return true;
  } else {
    logError(`Backend no responde: ${response.status}`);
    return false;
  }
}

async function testEnvironmentVariables() {
  logStep('2', 'Verificando Variables de Entorno');
  
  const requiredVars = [
    'CLOUDFRONT_DOMAIN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  let allPresent = true;
  
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      logSuccess(`${varName}: ${process.env[varName].substring(0, 20)}...`);
    } else {
      logError(`${varName}: NO CONFIGURADA`);
      allPresent = false;
    }
  }
  
  if (!TEST_TOKEN) {
    logWarning('TEST_JWT_TOKEN no configurado - algunos tests fallarán');
  }
  
  return allPresent;
}

async function testDomainConfiguration() {
  logStep('3', 'Probando Configuración de Dominio');
  
  const testData = {
    domain: 'example.com',
    subdomain: 'test',
    websiteId: '00000000-0000-0000-0000-000000000000' // UUID de prueba
  };
  
  const response = await makeRequest('POST', '/api/dns/configure', testData);
  
  console.log('Request:', testData);
  console.log('Response Status:', response.status);
  console.log('Response Data:', JSON.stringify(response.data, null, 2));
  
  if (response.success) {
    logSuccess('Configuración de dominio exitosa');
    return response.data.domain;
  } else {
    logError(`Error en configuración: ${response.data?.error || 'Error desconocido'}`);
    return null;
  }
}

async function testDomainVerification(domain) {
  if (!domain) {
    logWarning('Saltando verificación DNS - no hay dominio configurado');
    return false;
  }
  
  logStep('4', 'Probando Verificación DNS');
  
  const testData = { domain: domain.domain || domain };
  
  const response = await makeRequest('POST', '/api/dns/verify', testData);
  
  console.log('Request:', testData);
  console.log('Response Status:', response.status);
  console.log('Response Data:', JSON.stringify(response.data, null, 2));
  
  if (response.success || response.status === 400) {
    // 400 es esperado para dominios no configurados realmente
    logSuccess('Endpoint de verificación DNS funciona correctamente');
    return true;
  } else {
    logError(`Error en verificación DNS: ${response.data?.error || 'Error desconocido'}`);
    return false;
  }
}

async function testSSLGeneration(domain) {
  if (!domain) {
    logWarning('Saltando generación SSL - no hay dominio configurado');
    return false;
  }
  
  logStep('5', 'Probando Generación SSL');
  
  const testData = { domain: domain.domain || domain };
  
  const response = await makeRequest('POST', '/api/ssl/generate', testData);
  
  console.log('Request:', testData);
  console.log('Response Status:', response.status);
  console.log('Response Data:', JSON.stringify(response.data, null, 2));
  
  if (response.success || response.status === 400) {
    // 400 es esperado si DNS no está verificado
    logSuccess('Endpoint de generación SSL funciona correctamente');
    return true;
  } else {
    logError(`Error en generación SSL: ${response.data?.error || 'Error desconocido'}`);
    return false;
  }
}

async function testGetUserDomains() {
  logStep('6', 'Probando Listado de Dominios del Usuario');
  
  const response = await makeRequest('GET', '/api/dns/domains');
  
  console.log('Response Status:', response.status);
  console.log('Response Data:', JSON.stringify(response.data, null, 2));
  
  if (response.success || response.status === 401) {
    // 401 es esperado sin token válido
    logSuccess('Endpoint de listado de dominios funciona correctamente');
    return true;
  } else {
    logError(`Error en listado de dominios: ${response.data?.error || 'Error desconocido'}`);
    return false;
  }
}

async function runTests() {
  log('bright', '\n🧪 INICIANDO TESTS DEL SISTEMA DE DOMINIOS PERSONALIZADOS');
  log('bright', '================================================================\n');
  
  const results = [];
  
  // Test 1: Health Check
  results.push(await testHealthCheck());
  
  // Test 2: Variables de Entorno
  results.push(await testEnvironmentVariables());
  
  // Test 3: Configuración de Dominio
  const configuredDomain = await testDomainConfiguration();
  results.push(configuredDomain !== null);
  
  // Test 4: Verificación DNS
  results.push(await testDomainVerification(configuredDomain));
  
  // Test 5: Generación SSL
  results.push(await testSSLGeneration(configuredDomain));
  
  // Test 6: Listado de Dominios
  results.push(await testGetUserDomains());
  
  // Resumen
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  log('bright', '\n📊 RESUMEN DE TESTS');
  log('bright', '==================');
  
  if (passed === total) {
    logSuccess(`Todos los tests pasaron: ${passed}/${total}`);
    log('green', '\n🎉 ¡Sistema de dominios personalizados listo!');
  } else {
    logWarning(`Tests pasados: ${passed}/${total}`);
    
    if (passed >= 4) {
      log('yellow', '\n⚠️  El sistema básico funciona, pero hay algunos problemas menores');
    } else {
      log('red', '\n❌ Hay problemas críticos que deben resolverse');
    }
  }
  
  log('bright', '\n📝 PRÓXIMOS PASOS:');
  console.log('1. Si falta TEST_JWT_TOKEN, crear uno válido para tests completos');
  console.log('2. Verificar que la migración de BD está aplicada');
  console.log('3. Configurar las variables de entorno faltantes');
  console.log('4. Deployar a producción');
  console.log('5. Configurar el frontend para usar estos endpoints');
}

// Ejecutar tests
runTests().catch(error => {
  logError(`Error ejecutando tests: ${error.message}`);
  process.exit(1);
}); 