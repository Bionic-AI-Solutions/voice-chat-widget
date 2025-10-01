-- =============================================================================
-- FIX EXISTING TYPES AND CREATE MISSING TABLES
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure uuid_generate_v4 function is available
CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid AS $func$
BEGIN
    RETURN gen_random_uuid();
END;
$func$ LANGUAGE plpgsql;

-- Create types only if they don't exist
DO $$ BEGIN
    CREATE TYPE session_status AS ENUM ('active', 'ended', 'processing', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE conversation_status AS ENUM ('processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'retrying');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_type AS ENUM ('transcription', 'summarization', 'pdf_generation', 'email_delivery');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create tables only if they don't exist
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    officer_email VARCHAR(255) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    client_id VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    status session_status NOT NULL DEFAULT 'active',
    transcript TEXT,
    audio_url TEXT,
    conversation_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    officer_email VARCHAR(255) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration INTEGER NOT NULL,
    language VARCHAR(10) NOT NULL,
    status conversation_status NOT NULL DEFAULT 'processing',
    transcript TEXT,
    summary TEXT,
    audio_url TEXT,
    pdf_url TEXT,
    email_sent BOOLEAN DEFAULT FALSE,
    cost_breakdown JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type job_type NOT NULL,
    status job_status NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    payload JSONB NOT NULL,
    result JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audio_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    storage_path TEXT NOT NULL,
    storage_provider VARCHAR(50) DEFAULT 'minio',
    checksum VARCHAR(64),
    duration INTEGER,
    sample_rate INTEGER,
    channels INTEGER,
    bit_rate INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB DEFAULT '{}',
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    service VARCHAR(50) NOT NULL,
    cost_amount DECIMAL(10, 4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    usage_data JSONB DEFAULT '{}',
    billing_period DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_sessions_officer_email ON sessions(officer_email);
CREATE INDEX IF NOT EXISTS idx_sessions_app_name ON sessions(app_name);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_client_id ON sessions(client_id);

CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_officer_email ON conversations(officer_email);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_start_time ON conversations(start_time);
CREATE INDEX IF NOT EXISTS idx_conversations_duration ON conversations(duration);

CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

CREATE INDEX IF NOT EXISTS idx_audio_files_session_id ON audio_files(session_id);
CREATE INDEX IF NOT EXISTS idx_audio_files_conversation_id ON audio_files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_audio_files_storage_path ON audio_files(storage_path);
CREATE INDEX IF NOT EXISTS idx_audio_files_created_at ON audio_files(created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_session_id ON analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_conversation_id ON analytics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics(created_at);

CREATE INDEX IF NOT EXISTS idx_cost_tracking_session_id ON cost_tracking(session_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_conversation_id ON cost_tracking(conversation_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_service ON cost_tracking(service);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_billing_period ON cost_tracking(billing_period);

-- Create or replace functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers if they don't exist
DO $$ BEGIN
    CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_audio_files_updated_at BEFORE UPDATE ON audio_files
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_tracking ENABLE ROW LEVEL SECURITY;

-- Create or replace RLS policies
DROP POLICY IF EXISTS "Users can view their own sessions" ON sessions;
CREATE POLICY "Users can view their own sessions" ON sessions
    FOR SELECT USING (officer_email = current_setting('app.current_user_email', true));

DROP POLICY IF EXISTS "Users can create their own sessions" ON sessions;
CREATE POLICY "Users can create their own sessions" ON sessions
    FOR INSERT WITH CHECK (officer_email = current_setting('app.current_user_email', true));

DROP POLICY IF EXISTS "Users can update their own sessions" ON sessions;
CREATE POLICY "Users can update their own sessions" ON sessions
    FOR UPDATE USING (officer_email = current_setting('app.current_user_email', true));

DROP POLICY IF EXISTS "Users can view their own conversations" ON conversations;
CREATE POLICY "Users can view their own conversations" ON conversations
    FOR SELECT USING (officer_email = current_setting('app.current_user_email', true));

DROP POLICY IF EXISTS "Users can create their own conversations" ON conversations;
CREATE POLICY "Users can create their own conversations" ON conversations
    FOR INSERT WITH CHECK (officer_email = current_setting('app.current_user_email', true));

DROP POLICY IF EXISTS "Users can update their own conversations" ON conversations;
CREATE POLICY "Users can update their own conversations" ON conversations
    FOR UPDATE USING (officer_email = current_setting('app.current_user_email', true));

DROP POLICY IF EXISTS "Service role can manage jobs" ON jobs;
CREATE POLICY "Service role can manage jobs" ON jobs
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view their own audio files" ON audio_files;
CREATE POLICY "Users can view their own audio files" ON audio_files
    FOR SELECT USING (
        session_id IN (
            SELECT id FROM sessions WHERE officer_email = current_setting('app.current_user_email', true)
        )
    );

DROP POLICY IF EXISTS "Service role can manage audio files" ON audio_files;
CREATE POLICY "Service role can manage audio files" ON audio_files
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view their own analytics" ON analytics;
CREATE POLICY "Users can view their own analytics" ON analytics
    FOR SELECT USING (
        session_id IN (
            SELECT id FROM sessions WHERE officer_email = current_setting('app.current_user_email', true)
        )
    );

DROP POLICY IF EXISTS "Service role can manage analytics" ON analytics;
CREATE POLICY "Service role can manage analytics" ON analytics
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage cost tracking" ON cost_tracking;
CREATE POLICY "Service role can manage cost tracking" ON cost_tracking
    FOR ALL USING (auth.role() = 'service_role');
