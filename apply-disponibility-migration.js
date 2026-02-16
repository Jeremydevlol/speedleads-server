#!/usr/bin/env node

/**
 * Script para aplicar la migración de columnas faltantes a la tabla disponibility
 */

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🚀 Aplicando migración para agregar columnas faltantes a disponibility...\n');
  
  try {
    // Leer el archivo de migración
    const migrationSQL = fs.readFileSync('./db/migrations/2025-01-26_add_missing_disponibility_columns.sql', 'utf8');
    
    // Ejecutar la migración usando Supabase RPC o ejecutando el SQL directamente
    // Como Supabase no tiene un método directo para ejecutar SQL arbitrario,
    // vamos a usar la API REST de Supabase para ejecutar el SQL
    
    console.log('📝 Ejecutando migración SQL...');
    
    // Dividir el SQL en statements individuales y ejecutarlos
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('SELECT') && s !== '\n');
    
    // Nota: Supabase Client no permite ejecutar SQL arbitrario directamente
    // Necesitamos usar psql o la interfaz de Supabase SQL Editor
    console.log('\n⚠️ NOTA: Supabase Client no permite ejecutar SQL arbitrario directamente.');
    console.log('📋 Para ejecutar esta migración, tienes dos opciones:\n');
    console.log('OPCIÓN 1: Usar Supabase Dashboard (RECOMENDADO)');
    console.log('   1. Ve a https://supabase.com/dashboard/project/[tu-proyecto]/sql');
    console.log('   2. Copia el contenido del archivo: db/migrations/2025-01-26_add_missing_disponibility_columns.sql');
    console.log('   3. Pega y ejecuta el SQL\n');
    console.log('OPCIÓN 2: Usar psql desde la terminal');
    console.log('   psql $DATABASE_URL -f db/migrations/2025-01-26_add_missing_disponibility_columns.sql\n');
    
    // Verificar las columnas actuales de disponibility
    console.log('🔍 Verificando columnas actuales de la tabla disponibility...\n');
    
    const { data: columns, error: checkError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'disponibility'
        ORDER BY ordinal_position;
      `
    });
    
    if (checkError) {
      // Si no existe la función RPC, intentar una consulta directa
      console.log('📊 Columnas actuales en disponibility:');
      console.log('   (Usando método alternativo para verificar...)\n');
      
      // Intentar consultar la tabla directamente para ver qué columnas tiene
      const { data: testData, error: testError } = await supabase
        .from('disponibility')
        .select('*')
        .limit(1);
      
      if (testError) {
        console.error('❌ Error verificando tabla:', testError.message);
      } else {
        console.log('✅ Tabla disponibility existe');
        if (testData && testData.length > 0) {
          console.log('📋 Columnas encontradas:', Object.keys(testData[0]).join(', '));
        }
      }
    } else {
      console.log('📊 Columnas actuales:');
      if (columns && columns.length > 0) {
        columns.forEach(col => {
          console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });
      }
    }
    
    console.log('\n✅ Script de verificación completado');
    console.log('📝 Ejecuta la migración usando una de las opciones mencionadas arriba');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n🔧 Posibles soluciones:');
    console.error('   1. Verifica que el archivo de migración existe');
    console.error('   2. Ejecuta la migración directamente en Supabase Dashboard');
    console.error('   3. Asegúrate de tener permisos de administrador en la BD');
    process.exit(1);
  }
}

applyMigration();


