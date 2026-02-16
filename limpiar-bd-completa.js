// Script para limpiar TODA la base de datos de Uniclick
// Ejecutar con: node limpiar-bd-completa.js

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Lista de tablas a limpiar (en orden correcto por dependencias)
const tablesToClean = [
  'messages_new',
  'conversations_new', 
  'leads_contacts',
  'leads',
  'google_events',
  'google_watch_channels',
  'google_accounts',
  'citas_agendadas',
  'disponibility',
  'media',
  'personalities',
  'custom_domains',
  'websites',
  'profilesusers'
];

async function deleteInBatches(tableName, batchSize = 5000) {
  console.log(`\n🗑️  Limpiando tabla: ${tableName}...`);
  
  let totalDeleted = 0;
  let hasMore = true;
  
  while (hasMore) {
    // Obtener IDs a borrar
    const { data: rows, error: selectError } = await supabase
      .from(tableName)
      .select('id')
      .limit(batchSize);
    
    if (selectError) {
      // Si la tabla no existe, continuar
      if (selectError.code === '42P01' || selectError.message.includes('does not exist')) {
        console.log(`   ⚠️  Tabla ${tableName} no existe, saltando...`);
        return 0;
      }
      console.error(`   ❌ Error leyendo ${tableName}:`, selectError.message);
      return totalDeleted;
    }
    
    if (!rows || rows.length === 0) {
      hasMore = false;
      break;
    }
    
    const ids = rows.map(r => r.id);
    
    // Borrar el lote
    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .in('id', ids);
    
    if (deleteError) {
      console.error(`   ❌ Error borrando de ${tableName}:`, deleteError.message);
      hasMore = false;
    } else {
      totalDeleted += ids.length;
      process.stdout.write(`   📊 Borrados: ${totalDeleted} registros\r`);
    }
    
    // Si obtuvimos menos del batch size, no hay más
    if (rows.length < batchSize) {
      hasMore = false;
    }
  }
  
  console.log(`   ✅ Total borrado de ${tableName}: ${totalDeleted} registros`);
  return totalDeleted;
}

async function deleteAllUsers() {
  console.log('\n👤 Borrando usuarios de auth.users...');
  
  // Obtener todos los usuarios
  const { data: users, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 1000
  });
  
  if (listError) {
    console.error('   ❌ Error listando usuarios:', listError.message);
    return 0;
  }
  
  if (!users || users.users.length === 0) {
    console.log('   ℹ️  No hay usuarios para borrar');
    return 0;
  }
  
  console.log(`   📊 Encontrados ${users.users.length} usuarios`);
  
  let deleted = 0;
  for (const user of users.users) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`   ❌ Error borrando usuario ${user.email}:`, error.message);
    } else {
      deleted++;
      process.stdout.write(`   🗑️  Borrados: ${deleted}/${users.users.length} usuarios\r`);
    }
  }
  
  console.log(`\n   ✅ Usuarios borrados: ${deleted}`);
  
  // Si hay más de 1000 usuarios, hacer recursión
  if (users.users.length >= 1000) {
    console.log('   🔄 Hay más usuarios, continuando...');
    return deleted + await deleteAllUsers();
  }
  
  return deleted;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧹 LIMPIEZA COMPLETA DE BASE DE DATOS UNICLICK');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📅 Fecha: ${new Date().toISOString()}`);
  console.log(`🔗 Supabase: ${supabaseUrl}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Confirmar antes de proceder
  console.log('⚠️  ADVERTENCIA: Esto borrará TODOS los datos permanentemente!');
  console.log('   Presiona Ctrl+C en los próximos 5 segundos para cancelar...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('🚀 Iniciando limpieza...\n');
  
  const results = {};
  
  // 1. Limpiar tablas de datos
  for (const table of tablesToClean) {
    results[table] = await deleteInBatches(table);
  }
  
  // 2. Borrar usuarios de auth
  results['auth.users'] = await deleteAllUsers();
  
  // Resumen
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 RESUMEN DE LIMPIEZA:');
  console.log('═══════════════════════════════════════════════════════════');
  
  let totalRecords = 0;
  for (const [table, count] of Object.entries(results)) {
    console.log(`   ${table}: ${count} registros borrados`);
    totalRecords += count;
  }
  
  console.log('───────────────────────────────────────────────────────────');
  console.log(`   TOTAL: ${totalRecords} registros borrados`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n✅ Limpieza completada! La base de datos ahora está vacía.');
}

main().catch(console.error);
