-- =============================================
-- Script para crear la tabla profilesusers
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- 1. Crear la tabla profilesusers
CREATE TABLE IF NOT EXISTS public.profilesusers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  avatar_url TEXT,
  full_name TEXT,
  bio TEXT,
  website TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Crear índice para búsquedas rápidas por user_id
CREATE INDEX IF NOT EXISTS idx_profilesusers_user_id ON public.profilesusers(user_id);

-- 3. Habilitar Row Level Security
ALTER TABLE public.profilesusers ENABLE ROW LEVEL SECURITY;

-- 4. Política: Usuarios pueden leer su propio perfil
CREATE POLICY "Users can read own profile" ON public.profilesusers
  FOR SELECT USING (auth.uid() = user_id);

-- 5. Política: Usuarios pueden insertar su propio perfil
CREATE POLICY "Users can insert own profile" ON public.profilesusers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. Política: Usuarios pueden actualizar su propio perfil
CREATE POLICY "Users can update own profile" ON public.profilesusers
  FOR UPDATE USING (auth.uid() = user_id);

-- 7. Política: El service_role puede hacer todo (para el backend)
CREATE POLICY "Service role full access" ON public.profilesusers
  FOR ALL USING (auth.role() = 'service_role');

-- 8. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Aplicar trigger a la tabla
DROP TRIGGER IF EXISTS update_profilesusers_updated_at ON public.profilesusers;
CREATE TRIGGER update_profilesusers_updated_at
  BEFORE UPDATE ON public.profilesusers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 10. Comentario de documentación
COMMENT ON TABLE public.profilesusers IS 'Perfiles de usuario adicionales para SpeedLeads';

-- =============================================
-- VERIFICACIÓN: Ejecutar después de crear la tabla
-- =============================================
-- SELECT * FROM public.profilesusers LIMIT 5;

