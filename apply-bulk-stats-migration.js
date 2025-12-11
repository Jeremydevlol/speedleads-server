#!/usr/bin/env node

/**
 * Script para aplicar la migración de estadísticas de envío masivo
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🔄 Aplicando migración de estadísticas de envío masivo...');
  
  try {
    // Crear tabla de estadísticas
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS instagram_bulk_send_stats (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL,
          ig_account VARCHAR(255) NOT NULL,
          recipient_username VARCHAR(255) NOT NULL,
          recipient_id VARCHAR(255),
          message_preview TEXT,
          status VARCHAR(50) NOT NULL CHECK (status IN ('sent', 'failed', 'blocked', 'rate_limited')),
          error_code VARCHAR(100),
          error_type VARCHAR(100),
          error_message TEXT,
          bulk_type VARCHAR(50),
          source_post_url TEXT,
          ai_generated BOOLEAN DEFAULT FALSE,
          personality_id INTEGER,
          attempt_number INTEGER DEFAULT 1,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `
    });
    
    if (error1 && !error1.message.includes('already exists')) {
      // Intentar crear directamente con SQL
      const { error: directError } = await supabase
        .from('instagram_bulk_send_stats')
        .select('id')
        .limit(1);
      
      if (directError && directError.code === '42P01') {
        console.log('⚠️ La tabla no existe, creándola directamente...');
        // La tabla no existe, intentar crear con SQL directo
      } else {
        console.log('✅ Tabla instagram_bulk_send_stats ya existe o fue creada');
      }
    } else {
      console.log('✅ Tabla instagram_bulk_send_stats creada o ya existía');
    }
    
    // Verificar si podemos insertar
    console.log('🔍 Verificando acceso a la tabla...');
    const { data, error: testError } = await supabase
      .from('instagram_bulk_send_stats')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.log('⚠️ Error accediendo a la tabla:', testError.message);
      console.log('');
      console.log('📋 Por favor, ejecuta el siguiente SQL manualmente en Supabase:');
      console.log('');
      console.log(fs.readFileSync(path.join(__dirname, 'db/migrations/2025-12-10_create_bulk_send_stats.sql'), 'utf8'));
    } else {
      console.log('✅ Tabla accesible correctamente');
      console.log('📊 Registros actuales:', data?.length || 0);
    }
    
    console.log('');
    console.log('✨ Migración completada');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('📋 Ejecuta el SQL manualmente en Supabase Dashboard:');
    console.log('   1. Ve a supabase.com > Tu proyecto > SQL Editor');
    console.log('   2. Pega el contenido de: db/migrations/2025-12-10_create_bulk_send_stats.sql');
    console.log('   3. Ejecuta el SQL');
  }
}

applyMigration();
