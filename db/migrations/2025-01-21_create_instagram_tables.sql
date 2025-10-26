-- Migración para crear tablas de Instagram
-- Fecha: 2025-01-21
-- Descripción: Crear tablas necesarias para el sistema de Instagram

-- Tabla para cuentas de Instagram
CREATE TABLE IF NOT EXISTS instagram_accounts (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ig_username VARCHAR(255) NOT NULL,
    ig_user_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Tabla para mensajes de Instagram
CREATE TABLE IF NOT EXISTS instagram_messages (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id VARCHAR(255),
    recipient_username VARCHAR(255),
    text_content TEXT,
    sender_type VARCHAR(50) NOT NULL CHECK (sender_type IN ('user', 'ia', 'you')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para comentarios de Instagram
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

-- Tabla para sesiones de bot de Instagram
CREATE TABLE IF NOT EXISTS instagram_bot_sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT FALSE,
    personality_id INTEGER REFERENCES personalities(id),
    processed_messages INTEGER DEFAULT 0,
    last_response_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_instagram_messages_user_id ON instagram_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_thread_id ON instagram_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_created_at ON instagram_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_instagram_comments_user_id ON instagram_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_post_id ON instagram_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_created_at ON instagram_comments(created_at);

CREATE INDEX IF NOT EXISTS idx_instagram_bot_sessions_user_id ON instagram_bot_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_bot_sessions_is_active ON instagram_bot_sessions(is_active);

-- Comentarios para documentación
COMMENT ON TABLE instagram_accounts IS 'Cuentas de Instagram vinculadas a usuarios';
COMMENT ON TABLE instagram_messages IS 'Mensajes de Instagram (DMs)';
COMMENT ON TABLE instagram_comments IS 'Comentarios de Instagram en posts';
COMMENT ON TABLE instagram_bot_sessions IS 'Sesiones activas de bots de Instagram';

COMMENT ON COLUMN instagram_messages.sender_type IS 'Tipo de remitente: user (usuario), ia (bot), you (tú)';
COMMENT ON COLUMN instagram_bot_sessions.is_active IS 'Indica si el bot está activo para este usuario';