-- 🔧 ADAPTACIÓN FINAL: Agregar columnas que nuestro código espera
-- Aplicar en Supabase Dashboard → SQL Editor

-- 1. Agregar columna dns_records que nuestro código usa
ALTER TABLE public.custom_domains 
ADD COLUMN IF NOT EXISTS dns_records JSONB DEFAULT '{}';

-- 2. Agregar columna root_domain que nuestro código espera  
ALTER TABLE public.custom_domains 
ADD COLUMN IF NOT EXISTS root_domain TEXT;

-- 3. Agregar columna ssl_certificate_id que nuestro código usa
ALTER TABLE public.custom_domains 
ADD COLUMN IF NOT EXISTS ssl_certificate_id TEXT;

-- 4. Verificar la estructura final
SELECT 
  'FINAL TABLE STRUCTURE' as info,
  column_name,
  data_type,
  column_default
FROM information_schema.columns 
WHERE table_name = 'custom_domains' 
  AND table_schema = 'public'
  AND column_name IN ('dns_records', 'root_domain', 'ssl_certificate_id', 'cloudfront_domain')
ORDER BY column_name; 