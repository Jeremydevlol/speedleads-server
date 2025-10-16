// config/db.js - Configuración específica para Next.js
import { Pool } from 'pg'

// Pool global para evitar múltiples conexiones en Next.js
const pool = global.pgPool || new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

if (!global.pgPool) {
  global.pgPool = pool
}

// Manejo de errores del pool
pool.on('error', (err, client) => {
  console.error('Error en el pool de PostgreSQL:', err)
})

export default pool

// También exportar supabase admin si es necesario
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { 
    auth: { 
      autoRefreshToken: false, 
      persistSession: false 
    } 
  }
)
