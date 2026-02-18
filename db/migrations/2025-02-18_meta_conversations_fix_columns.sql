-- Arregla meta_conversations si la tabla existe pero le faltan columnas (ej. last_message).
-- Ejecutar en Supabase (el mismo proyecto que usa Render).
-- Si la tabla no existe, ejecuta antes: 2025-02-18_meta_conversations_messages.sql

ALTER TABLE public.meta_conversations ADD COLUMN IF NOT EXISTS last_message TEXT;
ALTER TABLE public.meta_conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.meta_conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
