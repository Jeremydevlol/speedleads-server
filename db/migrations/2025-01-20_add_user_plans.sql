-- Add User Plans System Migration
-- This adds plan field to users and creates plan management structure

-- 1. Add plan column to auth.users (Supabase default)
-- Note: This might need to be done through Supabase Dashboard if using auth.users
-- For custom users table, uncomment the lines below:

-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
-- CREATE INDEX IF NOT EXISTS idx_users_plan ON public.users(plan);

-- 2. Create plans configuration table
CREATE TABLE IF NOT EXISTS public.plan_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_width INTEGER NOT NULL,
  max_height INTEGER NOT NULL,
  max_bitrate BIGINT NOT NULL,
  max_file_size_mb INTEGER NOT NULL,
  max_videos_per_website INTEGER DEFAULT NULL, -- NULL = unlimited
  max_websites INTEGER DEFAULT NULL, -- NULL = unlimited
  features JSONB DEFAULT '[]',
  price_monthly DECIMAL(10,2) DEFAULT 0,
  price_yearly DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Insert default plan configurations
INSERT INTO public.plan_configs (
  id, name, max_width, max_height, max_bitrate, max_file_size_mb, 
  max_videos_per_website, max_websites, features, price_monthly, price_yearly
) VALUES 
(
  'free',
  'Free',
  854,
  480,
  1000000,
  100,
  1,
  2,
  '["480p video quality", "2 websites max", "1 video per website", "Basic support"]',
  0,
  0
),
(
  'basic',
  'Basic',
  1280,
  720,
  2500100,
  500,
  3,
  5,
  '["720p HD video quality", "5 websites max", "3 videos per website", "Email support"]',
  9.99,
  99.99
),
(
  'premium',
  'Premium',
  1920,
  1080,
  5001000,
  1024,
  10,
  15,
  '["1080p Full HD video quality", "15 websites max", "10 videos per website", "Priority support", "Custom domains"]',
  19.99,
  199.99
),
(
  'pro',
  'Pro',
  3840,
  2160,
  15001000,
  5120,
  NULL,
  NULL,
  '["4K video quality", "Unlimited websites", "Unlimited videos", "24/7 support", "Custom domains", "API access", "White label"]',
  49.99,
  499.99
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  max_width = EXCLUDED.max_width,
  max_height = EXCLUDED.max_height,
  max_bitrate = EXCLUDED.max_bitrate,
  max_file_size_mb = EXCLUDED.max_file_size_mb,
  max_videos_per_website = EXCLUDED.max_videos_per_website,
  max_websites = EXCLUDED.max_websites,
  features = EXCLUDED.features,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  updated_at = NOW();

-- 4. Create user_plans table to track user subscriptions
CREATE TABLE IF NOT EXISTS public.user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plan_configs(id),
  status TEXT DEFAULT 'active', -- active, cancelled, expired
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id) -- One active plan per user
);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_plans_user_id ON public.user_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plans_status ON public.user_plans(status);
CREATE INDEX IF NOT EXISTS idx_user_plans_expires_at ON public.user_plans(expires_at);

