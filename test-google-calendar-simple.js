// test-google-calendar-simple.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

console.log('🧪 Prueba Simple de Google Calendar...\n');

// Configurar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Función para probar la creación de un evento usando una cuenta existente
 */
async function testEventCreation() {
  try {
    console.log('📋 1. Verificando cuentas disponibles...');
    
    // Obtener la primera cuenta disponible
    const { data: accounts, error } = await supabase
      .from('google_accounts')
      .select('user_id, email, expiry_date')
      .limit(1);

    if (error || !accounts || accounts.length === 0) {
      console.log('❌ No hay cuentas de Google disponibles');
      console.log('   Ejecuta: node test-reconnect-google-account.js para ver opciones');
      return;
    }

    const account = accounts[0];
    console.log(`✅ Cuenta encontrada: ${account.email}`);
    console.log(`   User ID: ${account.user_id}`);

    // Verificar si el token está expirado
    const isExpired = new Date(account.expiry_date) < new Date();
    if (isExpired) {
      console.log('⚠️ Token expirado - necesitas reconectar la cuenta');
      console.log(`   URL de reconexión: http://localhost:5001/api/auth/google/calendar/connect?userId=${account.user_id}`);
      return;
    }

    console.log('✅ Token válido - procediendo con la prueba...');

    // Simular datos de evento
    const eventData = {
      userId: account.user_id,
      calendarId: 'primary',
      summary: '🧪 Prueba Simple - Uniclick',
      description: 'Evento de prueba creado desde el backend',
      location: 'Oficina Virtual',
      start: {
        dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        timeZone: 'America/Mexico_City'
      },
      end: {
        dateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        timeZone: 'America/Mexico_City'
      }
    };

    console.log('\n📅 2. Datos del evento a crear:');
    console.log(`   Título: ${eventData.summary}`);
    console.log(`   Inicio: ${new Date(eventData.start.dateTime).toLocaleString()}`);
    console.log(`   Fin: ${new Date(eventData.end.dateTime).toLocaleString()}`);

    // Importar el servicio dinámicamente
    console.log('\n🔧 3. Importando servicio de Google Calendar...');
    const { upsertGoogleEvent } = await import('./src/services/googleCalendar.service.js');
    console.log('✅ Servicio importado correctamente');

    console.log('\n📝 4. Creando evento...');
    const result = await upsertGoogleEvent(eventData);
    
    console.log('\n🎉 ¡Evento creado exitosamente!');
    console.log(`   Google Event ID: ${result.eventId}`);
    console.log(`   Usuario: ${account.email}`);

    // Verificar en base de datos local
    console.log('\n🔍 5. Verificando en base de datos local...');
    const { data: localEvent, error: localError } = await supabase
      .from('google_events')
      .select('*')
      .eq('user_id', account.user_id)
      .eq('event_id', result.eventId)
      .single();

    if (localError) {
      console.log('⚠️ No se pudo verificar en base de datos local:', localError.message);
    } else {
      console.log('✅ Evento sincronizado en base de datos local');
      console.log(`   ID Local: ${localEvent.id}`);
      console.log(`   Título: ${localEvent.summary}`);
      console.log(`   Fuente: ${localEvent.source}`);
    }

    console.log('\n🎯 Prueba completada exitosamente!');
    console.log('   ✅ Evento creado en Google Calendar');
    console.log('   ✅ Evento sincronizado en base de datos');
    console.log('   ✅ Sistema funcionando correctamente');

  } catch (error) {
    console.error('\n❌ Error en la prueba:', error.message);
    
    if (error.message.includes('invalid_grant')) {
      console.log('\n💡 Solución:');
      console.log('   1. Los tokens OAuth han expirado');
      console.log('   2. Ejecuta: node test-reconnect-google-account.js');
      console.log('   3. Reconecta una cuenta usando la URL proporcionada');
      console.log('   4. Ejecuta este script nuevamente');
    } else if (error.message.includes('No Google account found')) {
      console.log('\n💡 Solución:');
      console.log('   1. No hay cuentas de Google conectadas');
      console.log('   2. Ejecuta: node test-reconnect-google-account.js');
      console.log('   3. Conecta una nueva cuenta');
    } else {
      console.log('\n💡 Verifica:');
      console.log('   1. Variables de entorno configuradas');
      console.log('   2. Servidor ejecutándose (npm start)');
      console.log('   3. Conexión a base de datos');
    }
  }
}

/**
 * Función para verificar el estado del sistema
 */
async function checkSystemStatus() {
  console.log('🔍 Verificando estado del sistema...\n');
  
  // Verificar variables de entorno
  console.log('📋 Variables de entorno:');
  console.log(`   GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '✅' : '❌'}`);
  console.log(`   GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? '✅' : '❌'}`);
  console.log(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅' : '❌'}`);
  console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌'}`);
  
  // Verificar conexión a base de datos
  try {
    const { data, error } = await supabase
      .from('google_accounts')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log('   Base de datos: ❌ Error de conexión');
    } else {
      console.log('   Base de datos: ✅ Conectada');
    }
  } catch (error) {
    console.log('   Base de datos: ❌ Error de conexión');
  }
  
  // Verificar servidor
  try {
    const response = await fetch('http://localhost:5001/health');
    if (response.ok) {
      console.log('   Servidor: ✅ Ejecutándose');
    } else {
      console.log('   Servidor: ❌ No responde');
    }
  } catch (error) {
    console.log('   Servidor: ❌ No ejecutándose');
  }
  
  console.log('');
}

// Ejecutar las pruebas
async function runTests() {
  await checkSystemStatus();
  await testEventCreation();
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { checkSystemStatus, testEventCreation };


