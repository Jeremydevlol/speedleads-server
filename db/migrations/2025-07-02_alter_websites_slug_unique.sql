-- Migration: Turn slug into per-user unique and drop global uniqueness
ALTER TABLE public.websites
  DROP CONSTRAINT IF EXISTS websites_slug_key;

-- Remove old index on slug
DROP INDEX IF EXISTS idx_websites_slug;

-- Ensure slug is unique only per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_websites_user_slug
  ON public.websites (user_id, slug);

-- Retain index on slug for published lookup
CREATE INDEX IF NOT EXISTS idx_websites_slug
  ON public.websites (slug)
  WHERE is_published;