-- 6. Create function to get user's current plan
CREATE OR REPLACE FUNCTION get_user_plan(user_uuid UUID)
RETURNS TABLE(
  plan_id TEXT,
  plan_name TEXT,
  max_width INTEGER,
  max_height INTEGER,
  max_bitrate BIGINT,
  max_file_size_mb INTEGER,
  max_videos_per_website INTEGER,
  max_websites INTEGER,
  features JSONB,
  status TEXT,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(up.plan_id, 'free') as plan_id,
    pc.name as plan_name,
    pc.max_width,
    pc.max_height,
    pc.max_bitrate,
    pc.max_file_size_mb,
    pc.max_videos_per_website,
    pc.max_websites,
    pc.features,
    COALESCE(up.status, 'active') as status,
    up.expires_at
  FROM public.plan_configs pc
  LEFT JOIN public.user_plans up ON (
    up.user_id = user_uuid 
    AND up.status = 'active'
    AND (up.expires_at IS NULL OR up.expires_at > NOW())
  )
  WHERE pc.id = COALESCE(up.plan_id, 'free')
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create function to check if user can upload video
CREATE OR REPLACE FUNCTION can_user_upload_video(
  user_uuid UUID,
  file_size_bytes BIGINT,
  website_id UUID DEFAULT NULL
)
RETURNS TABLE(
  can_upload BOOLEAN,
  reason TEXT,
  current_plan TEXT,
  suggested_plan TEXT
) AS $$
DECLARE
  user_plan RECORD;
  website_video_count INTEGER;
  user_website_count INTEGER;
BEGIN
  -- Get user's current plan
  SELECT * INTO user_plan FROM get_user_plan(user_uuid);
  
  -- Check file size limit
  IF file_size_bytes > (user_plan.max_file_size_mb * 1024 * 1024) THEN
    RETURN QUERY SELECT 
      false as can_upload,
      'File size exceeds plan limit' as reason,
      user_plan.plan_id as current_plan,
      CASE 
        WHEN file_size_bytes <= (500 * 1024 * 1024) THEN 'basic'
        WHEN file_size_bytes <= (1024 * 1024 * 1024) THEN 'premium'
        ELSE 'pro'
      END as suggested_plan;
    RETURN;
  END IF;
  
  -- Check website limit
  IF user_plan.max_websites IS NOT NULL THEN
    SELECT COUNT(*) INTO user_website_count
    FROM public.websites 
    WHERE user_id = user_uuid;
    
    IF user_website_count >= user_plan.max_websites THEN
      RETURN QUERY SELECT 
        false as can_upload,
        'Website limit reached for your plan' as reason,
        user_plan.plan_id as current_plan,
        CASE 
          WHEN user_plan.plan_id = 'free' THEN 'basic'
          WHEN user_plan.plan_id = 'basic' THEN 'premium'
          ELSE 'pro'
        END as suggested_plan;
      RETURN;
    END IF;
  END IF;
  
  -- Check videos per website limit (if website_id provided)
  IF website_id IS NOT NULL AND user_plan.max_videos_per_website IS NOT NULL THEN
    -- Count videos in main_video and sections
    SELECT (
      CASE WHEN w.main_video->>'fileName' IS NOT NULL THEN 1 ELSE 0 END +
      (
        SELECT COUNT(*)
        FROM jsonb_array_elements(w.sections) AS section
        WHERE section->'video'->>'fileName' IS NOT NULL
      )
    ) INTO website_video_count
    FROM public.websites w
    WHERE w.id = website_id AND w.user_id = user_uuid;
    
    IF website_video_count >= user_plan.max_videos_per_website THEN
      RETURN QUERY SELECT 
        false as can_upload,
        'Video limit per website reached for your plan' as reason,
        user_plan.plan_id as current_plan,
        CASE 
          WHEN user_plan.plan_id = 'free' THEN 'basic'
          WHEN user_plan.plan_id = 'basic' THEN 'premium'
          ELSE 'pro'
        END as suggested_plan;
      RETURN;
    END IF;
  END IF;
  
  -- All checks passed
  RETURN QUERY SELECT 
    true as can_upload,
    'Upload allowed' as reason,
    user_plan.plan_id as current_plan,
    NULL::TEXT as suggested_plan;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Enable RLS on new tables
ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS policies

-- Plan configs are readable by everyone
CREATE POLICY "Plan configs are publicly readable" ON public.plan_configs
  FOR SELECT USING (is_active = true);

-- Users can only see their own plan
CREATE POLICY "Users can view own plan" ON public.user_plans
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can manage user plans
CREATE POLICY "Service role can manage user plans" ON public.user_plans
  FOR ALL USING (auth.role() = 'service_role');

-- 10. Grant permissions
GRANT SELECT ON public.plan_configs TO authenticated;
GRANT SELECT ON public.user_plans TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_plan(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_upload_video(UUID, BIGINT, UUID) TO authenticated;

-- 11. Comments for documentation
COMMENT ON TABLE public.plan_configs IS 'Configuration for different subscription plans';
COMMENT ON TABLE public.user_plans IS 'User subscription tracking';
COMMENT ON FUNCTION get_user_plan(UUID) IS 'Get user current plan with all limits and features';
COMMENT ON FUNCTION can_user_upload_video(UUID, BIGINT, UUID) IS 'Check if user can upload video based on plan limits';

-- 12. Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_plans_updated_at 
  BEFORE UPDATE ON public.user_plans
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column(); 