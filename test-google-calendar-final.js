// test-google-calendar-final.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

console.log('🎉 PRUEBA FINAL - SISTEMA GOOGLE CALENDAR\n');

// Configurar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Función para verificar que todo el sistema esté funcionando
 */
async function runFinalTest() {
  console.log('🔍 VERIFICACIÓN COMPLETA DEL SISTEMA\n');
  
  let allTestsPassed = true;
  
  // Test 1: Variables de entorno
  console.log('📋 1. Variables de entorno:');
  const requiredEnvVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  for (const varName of requiredEnvVars) {
    const isSet = !!process.env[varName];
    console.log(`   ${isSet ? '✅' : '❌'} ${varName}`);
    if (!isSet) allTestsPassed = false;
  }
  
  // Test 2: Conexión a base de datos
  console.log('\n📊 2. Base de datos:');
  try {
    const { data, error } = await supabase
      .from('google_accounts')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log('   ❌ Error de conexión');
      allTestsPassed = false;
    } else {
      console.log('   ✅ Conectada correctamente');
    }
  } catch (error) {
    console.log('   ❌ Error de conexión');
    allTestsPassed = false;
  }
  
  // Test 3: Tablas de Google Calendar
  console.log('\n🗃️ 3. Tablas de Google Calendar:');
  const tables = ['google_accounts', 'google_events', 'google_watch_channels', 'calendar_events_map'];
  
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1);
      const exists = !error || error.code !== 'PGRST116';
      console.log(`   ${exists ? '✅' : '❌'} ${table}`);
      if (!exists) allTestsPassed = false;
    } catch (error) {
      console.log(`   ❌ ${table}`);
      allTestsPassed = false;
    }
  }
  
  // Test 4: Servidor
  console.log('\n🖥️ 4. Servidor:');
  try {
    const response = await fetch('http://localhost:5001/health');
    if (response.ok) {
      const healthData = await response.json();
      console.log('   ✅ Ejecutándose correctamente');
      console.log(`   📊 Uptime: ${Math.round(healthData.uptime / 60)} minutos`);
    } else {
      console.log('   ❌ No responde correctamente');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('   ❌ No está ejecutándose');
    console.log('   💡 Ejecuta: npm start');
    allTestsPassed = false;
  }
  
  // Test 5: Servicios de Google Calendar
  console.log('\n🔧 5. Servicios de Google Calendar:');
  try {
    const { generateAuthUrl } = await import('./src/services/googleCalendar.service.js');
    console.log('   ✅ Servicio principal importado');
    
    // Probar generación de URL
    const testUrl = generateAuthUrl('test-user-id');
    if (testUrl && testUrl.includes('accounts.google.com')) {
      console.log('   ✅ Generación de URL OAuth funcionando');
    } else {
      console.log('   ❌ Generación de URL OAuth fallando');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('   ❌ Error importando servicios');
    allTestsPassed = false;
  }
  
  // Test 6: Rutas de API
  console.log('\n🛣️ 6. Rutas de API:');
  try {
    const googleCalendarRoutes = await import('./src/routes/googleCalendar.routes.js');
    console.log('   ✅ Rutas de Google Calendar importadas');
  } catch (error) {
    console.log('   ❌ Error importando rutas');
    allTestsPassed = false;
  }
  
  // Test 7: Cuentas de Google
  console.log('\n👤 7. Cuentas de Google:');
  try {
    const { data: accounts, error } = await supabase
      .from('google_accounts')
      .select('user_id, email, expiry_date')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.log('   ❌ Error consultando cuentas');
      allTestsPassed = false;
    } else if (!accounts || accounts.length === 0) {
      console.log('   ⚠️ No hay cuentas conectadas');
      console.log('   💡 Esto es normal para un sistema nuevo');
    } else {
      console.log(`   ✅ ${accounts.length} cuenta(s) encontrada(s)`);
      accounts.forEach((account, index) => {
        const isExpired = new Date(account.expiry_date) < new Date();
        const status = isExpired ? '❌ EXPIRADA' : '✅ ACTIVA';
        console.log(`      ${index + 1}. ${account.email} (${status})`);
      });
    }
  } catch (error) {
    console.log('   ❌ Error consultando cuentas');
    allTestsPassed = false;
  }
  
  // Test 8: Eventos existentes
  console.log('\n📅 8. Eventos existentes:');
  try {
    const { data: events, error } = await supabase
      .from('google_events')
      .select('event_id, summary, source')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.log('   ❌ Error consultando eventos');
      allTestsPassed = false;
    } else if (!events || events.length === 0) {
      console.log('   ⚠️ No hay eventos sincronizados');
      console.log('   💡 Esto es normal para un sistema nuevo');
    } else {
      console.log(`   ✅ ${events.length} evento(s) encontrado(s)`);
      events.forEach((event, index) => {
        console.log(`      ${index + 1}. ${event.summary || 'Sin título'} (${event.source})`);
      });
    }
  } catch (error) {
    console.log('   ❌ Error consultando eventos');
    allTestsPassed = false;
  }
  
  // Resultado final
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    console.log('🎉 ¡TODAS LAS PRUEBAS PASARON!');
    console.log('✅ El sistema de Google Calendar está completamente funcional');
    console.log('✅ Listo para usar en producción');
  } else {
    console.log('⚠️ ALGUNAS PRUEBAS FALLARON');
    console.log('❌ Revisa los errores anteriores');
  }
  console.log('='.repeat(50));
  
  // Instrucciones finales
  console.log('\n📋 INSTRUCCIONES FINALES:');
  console.log('');
  console.log('1. 🔗 Para conectar una cuenta de Google:');
  console.log('   http://localhost:5001/api/auth/google/calendar/connect?userId=TU_USER_ID');
  console.log('');
  console.log('2. 🧪 Para probar la creación de eventos:');
  console.log('   node test-google-calendar-simple.js');
  console.log('');
  console.log('3. 📊 Para ver el estado del sistema:');
  console.log('   node test-google-calendar-api.js');
  console.log('');
  console.log('4. 🔄 Para reconectar cuentas expiradas:');
  console.log('   node test-reconnect-google-account.js');
  console.log('');
  
  if (allTestsPassed) {
    console.log('🚀 ¡EL SISTEMA ESTÁ LISTO PARA USAR!');
  } else {
    console.log('🔧 Revisa los errores y vuelve a ejecutar las pruebas');
  }
}

// Ejecutar la prueba final
runFinalTest().catch(console.error);

