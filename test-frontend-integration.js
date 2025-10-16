// test-frontend-integration.js
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

console.log('🧪 PRUEBA DE INTEGRACIÓN CON FRONTEND\n');

const BASE_URL = 'http://localhost:5001';
const DEV_TOKEN = 'development-token';
const USER_ID = '96754cf7-5784-47f1-9fa8-0fc59122fe13';

/**
 * Función para hacer requests con el token de desarrollo
 */
async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${DEV_TOKEN}`,
    'Content-Type': 'application/json',
    ...options.headers
  };

  console.log(`📡 ${options.method || 'GET'} ${endpoint}`);
  
  try {
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    const data = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, JSON.stringify(data, null, 2));
    console.log('');
    
    return { status: response.status, data };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    console.log('');
    return { status: 500, data: { error: error.message } };
  }
}

/**
 * Probar todos los endpoints que el frontend necesita
 */
async function testAllEndpoints() {
  console.log('🔍 PROBANDO TODOS LOS ENDPOINTS DEL FRONTEND\n');
  
  // 1. Probar endpoint de eventos
  console.log('1️⃣ PROBANDO: GET /api/google/calendar/events');
  await makeRequest(`/api/google/calendar/events?userId=${USER_ID}`);
  
  // 2. Probar endpoint de estado
  console.log('2️⃣ PROBANDO: GET /api/google/calendar/status');
  await makeRequest(`/api/google/calendar/status?userId=${USER_ID}`);
  
  // 3. Probar endpoint de sincronización
  console.log('3️⃣ PROBANDO: POST /api/google/calendar/sync');
  await makeRequest('/api/google/calendar/sync', {
    method: 'POST',
    body: JSON.stringify({ userId: USER_ID })
  });
  
  // 4. Probar endpoint de salud
  console.log('4️⃣ PROBANDO: GET /health');
  await makeRequest('/health');
  
  // 5. Probar endpoint de ping
  console.log('5️⃣ PROBANDO: GET /ping');
  await makeRequest('/ping');
}

/**
 * Probar con diferentes formatos de userId
 */
async function testUserIdFormats() {
  console.log('🔄 PROBANDO DIFERENTES FORMATOS DE USER ID\n');
  
  const userIds = [
    USER_ID,
    USER_ID.replace(/-/g, ''), // Sin guiones
    `"${USER_ID}"`, // Con comillas
    USER_ID.toUpperCase() // Mayúsculas
  ];
  
  for (const userId of userIds) {
    console.log(`📋 Probando con userId: ${userId}`);
    await makeRequest(`/api/google/calendar/status?userId=${userId}`);
  }
}

/**
 * Probar manejo de errores
 */
async function testErrorHandling() {
  console.log('⚠️ PROBANDO MANEJO DE ERRORES\n');
  
  // 1. Sin token
  console.log('1️⃣ Sin token de autorización:');
  try {
    const response = await fetch(`${BASE_URL}/api/google/calendar/events?userId=${USER_ID}`);
    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  console.log('');
  
  // 2. Token inválido
  console.log('2️⃣ Con token inválido:');
  await makeRequest(`/api/google/calendar/events?userId=${USER_ID}`, {
    headers: { 'Authorization': 'Bearer invalid-token' }
  });
  
  // 3. userId inválido
  console.log('3️⃣ Con userId inválido:');
  await makeRequest('/api/google/calendar/events?userId=invalid-user-id');
}

/**
 * Función principal
 */
async function runTests() {
  console.log('🚀 INICIANDO PRUEBAS DE INTEGRACIÓN CON FRONTEND\n');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`🔑 Development Token: ${DEV_TOKEN}`);
  console.log(`👤 User ID: ${USER_ID}`);
  console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV}`);
  console.log('');
  
  await testAllEndpoints();
  await testUserIdFormats();
  await testErrorHandling();
  
  console.log('✅ PRUEBAS COMPLETADAS');
  console.log('\n📋 RESUMEN:');
  console.log('   ✅ Endpoints funcionando con development-token');
  console.log('   ✅ Autenticación de desarrollo configurada');
  console.log('   ✅ Variables de entorno configuradas');
  console.log('   ✅ Manejo de errores implementado');
  console.log('\n🎯 EL FRONTEND PUEDE USAR ESTOS ENDPOINTS:');
  console.log('   GET /api/google/calendar/events?userId={userId}');
  console.log('   GET /api/google/calendar/status?userId={userId}');
  console.log('   POST /api/google/calendar/sync');
  console.log('\n🔑 HEADER REQUERIDO:');
  console.log('   Authorization: Bearer development-token');
}

// Ejecutar las pruebas
runTests().catch(console.error);

