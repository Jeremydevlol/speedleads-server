-- Meta Connections (WhatsApp / Instagram Business API) - SpeedLeads
-- Tabla usada por metaConnectionsRepo: tenant_id, ig_business_id, access_token, etc.
-- Si la tabla ya existe sin access_token, este script añade la columna.

CREATE TABLE IF NOT EXISTS public.meta_connections (
    tenant_id UUID NOT NULL,
    ig_business_id TEXT NOT NULL,
    access_token TEXT,
    auto_reply_enabled BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'active',
    estado TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, ig_business_id)
);

-- Añadir access_token si la tabla existía con otro esquema (ej. creada sin esta columna)
ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS estado TEXT;
ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Índice para getConnectionByTenantId (orden por updated_at)
CREATE INDEX IF NOT EXISTS idx_meta_connections_tenant_updated
ON public.meta_connections (tenant_id, updated_at DESC);

-- Unique para upsert por (tenant_id, ig_business_id); evita duplicados
CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_tenant_ig_uniq
ON public.meta_connections (tenant_id, ig_business_id);

COMMENT ON TABLE public.meta_connections IS 'Conexiones Meta (Instagram/WhatsApp Business) por tenant; usado por metaAuthRoutes y metaConnectionsRepo.';
