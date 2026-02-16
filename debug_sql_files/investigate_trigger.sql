-- INVESTIGACIÓN COMPLETA DEL PROBLEMA bigint = uuid

-- 1. Ver TODOS los triggers en personalities
SELECT 
    t.trigger_name,
    t.event_manipulation,
    t.action_timing,
    t.action_orientation,
    t.action_statement
FROM information_schema.triggers t
WHERE t.event_object_table = 'personalities'
ORDER BY t.trigger_name;

-- 2. Ver triggers a nivel de esquema que podrían afectar
SELECT 
    trigger_name,
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE action_statement LIKE '%personalities%'
   OR action_statement LIKE '%users_id%'
   OR action_statement LIKE '%bigint%'
   OR action_statement LIKE '%uuid%';

-- 3. Ver CHECK constraints
SELECT 
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'personalities';

-- 4. Ver foreign keys que podrían tener problemas de tipo
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'personalities';

-- 5. Ver la estructura exacta de las columnas
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'personalities'
ORDER BY ordinal_position;

-- 6. Buscar funciones que mencionen personalities
SELECT 
    routine_name,
    routine_type,
    external_language,
    routine_definition
FROM information_schema.routines 
WHERE routine_definition ILIKE '%personalities%'
   OR routine_definition ILIKE '%users_id%'
ORDER BY routine_name;

-- 7. Ver si hay índices compuestos problemáticos
SELECT 
    i.relname AS index_name,
    t.relname AS table_name,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'personalities'
  AND (a.attname = 'users_id' OR a.attname = 'users_id_new')
ORDER BY i.relname, a.attname; 