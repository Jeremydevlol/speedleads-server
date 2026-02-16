#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDatabase() {
  console.log('🔍 Verificando configuración de base de datos...\n');
  
  try {
    // 1. Verificar conexión a Supabase
    console.log('1. Conectando a Supabase...');
    const { data: connection, error: connectionError } = await supabase
      .from('websites')
      .select('count')
      .limit(1);
    
    if (connectionError) {
      console.log('❌ Error de conexión:', connectionError.message);
      return;
    }
    console.log('✅ Conexión a Supabase: OK\n');
    
    // 2. Verificar tabla custom_domains
    console.log('2. Verificando tabla custom_domains...');
    const { data: customDomains, error: tableError } = await supabase
      .from('custom_domains')
      .select('*')
      .limit(1);
    
    if (tableError) {
      console.log('❌ Error accediendo a custom_domains:', tableError.message);
      console.log('🔧 Necesitas ejecutar la migración: db/migrations/2025-01-21_create_custom_domains.sql');
      return;
    }
    console.log('✅ Tabla custom_domains: OK\n');
    
    // 3. Verificar estructura de la tabla
    console.log('3. Verificando estructura...');
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
      console.log('❌ Error insertando registro de prueba:', insertError.message);
      console.log('🔧 Problema con la estructura de la tabla');
      return;
    }
    
    console.log('✅ Estructura de tabla: OK');
    console.log('✅ Registro de prueba creado:', testInsert[0]?.domain);
    
    // 4. Limpiar registro de prueba
    await supabase
      .from('custom_domains')
      .delete()
      .eq('domain', 'test-verification.example.com');
    
    console.log('✅ Registro de prueba eliminado\n');
    
    // 5. Verificar relación con websites
    console.log('4. Verificando relación con websites...');
    const { data: websites, error: websiteError } = await supabase
      .from('websites')
      .select('id, business_name, slug, is_published')
      .limit(3);
    
    if (websiteError) {
      console.log('⚠️ Error accediendo a websites:', websiteError.message);
    } else {
      console.log('✅ Tabla websites: OK');
      console.log(`📊 Websites encontrados: ${websites?.length || 0}`);
      if (websites?.length > 0) {
        console.log('🌐 Primer website:', websites[0].business_name, `(${websites[0].slug})`);
      }
    }
    
    console.log('\n🎉 ¡Base de datos lista para dominios personalizados!');
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

checkDatabase(); 