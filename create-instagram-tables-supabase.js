#!/usr/bin/env node

/**
 * Script para crear tablas de Instagram usando la API de Supabase
 * Uso: node create-instagram-tables-supabase.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variables de entorno de Supabase faltantes');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createInstagramTables() {
  try {
    console.log('🚀 Creando tablas de Instagram usando API de Supabase...\n');
    
    // 1. Crear tabla instagram_accounts
    console.log('📝 Creando tabla instagram_accounts...');
    const { error: accountsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS instagram_accounts (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          ig_username VARCHAR(255) NOT NULL,
          ig_user_id VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id)
        );
      `
    });
    
    if (accountsError) {
      console.log('⚠️ Error creando instagram_accounts:', accountsError.message);
    } else {
      console.log('✅ Tabla instagram_accounts creada');
    }
    
    // 2. Crear tabla instagram_messages
    console.log('📝 Creando tabla instagram_messages...');
    const { error: messagesError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS instagram_messages (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          thread_id VARCHAR(255),
          recipient_username VARCHAR(255),
          text_content TEXT,
          sender_type VARCHAR(50) NOT NULL CHECK (sender_type IN ('user', 'ia', 'you')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `
    });
    
    if (messagesError) {
      console.log('⚠️ Error creando instagram_messages:', messagesError.message);
    } else {
      console.log('✅ Tabla instagram_messages creada');
    }
    
    // 3. Crear tabla instagram_comments
    console.log('📝 Creando tabla instagram_comments...');
    const { error: commentsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS instagram_comments (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          post_id VARCHAR(255) NOT NULL,
          comment_id VARCHAR(255) NOT NULL,
          author_name VARCHAR(255),
          username VARCHAR(255),
          author_avatar TEXT,
          comment_text TEXT,
          post_caption TEXT,
          post_image TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id, comment_id)
        );
      `
    });
    
    if (commentsError) {
      console.log('⚠️ Error creando instagram_comments:', commentsError.message);
    } else {
      console.log('✅ Tabla instagram_comments creada');
    }
    
    // 4. Crear tabla instagram_bot_sessions
    console.log('📝 Creando tabla instagram_bot_sessions...');
    const { error: sessionsError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS instagram_bot_sessions (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          is_active BOOLEAN DEFAULT FALSE,
          personality_id INTEGER,
          processed_messages INTEGER DEFAULT 0,
          last_response_time TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(user_id)
        );
      `
    });
    
    if (sessionsError) {
      console.log('⚠️ Error creando instagram_bot_sessions:', sessionsError.message);
    } else {
      console.log('✅ Tabla instagram_bot_sessions creada');
    }
    
    // 5. Crear índices
    console.log('📝 Creando índices...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_instagram_messages_user_id ON instagram_messages(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_instagram_messages_thread_id ON instagram_messages(thread_id);',
      'CREATE INDEX IF NOT EXISTS idx_instagram_messages_created_at ON instagram_messages(created_at);',
      'CREATE INDEX IF NOT EXISTS idx_instagram_comments_user_id ON instagram_comments(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_instagram_comments_post_id ON instagram_comments(post_id);',
      'CREATE INDEX IF NOT EXISTS idx_instagram_comments_created_at ON instagram_comments(created_at);',
      'CREATE INDEX IF NOT EXISTS idx_instagram_bot_sessions_user_id ON instagram_bot_sessions(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_instagram_bot_sessions_is_active ON instagram_bot_sessions(is_active);'
    ];
    
    for (const indexSql of indexes) {
      const { error: indexError } = await supabase.rpc('exec_sql', { sql: indexSql });
      if (indexError) {
        console.log('⚠️ Error creando índice:', indexError.message);
      }
    }
    
    console.log('✅ Índices creados');
    
    // 6. Verificar que las tablas existen
    console.log('\n🔍 Verificando tablas creadas...');
    const tables = ['instagram_accounts', 'instagram_messages', 'instagram_comments', 'instagram_bot_sessions'];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_name', table)
        .limit(1);
      
      if (error) {
        console.log(`❌ Error verificando ${table}:`, error.message);
      } else if (data && data.length > 0) {
        console.log(`✅ Tabla ${table} existe`);
      } else {
        console.log(`❌ Tabla ${table} NO existe`);
      }
    }
    
    console.log('\n🎉 ¡Tablas de Instagram creadas exitosamente!');
    
  } catch (error) {
    console.error('❌ Error creando tablas:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  createInstagramTables();
}

export default createInstagramTables;

