// test-google-calendar-setup.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

console.log('🧪 Probando configuración de Google Calendar...\n');

// Test 1: Verificar variables de entorno
console.log('📋 1. Verificando variables de entorno...');
const requiredEnvVars = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Variables de entorno faltantes:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  process.exit(1);
} else {
  console.log('✅ Todas las variables de entorno requeridas están configuradas');
}

// Test 2: Probar conexión a Supabase
console.log('\n🔌 2. Probando conexión a Supabase...');
try {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Probar una consulta simple
  const { data, error } = await supabase
    .from('google_accounts')
    .select('id')
    .limit(1);

  if (error && error.code !== 'PGRST116') { // PGRST116 = tabla no encontrada
    console.error('❌ Error conectando a Supabase:', error.message);
    process.exit(1);
  } else {
    console.log('✅ Conexión a Supabase exitosa');
  }
} catch (error) {
  console.error('❌ Error de conexión a Supabase:', error.message);
  process.exit(1);
}

// Test 3: Verificar tablas de Google Calendar
console.log('\n📊 3. Verificando tablas de Google Calendar...');
try {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const tables = ['google_accounts', 'google_events', 'google_watch_channels', 'calendar_events_map'];
  const tableStatus = {};

  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1);
      tableStatus[table] = error ? 'NO EXISTE' : 'EXISTE';
    } catch (err) {
      tableStatus[table] = 'ERROR';
    }
  }

  console.log('📋 Estado de las tablas:');
  Object.entries(tableStatus).forEach(([table, status]) => {
    const icon = status === 'EXISTE' ? '✅' : '❌';
    console.log(`   ${icon} ${table}: ${status}`);
  });

  const missingTables = Object.entries(tableStatus)
    .filter(([table, status]) => status !== 'EXISTE')
    .map(([table]) => table);

  if (missingTables.length > 0) {
    console.log('\n⚠️ Tablas faltantes detectadas. Ejecuta la migración:');
    console.log('   psql $DATABASE_URL -f db/migrations/2025-01-23_google_calendar_complete.sql');
  } else {
    console.log('✅ Todas las tablas de Google Calendar están presentes');
  }
} catch (error) {
  console.error('❌ Error verificando tablas:', error.message);
}

// Test 4: Verificar dependencias de Node.js
console.log('\n📦 4. Verificando dependencias...');
try {
  await import('googleapis');
  console.log('✅ googleapis: Instalado');
} catch (error) {
  console.error('❌ googleapis: No instalado');
}

try {
  await import('google-auth-library');
  console.log('✅ google-auth-library: Instalado');
} catch (error) {
  console.error('❌ google-auth-library: No instalado');
}

try {
  await import('node-cron');
  console.log('✅ node-cron: Instalado');
} catch (error) {
  console.error('❌ node-cron: No instalado');
}

// Test 5: Verificar configuración de webhooks
console.log('\n🌐 5. Verificando configuración de webhooks...');
if (process.env.ENABLE_GCAL_WEBHOOKS === 'true') {
  if (!process.env.PUBLIC_BASE_URL) {
    console.log('⚠️ Webhooks habilitados pero PUBLIC_BASE_URL no configurada');
    console.log('   Para desarrollo, usa Cloudflare Tunnel:');
    console.log('   cloudflared tunnel --url http://localhost:5001');
  } else if (!process.env.PUBLIC_BASE_URL.startsWith('https://')) {
    console.log('⚠️ PUBLIC_BASE_URL debe usar HTTPS para webhooks');
  } else {
    console.log('✅ Configuración de webhooks válida');
    console.log(`   Webhook URL: ${process.env.PUBLIC_BASE_URL}/webhooks/google/calendar`);
  }
} else {
  console.log('ℹ️ Webhooks deshabilitados (ENABLE_GCAL_WEBHOOKS != true)');
}

// Test 6: Probar importación de servicios
console.log('\n🔧 6. Probando importación de servicios...');
try {
  const { generateAuthUrl } = await import('./src/services/googleCalendar.service.js');
  console.log('✅ Servicio principal: Importado correctamente');
} catch (error) {
  console.error('❌ Error importando servicio principal:', error.message);
}

try {
  const { startCalendarWatch } = await import('./src/services/gcalWatch.js');
  console.log('✅ Servicio de webhooks: Importado correctamente');
} catch (error) {
  console.error('❌ Error importando servicio de webhooks:', error.message);
}

try {
  const googleCalendarRoutes = await import('./src/routes/googleCalendar.routes.js');
  console.log('✅ Rutas de API: Importadas correctamente');
} catch (error) {
  console.error('❌ Error importando rutas:', error.message);
}

// Resumen final
console.log('\n🎉 Prueba de configuración completada!');
console.log('\n📋 Pasos siguientes:');
console.log('1. Si hay tablas faltantes, ejecuta la migración SQL');
console.log('2. Si hay dependencias faltantes, ejecuta: npm install');
console.log('3. Para webhooks, configura PUBLIC_BASE_URL con HTTPS');
console.log('4. Compila TypeScript: npm run build');
console.log('5. Inicia el servidor: npm start');

process.exit(0);

