-- Migración para crear tabla de estadísticas de envío masivo
-- Fecha: 2025-12-10
-- Descripción: Guardar estadísticas de éxito/error en envíos masivos de Instagram

-- Tabla para estadísticas de envío masivo
CREATE TABLE IF NOT EXISTS instagram_bulk_send_stats (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ig_account VARCHAR(255) NOT NULL,          -- Cuenta de Instagram que envía
    recipient_username VARCHAR(255) NOT NULL,   -- Usuario destino
    recipient_id VARCHAR(255),                  -- ID de Instagram del destino
    message_preview TEXT,                       -- Primeros 100 caracteres del mensaje
    status VARCHAR(50) NOT NULL CHECK (status IN ('sent', 'failed', 'blocked', 'rate_limited')),
    error_code VARCHAR(100),                    -- Código de error (403, 429, etc)
    error_type VARCHAR(100),                    -- Tipo: new_account, rate_limit, spam_detected, etc
    error_message TEXT,                         -- Mensaje completo del error
    bulk_type VARCHAR(50),                      -- Tipo: followers, likers, commenters, list
    source_post_url TEXT,                       -- URL del post origen (si aplica)
    ai_generated BOOLEAN DEFAULT FALSE,         -- Si el mensaje fue generado por IA
    personality_id INTEGER,                     -- ID de personalidad usada
    attempt_number INTEGER DEFAULT 1,           -- Número de intento
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla resumen de campañas de envío masivo
CREATE TABLE IF NOT EXISTS instagram_bulk_campaigns (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ig_account VARCHAR(255) NOT NULL,
    campaign_type VARCHAR(50) NOT NULL,        -- followers, likers, commenters, list
    source_post_url TEXT,
    total_targets INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    blocked_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'stopped', 'error')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_summary JSONB                         -- Resumen de errores por tipo
);

-- Índices para optimizar consultas de admin
CREATE INDEX IF NOT EXISTS idx_bulk_stats_user_id ON instagram_bulk_send_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_stats_status ON instagram_bulk_send_stats(status);
CREATE INDEX IF NOT EXISTS idx_bulk_stats_created_at ON instagram_bulk_send_stats(created_at);
CREATE INDEX IF NOT EXISTS idx_bulk_stats_ig_account ON instagram_bulk_send_stats(ig_account);
CREATE INDEX IF NOT EXISTS idx_bulk_stats_error_type ON instagram_bulk_send_stats(error_type);

CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_user_id ON instagram_bulk_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_status ON instagram_bulk_campaigns(status);

-- Vista para estadísticas rápidas de admin
CREATE OR REPLACE VIEW v_bulk_send_summary AS
SELECT 
    user_id,
    ig_account,
    DATE(created_at) as date,
    COUNT(*) as total_attempts,
    SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
    SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
    SUM(CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END) as rate_limited,
    ROUND(100.0 * SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as success_rate
FROM instagram_bulk_send_stats
GROUP BY user_id, ig_account, DATE(created_at)
ORDER BY date DESC;

-- Vista de errores por tipo para admin
CREATE OR REPLACE VIEW v_bulk_errors_by_type AS
SELECT 
    error_type,
    error_code,
    COUNT(*) as count,
    MAX(error_message) as sample_message,
    MAX(created_at) as last_occurrence
FROM instagram_bulk_send_stats
WHERE status != 'sent'
GROUP BY error_type, error_code
ORDER BY count DESC;

COMMENT ON TABLE instagram_bulk_send_stats IS 'Estadísticas detalladas de cada intento de envío masivo';
COMMENT ON TABLE instagram_bulk_campaigns IS 'Campañas de envío masivo (resumen por lote)';
