// test-reconnect-google-account.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

console.log('🔄 Script para reconectar cuenta de Google Calendar...\n');

// Configurar Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Función para mostrar cuentas existentes y generar URL de reconexión
 */
async function showReconnectionOptions() {
  try {
    console.log('📋 1. Verificando cuentas de Google existentes...');
    
    // Obtener todas las cuentas
    const { data: accounts, error } = await supabase
      .from('google_accounts')
      .select('user_id, email, expiry_date, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error obteniendo cuentas:', error.message);
      return;
    }

    if (!accounts || accounts.length === 0) {
      console.log('📭 No hay cuentas de Google conectadas');
      console.log('\n💡 Para conectar una nueva cuenta:');
      console.log('   1. Visita: http://localhost:5001/api/auth/google/calendar/connect?userId=TU_USER_ID');
      console.log('   2. Completa el flujo OAuth');
      console.log('   3. Ejecuta el script de prueba nuevamente');
      return;
    }

    console.log(`📊 ${accounts.length} cuenta(s) encontrada(s):\n`);

    accounts.forEach((account, index) => {
      const isExpired = new Date(account.expiry_date) < new Date();
      const status = isExpired ? '❌ EXPIRADA' : '✅ ACTIVA';
      
      console.log(`   ${index + 1}. ${account.email}`);
      console.log(`      User ID: ${account.user_id}`);
      console.log(`      Estado: ${status}`);
      console.log(`      Expira: ${new Date(account.expiry_date).toLocaleString()}`);
      console.log(`      Creada: ${new Date(account.created_at).toLocaleString()}`);
      
      if (isExpired) {
        console.log(`      🔗 URL de reconexión:`);
        console.log(`         http://localhost:5001/api/auth/google/calendar/connect?userId=${account.user_id}`);
      }
      console.log('');
    });

    // Mostrar instrucciones
    console.log('📋 2. Instrucciones para reconectar:');
    console.log('');
    console.log('   Para reconectar una cuenta expirada:');
    console.log('   1. Copia la URL de reconexión de la cuenta que quieres reconectar');
    console.log('   2. Abre la URL en tu navegador');
    console.log('   3. Completa el flujo OAuth de Google');
    console.log('   4. Serás redirigido a una página de éxito');
    console.log('   5. Ejecuta nuevamente: node test-create-google-calendar-event.js');
    console.log('');

    // Mostrar ejemplo de nueva cuenta
    console.log('   Para conectar una nueva cuenta:');
    console.log('   1. Genera un UUID para el usuario (puedes usar: https://www.uuidgenerator.net/)');
    console.log('   2. Visita: http://localhost:5001/api/auth/google/calendar/connect?userId=TU_NUEVO_UUID');
    console.log('   3. Completa el flujo OAuth');
    console.log('   4. Ejecuta: node test-create-google-calendar-event.js');
    console.log('');

    // Mostrar estado del servidor
    console.log('📋 3. Verificar que el servidor esté ejecutándose:');
    console.log('   El servidor debe estar corriendo en: http://localhost:5001');
    console.log('   Si no está corriendo, ejecuta: npm start');
    console.log('');

    // Mostrar configuración de OAuth
    console.log('📋 4. Verificar configuración de OAuth:');
    console.log(`   GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`   GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? '✅ Configurado' : '❌ No configurado'}`);
    console.log(`   GOOGLE_REDIRECT_URI: ${process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5001/api/auth/google/calendar/callback'}`);
    console.log('');

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.log('⚠️ IMPORTANTE: Configura las variables de entorno de Google OAuth en tu archivo .env');
      console.log('   GOOGLE_CLIENT_ID=tu-google-client-id');
      console.log('   GOOGLE_CLIENT_SECRET=tu-google-client-secret');
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error en el script:', error);
  }
}

/**
 * Función para limpiar cuentas expiradas (opcional)
 */
async function cleanupExpiredAccounts() {
  try {
    console.log('🧹 Limpiando cuentas expiradas...');
    
    const { data: deletedAccounts, error } = await supabase
      .from('google_accounts')
      .delete()
      .lt('expiry_date', new Date().toISOString())
      .select('email');

    if (error) {
      console.error('❌ Error limpiando cuentas:', error.message);
      return;
    }

    if (deletedAccounts && deletedAccounts.length > 0) {
      console.log(`✅ ${deletedAccounts.length} cuenta(s) expirada(s) eliminada(s):`);
      deletedAccounts.forEach(account => {
        console.log(`   - ${account.email}`);
      });
    } else {
      console.log('📭 No hay cuentas expiradas para limpiar');
    }

  } catch (error) {
    console.error('❌ Error limpiando cuentas:', error);
  }
}

// Ejecutar el script
async function runScript() {
  await showReconnectionOptions();
  
  // Preguntar si quiere limpiar cuentas expiradas
  console.log('💡 ¿Quieres limpiar las cuentas expiradas? (Esto las eliminará de la base de datos)');
  console.log('   Ejecuta: node -e "import(\'./test-reconnect-google-account.js\').then(m => m.cleanupExpiredAccounts())"');
  console.log('');
  
  console.log('🎯 Próximos pasos:');
  console.log('   1. Reconecta una cuenta usando la URL proporcionada');
  console.log('   2. Ejecuta: node test-create-google-calendar-event.js');
  console.log('   3. ¡Verifica que el evento se cree correctamente!');
}

// Exportar funciones para uso individual
export { cleanupExpiredAccounts, showReconnectionOptions };

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runScript().catch(console.error);
}

