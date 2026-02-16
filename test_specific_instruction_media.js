#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: '/Users/amosmendez/Desktop/Uniclcik.io/api/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 PRUEBA ESPECÍFICA DE MEDIA PARA INSTRUCCIÓN 2892');
console.log('=' .repeat(60));

async function testSpecificInstruction() {
  const instructionId = 2892;
  const userId = 'cb4171e9-a200-4147-b8c1-2cc47211375b';
  
  try {
    console.log(`\n1. 📋 Obteniendo instrucción ${instructionId}...`);
    
    const { data: instruction, error: instrError } = await supabase
      .from('personality_instructions')
      .select('*')
      .eq('id', instructionId)
      .single();

    if (instrError) {
      console.error('❌ Error obteniendo instrucción:', instrError);
      return;
    }

    console.log('✅ Instrucción encontrada:');
    console.log(`   - ID: ${instruction.id}`);
    console.log(`   - Personalidad: ${instruction.personality_id}`);
    console.log(`   - Usuario: ${instruction.users_id}`);
    console.log(`   - Texto: ${instruction.instruccion?.substring(0, 100)}...`);

    console.log(`\n2. 🔍 Buscando media para instrucción ${instructionId}...`);
    
    // Buscar media exactamente como lo hace el endpoint
    const { data: mediaData, error: mediaError } = await supabase
      .from('media')
      .select('id, media_type, filename, mime_type, image_url, extracted_text, file_size, created_at')
      .eq('personality_instruction_id', instructionId)
      .eq('users_id', userId)
      .order('created_at', { ascending: true });

    if (mediaError) {
      console.error('❌ Error obteniendo media:', mediaError);
      return;
    }

    console.log(`✅ Media encontrada: ${mediaData?.length || 0} registros`);
    
    if (mediaData && mediaData.length > 0) {
      mediaData.forEach((media, index) => {
        console.log(`\n   📄 Media ${index + 1}:`);
        console.log(`      - ID: ${media.id}`);
        console.log(`      - Tipo: ${media.media_type}`);
        console.log(`      - Archivo: ${media.filename}`);
        console.log(`      - MIME: ${media.mime_type}`);
        console.log(`      - URL: ${media.image_url}`);
        console.log(`      - Tamaño: ${media.file_size} bytes`);
        console.log(`      - Texto extraído: ${media.extracted_text?.substring(0, 100)}...`);
      });
    } else {
      console.log('📭 No se encontró media para esta instrucción');
      
      // Buscar sin filtro de usuario para debug
      console.log('\n🔍 Buscando media sin filtro de usuario...');
      const { data: allMedia, error: allMediaError } = await supabase
        .from('media')
        .select('*')
        .eq('personality_instruction_id', instructionId);

      if (!allMediaError && allMedia) {
        console.log(`📊 Media sin filtro de usuario: ${allMedia.length} registros`);
        allMedia.forEach((media, index) => {
          console.log(`   ${index + 1}. ID: ${media.id}, Usuario: ${media.users_id}, Archivo: ${media.filename}`);
        });
      }
    }

    console.log(`\n3. 🧪 Simulando el procesamiento del endpoint...`);
    
    // Simular exactamente lo que hace getPersonalityInstructions
    const processedMedia = (mediaData || []).map(mediaItem => {
      const isSupabaseUrl = mediaItem.image_url && mediaItem.image_url.includes('supabase.co/storage');
      const isLocalFile = mediaItem.image_url && mediaItem.image_url.startsWith('/uploads/');
      
      let fullUrl = mediaItem.image_url;
      if (isLocalFile) {
        const baseUrl = 'http://localhost:5001';
        fullUrl = `${baseUrl}${mediaItem.image_url}`;
      }
      
      return {
        id: mediaItem.id,
        type: mediaItem.media_type === 'pdf' ? 'pdf' : 
              mediaItem.media_type === 'image' ? 'image' : 
              mediaItem.media_type === 'audio' ? 'audio' : mediaItem.media_type,
        data: fullUrl,
        url: fullUrl,
        filename: mediaItem.filename || 'archivo_sin_nombre',
        mimeType: mediaItem.mime_type || 'application/octet-stream',
        size: mediaItem.file_size || 0,
        extractedText: mediaItem.extracted_text || undefined,
        uploadedAt: mediaItem.created_at,
        isSupabaseStorage: isSupabaseUrl,
        isLocalStorage: isLocalFile,
        previewSupported: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'].includes(mediaItem.mime_type)
      };
    });

    console.log('📋 Media procesada para el frontend:');
    console.log(JSON.stringify(processedMedia, null, 2));

  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

async function testGetInstructionsEndpoint() {
  console.log(`\n4. 🌐 Probando endpoint completo para personalidad 859...`);
  
  const personalityId = 859;
  const userId = 'cb4171e9-a200-4147-b8c1-2cc47211375b';
  
  try {
    // Simular exactamente lo que hace el endpoint
    const { data: instructions, error: instructionsError } = await supabase
      .from('personality_instructions')
      .select('id, instruccion, created_at')
      .eq('personality_id', personalityId)
      .eq('users_id', userId)
      .order('created_at', { ascending: true });

    if (instructionsError) {
      console.error('❌ Error obteniendo instrucciones:', instructionsError);
      return;
    }

    console.log(`✅ Instrucciones encontradas: ${instructions?.length || 0}`);

    const grouped = [];
    
    for (const instruction of instructions || []) {
      console.log(`\n   🔍 Procesando instrucción ${instruction.id}...`);
      
      const { data: mediaData, error: mediaError } = await supabase
        .from('media')
        .select('id, media_type, filename, mime_type, image_url, extracted_text, file_size, created_at')
        .eq('personality_instruction_id', instruction.id)
        .eq('users_id', userId)
        .order('created_at', { ascending: true });

      if (mediaError) {
        console.error(`   ❌ Error obteniendo media para ${instruction.id}:`, mediaError);
      } else {
        console.log(`   📊 Media encontrada: ${mediaData?.length || 0}`);
      }

      const processedMedia = (mediaData || []).map(mediaItem => ({
        id: mediaItem.id,
        type: mediaItem.media_type,
        filename: mediaItem.filename,
        url: mediaItem.image_url
      }));

      grouped.push({
        id: instruction.id,
        texto: instruction.instruccion,
        created_at: instruction.created_at,
        media: processedMedia,
        mediaCount: processedMedia.length
      });
    }

    console.log('\n📋 Resultado final del endpoint simulado:');
    console.log(`Total instrucciones: ${grouped.length}`);
    
    const instructionsWithMedia = grouped.filter(g => g.mediaCount > 0);
    console.log(`Instrucciones con media: ${instructionsWithMedia.length}`);
    
    if (instructionsWithMedia.length > 0) {
      console.log('\n📄 Instrucciones que SÍ tienen media:');
      instructionsWithMedia.forEach(instr => {
        console.log(`   - ID ${instr.id}: ${instr.mediaCount} archivos`);
        instr.media.forEach(m => {
          console.log(`     * ${m.filename} (${m.type})`);
        });
      });
    }

  } catch (error) {
    console.error('❌ Error en simulación del endpoint:', error);
  }
}

async function runTest() {
  await testSpecificInstruction();
  await testGetInstructionsEndpoint();
  
  console.log('\n' + '=' .repeat(60));
  console.log('🎯 CONCLUSIONES');
  console.log('=' .repeat(60));
  console.log('');
  console.log('Si el endpoint devuelve media: [] pero aquí encontramos media,');
  console.log('significa que hay un problema en:');
  console.log('');
  console.log('1. El código del endpoint no se está ejecutando');
  console.log('2. El servidor no se reinició con los cambios');
  console.log('3. Hay un error en la lógica del endpoint');
  console.log('4. El filtro de users_id no coincide');
  console.log('');
  console.log('Próximo paso: Verificar que el servidor esté usando');
  console.log('la versión actualizada del código.');
}

runTest();
