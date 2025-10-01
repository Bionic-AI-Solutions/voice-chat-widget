-- =============================================================================
-- STORAGE BUCKETS AND POLICIES
-- =============================================================================

-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('audio-files', 'audio-files', false, 104857600, ARRAY['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/webm']),
    ('reports', 'reports', true, 52428800, ARRAY['application/pdf']),
    ('temp-files', 'temp-files', false, 10485760, ARRAY['application/octet-stream', 'text/plain'])
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- STORAGE POLICIES
-- =============================================================================

-- Audio files bucket policies
CREATE POLICY "Users can upload their own audio files" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'audio-files' AND
        auth.role() = 'service_role'
    );

CREATE POLICY "Users can view their own audio files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'audio-files' AND
        (
            auth.role() = 'service_role' OR
            (storage.foldername(name))[1] = auth.uid()::text
        )
    );

CREATE POLICY "Service role can manage audio files" ON storage.objects
    FOR ALL USING (
        bucket_id = 'audio-files' AND
        auth.role() = 'service_role'
    );

-- Reports bucket policies (public read)
CREATE POLICY "Anyone can view reports" ON storage.objects
    FOR SELECT USING (bucket_id = 'reports');

CREATE POLICY "Service role can upload reports" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'reports' AND
        auth.role() = 'service_role'
    );

CREATE POLICY "Service role can manage reports" ON storage.objects
    FOR ALL USING (
        bucket_id = 'reports' AND
        auth.role() = 'service_role'
    );

-- Temp files bucket policies
CREATE POLICY "Service role can manage temp files" ON storage.objects
    FOR ALL USING (
        bucket_id = 'temp-files' AND
        auth.role() = 'service_role'
    );

-- =============================================================================
-- STORAGE FUNCTIONS
-- =============================================================================

-- Function to get signed URL for audio file
CREATE OR REPLACE FUNCTION get_audio_file_url(file_path TEXT, expires_in INTEGER DEFAULT 3600)
RETURNS TEXT AS $$
DECLARE
    signed_url TEXT;
BEGIN
    -- Generate signed URL for private audio file
    SELECT storage.create_signed_url('audio-files', file_path, expires_in) INTO signed_url;
    RETURN signed_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get public URL for report
CREATE OR REPLACE FUNCTION get_report_url(file_path TEXT)
RETURNS TEXT AS $$
DECLARE
    public_url TEXT;
BEGIN
    -- Get public URL for report file
    SELECT storage.get_public_url('reports', file_path) INTO public_url;
    RETURN public_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old temp files
CREATE OR REPLACE FUNCTION cleanup_temp_files(days_old INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete old temp files
    DELETE FROM storage.objects 
    WHERE bucket_id = 'temp-files' 
    AND created_at < NOW() - INTERVAL '1 day' * days_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- STORAGE TRIGGERS
-- =============================================================================

-- Function to log file operations
CREATE OR REPLACE FUNCTION log_file_operation()
RETURNS TRIGGER AS $$
BEGIN
    -- Log file operations to analytics
    INSERT INTO analytics (event_type, event_data)
    VALUES (
        'file_' || TG_OP,
        jsonb_build_object(
            'bucket_id', COALESCE(NEW.bucket_id, OLD.bucket_id),
            'file_name', COALESCE(NEW.name, OLD.name),
            'file_size', COALESCE(NEW.metadata->>'size', OLD.metadata->>'size'),
            'mime_type', COALESCE(NEW.metadata->>'mimetype', OLD.metadata->>'mimetype')
        )
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to storage.objects
CREATE TRIGGER log_storage_operations
    AFTER INSERT OR UPDATE OR DELETE ON storage.objects
    FOR EACH ROW EXECUTE FUNCTION log_file_operation();

-- =============================================================================
-- STORAGE VIEWS
-- =============================================================================

-- View for audio file statistics
CREATE VIEW audio_file_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_files,
    SUM((metadata->>'size')::bigint) as total_size,
    AVG((metadata->>'size')::bigint) as avg_file_size,
    COUNT(DISTINCT (storage.foldername(name))[1]) as unique_users
FROM storage.objects
WHERE bucket_id = 'audio-files'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- View for report statistics
CREATE VIEW report_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_reports,
    SUM((metadata->>'size')::bigint) as total_size,
    AVG((metadata->>'size')::bigint) as avg_file_size
FROM storage.objects
WHERE bucket_id = 'reports'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON FUNCTION get_audio_file_url(TEXT, INTEGER) IS 'Generate signed URL for private audio files';
COMMENT ON FUNCTION get_report_url(TEXT) IS 'Get public URL for report files';
COMMENT ON FUNCTION cleanup_temp_files(INTEGER) IS 'Clean up old temporary files';
COMMENT ON VIEW audio_file_stats IS 'Statistics for audio file storage usage';
COMMENT ON VIEW report_stats IS 'Statistics for report file storage usage';
