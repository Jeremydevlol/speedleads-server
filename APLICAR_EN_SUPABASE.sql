-- 🔧 APLICAR EN SUPABASE DASHBOARD → SQL EDITOR
-- Esto agrega las columnas faltantes a la tabla custom_domains

-- 1. Agregar columnas faltantes
ALTER TABLE public.custom_domains 
ADD COLUMN IF NOT EXISTS cloudfront_domain TEXT DEFAULT 'domains.uniclick.io';

ALTER TABLE public.custom_domains 
ADD COLUMN IF NOT EXISTS verification_record JSONB;

ALTER TABLE public.custom_domains 
ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE public.custom_domains 
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- 2. Crear función para updated_at (si no existe)
CREATE OR REPLACE FUNCTION update_custom_domains_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Crear trigger para updated_at
DROP TRIGGER IF EXISTS update_custom_domains_updated_at ON public.custom_domains;
CREATE TRIGGER update_custom_domains_updated_at
  BEFORE UPDATE ON public.custom_domains
  FOR EACH ROW EXECUTE FUNCTION update_custom_domains_updated_at();

-- 4. Verificar que todo está bien
SELECT 
  'custom_domains table ready!' as status,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'custom_domains' 
  AND table_schema = 'public'
ORDER BY ordinal_position; 