-- Tabla para guardar seguidores scrapeados de Instagram
CREATE TABLE IF NOT EXISTS public.ig_scraped_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    target_username TEXT NOT NULL,
    target_pk TEXT,
    follower_pk TEXT NOT NULL,
    follower_username TEXT NOT NULL,
    follower_full_name TEXT,
    is_private BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    profile_pic_url TEXT,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, target_username, follower_pk)
);

CREATE INDEX IF NOT EXISTS idx_ig_scraped_tenant ON public.ig_scraped_followers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ig_scraped_target ON public.ig_scraped_followers(tenant_id, target_username);
