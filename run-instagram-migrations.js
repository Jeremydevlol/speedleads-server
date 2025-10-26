#!/usr/bin/env node

/**
 * Script para aplicar migraciones de Instagram
 * Uso: node run-instagram-migrations.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './dist/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runInstagramMigrations() {
  try {
    console.log('🚀 Iniciando migraciones de Instagram...');
    
    // Leer archivo de migración
    const migrationPath = path.join(__dirname, 'db/migrations/2025-01-21_create_instagram_tables.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ No se encontró el archivo de migración:', migrationPath);
      process.exit(1);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Aplicando migración: 2025-01-21_create_instagram_tables.sql');
    
    // Ejecutar migración
    await pool.query(migrationSQL);
    
    console.log('✅ Migración de Instagram aplicada exitosamente');
    
    // Verificar que las tablas se crearon
    const tables = [
      'instagram_accounts',
      'instagram_messages', 
      'instagram_comments',
      'instagram_bot_sessions'
    ];
    
    for (const table of tables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        );
      `, [table]);
      
      if (result.rows[0].exists) {
        console.log(`✅ Tabla ${table} creada correctamente`);
      } else {
        console.log(`❌ Tabla ${table} NO se creó`);
      }
    }
    
    console.log('🎉 Migraciones de Instagram completadas');
    
  } catch (error) {
    console.error('❌ Error aplicando migraciones:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runInstagramMigrations();
}

export default runInstagramMigrations;

