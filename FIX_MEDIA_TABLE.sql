-- =========================================================
-- SQL para corregir la estructura de la tabla 'media'
-- Ejecutar este comando en el SQL Editor de Supabase
-- =========================================================

-- 1. Asegurar que la tabla media existe
CREATE TABLE IF NOT EXISTS public.media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agregar columnas básicas si no existen
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS users_id UUID;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS personality_instruction_id TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS filename TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 3. Agregar columnas para video e IA si no existen
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS video_transcription TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS ai_analysis TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS processed_with_ai BOOLEAN DEFAULT false;

-- 4. Crear índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_media_users_id ON public.media(users_id);
CREATE INDEX IF NOT EXISTS idx_media_message_id ON public.media(message_id);
CREATE INDEX IF NOT EXISTS idx_media_personality_instruction_id ON public.media(personality_instruction_id);
CREATE INDEX IF NOT EXISTS idx_media_media_type ON public.media(media_type);

-- 5. Verificar estructura final
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'media'
ORDER BY ordinal_position;

-- NOTA: Si el error de "schema cache" persiste después de ejecutar esto, 
-- ve a Supabase Dashboard -> API Settings -> PostgREST -> "Reload PostgREST" 
-- o espera unos minutos a que el cache se actualice automáticamente.
