-- Script para verificar triggers, constraints y funciones que afectan personalities

-- 1. Ver todos los triggers en la tabla personalities
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'personalities'
ORDER BY trigger_name;

-- 2. Ver constraints de la tabla
SELECT 
    constraint_name,
    constraint_type,
    column_name
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_name = 'personalities'
ORDER BY constraint_type, constraint_name;

-- 3. Ver CHECK constraints específicos
SELECT 
    cc.constraint_name,
    cc.check_clause
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc ON cc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'personalities';

-- 4. Ver funciones que podrían estar relacionadas
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name LIKE '%personality%' 
   OR routine_name LIKE '%user%'
   OR routine_definition LIKE '%personalities%'
ORDER BY routine_name;

-- 5. Ver si hay políticas RLS (aunque dijiste que están deshabilitadas)
SELECT 
    schemaname,
    tablename,
    policyname,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'personalities';

-- 6. Descripción completa de la tabla
\d personalities; 