#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/amosmendez/Desktop/Uniclcik.io/api/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('🔍 VERIFICANDO COLUMNAS REALES DE LA TABLA MEDIA');
console.log('=' .repeat(50));

async function checkActualColumns() {
  try {
    // Obtener un registro para ver las columnas reales
    const { data: mediaRecord, error } = await supabase
      .from('media')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log('✅ Columnas reales en la tabla media:');
    Object.keys(mediaRecord).forEach((column, index) => {
      console.log(`   ${index + 1}. ${column}`);
    });

    console.log('\n📋 Registro de ejemplo:');
    console.log(JSON.stringify(mediaRecord, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkActualColumns();
