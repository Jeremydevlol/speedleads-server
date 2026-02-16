-- Instagram Official Accounts (Meta OAuth) - SpeedLeads
-- Ejecutar en Supabase SQL Editor (misma BD que speedleads: liftlvbugumpxhmjvmtb)

CREATE TABLE IF NOT EXISTS public.instagram_official_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    facebook_user_id TEXT,
    facebook_page_id TEXT,
    instagram_business_id TEXT NOT NULL,
    page_name TEXT,
    instagram_username TEXT,
    instagram_profile_picture TEXT,
    access_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, instagram_business_id)
);

ALTER TABLE public.instagram_official_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role has full access to instagram_official_accounts" ON public.instagram_official_accounts
    FOR ALL USING ( auth.role() = 'service_role' ) WITH CHECK ( auth.role() = 'service_role' );

CREATE POLICY "Users can view their own instagram connections" ON public.instagram_official_accounts
    FOR SELECT USING ( auth.uid() = user_id );

CREATE POLICY "Users can delete their own instagram connections" ON public.instagram_official_accounts
    FOR DELETE USING ( auth.uid() = user_id );
