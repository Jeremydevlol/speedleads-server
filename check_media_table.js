#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: '/Users/amosmendez/Desktop/Uniclcik.io/api/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkMediaTable() {
  try {
    console.log('🔍 Verificando tabla media...');
    
    // Obtener registros recientes de la tabla media
    const { data: mediaRecords, error } = await supabase
      .from('media')
      .select('*')
      .eq('users_id', 'cb4171e9-a200-4147-b8c1-2cc47211375b')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('❌ Error consultando tabla media:', error);
      return;
    }
    
    console.log(`📊 Registros encontrados: ${mediaRecords.length}`);
    
    mediaRecords.forEach((record, index) => {
      console.log(`\n📄 Registro ${index + 1}:`);
      console.log(`   ID: ${record.id}`);
      console.log(`   Filename: ${record.filename}`);
      console.log(`   Media Type: ${record.media_type}`);
      console.log(`   MIME Type: ${record.mime_type}`);
      console.log(`   Image URL: ${record.image_url}`);
      console.log(`   Personality Instruction ID: ${record.personality_instruction_id}`);
      console.log(`   Extracted Text: ${record.extracted_text?.substring(0, 100)}...`);
      console.log(`   Created At: ${record.created_at}`);
    });
    
    // Verificar archivos en Supabase Storage
    console.log('\n☁️ Verificando archivos en Supabase Storage...');
    
    const { data: files, error: storageError } = await supabase.storage
      .from('personality-files')
      .list('cb4171e9-a200-4147-b8c1-2cc47211375b', {
        limit: 10,
        sortBy: { column: 'created_at', order: 'desc' }
      });
    
    if (storageError) {
      console.error('❌ Error listando archivos en storage:', storageError);
      return;
    }
    
    console.log(`📁 Archivos en storage: ${files.length}`);
    files.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file.name} (${file.metadata?.size || 0} bytes)`);
    });
    
  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

// Ejecutar verificación
checkMediaTable();
