// test-google-calendar-api.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

console.log('🧪 Prueba de API de Google Calendar...\n');

// Configurar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Función para probar los endpoints de la API
 */
async function testAPIEndpoints() {
  try {
    console.log('📋 1. Verificando cuentas disponibles...');
    
    // Obtener una cuenta para las pruebas
    const { data: accounts, error } = await supabase
      .from('google_accounts')
      .select('user_id, email, expiry_date')
      .limit(1);

    if (error || !accounts || accounts.length === 0) {
      console.log('❌ No hay cuentas de Google disponibles');
      return;
    }

    const account = accounts[0];
    console.log(`✅ Cuenta encontrada: ${account.email}`);
    console.log(`   User ID: ${account.user_id}`);

    // Probar endpoint de estado
    console.log('\n📊 2. Probando endpoint de estado...');
    try {
      const statusResponse = await fetch('http://localhost:5001/api/google/calendar/status', {
        headers: {
          'Authorization': `Bearer fake-token-for-testing`
        }
      });
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        console.log('✅ Endpoint de estado responde');
        console.log(`   Conectado: ${statusData.connected}`);
        if (statusData.connected) {
          console.log(`   Email: ${statusData.account?.email}`);
          console.log(`   Eventos: ${statusData.eventCount}`);
        }
      } else {
        console.log('⚠️ Endpoint de estado requiere autenticación válida');
      }
    } catch (error) {
      console.log('❌ Error probando endpoint de estado:', error.message);
    }

    // Probar endpoint de eventos
    console.log('\n📅 3. Probando endpoint de eventos...');
    try {
      const eventsResponse = await fetch('http://localhost:5001/api/google/calendar/events', {
        headers: {
          'Authorization': `Bearer fake-token-for-testing`
        }
      });
      
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        console.log('✅ Endpoint de eventos responde');
        console.log(`   Eventos encontrados: ${eventsData.events?.length || 0}`);
      } else {
        console.log('⚠️ Endpoint de eventos requiere autenticación válida');
      }
    } catch (error) {
      console.log('❌ Error probando endpoint de eventos:', error.message);
    }

    // Probar endpoint de salud
    console.log('\n🏥 4. Probando endpoint de salud...');
    try {
      const healthResponse = await fetch('http://localhost:5001/api/health/google-calendar');
      
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        console.log('✅ Endpoint de salud responde');
        console.log(`   Estado: ${healthData.status}`);
        console.log(`   Servicio: ${healthData.service}`);
        if (healthData.stats) {
          console.log(`   Cuentas: ${healthData.stats.accounts}`);
          console.log(`   Eventos: ${healthData.stats.events}`);
          console.log(`   Watches: ${healthData.stats.watches?.total || 0}`);
        }
      } else {
        console.log('❌ Endpoint de salud no responde');
      }
    } catch (error) {
      console.log('❌ Error probando endpoint de salud:', error.message);
    }

    // Mostrar URLs de reconexión
    console.log('\n🔗 5. URLs de reconexión disponibles:');
    const { data: allAccounts } = await supabase
      .from('google_accounts')
      .select('user_id, email, expiry_date')
      .order('created_at', { ascending: false });

    allAccounts?.forEach((acc, index) => {
      const isExpired = new Date(acc.expiry_date) < new Date();
      const status = isExpired ? '❌ EXPIRADA' : '✅ ACTIVA';
      
      console.log(`   ${index + 1}. ${acc.email} (${status})`);
      if (isExpired) {
        console.log(`      URL: http://localhost:5001/api/auth/google/calendar/connect?userId=${acc.user_id}`);
      }
    });

    console.log('\n🎯 Próximos pasos:');
    console.log('   1. Usa una de las URLs de reconexión en tu navegador');
    console.log('   2. Completa el flujo OAuth de Google');
    console.log('   3. Ejecuta: node test-google-calendar-simple.js');
    console.log('   4. ¡Verifica que el evento se cree correctamente!');

  } catch (error) {
    console.error('\n❌ Error en la prueba de API:', error);
  }
}

/**
 * Función para verificar la configuración del servidor
 */
async function checkServerConfiguration() {
  console.log('🔧 Verificando configuración del servidor...\n');
  
  // Verificar que el servidor esté ejecutándose
  try {
    const response = await fetch('http://localhost:5001/health');
    const healthData = await response.json();
    
    console.log('✅ Servidor ejecutándose');
    console.log(`   Estado: ${healthData.status}`);
    console.log(`   Uptime: ${Math.round(healthData.uptime / 60)} minutos`);
    console.log(`   PID: ${healthData.pid}`);
    
  } catch (error) {
    console.log('❌ Servidor no está ejecutándose');
    console.log('   Ejecuta: npm start');
    return false;
  }
  
  // Verificar endpoints básicos
  const endpoints = [
    { name: 'Health Check', url: '/health' },
    { name: 'Ping', url: '/ping' },
    { name: 'Status', url: '/status' }
  ];
  
  console.log('\n📡 Verificando endpoints básicos:');
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`http://localhost:5001${endpoint.url}`);
      const status = response.ok ? '✅' : '❌';
      console.log(`   ${status} ${endpoint.name}: ${response.status}`);
    } catch (error) {
      console.log(`   ❌ ${endpoint.name}: Error`);
    }
  }
  
  return true;
}

// Ejecutar las pruebas
async function runTests() {
  const serverRunning = await checkServerConfiguration();
  
  if (serverRunning) {
    console.log('');
    await testAPIEndpoints();
  }
  
  console.log('\n🏁 Pruebas de API completadas!');
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { checkServerConfiguration, testAPIEndpoints };


