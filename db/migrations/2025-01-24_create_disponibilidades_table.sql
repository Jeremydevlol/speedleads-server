-- ========================================
-- MIGRACIÓN: ADAPTAR TABLA DISPONIBILITY EXISTENTE
-- ========================================
-- Esta migración adapta la tabla existente "disponibility" agregando
-- las columnas necesarias para integración con Google Calendar

-- Habilitar extensión pgcrypto si no existe
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Agregar columnas necesarias a la tabla existente disponibility
ALTER TABLE public.disponibility 
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS calendar_id text DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS summary text DEFAULT 'Disponibilidad',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS start_ts bigint,
  ADD COLUMN IF NOT EXISTS end_ts bigint,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Actualizar start_ts y end_ts basándose en selected_date + start_time/end_time
UPDATE public.disponibility 
SET start_ts = EXTRACT(EPOCH FROM (selected_date + start_time)::timestamptz)::bigint * 1000,
    end_ts = EXTRACT(EPOCH FROM (selected_date + end_time)::timestamptz)::bigint * 1000
WHERE start_ts IS NULL OR end_ts IS NULL;

-- Actualizar status basándose en is_available
UPDATE public.disponibility 
SET status = CASE 
  WHEN is_available = true THEN 'available'
  ELSE 'booked'
END
WHERE status IS NULL OR status = 'available';

-- Tabla citas_agendadas (para rastrear qué disponibilidad fue agendada)
CREATE TABLE IF NOT EXISTS public.citas_agendadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  disponibilidad_id text, -- Referencia a la disponibilidad original (usando text para coincidir con id)
  google_event_id text NOT NULL, -- ID del evento en Google Calendar
  calendar_id text NOT NULL DEFAULT 'primary',
  client_name text NOT NULL,
  client_phone text,
  client_email text,
  summary text NOT NULL,
  description text,
  location text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  start_ts bigint NOT NULL,
  end_ts bigint NOT NULL,
  notes text, -- Notas adicionales de la cita
  status text NOT NULL DEFAULT 'confirmed', -- 'confirmed', 'cancelled', 'completed'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT fk_user_cita FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_disponibility FOREIGN KEY (disponibilidad_id) REFERENCES public.disponibility(id) ON DELETE SET NULL
);

-- Índices para performance en disponibility
CREATE INDEX IF NOT EXISTS idx_disponibility_user_id ON public.disponibility (user_id);
CREATE INDEX IF NOT EXISTS idx_disponibility_status ON public.disponibility (status);
CREATE INDEX IF NOT EXISTS idx_disponibility_start_ts ON public.disponibility (start_ts);
CREATE INDEX IF NOT EXISTS idx_disponibility_end_ts ON public.disponibility (end_ts);
CREATE INDEX IF NOT EXISTS idx_disponibility_date_range ON public.disponibility (user_id, start_ts, end_ts);
CREATE INDEX IF NOT EXISTS idx_disponibility_google_event_id ON public.disponibility (google_event_id);
CREATE INDEX IF NOT EXISTS idx_disponibility_user_status ON public.disponibility (user_id, status);
CREATE INDEX IF NOT EXISTS idx_disponibility_selected_date ON public.disponibility (selected_date);

-- Índices para citas_agendadas
CREATE INDEX IF NOT EXISTS idx_citas_user_id ON public.citas_agendadas (user_id);
CREATE INDEX IF NOT EXISTS idx_citas_disponibility_id ON public.citas_agendadas (disponibility_id);
CREATE INDEX IF NOT EXISTS idx_citas_google_event_id ON public.citas_agendadas (google_event_id);
CREATE INDEX IF NOT EXISTS idx_citas_start_ts ON public.citas_agendadas (start_ts);
CREATE INDEX IF NOT EXISTS idx_citas_end_ts ON public.citas_agendadas (end_ts);
CREATE INDEX IF NOT EXISTS idx_citas_date_range ON public.citas_agendadas (user_id, start_ts, end_ts);
CREATE INDEX IF NOT EXISTS idx_citas_status ON public.citas_agendadas (status);
CREATE INDEX IF NOT EXISTS idx_citas_user_status ON public.citas_agendadas (user_id, status);

-- Trigger para updated_at en disponibility
DROP TRIGGER IF EXISTS update_disponibility_updated_at ON public.disponibility;
CREATE TRIGGER update_disponibility_updated_at 
    BEFORE UPDATE ON public.disponibility 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para updated_at en citas_agendadas
DROP TRIGGER IF EXISTS update_citas_agendadas_updated_at ON public.citas_agendadas;
CREATE TRIGGER update_citas_agendadas_updated_at 
    BEFORE UPDATE ON public.citas_agendadas 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Función para actualizar start_ts y end_ts automáticamente cuando cambian selected_date, start_time o end_time
CREATE OR REPLACE FUNCTION update_disponibility_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.start_ts := EXTRACT(EPOCH FROM (NEW.selected_date + NEW.start_time)::timestamptz)::bigint * 1000;
  NEW.end_ts := EXTRACT(EPOCH FROM (NEW.selected_date + NEW.end_time)::timestamptz)::bigint * 1000;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar timestamps automáticamente
DROP TRIGGER IF EXISTS trigger_update_disponibility_timestamps ON public.disponibility;
CREATE TRIGGER trigger_update_disponibility_timestamps
    BEFORE INSERT OR UPDATE OF selected_date, start_time, end_time ON public.disponibility
    FOR EACH ROW
    EXECUTE FUNCTION update_disponibility_timestamps();

-- Verificación
SELECT 'disponibility' as table_name, count(*) as record_count FROM public.disponibility
UNION ALL
SELECT 'citas_agendadas', count(*) FROM public.citas_agendadas;
