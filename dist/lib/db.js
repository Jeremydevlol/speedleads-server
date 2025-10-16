// lib/db.ts
// Re-export de la configuración de base de datos para uso en Next.js App Router
// Importar desde la configuración existente
import pool, { supabaseAdmin } from '../dist/config/db.js';
// Re-exportar para uso en rutas de Next.js
export default pool;
export { supabaseAdmin };
