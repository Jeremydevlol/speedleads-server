-- Video Storage Setup Migration
-- This creates the bucket and policies for video storage in websites

-- 1. Create bucket for web creator videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'web-creator-videos', 
  'web-creator-videos', 
  true,
  524288000, -- 500MB limit
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

-- Policy: Users can upload videos to their own folder
CREATE POLICY "Users can upload own videos" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'web-creator-videos' AND 
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Policy: All videos are publicly viewable (for published websites)
CREATE POLICY "Videos are publicly viewable" ON storage.objects
FOR SELECT USING (bucket_id = 'web-creator-videos');

-- Policy: Users can delete their own videos
CREATE POLICY "Users can delete own videos" ON storage.objects
FOR DELETE USING (
  bucket_id = 'web-creator-videos' AND 
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- Policy: Users can update their own videos metadata
CREATE POLICY "Users can update own videos" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'web-creator-videos' AND 
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- 5. Create function to clean up orphaned videos
CREATE OR REPLACE FUNCTION cleanup_orphaned_videos()
RETURNS void AS $$
DECLARE
  video_record RECORD;
  is_referenced BOOLEAN;
BEGIN
  -- Loop through all videos in storage
  FOR video_record IN 
    SELECT name FROM storage.objects 
    WHERE bucket_id = 'web-creator-videos'
  LOOP
    -- Check if video is referenced in any website
    SELECT EXISTS(
      SELECT 1 FROM websites 
      WHERE 
        main_video->>'fileName' = video_record.name
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(sections) AS section
          WHERE section->'video'->>'fileName' = video_record.name
        )
    ) INTO is_referenced;
    
    -- If not referenced, delete the video
    IF NOT is_referenced THEN
      DELETE FROM storage.objects 
      WHERE bucket_id = 'web-creator-videos' AND name = video_record.name;
      
      RAISE NOTICE 'Deleted orphaned video: %', video_record.name;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6. Create a function to get user storage usage
CREATE OR REPLACE FUNCTION get_user_storage_usage(user_uuid UUID)
RETURNS TABLE(
  total_files BIGINT,
  total_size BIGINT,
  total_size_mb NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT,
    COALESCE(SUM((metadata->>'size')::BIGINT), 0)::BIGINT,
    ROUND(COALESCE(SUM((metadata->>'size')::BIGINT), 0) / 1024.0 / 1024.0, 2)
  FROM storage.objects
  WHERE bucket_id = 'web-creator-videos'
    AND (string_to_array(name, '/'))[1] = user_uuid::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Grant necessary permissions
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;

-- 8. Comments for documentation
COMMENT ON FUNCTION cleanup_orphaned_videos() IS 'Removes videos from storage that are not referenced by any website';
COMMENT ON FUNCTION get_user_storage_usage(UUID) IS 'Returns storage usage statistics for a specific user';

-- 9. Create index for better performance on video queries
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_user 
ON storage.objects (bucket_id, ((string_to_array(name, '/'))[1])) 
WHERE bucket_id = 'web-creator-videos'; 