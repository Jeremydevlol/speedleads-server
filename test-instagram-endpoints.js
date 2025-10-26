#!/usr/bin/env node

/**
 * Script para probar los endpoints de Instagram
 * Uso: node test-instagram-endpoints.js
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:5001';

// Token de prueba (reemplaza con un token real)
const TEST_TOKEN = 'development-token'; // Para desarrollo local

async function testInstagramEndpoints() {
  console.log('🧪 Probando endpoints de Instagram...\n');
  
  const headers = {
    'Authorization': `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json'
  };
  
  try {
    // 1. Probar endpoint de estado
    console.log('1️⃣ Probando /api/instagram/status...');
    try {
      const statusResponse = await axios.get(`${BASE_URL}/api/instagram/status`, { headers });
      console.log('✅ Status:', statusResponse.data);
    } catch (error) {
      console.log('❌ Error en status:', error.response?.data || error.message);
    }
    
    // 2. Probar endpoint de DMs
    console.log('\n2️⃣ Probando /api/instagram/dms...');
    try {
      const dmsResponse = await axios.get(`${BASE_URL}/api/instagram/dms`, { headers });
      console.log('✅ DMs:', dmsResponse.data);
    } catch (error) {
      console.log('❌ Error en DMs:', error.response?.data || error.message);
      console.log('   Status:', error.response?.status);
      console.log('   Headers:', error.response?.headers);
    }
    
    // 3. Probar endpoint de comentarios
    console.log('\n3️⃣ Probando /api/instagram/comments...');
    try {
      const commentsResponse = await axios.get(`${BASE_URL}/api/instagram/comments`, { headers });
      console.log('✅ Comments:', commentsResponse.data);
    } catch (error) {
      console.log('❌ Error en comments:', error.response?.data || error.message);
    }
    
    // 4. Probar endpoint de bot status
    console.log('\n4️⃣ Probando /api/instagram/bot/status...');
    try {
      const botStatusResponse = await axios.get(`${BASE_URL}/api/instagram/bot/status`, { headers });
      console.log('✅ Bot Status:', botStatusResponse.data);
    } catch (error) {
      console.log('❌ Error en bot status:', error.response?.data || error.message);
    }
    
    // 5. Probar login (sin credenciales reales)
    console.log('\n5️⃣ Probando /api/instagram/login (sin credenciales)...');
    try {
      const loginResponse = await axios.post(`${BASE_URL}/api/instagram/login`, {
        username: 'test_user',
        password: 'test_password'
      }, { headers });
      console.log('✅ Login:', loginResponse.data);
    } catch (error) {
      console.log('❌ Error en login:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
  
  console.log('\n📋 Resumen:');
  console.log('- Si ves errores 403, el problema es de autenticación');
  console.log('- Si ves errores 400, el problema es de sesión de Instagram');
  console.log('- Si ves errores 500, el problema es del servidor');
  
  console.log('\n🔧 Soluciones:');
  console.log('1. Verificar que el servidor esté corriendo en puerto 5001');
  console.log('2. Verificar que el token de autenticación sea válido');
  console.log('3. Verificar que las variables de entorno estén configuradas');
  console.log('4. Verificar que las tablas de Instagram existan en Supabase');
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  testInstagramEndpoints();
}

export default testInstagramEndpoints;

