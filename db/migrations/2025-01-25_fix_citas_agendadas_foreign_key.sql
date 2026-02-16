-- ========================================
-- MIGRACIÓN: CORREGIR FOREIGN KEY EN CITAS_AGENDADAS
-- ========================================
-- Esta migración corrige la foreign key constraint que referencia
-- incorrectamente a la tabla "disponibilidades" cuando debería ser "disponibility"

-- Paso 1: Eliminar todas las foreign keys relacionadas con disponibilidad
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Buscar todas las constraints de foreign key en citas_agendadas que involucren disponibilidad
    FOR r IN 
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'citas_agendadas'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%disponibilidad%'
    LOOP
        EXECUTE 'ALTER TABLE public.citas_agendadas DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name) || ' CASCADE';
        RAISE NOTICE 'Eliminada constraint: %', r.constraint_name;
    END LOOP;
    
    -- También eliminar fk_disponibility si existe
    ALTER TABLE public.citas_agendadas DROP CONSTRAINT IF EXISTS fk_disponibility CASCADE;
END $$;

-- Paso 2: Verificar que la tabla disponibility existe y tiene la columna id
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'disponibility') THEN
        RAISE EXCEPTION 'La tabla disponibility no existe. Ejecuta primero la migración 2025-01-24_create_disponibilidades_table.sql';
    END IF;
    
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'disponibility' 
        AND column_name = 'id'
    ) THEN
        RAISE EXCEPTION 'La tabla disponibility no tiene la columna id';
    END IF;
    
    RAISE NOTICE '✅ Tabla disponibility verificada correctamente';
END $$;

-- Paso 3: Verificar que la columna disponibilidad_id existe en citas_agendadas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'citas_agendadas' 
        AND column_name = 'disponibilidad_id'
    ) THEN
        RAISE EXCEPTION 'La columna disponibilidad_id no existe en citas_agendadas';
    END IF;
    
    RAISE NOTICE '✅ Columna disponibilidad_id verificada correctamente';
END $$;

-- Paso 4: Asegurar que disponibilidad_id tenga el mismo tipo que disponibility.id
-- Verificar ambos tipos y hacer que coincidan
DO $$
DECLARE
    id_udt_name text;
    disponibilidad_id_udt_name text;
BEGIN
    -- Verificar el tipo actual de disponibility.id
    SELECT udt_name INTO id_udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'disponibility'
    AND column_name = 'id';
    
    -- Verificar el tipo actual de citas_agendadas.disponibilidad_id
    SELECT udt_name INTO disponibilidad_id_udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'citas_agendadas'
    AND column_name = 'disponibilidad_id';
    
    RAISE NOTICE 'Tipo de disponibility.id (udt): %', id_udt_name;
    RAISE NOTICE 'Tipo de citas_agendadas.disponibilidad_id (udt): %', disponibilidad_id_udt_name;
    
    -- Si los tipos no coinciden, ajustar disponibilidad_id para que coincida con disponibility.id
    IF id_udt_name != disponibilidad_id_udt_name THEN
        IF id_udt_name = 'text' THEN
            -- Cambiar disponibilidad_id de uuid a text
            ALTER TABLE public.citas_agendadas 
            ALTER COLUMN disponibilidad_id TYPE text USING disponibilidad_id::text;
            
            RAISE NOTICE '✅ Columna disponibilidad_id cambiada de % a text', disponibilidad_id_udt_name;
        ELSIF id_udt_name = 'uuid' THEN
            -- Cambiar disponibilidad_id de text a uuid
            ALTER TABLE public.citas_agendadas 
            ALTER COLUMN disponibilidad_id TYPE uuid USING 
                CASE 
                    WHEN disponibilidad_id IS NULL THEN NULL
                    WHEN disponibilidad_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                    THEN disponibilidad_id::uuid
                    ELSE NULL
                END;
            
            RAISE NOTICE '✅ Columna disponibilidad_id cambiada de % a uuid', disponibilidad_id_udt_name;
        ELSE
            RAISE WARNING '⚠️ Tipo desconocido para disponibility.id: %, puede haber problemas', id_udt_name;
        END IF;
    ELSE
        RAISE NOTICE '✅ Los tipos ya coinciden: %', id_udt_name;
    END IF;
END $$;

-- Paso 5: Crear la foreign key correcta apuntando a la tabla "disponibility"
ALTER TABLE public.citas_agendadas 
  ADD CONSTRAINT fk_disponibility 
  FOREIGN KEY (disponibilidad_id) 
  REFERENCES public.disponibility(id) 
  ON DELETE SET NULL;

-- Paso 6: Verificar que la constraint se creó correctamente
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public'
        AND constraint_name = 'fk_disponibility' 
        AND table_name = 'citas_agendadas'
    ) THEN
        RAISE NOTICE '✅ Foreign key fk_disponibility creada correctamente';
    ELSE
        RAISE WARNING '⚠️ No se pudo crear la foreign key fk_disponibility';
    END IF;
END $$;

