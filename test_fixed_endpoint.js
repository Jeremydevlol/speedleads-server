#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/amosmendez/Desktop/Uniclcik.io/api/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('🧪 PROBANDO ENDPOINT CORREGIDO');
console.log('=' .repeat(40));

async function testFixedEndpoint() {
  const personalityId = 859;
  const userId = 'cb4171e9-a200-4147-b8c1-2cc47211375b';
  
  try {
    console.log('\n1. 📋 Obteniendo instrucciones...');
    
    const { data: instructions, error: instructionsError } = await supabase
      .from('personality_instructions')
      .select('id, instruccion, created_at')
      .eq('personality_id', personalityId)
      .eq('users_id', userId)
      .order('created_at', { ascending: true });

    if (instructionsError) {
      console.error('❌ Error:', instructionsError);
      return;
    }

    console.log(`✅ Instrucciones: ${instructions?.length || 0}`);

    const grouped = [];
    
    for (const instruction of instructions || []) {
      console.log(`\n2. 🔍 Procesando instrucción ${instruction.id}...`);
      
      // Usar las columnas que SÍ existen
      const { data: mediaData, error: mediaError } = await supabase
        .from('media')
        .select('id, media_type, filename, mime_type, image_url, extracted_text, created_at')
        .eq('personality_instruction_id', instruction.id)
        .eq('users_id', userId)
        .order('created_at', { ascending: true });

      if (mediaError) {
        console.error(`   ❌ Error obteniendo media:`, mediaError);
        continue;
      }

      console.log(`   📊 Media encontrada: ${mediaData?.length || 0}`);
      
      if (mediaData && mediaData.length > 0) {
        mediaData.forEach((media, index) => {
          console.log(`      ${index + 1}. ${media.filename} (${media.media_type})`);
          console.log(`         URL: ${media.image_url}`);
        });
      }

      // Procesar media como lo hace el endpoint real
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
          size: 0, // No disponible
          extractedText: mediaItem.extracted_text || undefined,
          uploadedAt: mediaItem.created_at,
          isSupabaseStorage: isSupabaseUrl,
          isLocalStorage: isLocalFile,
          previewSupported: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'].includes(mediaItem.mime_type)
        };
      });

      grouped.push({
        id: instruction.id,
        texto: instruction.instruccion,
        created_at: instruction.created_at,
        media: processedMedia,
        mediaCount: processedMedia.length,
        hasPdfs: processedMedia.some(m => m.type === 'pdf'),
        hasImages: processedMedia.some(m => m.type === 'image'),
        hasAudio: processedMedia.some(m => m.type === 'audio'),
        totalSize: 0
      });
    }

    // Estadísticas
    const totalMedia = grouped.reduce((sum, instr) => sum + instr.mediaCount, 0);
    const totalPdfs = grouped.reduce((sum, instr) => sum + (instr.hasPdfs ? instr.media.filter(m => m.type === 'pdf').length : 0), 0);
    
    console.log('\n3. 📊 RESULTADO FINAL:');
    console.log(`   - Total instrucciones: ${grouped.length}`);
    console.log(`   - Total archivos multimedia: ${totalMedia}`);
    console.log(`   - Total PDFs: ${totalPdfs}`);
    
    const instructionsWithMedia = grouped.filter(g => g.mediaCount > 0);
    console.log(`   - Instrucciones con media: ${instructionsWithMedia.length}`);
    
    if (instructionsWithMedia.length > 0) {
      console.log('\n📄 INSTRUCCIONES CON MEDIA:');
      instructionsWithMedia.forEach(instr => {
        console.log(`   📋 Instrucción ${instr.id}:`);
        console.log(`      - Media count: ${instr.mediaCount}`);
        console.log(`      - Has PDFs: ${instr.hasPdfs}`);
        instr.media.forEach(m => {
          console.log(`      - ${m.filename} (${m.type})`);
          console.log(`        URL: ${m.url}`);
          console.log(`        Preview supported: ${m.previewSupported}`);
        });
      });
      
      console.log('\n✅ ¡EL ENDPOINT DEBERÍA FUNCIONAR AHORA!');
    } else {
      console.log('\n❌ Aún no se encuentran instrucciones con media');
    }

  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

testFixedEndpoint();
