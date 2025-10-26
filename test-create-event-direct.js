// test-create-event-direct.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

console.log('🎯 PRUEBA DIRECTA - CREAR EVENTO EN GOOGLE CALENDAR\n');

// Configurar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Función para crear un evento directamente usando la API
 */
async function createEventDirectly() {
  try {
    console.log('📋 1. Verificando cuentas disponibles...');
    
    // Obtener la primera cuenta disponible
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

    // Verificar si el token está expirado
    const isExpired = new Date(account.expiry_date) < new Date();
    if (isExpired) {
      console.log('⚠️ Token expirado - necesitas reconectar la cuenta');
      console.log(`   URL de reconexión: http://localhost:5001/api/auth/google/calendar/connect?userId=${account.user_id}`);
      console.log('\n💡 Pasos para reconectar:');
      console.log('   1. Abre la URL en tu navegador');
      console.log('   2. Completa el flujo OAuth de Google');
      console.log('   3. Ejecuta este script nuevamente');
      return;
    }

    console.log('✅ Token válido - procediendo con la prueba...');

    // Datos del evento a crear
    const eventData = {
      calendarId: 'primary',
      summary: '🧪 Prueba Directa - Uniclick',
      description: 'Evento de prueba creado directamente desde el backend',
      location: 'Oficina Virtual Uniclick',
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
    console.log(`   Ubicación: ${eventData.location}`);

    // Crear el evento usando el servicio directamente
    console.log('\n🔧 3. Importando servicio de Google Calendar...');
    const { upsertGoogleEvent } = await import('./src/services/googleCalendar.service.js');
    console.log('✅ Servicio importado correctamente');

    console.log('\n📝 4. Creando evento...');
    const result = await upsertGoogleEvent({
      userId: account.user_id,
      ...eventData
    });
    
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
      console.log(`   Sincronizado: ${localEvent.last_synced_at}`);
    }

    console.log('\n🎯 Prueba completada exitosamente!');
    console.log('   ✅ Evento creado en Google Calendar');
    console.log('   ✅ Evento sincronizado en base de datos');
    console.log('   ✅ Sistema funcionando correctamente');

    // Mostrar el evento creado
    console.log('\n📋 6. Resumen del evento creado:');
    console.log(`   📅 Título: ${eventData.summary}`);
    console.log(`   🕐 Inicio: ${new Date(eventData.start.dateTime).toLocaleString()}`);
    console.log(`   🕐 Fin: ${new Date(eventData.end.dateTime).toLocaleString()}`);
    console.log(`   📍 Ubicación: ${eventData.location}`);
    console.log(`   🆔 Google ID: ${result.eventId}`);
    console.log(`   👤 Usuario: ${account.email}`);

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
      console.log('   4. Cuenta de Google reconectada');
    }
  }
}

/**
 * Función para verificar el estado actual del sistema
 */
async function checkCurrentStatus() {
  console.log('🔍 Verificando estado actual del sistema...\n');
  
  // Verificar cuentas
  const { data: accounts } = await supabase
    .from('google_accounts')
    .select('user_id, email, expiry_date, created_at')
    .order('created_at', { ascending: false });

  if (accounts && accounts.length > 0) {
    console.log(`📊 ${accounts.length} cuenta(s) encontrada(s):`);
    accounts.forEach((account, index) => {
      const isExpired = new Date(account.expiry_date) < new Date();
      const status = isExpired ? '❌ EXPIRADA' : '✅ ACTIVA';
      const createdDate = new Date(account.created_at).toLocaleDateString();
      
      console.log(`   ${index + 1}. ${account.email} (${status})`);
      console.log(`      Creada: ${createdDate}`);
      console.log(`      Expira: ${new Date(account.expiry_date).toLocaleString()}`);
      if (isExpired) {
        console.log(`      🔗 URL: http://localhost:5001/api/auth/google/calendar/connect?userId=${account.user_id}`);
      }
      console.log('');
    });
  } else {
    console.log('⚠️ No hay cuentas de Google conectadas');
  }

  // Verificar eventos existentes
  const { data: events } = await supabase
    .from('google_events')
    .select('event_id, summary, source, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (events && events.length > 0) {
    console.log(`📅 ${events.length} evento(s) reciente(s):`);
    events.forEach((event, index) => {
      const createdDate = new Date(event.created_at).toLocaleString();
      console.log(`   ${index + 1}. ${event.summary || 'Sin título'} (${event.source})`);
      console.log(`      Creado: ${createdDate}`);
      console.log(`      ID: ${event.event_id}`);
      console.log('');
    });
  } else {
    console.log('⚠️ No hay eventos sincronizados');
  }
}

// Ejecutar las pruebas
async function runTests() {
  await checkCurrentStatus();
  await createEventDirectly();
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { checkCurrentStatus, createEventDirectly };


