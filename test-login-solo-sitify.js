#!/usr/bin/env node

/**
 * Script de prueba para login de Instagram usando el endpoint real
 * Solo prueba con sitify.io
 */

import axios from 'axios';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const TEST_USER_ID = '68eec7b4-8e52-462b-bb46-76d69985f09a';

async function testLogin() {
  try {
    console.log('🔐 Probando login con sitify.io');
    console.log('═'.repeat(80));
    console.log(`🌐 Servidor: ${BASE_URL}`);
    console.log(`📧 Usuario: sitify.io`);
    console.log(`👤 User ID: ${TEST_USER_ID}`);
    console.log(`🕐 Hora: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
    console.log('');
    
    const startTime = Date.now();
    
    const response = await axios.post(
      `${BASE_URL}/api/instagram/login`,
      {
        username: 'sitify.io',
        password: 'Dios2025',
        userId: TEST_USER_ID
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          'X-Timezone-Offset': '60',
          'X-Timezone': 'Europe/Madrid',
          'X-Country': 'ES',
          'X-City': 'Madrid'
        },
        timeout: 120000 // 120 segundos
      }
    );
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('═'.repeat(80));
    console.log('✅ LOGIN EXITOSO');
    console.log('═'.repeat(80));
    console.log(`Mensaje: ${response.data.message || 'Login exitoso'}`);
    console.log(`Username: ${response.data.username || 'sitify.io'}`);
    console.log(`Restaurado: ${response.data.restored || false}`);
    console.log(`Tiempo: ${duration} segundos`);
    console.log('');
    
    console.log('📊 Estado de la sesión:');
    console.log(`   ✅ Sesión activa`);
    console.log(`   ✅ Cookies guardadas`);
    console.log(`   ✅ Listo para usar`);
    console.log('');
    
    return true;
    
  } catch (error) {
    console.log('═'.repeat(80));
    console.log('❌ ERROR EN LOGIN');
    console.log('═'.repeat(80));
    
    if (error.response) {
      const data = error.response.data;
      console.log(`Status: ${error.response.status}`);
      console.log(`Error: ${data.error || error.message}`);
      console.log(`Mensaje: ${data.message || 'Sin mensaje'}`);
      console.log('');
      
      if (data.status === '2FA_REQUIRED') {
        console.log('🔐 2FA REQUERIDO:');
        console.log(`   Método: ${data.via || 'sms'}`);
        console.log(`   Username: ${data.username || 'sitify.io'}`);
        console.log('');
      }
      
      if (data.challenge) {
        console.log('⚠️ Challenge requerido');
        console.log('');
      }
      
      if (data.recovery_required) {
        console.log('⚠️ Recuperación de cuenta requerida');
        console.log('');
      }
      
      if (data.is_new_account) {
        console.log('⚠️ Cuenta nueva - requiere uso manual primero');
        console.log('');
      }
    } else if (error.request) {
      console.log(`Error de conexión: ${error.message}`);
      console.log('   El servidor no respondió');
      console.log('');
    } else {
      console.log(`Error: ${error.message}`);
      console.log('');
    }
    
    return false;
  }
}

// Ejecutar
testLogin().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});



