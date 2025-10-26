-- Video Storage Setup Migration (1GB LIMIT) - CORREGIDO
-- This creates the bucket and policies for video storage in websites
-- Using Supabase storage functions instead of direct table manipulation

-- 1. Create bucket for web creator videos
-- Use the Storage API function instead of direct INSERT
SELECT storage.create_bucket(
  'web-creator-videos',
  'web-creator-videos',
  true,
  1073741824, -- 1GB limit (1024MB)
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/avi', 'video/mov']::text[]
);

-- 2. Create RLS policies for video storage
-- Use the storage.create_policy function instead of direct policy creation
SELECT storage.create_policy(
  'web-creator-videos',
  'upload',
  'authenticated',
  'auth.uid()::text = (string_to_array(name, ''/''))[1]'
);

SELECT storage.create_policy(
  'web-creator-videos',
  'select',
  'public',
  'true'
);

SELECT storage.create_policy(
  'web-creator-videos',
  'delete',
  'authenticated',
  'auth.uid()::text = (string_to_array(name, ''/''))[1]'
);

SELECT storage.create_policy(
  'web-creator-videos',
  'update',
  'authenticated',
  'auth.uid()::text = (string_to_array(name, ''/''))[1]'
); 