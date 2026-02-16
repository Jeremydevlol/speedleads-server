import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno (dotenv busca .env en el directorio actual)
dotenv.config();

// Variables de entorno proporcionadas directamente (para pruebas)
const supabaseUrl = process.env.SUPABASE_URL || 'https://jnzsabhbfnivdiceoefg.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuenNhYmhiZm5pdmRpY2VvZWZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTQ2MDkwNiwiZXhwIjoyMDY3MDM2OTA2fQ.osVY-mW4BQ1RY6zrT0JrbLuqISYKL0LSUkN0m3enWd0';

// Debug: Verificar que las variables están disponibles
console.log('🔍 Verificando variables de entorno...');
console.log(`   SUPABASE_URL: ${supabaseUrl ? '✅ Configurada' : '❌ No configurada'}`);
console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey ? '✅ Configurada' : '❌ No configurada'}`);

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan variables de entorno: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: true, persistSession: false, detectSessionInUrl: false }
});

async function uploadToSupabaseStorage(buffer, filename, mimeType, userId, bucketName = 'whatsapp') {
  try {
    console.log(`📤 Subiendo archivo a Supabase Storage: ${filename}`);
    
    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const originalExt = path.extname(filename);
    const baseName = path.basename(filename, originalExt).replace(/[^a-zA-Z0-9.-]/g, '_');
    let safeExt = originalExt || '.png';
    const uniqueFilename = `${userId}/${timestamp}-${baseName}${safeExt}`;
    const targetBucket = bucketName || 'whatsapp';
    
    // Subir al bucket
    const { data, error } = await supabaseAdmin.storage
      .from(targetBucket)
      .upload(uniqueFilename, buffer, {
        contentType: mimeType,
        upsert: false
      });
    
    if (error) {
      throw error;
    }
    
    // Obtener URL pública del archivo
    const { data: urlData } = supabaseAdmin.storage
      .from(targetBucket)
      .getPublicUrl(uniqueFilename);
    
    console.log(`✅ Archivo subido exitosamente: ${urlData.publicUrl}`);
    
    return {
      path: uniqueFilename,
      publicUrl: urlData.publicUrl,
      size: buffer.length
    };
    
  } catch (error) {
    console.error('❌ Error en uploadToSupabaseStorage:', error);
    throw error;
  }
}

async function testUploadImage() {
  try {
    // Buscar el archivo Screenshot en el directorio actual
    const files = fs.readdirSync(__dirname);
    const screenshotFile = files.find(f => f.includes('Screenshot') && f.endsWith('.png'));
    
    if (!screenshotFile) {
      console.error('❌ No se encontró ningún archivo Screenshot.png en el directorio');
      console.log('📁 Archivos en el directorio:', files.filter(f => f.endsWith('.png')).join(', ') || 'ninguno');
      return;
    }
    
    const imagePath = path.join(__dirname, screenshotFile);
    console.log('📸 Archivo encontrado:', screenshotFile);
    console.log('📸 Leyendo imagen desde:', imagePath);
    
    // Verificar que el archivo existe
    if (!fs.existsSync(imagePath)) {
      console.error('❌ El archivo no existe:', imagePath);
      return;
    }
    
    // Leer el archivo como buffer
    const buffer = fs.readFileSync(imagePath);
    console.log(`✅ Imagen leída: ${(buffer.length / 1024).toFixed(2)} KB`);
    
    // Obtener información del archivo
    const stats = fs.statSync(imagePath);
    console.log(`📊 Tamaño del archivo: ${(stats.size / 1024).toFixed(2)} KB`);
    
    // Usar un userId de prueba (puedes cambiarlo)
    const testUserId = 'f3960fca-4bfe-482c-b222-ca8156964ddb';
    const filename = 'Screenshot 2026-01-04 at 1.28.36 AM.png';
    const mimeType = 'image/png';
    
    console.log('☁️ Subiendo imagen a Supabase Storage...');
    console.log(`   - Usuario: ${testUserId}`);
    console.log(`   - Nombre: ${filename}`);
    console.log(`   - Tipo: ${mimeType}`);
    
    // Subir a Supabase Storage
    const uploadResult = await uploadToSupabaseStorage(
      buffer,
      filename,
      mimeType,
      testUserId
    );
    
    console.log('\n✅ ¡Imagen subida exitosamente a Supabase Storage!');
    console.log('📋 Resultado de la subida:');
    console.log(`   - Path: ${uploadResult.path}`);
    console.log(`   - URL pública: ${uploadResult.publicUrl}`);
    console.log(`   - Tamaño: ${(uploadResult.size / 1024).toFixed(2)} KB`);
    
    // Verificar que la URL es accesible
    console.log('\n🔍 Verificando acceso a la URL...');
    try {
      const response = await fetch(uploadResult.publicUrl, { method: 'HEAD' });
      if (response.ok) {
        console.log(`✅ URL accesible (Status: ${response.status})`);
        console.log(`   Content-Type: ${response.headers.get('content-type')}`);
        console.log(`   Content-Length: ${response.headers.get('content-length')} bytes`);
      } else {
        console.log(`⚠️ URL no accesible (Status: ${response.status})`);
      }
    } catch (fetchError) {
      console.log(`⚠️ Error verificando URL: ${fetchError.message}`);
    }
    
    // 2. Guardar la URL en la base de datos (messages_new)
    console.log('\n💾 Guardando URL en la base de datos (messages_new)...');
    
    // Necesitamos un conversation_id y message_id de ejemplo
    // Buscar una conversación existente del usuario
    const { data: conversations, error: convError } = await supabaseAdmin
      .from('conversations_new')
      .select('id, external_id, contact_name')
      .eq('user_id', testUserId)
      .limit(1);
    
    if (convError || !conversations || conversations.length === 0) {
      console.log('⚠️ No se encontró una conversación existente. Creando una de prueba...');
      
      // Crear una conversación de prueba
      const { data: newConv, error: createConvError } = await supabaseAdmin
        .from('conversations_new')
        .insert({
          user_id: testUserId,
          external_id: `test-${Date.now()}@test.whatsapp.net`,
          contact_name: 'Prueba de Imagen',
          started_at: new Date().toISOString(),
          tenant: 'whatsapp'
        })
        .select('id')
        .single();
      
      if (createConvError) {
        console.error('❌ Error creando conversación de prueba:', createConvError);
        throw createConvError;
      }
      
      console.log(`✅ Conversación de prueba creada: ${newConv.id}`);
      
      // Crear un mensaje de prueba con la imagen
      const { data: newMessage, error: createMsgError } = await supabaseAdmin
        .from('messages_new')
        .insert({
          conversation_id: newConv.id,
          user_id: testUserId,
          sender_type: 'user',
          message_type: 'media',
          text_content: null, // Sin texto, solo imagen
          media_url: uploadResult.publicUrl,
          media_type: 'image',
          media_filename: filename,
          media_size: buffer.length,
          created_at: new Date().toISOString(),
          tenant: 'whatsapp'
        })
        .select('id, media_url, media_type, media_filename')
        .single();
      
      if (createMsgError) {
        console.error('❌ Error creando mensaje de prueba:', createMsgError);
        throw createMsgError;
      }
      
      console.log('✅ Mensaje de prueba creado con la imagen:');
      console.log(`   - Message ID: ${newMessage.id}`);
      console.log(`   - Media URL: ${newMessage.media_url}`);
      console.log(`   - Media Type: ${newMessage.media_type}`);
      console.log(`   - Media Filename: ${newMessage.media_filename}`);
      
      // Verificar que se guardó correctamente
      const { data: verifyMsg, error: verifyError } = await supabaseAdmin
        .from('messages_new')
        .select('id, media_url, media_type, media_filename, media_size')
        .eq('id', newMessage.id)
        .single();
      
      if (verifyError) {
        console.error('❌ Error verificando mensaje:', verifyError);
      } else {
        console.log('\n✅ Verificación exitosa - Mensaje guardado en BD:');
        console.log(`   - ID: ${verifyMsg.id}`);
        console.log(`   - Media URL: ${verifyMsg.media_url}`);
        console.log(`   - Media Type: ${verifyMsg.media_type}`);
        console.log(`   - Media Filename: ${verifyMsg.media_filename}`);
        console.log(`   - Media Size: ${verifyMsg.media_size} bytes`);
      }
      
    } else {
      const conv = conversations[0];
      console.log(`✅ Conversación encontrada: ${conv.contact_name} (ID: ${conv.id})`);
      
      // Crear un mensaje de prueba con la imagen en esta conversación
      const { data: newMessage, error: createMsgError } = await supabaseAdmin
        .from('messages_new')
        .insert({
          conversation_id: conv.id,
          user_id: testUserId,
          sender_type: 'user',
          message_type: 'media',
          text_content: null, // Sin texto, solo imagen
          media_url: uploadResult.publicUrl,
          media_type: 'image',
          media_filename: filename,
          media_size: buffer.length,
          created_at: new Date().toISOString(),
          tenant: 'whatsapp'
        })
        .select('id, media_url, media_type, media_filename')
        .single();
      
      if (createMsgError) {
        console.error('❌ Error creando mensaje de prueba:', createMsgError);
        throw createMsgError;
      }
      
      console.log('✅ Mensaje de prueba creado con la imagen:');
      console.log(`   - Message ID: ${newMessage.id}`);
      console.log(`   - Conversation ID: ${conv.id}`);
      console.log(`   - Media URL: ${newMessage.media_url}`);
      console.log(`   - Media Type: ${newMessage.media_type}`);
      console.log(`   - Media Filename: ${newMessage.media_filename}`);
      
      // Verificar que se guardó correctamente
      const { data: verifyMsg, error: verifyError } = await supabaseAdmin
        .from('messages_new')
        .select('id, media_url, media_type, media_filename, media_size, conversation_id')
        .eq('id', newMessage.id)
        .single();
      
      if (verifyError) {
        console.error('❌ Error verificando mensaje:', verifyError);
      } else {
        console.log('\n✅ Verificación exitosa - Mensaje guardado en BD:');
        console.log(`   - ID: ${verifyMsg.id}`);
        console.log(`   - Conversation ID: ${verifyMsg.conversation_id}`);
        console.log(`   - Media URL: ${verifyMsg.media_url}`);
        console.log(`   - Media Type: ${verifyMsg.media_type}`);
        console.log(`   - Media Filename: ${verifyMsg.media_filename}`);
        console.log(`   - Media Size: ${verifyMsg.media_size} bytes`);
        
        // Verificar que la URL en la BD coincide con la subida
        if (verifyMsg.media_url === uploadResult.publicUrl) {
          console.log('\n✅ ✅ URL coincide perfectamente con la subida al storage!');
        } else {
          console.log('\n⚠️ ⚠️ Las URLs no coinciden:');
          console.log(`   - URL subida: ${uploadResult.publicUrl}`);
          console.log(`   - URL en BD: ${verifyMsg.media_url}`);
        }
      }
    }
    
    console.log('\n🎉 Prueba completada exitosamente!');
    console.log(`\n📎 URL de la imagen: ${uploadResult.publicUrl}`);
    console.log(`\n📝 Resumen del flujo:`);
    console.log(`   1. ✅ Imagen leída del sistema de archivos`);
    console.log(`   2. ✅ Imagen subida a Supabase Storage (bucket: whatsapp)`);
    console.log(`   3. ✅ URL guardada en messages_new.media_url`);
    console.log(`   4. ✅ Verificación de acceso a la URL`);
    console.log(`   5. ✅ Verificación de guardado en base de datos`);
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Ejecutar la prueba
testUploadImage();
