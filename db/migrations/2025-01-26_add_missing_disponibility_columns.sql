-- ========================================
-- MIGRACIÓN: AGREGAR TODAS LAS COLUMNAS FALTANTES A DISPONIBILITY
-- ========================================
-- Esta migración asegura que todas las columnas necesarias existan en la tabla disponibility

-- Verificar y crear función update_updated_at_column si no existe
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Agregar todas las columnas necesarias a disponibility (con verificaciones)
DO $$
BEGIN
    -- google_event_id (text, puede ser null)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'disponibility' 
        AND column_name = 'google_event_id'
    ) THEN
        ALTER TABLE public.disponibility ADD COLUMN google_event_id text;
        RAISE NOTICE 'Columna google_event_id agregada';
    END IF;

    -- calendar_id (text, default 'primary')
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'disponibility' 
        AND column_name = 'calendar_id'
    ) THEN
        ALTER TABLE public.disponibility ADD COLUMN calendar_id text DEFAULT 'primary';
        RAISE NOTICE 'Columna calendar_id agregada';
    END IF;

    -- summary (text, default 'Disponibilidad')
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'disponibility' 
        AND column_name = 'summary'
    ) THEN
        ALTER TABLE public.disponibility ADD COLUMN summary text DEFAULT 'Disponibilidad';
        RAISE NOTICE 'Columna summary agregada';
    END IF;

    -- description (text, puede ser null)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'disponibility' 
        AND column_name = 'description'
    ) THEN
        ALTER TABLE public.disponibility ADD COLUMN description text;
        RAISE NOTICE 'Columna description agregada';
    END IF;

    -- location (text, puede ser null)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'disponibility' 
        AND column_name = 'location'
    ) THEN
        ALTER TABLE public.disponibility ADD COLUMN location text;
        RAISE NOTICE 'Columna location agregada';
    END IF;

    -- start_ts (bigint, puede ser null)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'disponibility' 
        AND column_name = 'start_ts'
    ) THEN
        ALTER TABLE public.disponibility ADD COLUMN start_ts bigint;
        RAISE NOTICE 'Columna start_ts agregada';
    END IF;

    -- end_ts (bigint, puede ser null)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'disponibility' 
        AND column_name = 'end_ts'
    ) THEN
        ALTER TABLE public.disponibility ADD COLUMN end_ts bigint;
        RAISE NOTICE 'Columna end_ts agregada';
    END IF;

    -- status (text, default 'available')
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'disponibility' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE public.disponibility ADD COLUMN status text DEFAULT 'available';
        RAISE NOTICE 'Columna status agregada';
    END IF;

    -- created_at (timestamptz, default now())
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'disponibility' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.disponibility ADD COLUMN created_at timestamptz DEFAULT now();
        RAISE NOTICE 'Columna created_at agregada';
    END IF;

    -- updated_at (timestamptz, default now())
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'disponibility' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.disponibility ADD COLUMN updated_at timestamptz DEFAULT now();
        RAISE NOTICE 'Columna updated_at agregada';
    END IF;
END $$;

-- Actualizar start_ts y end_ts para registros existentes que no los tengan
UPDATE public.disponibility 
SET start_ts = EXTRACT(EPOCH FROM (selected_date + start_time)::timestamptz)::bigint * 1000
WHERE start_ts IS NULL 
  AND selected_date IS NOT NULL 
  AND start_time IS NOT NULL;

UPDATE public.disponibility 
SET end_ts = EXTRACT(EPOCH FROM (selected_date + end_time)::timestamptz)::bigint * 1000
WHERE end_ts IS NULL 
  AND selected_date IS NOT NULL 
  AND end_time IS NOT NULL;

-- Actualizar status basándose en is_available si status es null
UPDATE public.disponibility 
SET status = CASE 
  WHEN is_available = true THEN 'available'
  ELSE 'booked'
END
WHERE status IS NULL OR (status = 'available' AND is_available = false);

-- Crear índices si no existen
CREATE INDEX IF NOT EXISTS idx_disponibility_google_event_id ON public.disponibility (google_event_id);
CREATE INDEX IF NOT EXISTS idx_disponibility_start_ts ON public.disponibility (start_ts);
CREATE INDEX IF NOT EXISTS idx_disponibility_end_ts ON public.disponibility (end_ts);
CREATE INDEX IF NOT EXISTS idx_disponibility_status ON public.disponibility (status);
CREATE INDEX IF NOT EXISTS idx_disponibility_user_status ON public.disponibility (user_id, status);
CREATE INDEX IF NOT EXISTS idx_disponibility_date_range ON public.disponibility (user_id, start_ts, end_ts);

-- Crear o reemplazar función para actualizar timestamps automáticamente
CREATE OR REPLACE FUNCTION update_disponibility_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.selected_date IS NOT NULL AND NEW.start_time IS NOT NULL THEN
    NEW.start_ts := EXTRACT(EPOCH FROM (NEW.selected_date + NEW.start_time)::timestamptz)::bigint * 1000;
  END IF;
  
  IF NEW.selected_date IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    NEW.end_ts := EXTRACT(EPOCH FROM (NEW.selected_date + NEW.end_time)::timestamptz)::bigint * 1000;
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para actualizar timestamps automáticamente
DROP TRIGGER IF EXISTS trigger_update_disponibility_timestamps ON public.disponibility;
CREATE TRIGGER trigger_update_disponibility_timestamps
    BEFORE INSERT OR UPDATE OF selected_date, start_time, end_time ON public.disponibility
    FOR EACH ROW
    EXECUTE FUNCTION update_disponibility_timestamps();

-- Crear trigger para updated_at
DROP TRIGGER IF EXISTS update_disponibility_updated_at ON public.disponibility;
CREATE TRIGGER update_disponibility_updated_at 
    BEFORE UPDATE ON public.disponibility 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Verificar columnas creadas
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'disponibility'
ORDER BY ordinal_position;


