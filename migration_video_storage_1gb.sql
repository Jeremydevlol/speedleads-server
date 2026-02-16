-- Video Storage Setup Migration (1GB LIMIT)
-- This creates the bucket and policies for video storage in websites

-- 1. Create bucket for web creator videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'web-creator-videos',
  'web-creator-videos',
  true,
  1073741824, -- 1GB limit (1024MB)
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/avi', 'video/mov']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own videos" ON storage.objects;
DROP POLICY IF EXISTS "Videos are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own videos" ON storage.objects;

-- 4. Create RLS policies for video storage
CREATE POLICY "Users can upload own videos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'web-creator-videos' AND
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

CREATE POLICY "Videos are publicly viewable" ON storage.objects
FOR SELECT USING (bucket_id = 'web-creator-videos');

CREATE POLICY "Users can delete own videos" ON storage.objects
FOR DELETE USING (
  bucket_id = 'web-creator-videos' AND
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

CREATE POLICY "Users can update own videos" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'web-creator-videos' AND
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- 5. Grant necessary permissions
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;

-- 6. Create index for better performance on video queries
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_user
ON storage.objects (bucket_id, ((string_to_array(name, '/'))[1]))
WHERE bucket_id = 'web-creator-videos'; 