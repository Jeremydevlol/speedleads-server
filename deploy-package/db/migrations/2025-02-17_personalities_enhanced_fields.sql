-- Campos mejorados para la tabla personalities (agente único)
-- Ejecutar en Supabase SQL Editor

ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS tone TEXT DEFAULT 'professional';
ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'es';
ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS response_style TEXT DEFAULT 'medium';
ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS context TEXT;
ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS fallback_message TEXT;
ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS no_answer_message TEXT;
ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS max_response_words INTEGER;
ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS system_prompt_extra TEXT;
ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS forbidden_topics TEXT;
ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS keywords TEXT;
ALTER TABLE public.personalities ADD COLUMN IF NOT EXISTS allow_off_topic BOOLEAN DEFAULT true;
