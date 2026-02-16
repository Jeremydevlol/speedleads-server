-- Comandos SQL para agregar las columnas faltantes a la tabla media
-- Ejecutar estos comandos en Supabase SQL Editor

-- 1. Agregar columna file_size (tamaño del archivo en bytes)
ALTER TABLE media 
ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- 2. Agregar columna metadata (metadatos JSON del video)
ALTER TABLE media 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 3. Agregar comentarios para documentar las columnas
COMMENT ON COLUMN media.file_size IS 'Tamaño del archivo en bytes';
COMMENT ON COLUMN media.metadata IS 'Metadatos JSON del video (título, descripción, duración, etc.)';

-- 4. Crear índice en metadata para búsquedas eficientes (opcional)
CREATE INDEX IF NOT EXISTS idx_media_metadata_platform 
ON media USING GIN ((metadata->>'platform'));

CREATE INDEX IF NOT EXISTS idx_media_metadata_title 
ON media USING GIN ((metadata->>'title'));

-- 5. Verificar que las columnas se agregaron correctamente
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'media' 
AND column_name IN ('file_size', 'metadata')
ORDER BY column_name;
