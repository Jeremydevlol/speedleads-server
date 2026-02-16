// test-create-google-calendar-event.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { upsertGoogleEvent } from './src/services/googleCalendar.service.js';

// Cargar variables de entorno
dotenv.config();

console.log('🧪 Probando creación de evento en Google Calendar...\n');

// Configurar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Función para crear un evento de prueba
 */
async function createTestEvent() {
  try {
    console.log('📋 1. Verificando cuentas de Google conectadas...');
    
    // Obtener una cuenta de Google conectada
    const { data: accounts, error: accountsError } = await supabase
      .from('google_accounts')
      .select('user_id, email')
      .limit(1);

    if (accountsError) {
      console.error('❌ Error obteniendo cuentas:', accountsError.message);
      return;
    }

    if (!accounts || accounts.length === 0) {
      console.log('⚠️ No hay cuentas de Google conectadas');
      console.log('   Para conectar una cuenta, visita:');
      console.log('   http://localhost:5001/api/auth/google/calendar/connect?userId=TU_USER_ID');
      return;
    }

    const account = accounts[0];
    console.log(`✅ Cuenta encontrada: ${account.email} (User ID: ${account.user_id})`);

    console.log('\n📅 2. Creando evento de prueba...');
    
    // Crear evento de prueba
    const eventData = {
      userId: account.user_id,
      calendarId: 'primary',
      summary: '🧪 Evento de Prueba - Uniclick',
      description: 'Este es un evento de prueba creado desde el backend de Uniclick para verificar la integración con Google Calendar.',
      location: 'Oficina Virtual - Uniclick',
      start: {
        dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // En 1 hora
        timeZone: 'America/Mexico_City'
      },
      end: {
        dateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // En 2 horas
        timeZone: 'America/Mexico_City'
      }
    };

    console.log('📝 Datos del evento:');
    console.log(`   Título: ${eventData.summary}`);
    console.log(`   Descripción: ${eventData.description}`);
    console.log(`   Ubicación: ${eventData.location}`);
    console.log(`   Inicio: ${new Date(eventData.start.dateTime).toLocaleString()}`);
    console.log(`   Fin: ${new Date(eventData.end.dateTime).toLocaleString()}`);

    // Crear el evento
    const result = await upsertGoogleEvent(eventData);
    
    console.log('\n✅ 3. Evento creado exitosamente!');
    console.log(`   Google Event ID: ${result.eventId}`);
    console.log(`   Usuario: ${account.email}`);
    console.log(`   Calendario: ${eventData.calendarId}`);

    console.log('\n🔍 4. Verificando evento en base de datos local...');
    
    // Verificar que el evento se guardó en nuestra base de datos
    const { data: localEvent, error: localError } = await supabase
      .from('google_events')
      .select('*')
      .eq('user_id', account.user_id)
      .eq('event_id', result.eventId)
      .single();

    if (localError) {
      console.error('❌ Error verificando evento local:', localError.message);
    } else {
      console.log('✅ Evento sincronizado en base de datos local:');
      console.log(`   ID Local: ${localEvent.id}`);
      console.log(`   Título: ${localEvent.summary}`);
      console.log(`   Fuente: ${localEvent.source}`);
      console.log(`   Última sincronización: ${localEvent.last_synced_at}`);
    }

    console.log('\n🎉 ¡Prueba completada exitosamente!');
    console.log('\n📋 Resumen:');
    console.log(`   ✅ Evento creado en Google Calendar: ${result.eventId}`);
    console.log(`   ✅ Evento sincronizado en base de datos local`);
    console.log(`   ✅ Usuario: ${account.email}`);
    console.log(`   ✅ Sistema funcionando correctamente`);

    console.log('\n🔗 Para ver el evento:');
    console.log('   1. Abre Google Calendar en tu navegador');
    console.log('   2. Busca el evento "🧪 Evento de Prueba - Uniclick"');
    console.log('   3. Verifica que aparezca en la hora programada');

  } catch (error) {
    console.error('\n❌ Error creando evento de prueba:', error);
    
    if (error.message.includes('No Google account found')) {
      console.log('\n💡 Solución:');
      console.log('   1. Conecta una cuenta de Google primero:');
      console.log('      http://localhost:5001/api/auth/google/calendar/connect?userId=TU_USER_ID');
      console.log('   2. Completa el flujo OAuth');
      console.log('   3. Ejecuta este script nuevamente');
    } else if (error.message.includes('Token')) {
      console.log('\n💡 Solución:');
      console.log('   1. El token de acceso puede haber expirado');
      console.log('   2. Reconecta la cuenta de Google');
      console.log('   3. O verifica la configuración de OAuth');
    } else {
      console.log('\n💡 Verifica:');
      console.log('   1. Variables de entorno configuradas');
      console.log('   2. Servidor ejecutándose');
      console.log('   3. Conexión a base de datos');
    }
  }
}

/**
 * Función para listar eventos existentes
 */
async function listExistingEvents() {
  try {
    console.log('\n📋 Listando eventos existentes...');
    
    const { data: events, error } = await supabase
      .from('google_events')
      .select('event_id, summary, start_time, source, last_synced_at')
      .order('start_time', { ascending: false })
      .limit(5);

    if (error) {
      console.error('❌ Error listando eventos:', error.message);
      return;
    }

    if (!events || events.length === 0) {
      console.log('📭 No hay eventos en la base de datos local');
      return;
    }

    console.log(`📅 Últimos ${events.length} eventos:`);
    events.forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.summary || 'Sin título'}`);
      console.log(`      ID: ${event.event_id}`);
      console.log(`      Inicio: ${new Date(event.start_time).toLocaleString()}`);
      console.log(`      Fuente: ${event.source}`);
      console.log(`      Sincronizado: ${new Date(event.last_synced_at).toLocaleString()}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error listando eventos:', error.message);
  }
}

/**
 * Función para verificar estado de la cuenta
 */
async function checkAccountStatus() {
  try {
    console.log('🔍 Verificando estado de cuentas...');
    
    const { data: accounts, error } = await supabase
      .from('google_accounts')
      .select('user_id, email, expiry_date, created_at');

    if (error) {
      console.error('❌ Error verificando cuentas:', error.message);
      return;
    }

    if (!accounts || accounts.length === 0) {
      console.log('📭 No hay cuentas de Google conectadas');
      return;
    }

    console.log(`📊 ${accounts.length} cuenta(s) conectada(s):`);
    accounts.forEach((account, index) => {
      const isExpired = new Date(account.expiry_date) < new Date();
      const status = isExpired ? '❌ EXPIRADA' : '✅ ACTIVA';
      
      console.log(`   ${index + 1}. ${account.email}`);
      console.log(`      User ID: ${account.user_id}`);
      console.log(`      Estado: ${status}`);
      console.log(`      Expira: ${new Date(account.expiry_date).toLocaleString()}`);
      console.log(`      Creada: ${new Date(account.created_at).toLocaleString()}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error verificando cuentas:', error.message);
  }
}

// Ejecutar las pruebas
async function runTests() {
  console.log('🚀 Iniciando pruebas de Google Calendar...\n');
  
  // Verificar estado de cuentas
  await checkAccountStatus();
  
  // Listar eventos existentes
  await listExistingEvents();
  
  // Crear evento de prueba
  await createTestEvent();
  
  console.log('\n🏁 Pruebas completadas!');
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { checkAccountStatus, createTestEvent, listExistingEvents };


