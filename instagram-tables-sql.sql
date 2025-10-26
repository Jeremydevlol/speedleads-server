-- SQL para crear tablas de Instagram en Supabase
-- Ejecutar este SQL en el SQL Editor de Supabase

-- 1. Tabla para cuentas de Instagram
CREATE TABLE IF NOT EXISTS instagram_accounts (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ig_username VARCHAR(255) NOT NULL,
    ig_user_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 2. Tabla para mensajes de Instagram
CREATE TABLE IF NOT EXISTS instagram_messages (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id VARCHAR(255),
    recipient_username VARCHAR(255),
    text_content TEXT,
    sender_type VARCHAR(50) NOT NULL CHECK (sender_type IN ('user', 'ia', 'you')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabla para comentarios de Instagram
CREATE TABLE IF NOT EXISTS instagram_comments (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id VARCHAR(255) NOT NULL,
    comment_id VARCHAR(255) NOT NULL,
    author_name VARCHAR(255),
    username VARCHAR(255),
    author_avatar TEXT,
    comment_text TEXT,
    post_caption TEXT,
    post_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, comment_id)
);

-- 4. Tabla para sesiones de bot de Instagram
CREATE TABLE IF NOT EXISTS instagram_bot_sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT FALSE,
    personality_id INTEGER,
    processed_messages INTEGER DEFAULT 0,
    last_response_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 5. Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_instagram_messages_user_id ON instagram_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_thread_id ON instagram_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_created_at ON instagram_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_instagram_comments_user_id ON instagram_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_post_id ON instagram_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_created_at ON instagram_comments(created_at);

CREATE INDEX IF NOT EXISTS idx_instagram_bot_sessions_user_id ON instagram_bot_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_bot_sessions_is_active ON instagram_bot_sessions(is_active);

-- 6. Comentarios para documentación
COMMENT ON TABLE instagram_accounts IS 'Cuentas de Instagram vinculadas a usuarios';
COMMENT ON TABLE instagram_messages IS 'Mensajes de Instagram (DMs)';
COMMENT ON TABLE instagram_comments IS 'Comentarios de Instagram en posts';
COMMENT ON TABLE instagram_bot_sessions IS 'Sesiones activas de bots de Instagram';

COMMENT ON COLUMN instagram_messages.sender_type IS 'Tipo de remitente: user (usuario), ia (bot), you (tú)';
COMMENT ON COLUMN instagram_bot_sessions.is_active IS 'Indica si el bot está activo para este usuario';

-- 7. Habilitar RLS (Row Level Security)
ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_bot_sessions ENABLE ROW LEVEL SECURITY;

-- 8. Políticas RLS para que los usuarios solo vean sus propios datos
CREATE POLICY "Users can view their own instagram accounts" ON instagram_accounts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own instagram accounts" ON instagram_accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own instagram accounts" ON instagram_accounts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own instagram messages" ON instagram_messages
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own instagram messages" ON instagram_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own instagram comments" ON instagram_comments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own instagram comments" ON instagram_comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own instagram bot sessions" ON instagram_bot_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own instagram bot sessions" ON instagram_bot_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own instagram bot sessions" ON instagram_bot_sessions
    FOR UPDATE USING (auth.uid() = user_id);

