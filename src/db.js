// src/db.js - Conexión directa a PostgreSQL para producción
import pkg from 'pg';
const { Pool } = pkg;

export const pg = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

console.log('🔗 Pool de PostgreSQL configurado para producción');
console.log('   - Max conexiones: 10');
console.log('   - Idle timeout: 10s');
console.log('   - Connection timeout: 5s');
