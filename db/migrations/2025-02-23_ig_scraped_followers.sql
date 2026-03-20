-- Instagram Scraped Followers - SpeedLeads
-- Seguidores extraídos por scraper (Puppeteer) para evitar usar Private API en esa tarea.
-- La sesión que hace login solo lee de aquí y envía DMs.

DROP TABLE IF EXISTS public.ig_scraped_followers;

CREATE TABLE public.ig_scraped_followers (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    target_username TEXT NOT NULL,
    follower_username TEXT NOT NULL,
    follower_pk TEXT,
    full_name TEXT,
    profile_pic_url TEXT,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT ig_scraped_followers_unique UNIQUE (user_id, target_username, follower_username)
);

CREATE INDEX idx_ig_scraped_user_target
ON public.ig_scraped_followers (user_id, target_username);

CREATE INDEX idx_ig_scraped_scraped_at
ON public.ig_scraped_followers (scraped_at DESC);

COMMENT ON TABLE public.ig_scraped_followers IS 'Seguidores de Instagram extraídos por scraper; la sesión Private API los lee para enviar DMs sin hacer getFollowers.';
