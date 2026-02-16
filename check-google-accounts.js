
import pool from './dist/config/db.js';

async function checkTable(tableName) {
  console.log(`\n🔍 Verificando estructura de la tabla ${tableName}...`);
  try {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = '${tableName}'
      ORDER BY ordinal_position;
    `);
    
    if (res.rows.length === 0) {
      console.log(`❌ La tabla ${tableName} no existe.`);
      return;
    }

    console.log(`✅ Estructura de ${tableName}:`);
    res.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'})`);
    });

    // Check constraints
    console.log(`\n🔍 Verificando constraints de ${tableName}...`);
    const constraints = await pool.query(`
        SELECT conname, contype, pg_get_constraintdef(oid)
        FROM pg_constraint
        WHERE conrelid = '${tableName}'::regclass;
    `);
    constraints.rows.forEach(row => {
        console.log(`   - ${row.conname} (${row.contype}): ${row.pg_get_constraintdef}`);
    });

  } catch (err) {
    console.error(`❌ Error al verificar la tabla ${tableName}:`, err.message);
  }
}

async function main() {
  await checkTable('google_accounts');
  await checkTable('profilesusers');
  process.exit(0);
}

main();
