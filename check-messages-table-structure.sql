-- =========================================================
-- SQL para verificar la estructura de la tabla messages_new
-- =========================================================

-- 1. Ver todas las columnas de la tabla messages_new
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'messages_new'
ORDER BY ordinal_position;

-- 2. Ver las restricciones (constraints) de la tabla
SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'messages_new';

-- 3. Ver índices de la tabla
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'messages_new';

-- 4. Ver un ejemplo de datos (últimos 5 mensajes)
SELECT *
FROM messages_new
ORDER BY created_at DESC
LIMIT 5;

-- 5. Verificar columnas específicas que se usan en el código
SELECT 
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages_new' AND column_name = 'whatsapp_created_at'
    ) THEN '✅ whatsapp_created_at existe' 
    ELSE '❌ whatsapp_created_at NO existe' END as whatsapp_created_at_check,
    
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages_new' AND column_name = 'last_msg_id'
    ) THEN '✅ last_msg_id existe' 
    ELSE '❌ last_msg_id NO existe' END as last_msg_id_check,
    
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages_new' AND column_name = 'sender_type'
    ) THEN '✅ sender_type existe' 
    ELSE '❌ sender_type NO existe' END as sender_type_check,
    
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages_new' AND column_name = 'message_type'
    ) THEN '✅ message_type existe' 
    ELSE '❌ message_type NO existe' END as message_type_check,
    
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages_new' AND column_name = 'text_content'
    ) THEN '✅ text_content existe' 
    ELSE '❌ text_content NO existe' END as text_content_check,
    
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages_new' AND column_name = 'conversation_id'
    ) THEN '✅ conversation_id existe' 
    ELSE '❌ conversation_id NO existe' END as conversation_id_check,
    
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages_new' AND column_name = 'user_id'
    ) THEN '✅ user_id existe' 
    ELSE '❌ user_id NO existe' END as user_id_check;

-- =========================================================
-- 6. SQL para CREAR columnas faltantes (si no existen)
-- =========================================================

-- Agregar columna whatsapp_created_at si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages_new' AND column_name = 'whatsapp_created_at'
    ) THEN
        ALTER TABLE messages_new 
        ADD COLUMN whatsapp_created_at TIMESTAMPTZ;
        RAISE NOTICE '✅ Columna whatsapp_created_at agregada';
    ELSE
        RAISE NOTICE '✅ Columna whatsapp_created_at ya existe';
    END IF;
END $$;

-- Agregar columna last_msg_id si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages_new' AND column_name = 'last_msg_id'
    ) THEN
        ALTER TABLE messages_new 
        ADD COLUMN last_msg_id TEXT;
        RAISE NOTICE '✅ Columna last_msg_id agregada';
    ELSE
        RAISE NOTICE '✅ Columna last_msg_id ya existe';
    END IF;
END $$;

-- Crear índice único en (conversation_id, last_msg_id) para evitar duplicados
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'messages_new_conversation_last_msg_unique'
    ) THEN
        CREATE UNIQUE INDEX messages_new_conversation_last_msg_unique 
        ON messages_new (conversation_id, last_msg_id) 
        WHERE last_msg_id IS NOT NULL;
        RAISE NOTICE '✅ Índice único creado en (conversation_id, last_msg_id)';
    ELSE
        RAISE NOTICE '✅ Índice único ya existe';
    END IF;
END $$;

-- =========================================================
-- 7. Ver estructura final después de agregar columnas
-- =========================================================
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'messages_new'
ORDER BY ordinal_position;

