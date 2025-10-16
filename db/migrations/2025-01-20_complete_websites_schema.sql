-- Complete Website Schema Migration
-- This migration ensures the websites table has all required fields and constraints

-- Create or update the websites table with complete schema
CREATE TABLE IF NOT EXISTS public.websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_description TEXT NOT NULL,
  slug TEXT,
  sections JSONB DEFAULT '[]',
  social_media JSONB DEFAULT '{}',
  main_video JSONB DEFAULT '{}',
  theme_colors JSONB DEFAULT '{}',
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure unique constraint for user_id + slug combination
DROP INDEX IF EXISTS websites_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_websites_user_slug 
  ON public.websites (user_id, slug);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_websites_user_id 
  ON public.websites(user_id);
  
CREATE INDEX IF NOT EXISTS idx_websites_slug 
  ON public.websites(slug) 
  WHERE is_published = true;
  
CREATE INDEX IF NOT EXISTS idx_websites_published 
  ON public.websites(is_published);

-- Enable Row Level Security
ALTER TABLE public.websites ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own websites" ON public.websites;
DROP POLICY IF EXISTS "Users can insert own websites" ON public.websites;
DROP POLICY IF EXISTS "Users can update own websites" ON public.websites;
DROP POLICY IF EXISTS "Users can delete own websites" ON public.websites;

-- Create RLS policies
CREATE POLICY "Users can view own websites" ON public.websites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own websites" ON public.websites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own websites" ON public.websites
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own websites" ON public.websites
  FOR DELETE USING (auth.uid() = user_id);

-- Create or replace trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic updated_at
DROP TRIGGER IF EXISTS update_websites_updated_at ON public.websites;
CREATE TRIGGER update_websites_updated_at 
  BEFORE UPDATE ON public.websites
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE public.websites IS 'User websites with business information and content sections';
COMMENT ON COLUMN public.websites.user_id IS 'Foreign key to auth.users table';
COMMENT ON COLUMN public.websites.business_name IS 'Name of the business/website';
COMMENT ON COLUMN public.websites.business_description IS 'Description of the business';
COMMENT ON COLUMN public.websites.slug IS 'URL slug for the website (unique per user)';
COMMENT ON COLUMN public.websites.sections IS 'JSON array containing website sections/content';
COMMENT ON COLUMN public.websites.social_media IS 'JSON object with social media links';
COMMENT ON COLUMN public.websites.main_video IS 'JSON object with main video information';
COMMENT ON COLUMN public.websites.theme_colors IS 'JSON object with theme color configuration';
COMMENT ON COLUMN public.websites.is_published IS 'Whether the website is published/live'; 