-- =============================================================================
-- 🧹 SCRIPT PARA VACIAR COMPLETAMENTE LA BASE DE DATOS DE UNICLICK
-- =============================================================================
-- ⚠️ ADVERTENCIA: Este script eliminará TODOS los datos de la base de datos.
--    Las tablas se mantendrán intactas pero quedarán vacías.
--    ¡ASEGÚRATE DE TENER UN BACKUP ANTES DE EJECUTAR!
-- =============================================================================
-- Fecha: 2026-02-05
-- Propósito: Limpiar BD para empezar desde cero o crear duplicado sin datos
-- =============================================================================

-- Desactivar temporalmente las restricciones de foreign keys para poder borrar en cualquier orden
SET session_replication_role = 'replica';

-- =============================================================================
-- 1. MENSAJES Y CONVERSACIONES (WhatsApp)
-- =============================================================================
TRUNCATE TABLE public.messages_new CASCADE;
TRUNCATE TABLE public.conversations_new CASCADE;

-- =============================================================================
-- 2. GOOGLE CALENDAR
-- =============================================================================
TRUNCATE TABLE public.google_events CASCADE;
TRUNCATE TABLE public.google_watch_channels CASCADE;
TRUNCATE TABLE public.google_accounts CASCADE;

-- =============================================================================
-- 3. CITAS Y DISPONIBILIDAD
-- =============================================================================
TRUNCATE TABLE public.citas_agendadas CASCADE;
TRUNCATE TABLE public.disponibility CASCADE;

-- =============================================================================
-- 4. LEADS (EMBUDO DE VENTAS)
-- =============================================================================
TRUNCATE TABLE public.leads_contacts CASCADE;
TRUNCATE TABLE public.leads CASCADE;

-- =============================================================================
-- 5. WEBSITES Y DOMINIOS
-- =============================================================================
TRUNCATE TABLE public.custom_domains CASCADE;
TRUNCATE TABLE public.websites CASCADE;

-- =============================================================================
-- 6. MEDIA Y ARCHIVOS
-- =============================================================================
TRUNCATE TABLE public.media CASCADE;

-- =============================================================================
-- 7. PERSONALIDADES DE IA
-- =============================================================================
TRUNCATE TABLE public.personalities CASCADE;

-- =============================================================================
-- 8. PERFILES DE USUARIOS (datos adicionales, no auth)
-- =============================================================================
TRUNCATE TABLE public.profilesusers CASCADE;

-- =============================================================================
-- 9. PLANES Y SUSCRIPCIONES (OPCIONAL - descomenta si quieres)
-- =============================================================================
-- TRUNCATE TABLE public.user_plans CASCADE;
-- TRUNCATE TABLE public.subscriptions CASCADE;

-- =============================================================================
-- 10. USUARIOS (auth.users - ⚠️ CUIDADO - esto borra todas las cuentas)
-- =============================================================================
-- Para borrar usuarios de Supabase Auth, necesitas hacer esto desde el Dashboard
-- o usar la Admin API. No se puede hacer con TRUNCATE directamente.
-- Si quieres borrar usuarios, descomenta la siguiente línea:

-- DELETE FROM auth.users;

-- Reactivar las restricciones de foreign keys
SET session_replication_role = 'origin';

-- =============================================================================
-- ✅ VERIFICACIÓN - Ejecuta esto para confirmar que las tablas están vacías
-- =============================================================================
SELECT 'messages_new' as tabla, COUNT(*) as registros FROM public.messages_new
UNION ALL
SELECT 'conversations_new', COUNT(*) FROM public.conversations_new
UNION ALL
SELECT 'google_events', COUNT(*) FROM public.google_events
UNION ALL
SELECT 'google_accounts', COUNT(*) FROM public.google_accounts
UNION ALL
SELECT 'leads_contacts', COUNT(*) FROM public.leads_contacts
UNION ALL
SELECT 'leads', COUNT(*) FROM public.leads
UNION ALL
SELECT 'citas_agendadas', COUNT(*) FROM public.citas_agendadas
UNION ALL
SELECT 'media', COUNT(*) FROM public.media
ORDER BY tabla;

-- =============================================================================
-- 📋 NOTAS IMPORTANTES:
-- =============================================================================
-- 1. Este script usa TRUNCATE que es más rápido que DELETE
-- 2. CASCADE elimina datos dependientes automáticamente
-- 3. Los usuarios de auth.users se deben borrar desde el Dashboard de Supabase
--    o usando: DELETE FROM auth.users WHERE id NOT IN ('tu-admin-id');
-- 4. Si alguna tabla no existe, el script dará error pero puedes ignorarlo
--    o comentar esa línea
-- =============================================================================
