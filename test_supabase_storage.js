#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: '/Users/amosmendez/Desktop/Uniclcik.io/api/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Configuración de Supabase:');
console.log(`   URL: ${supabaseUrl}`);
console.log(`   Service Key: ${supabaseServiceKey ? 'Configurado' : 'NO CONFIGURADO'}`);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Variables de entorno de Supabase no configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function testSupabaseStorage() {
  try {
    console.log('\n🧪 Probando Supabase Storage...');
    
    // 1. Listar buckets existentes
    console.log('\n📦 Listando buckets existentes...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('❌ Error listando buckets:', bucketsError);
      return;
    }
    
    console.log(`✅ Buckets encontrados: ${buckets.length}`);
    buckets.forEach(bucket => {
      console.log(`   - ${bucket.name} (${bucket.public ? 'público' : 'privado'})`);
    });
    
    // 2. Verificar si existe el bucket 'personality-files'
    const personalityBucket = buckets.find(b => b.name === 'personality-files');
    
    if (!personalityBucket) {
      console.log('\n🔨 Creando bucket "personality-files"...');
      
      const { data: newBucket, error: createError } = await supabase.storage.createBucket('personality-files', {
        public: true,
        allowedMimeTypes: ['application/pdf', 'text/plain', 'image/*', 'audio/*'],
        fileSizeLimit: 10485760 // 10MB
      });
      
      if (createError) {
        console.error('❌ Error creando bucket:', createError);
        return;
      }
      
      console.log('✅ Bucket "personality-files" creado exitosamente');
    } else {
      console.log('✅ Bucket "personality-files" ya existe');
    }
    
    // 3. Probar subida de archivo
    console.log('\n📤 Probando subida de archivo...');
    
    const testContent = 'Este es un archivo de prueba para Supabase Storage';
    const testBuffer = Buffer.from(testContent, 'utf8');
    const testFilename = `test-${Date.now()}.txt`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('personality-files')
      .upload(testFilename, testBuffer, {
        contentType: 'text/plain',
        upsert: false
      });
    
    if (uploadError) {
      console.error('❌ Error subiendo archivo:', uploadError);
      return;
    }
    
    console.log('✅ Archivo subido exitosamente:', uploadData.path);
    
    // 4. Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('personality-files')
      .getPublicUrl(testFilename);
    
    console.log('🔗 URL pública:', urlData.publicUrl);
    
    // 5. Verificar que el archivo existe
    console.log('\n🔍 Verificando archivo subido...');
    
    const { data: files, error: listError } = await supabase.storage
      .from('personality-files')
      .list('', {
        limit: 10,
        sortBy: { column: 'created_at', order: 'desc' }
      });
    
    if (listError) {
      console.error('❌ Error listando archivos:', listError);
      return;
    }
    
    console.log(`📁 Archivos en el bucket: ${files.length}`);
    files.forEach(file => {
      console.log(`   - ${file.name} (${file.metadata?.size || 0} bytes)`);
    });
    
    // 6. Limpiar archivo de prueba
    console.log('\n🗑️ Limpiando archivo de prueba...');
    
    const { error: deleteError } = await supabase.storage
      .from('personality-files')
      .remove([testFilename]);
    
    if (deleteError) {
      console.warn('⚠️ Error eliminando archivo de prueba:', deleteError);
    } else {
      console.log('✅ Archivo de prueba eliminado');
    }
    
    console.log('\n🎉 ¡Prueba de Supabase Storage completada exitosamente!');
    
  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

// Ejecutar prueba
testSupabaseStorage();
