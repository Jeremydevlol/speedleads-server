-- Ver columnas de la tabla profilesusers
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profilesusers'
ORDER BY ordinal_position;

-- Ver constraints (clave primaria, unique, etc.) de la tabla profilesusers
SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'profilesusers'
ORDER BY tc.constraint_type, tc.constraint_name;

