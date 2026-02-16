#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: '/Users/amosmendez/Desktop/Uniclcik.io/api/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Faltan variables de entorno de Supabase');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 DIAGNÓSTICO DE LA TABLA MEDIA');
console.log('=' .repeat(50));

async function checkMediaTable() {
  try {
    console.log('\n1. 📊 Verificando estructura de la tabla media...');
    
    // Intentar obtener algunos registros para ver la estructura
    const { data: mediaRecords, error: mediaError } = await supabase
      .from('media')
      .select('*')
      .limit(5);

    if (mediaError) {
      console.error('❌ Error accediendo a la tabla media:', mediaError);
      
      // Verificar si la tabla existe
      const { data: tables, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .like('table_name', '%media%');
      
      if (!tablesError && tables) {
        console.log('📋 Tablas relacionadas con media encontradas:', tables.map(t => t.table_name));
      }
      
      return;
    }

    console.log(`✅ Tabla media accesible. Registros encontrados: ${mediaRecords?.length || 0}`);
    
    if (mediaRecords && mediaRecords.length > 0) {
      console.log('\n📋 Estructura de la tabla (basada en primer registro):');
      const firstRecord = mediaRecords[0];
      Object.keys(firstRecord).forEach(key => {
        const value = firstRecord[key];
        const type = value === null ? 'null' : typeof value;
        console.log(`   - ${key}: ${type} = ${value}`);
      });
      
      console.log('\n📄 Registros de media encontrados:');
      mediaRecords.forEach((record, index) => {
        console.log(`   ${index + 1}. ID: ${record.id}`);
        console.log(`      - Tipo: ${record.media_type}`);
        console.log(`      - Archivo: ${record.filename}`);
        console.log(`      - URL: ${record.image_url}`);
        console.log(`      - Usuario: ${record.users_id}`);
        console.log(`      - Instrucción: ${record.personality_instruction_id}`);
        console.log(`      - Mensaje: ${record.message_id}`);
      });
    } else {
      console.log('📭 No hay registros en la tabla media');
    }

  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

async function checkPersonalityInstructions() {
  try {
    console.log('\n2. 📝 Verificando instrucciones de personalidad...');
    
    const { data: instructions, error: instructionsError } = await supabase
      .from('personality_instructions')
      .select('id, personality_id, users_id, instruccion, created_at')
      .limit(5)
      .order('created_at', { ascending: false });

    if (instructionsError) {
      console.error('❌ Error accediendo a personality_instructions:', instructionsError);
      return;
    }

    console.log(`✅ Instrucciones encontradas: ${instructions?.length || 0}`);
    
    if (instructions && instructions.length > 0) {
      console.log('\n📋 Instrucciones recientes:');
      instructions.forEach((instr, index) => {
        console.log(`   ${index + 1}. ID: ${instr.id}`);
        console.log(`      - Personalidad: ${instr.personality_id}`);
        console.log(`      - Usuario: ${instr.users_id}`);
        console.log(`      - Texto: ${instr.instruccion?.substring(0, 50)}...`);
        console.log(`      - Creado: ${instr.created_at}`);
      });
    }

  } catch (error) {
    console.error('❌ Error verificando instrucciones:', error);
  }
}

async function checkMediaForInstructions() {
  try {
    console.log('\n3. 🔗 Verificando relación media-instrucciones...');
    
    // Obtener instrucciones recientes
    const { data: instructions, error: instructionsError } = await supabase
      .from('personality_instructions')
      .select('id')
      .limit(10)
      .order('created_at', { ascending: false });

    if (instructionsError || !instructions || instructions.length === 0) {
      console.log('❌ No se pudieron obtener instrucciones para verificar');
      return;
    }

    const instructionIds = instructions.map(i => i.id);
    console.log(`📋 Verificando media para instrucciones: ${instructionIds.join(', ')}`);

    const { data: relatedMedia, error: mediaError } = await supabase
      .from('media')
      .select('*')
      .in('personality_instruction_id', instructionIds);

    if (mediaError) {
      console.error('❌ Error buscando media relacionada:', mediaError);
      return;
    }

    console.log(`📊 Media encontrada para estas instrucciones: ${relatedMedia?.length || 0}`);
    
    if (relatedMedia && relatedMedia.length > 0) {
      relatedMedia.forEach((media, index) => {
        console.log(`   ${index + 1}. Media ID: ${media.id}`);
        console.log(`      - Para instrucción: ${media.personality_instruction_id}`);
        console.log(`      - Tipo: ${media.media_type}`);
        console.log(`      - Archivo: ${media.filename}`);
      });
    } else {
      console.log('📭 No hay media asociada a las instrucciones recientes');
    }

  } catch (error) {
    console.error('❌ Error verificando relación media-instrucciones:', error);
  }
}

async function runDiagnostic() {
  await checkMediaTable();
  await checkPersonalityInstructions();
  await checkMediaForInstructions();
  
  console.log('\n' + '=' .repeat(50));
  console.log('🎯 RESUMEN DEL DIAGNÓSTICO');
  console.log('=' .repeat(50));
  console.log('');
  console.log('Si la tabla media está vacía o no tiene registros asociados');
  console.log('a personality_instruction_id, significa que:');
  console.log('');
  console.log('1. El endpoint de subida NO está funcionando correctamente');
  console.log('2. Los archivos NO se están procesando');
  console.log('3. Por eso get_personalities_instructions devuelve media: []');
  console.log('');
  console.log('Próximo paso: Probar el endpoint de subida de instrucciones');
  console.log('con un PDF para ver si se procesan correctamente.');
}

runDiagnostic();
