#!/usr/bin/env node

/**
 * Script de prueba para probar login de Instagram con todas las cuentas
 * Verifica que la detección de IP real funcione correctamente
 */

const SERVER_URL = 'http://localhost:5001';

// Token JWT para autenticación (reemplaza con un token válido)
// Para pruebas, puedes obtener uno desde el frontend después de hacer login
const JWT_TOKEN = process.env.JWT_TOKEN || 'eyJhbGciOiJIUzI1NiIsImtpZCI6ImNCZCtEOGgwNDdMdklmS2QiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2xpZnRsdmJ1Z3VtcHhobWp2bXRiLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI2OGVlYzdiNC04ZTUyLTQ2MmItYmI0Ni03NmQ2OTk4NWYwOWEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzYyODkxMzk5LCJpYXQiOjE3NjI4ODc3OTksImVtYWlsIjoicGVkcm9AZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdLCJyb2xlIjoiYWRtaW4ifSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6InBlZHJvQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmdWxsX25hbWUiOiJQZWRybyIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicm9sZSI6ImFkbWluIiwic3ViIjoiNjhlZWM3YjQtOGU1Mi00NjJiLWJiNDYtNzZkNjk5ODVmMDlhIiwidXNlcm5hbWUiOiJwZWRybyJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzYyODg3Nzk5fV0sInNlc3Npb25faWQiOiIwNDlmMThlYy03ZjA5LTQwMjgtYjQ1YS00MjFkODVjY2Y1YzciLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.fake_token';

// Cuentas de prueba
const CUENTAS = [
  {
    name: 'readytoblessd',
    username: 'readytoblessd',
    password: 'Dios199258*',
    description: 'Cuenta existente - debería funcionar'
  },
  {
    name: 'Yokiespana757',
    username: 'Yokiespana757@gmail.com',
    password: 'Yoki2025.',
    description: 'Cuenta nueva - puede requerir calentamiento'
  },
  {
    name: 'sitify.io',
    username: 'sitify.io',
    password: 'Dios2025',
    description: 'Cuenta antigua - debería funcionar'
  }
];

console.log('🚀 Script de Prueba de Login de Instagram - Todas las Cuentas\n');
console.log('='.repeat(80));
console.log(`📅 Fecha/Hora: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
console.log(`🌐 Servidor: ${SERVER_URL}`);
console.log('='.repeat(80));

/**
 * Realizar petición HTTP con headers simulando navegador real
 */
async function makeRequest(url, options = {}) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    // Simular headers de navegador real
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JWT_TOKEN}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Origin': 'http://localhost:3000',
      'Referer': 'http://localhost:3000/',
      'X-Timezone': 'Europe/Madrid',
      'X-Timezone-Offset': '-60', // UTC+1 en minutos
      'X-Country': 'ES',
      'X-City': 'Madrid'
    };
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    });
    
    const data = await response.json();
    return { success: response.ok, data, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Probar login con una cuenta
 */
async function testLogin(cuenta) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📝 PRUEBA: ${cuenta.name}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`   Username: ${cuenta.username}`);
  console.log(`   Descripción: ${cuenta.description}`);
  console.log(`   Hora inicio: ${new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' })}`);
  
  const startTime = Date.now();
  
  try {
    const result = await makeRequest(`${SERVER_URL}/api/instagram/login`, {
      method: 'POST',
      body: JSON.stringify({
        username: cuenta.username,
        password: cuenta.password
      })
    });
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`\n⏱️  Tiempo de respuesta: ${duration} segundos`);
    console.log(`   Hora fin: ${new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' })}`);
    
    if (result.success && result.data) {
      const data = result.data;
      
      if (data.success) {
        console.log(`\n✅ LOGIN EXITOSO`);
        console.log(`   Usuario: ${data.username || cuenta.username}`);
        console.log(`   Restaurado: ${data.restored ? 'Sí' : 'No'}`);
        console.log(`   Conectado: ${data.connected ? 'Sí' : 'No'}`);
        
        if (data.device) {
          console.log(`\n📱 Dispositivo detectado:`);
          console.log(`   Device String: ${data.device.substring(0, 80)}...`);
        }
        
        if (data.ip) {
          console.log(`\n📍 IP detectada: ${data.ip}`);
        }
        
        if (data.timestamp) {
          const loginTime = new Date(data.timestamp);
          console.log(`\n🕐 Timestamp del login: ${loginTime.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
        }
        
        return { success: true, cuenta: cuenta.name, duration, data };
      } else {
        console.log(`\n❌ LOGIN FALLIDO`);
        console.log(`   Error: ${data.error || 'Error desconocido'}`);
        console.log(`   Mensaje: ${data.message || 'Sin mensaje'}`);
        
        if (data.challenge) {
          console.log(`\n⚠️  CHALLENGE REQUERIDO`);
          console.log(`   Tipo: ${data.challenge_type || 'Desconocido'}`);
        }
        
        if (data.recovery_required) {
          console.log(`\n📧 RECUPERACIÓN DE CUENTA REQUERIDA`);
          if (data.is_new_account) {
            console.log(`   ⚠️  Esta es una cuenta NUEVA`);
            console.log(`   ⚠️  Requiere calentamiento de 24-48 horas`);
          }
        }
        
        return { success: false, cuenta: cuenta.name, duration, error: data.error || 'Error desconocido', data };
      }
    } else {
      console.log(`\n❌ ERROR EN LA PETICIÓN`);
      console.log(`   Status: ${result.status || 'N/A'}`);
      console.log(`   Error: ${result.error || JSON.stringify(result.data)}`);
      return { success: false, cuenta: cuenta.name, duration, error: result.error || 'Error en petición' };
    }
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`\n❌ EXCEPCIÓN DURANTE LA PRUEBA`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
    return { success: false, cuenta: cuenta.name, duration, error: error.message };
  }
}

/**
 * Función principal
 */
async function main() {
  console.log(`\n📋 Total de cuentas a probar: ${CUENTAS.length}`);
  
  const resultados = [];
  
  // Probar cada cuenta
  for (let i = 0; i < CUENTAS.length; i++) {
    const cuenta = CUENTAS[i];
    
    console.log(`\n\n🔍 [${i + 1}/${CUENTAS.length}] Probando cuenta: ${cuenta.name}`);
    
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
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`📊 RESUMEN FINAL`);
  console.log(`${'='.repeat(80)}`);
  
  const exitosos = resultados.filter(r => r.success);
  const fallidos = resultados.filter(r => !r.success);
  
  console.log(`\n✅ Exitosos: ${exitosos.length}/${resultados.length}`);
  console.log(`❌ Fallidos: ${fallidos.length}/${resultados.length}`);
  
  if (exitosos.length > 0) {
    console.log(`\n✅ LOGINS EXITOSOS:`);
    exitosos.forEach(r => {
      console.log(`   • ${r.cuenta} - ${r.duration}s`);
    });
  }
  
  if (fallidos.length > 0) {
    console.log(`\n❌ LOGINS FALLIDOS:`);
    fallidos.forEach(r => {
      console.log(`   • ${r.cuenta} - Error: ${r.error || 'Desconocido'}`);
    });
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`✨ Pruebas completadas a las ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`);
  console.log(`${'='.repeat(80)}\n`);
}

// Ejecutar
main().catch(error => {
  console.error('\n❌ Error fatal:', error);
  process.exit(1);
});





