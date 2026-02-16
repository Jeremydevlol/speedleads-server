#!/usr/bin/env node

/**
 * Script para aplicar la migración de leads a la base de datos
 */

import fs from 'fs';
import pool from './dist/config/db.js';

async function applyMigration() {
  console.log('🚀 Aplicando migración de leads...\n');
  
  try {
    // Leer el archivo de migración
    const migrationSQL = fs.readFileSync('./db/migrations/2025-01-22_fix_leads_schema.sql', 'utf8');
    
    // Ejecutar la migración
    await pool.query(migrationSQL);
    
    console.log('✅ Migración aplicada exitosamente!');
    console.log('\n📋 Cambios realizados:');
    console.log('   ✅ Tablas leads y leads_contacts creadas/corregidas');
    console.log('   ✅ Columnas renombradas: tittle → title, columnId → column_id, conversationId → conversation_id');
    console.log('   ✅ Índices de performance creados');
    console.log('   ✅ RLS (Row Level Security) habilitado');
    console.log('   ✅ Políticas de seguridad configuradas');
    console.log('   ✅ Columna por defecto creada para usuarios existentes');
    
    // Verificar que las tablas existen
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('leads', 'leads_contacts')
    `);
    
    console.log('\n🔍 Verificación:');
    tablesCheck.rows.forEach(row => {
      console.log(`   ✅ Tabla ${row.table_name} existe`);
    });
    
    // Verificar estructura de leads
    const leadsStructure = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'leads' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📊 Estructura de tabla leads:');
    leadsStructure.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });
    
    // Verificar estructura de leads_contacts
    const contactsStructure = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'leads_contacts' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📊 Estructura de tabla leads_contacts:');
    contactsStructure.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('\n🎉 ¡Sistema de leads listo para usar!');
    console.log('\n📝 Próximos pasos:');
    console.log('   1. Reinicia tu servidor backend');
    console.log('   2. Prueba los endpoints de importación');
    console.log('   3. Usa el script test-leads-import-system.js para verificar');
    
  } catch (error) {
    console.error('❌ Error aplicando migración:', error.message);
    console.error('\n🔧 Posibles soluciones:');
    console.error('   1. Verifica que DATABASE_URL esté configurado correctamente');
    console.error('   2. Asegúrate de tener permisos de administrador en la BD');
    console.error('   3. Si las tablas ya existen, la migración debería ser segura');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
