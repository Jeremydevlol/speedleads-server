-- Custom Domains Migration
-- This migration creates the custom_domains table for managing custom domain configurations

CREATE TABLE IF NOT EXISTS public.custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  website_id UUID NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  domain TEXT NOT NULL, -- Full domain like "shop.company.com"
  subdomain TEXT, -- subdomain part like "shop"
  root_domain TEXT, -- root domain like "company.com"
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'dns_verified', 'ssl_pending', 'active', 'failed')),
  dns_records JSONB DEFAULT '{}', -- DNS records to configure
  ssl_status TEXT DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'generating', 'active', 'failed')),
  ssl_certificate_id TEXT, -- AWS ACM certificate ID or similar
  verification_record JSONB, -- DNS verification record details
  cloudfront_domain TEXT DEFAULT 'domains.uniclick.io', -- Target CNAME
  error_message TEXT, -- Error details if any
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(domain) -- Each domain can only be configured once
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_custom_domains_user_id ON public.custom_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_status ON public.custom_domains(status);
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON public.custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_custom_domains_website_id ON public.custom_domains(website_id);

-- Enable Row Level Security
ALTER TABLE public.custom_domains ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own custom domains" ON public.custom_domains
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own custom domains" ON public.custom_domains
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own custom domains" ON public.custom_domains
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom domains" ON public.custom_domains
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_custom_domains_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_custom_domains_updated_at
  BEFORE UPDATE ON public.custom_domains
  FOR EACH ROW EXECUTE FUNCTION update_custom_domains_updated_at();

-- Insert sample configuration (optional, for testing)
-- This will be removed after testing
/*
INSERT INTO public.custom_domains (
  user_id, website_id, domain, subdomain, root_domain, 
  dns_records, cloudfront_domain
) VALUES (
  -- Replace with actual test user_id and website_id
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  'shop.example.com',
  'shop',
  'example.com',
  '{"cname": {"type": "CNAME", "name": "shop", "value": "domains.uniclick.io", "ttl": 300}}',
  'domains.uniclick.io'
) ON CONFLICT (domain) DO NOTHING;
*/ 