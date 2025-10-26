#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixCustomDomainsTable() {
  console.log('🔧 Corrigiendo estructura de tabla custom_domains...\n');
  
  try {
    // 1. Verificar columnas actuales
    console.log('1. Verificando estructura actual...');
    
    // Query SQL para obtener columnas de la tabla
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_table_columns', { table_name: 'custom_domains' })
      .catch(async () => {
        // Si la función no existe, usar query directa
        const { data, error } = await supabase
          .from('custom_domains')
          .select('*')
          .limit(0); // Solo queremos la estructura, no datos
        
        if (error) {
          throw error;
        }
        
        return { data: [], error: null };
      });

    console.log('✅ Tabla custom_domains encontrada');
    
    // 2. Ejecutar ALTER TABLE para agregar columnas faltantes
    console.log('2. Agregando columnas faltantes...');
    
    const alterStatements = [
      // Agregar cloudfront_domain si no existe
      `ALTER TABLE public.custom_domains 
       ADD COLUMN IF NOT EXISTS cloudfront_domain TEXT DEFAULT 'domains.uniclick.io'`,
      
      // Agregar verification_record si no existe
      `ALTER TABLE public.custom_domains 
       ADD COLUMN IF NOT EXISTS verification_record JSONB`,
      
      // Agregar error_message si no existe
      `ALTER TABLE public.custom_domains 
       ADD COLUMN IF NOT EXISTS error_message TEXT`,
      
      // Agregar last_verified_at si no existe
      `ALTER TABLE public.custom_domains 
       ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ`,
      
      // Crear función para updated_at si no existe
      `CREATE OR REPLACE FUNCTION update_custom_domains_updated_at()
       RETURNS TRIGGER AS $$
       BEGIN
         NEW.updated_at = NOW();
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql`,
      
      // Crear trigger si no existe
      `DROP TRIGGER IF EXISTS update_custom_domains_updated_at ON public.custom_domains`,
      `CREATE TRIGGER update_custom_domains_updated_at
       BEFORE UPDATE ON public.custom_domains
       FOR EACH ROW EXECUTE FUNCTION update_custom_domains_updated_at()`
    ];

    for (const statement of alterStatements) {
      console.log(`   Ejecutando: ${statement.substring(0, 50)}...`);
      
      const { error } = await supabase.rpc('exec_sql', { sql: statement })
        .catch(async () => {
          // Si la función RPC no existe, intentar con query directa
          throw new Error('No se puede ejecutar SQL directamente. Necesitas aplicar la migración manualmente.');
        });

      if (error) {
        console.log(`   ⚠️ ${error.message}`);
      } else {
        console.log(`   ✅ OK`);
      }
    }

    // 3. Verificar que ahora funciona
    console.log('\n3. Verificando estructura corregida...');
    const { data: testInsert, error: insertError } = await supabase
      .from('custom_domains')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        website_id: '00000000-0000-0000-0000-000000000000', 
        domain: 'test-verification.example.com',
        subdomain: 'test-verification',
        root_domain: 'example.com',
        status: 'pending',
        dns_records: { cname: { type: 'CNAME', name: 'test-verification', value: 'domains.uniclick.io', ttl: 300 } },
        cloudfront_domain: 'domains.uniclick.io'
      })
      .select();
    
    if (insertError) {
      console.log('❌ Aún hay problemas:', insertError.message);
      console.log('\n🔧 SOLUCIÓN MANUAL NECESARIA:');
      console.log('Ve a Supabase Dashboard → SQL Editor y ejecuta:');
      console.log('\n```sql');
      alterStatements.forEach(stmt => console.log(stmt + ';'));
      console.log('```\n');
      return;
    }
    
    console.log('✅ Estructura corregida exitosamente!');
    console.log('✅ Registro de prueba creado:', testInsert[0]?.domain);
    
    // Limpiar registro de prueba
    await supabase
      .from('custom_domains')
      .delete()
      .eq('domain', 'test-verification.example.com');
    
    console.log('✅ Registro de prueba eliminado');
    console.log('\n🎉 ¡Tabla custom_domains lista para usar!');
    
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log('\n🔧 SOLUCIÓN MANUAL:');
    console.log('Ejecuta la migración completa en Supabase Dashboard:');
    console.log('Archivo: db/migrations/2025-01-21_create_custom_domains.sql');
  }
}

fixCustomDomainsTable(); 