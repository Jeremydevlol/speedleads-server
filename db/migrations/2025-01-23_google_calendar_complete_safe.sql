-- ========================================
-- MIGRACIÓN COMPLETA GOOGLE CALENDAR (VERSIÓN SEGURA)
-- ========================================

-- Habilitar extensión pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tabla google_accounts
CREATE TABLE IF NOT EXISTS google_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expiry_date timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Tabla google_events
CREATE TABLE IF NOT EXISTS google_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  calendar_id text NOT NULL,
  event_id text NOT NULL,
  summary text,
  description text,
  location text,
  start_time timestamptz,
  end_time timestamptz,
  start_ts bigint,
  end_ts bigint,
  is_all_day boolean DEFAULT false,
  status text DEFAULT 'confirmed',
  color_id text,
  etag text,
  source text DEFAULT 'google',
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, calendar_id, event_id)
);

-- 3. Tabla google_watch_channels
CREATE TABLE IF NOT EXISTS google_watch_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  calendar_id text NOT NULL,
  channel_id text NOT NULL,
  resource_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  token text,
  expiration timestamptz,
  sync_token text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id)
);

-- 4. Tabla calendar_events_map
CREATE TABLE IF NOT EXISTS calendar_events_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  uniclick_event_id uuid,
  google_event_id text,
  calendar_id text NOT NULL,
  etag text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, google_event_id)
);

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_google_accounts_user_id ON google_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_google_events_user_calendar ON google_events (user_id, calendar_id);
CREATE INDEX IF NOT EXISTS idx_google_events_start_ts ON google_events (start_ts);
CREATE INDEX IF NOT EXISTS idx_google_events_end_ts ON google_events (end_ts);
CREATE INDEX IF NOT EXISTS idx_google_events_date_range ON google_events (user_id, start_ts, end_ts);
CREATE INDEX IF NOT EXISTS idx_google_events_last_synced ON google_events (last_synced_at);
CREATE INDEX IF NOT EXISTS idx_gwc_resource_id ON google_watch_channels(resource_id);
CREATE INDEX IF NOT EXISTS idx_gwc_user_cal ON google_watch_channels(user_id, calendar_id);
CREATE INDEX IF NOT EXISTS idx_gwc_status ON google_watch_channels(status);
CREATE INDEX IF NOT EXISTS idx_gwc_expiration ON google_watch_channels(expiration);
CREATE INDEX IF NOT EXISTS idx_calendar_events_map_user_uniclick ON calendar_events_map (user_id, uniclick_event_id);

-- 6. Función para updated_at (si no existe)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 7. Triggers (eliminar si existen antes de crear)
DROP TRIGGER IF EXISTS update_google_accounts_updated_at ON google_accounts;
CREATE TRIGGER update_google_accounts_updated_at 
    BEFORE UPDATE ON google_accounts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_google_watch_channels_updated_at ON google_watch_channels;
CREATE TRIGGER update_google_watch_channels_updated_at 
    BEFORE UPDATE ON google_watch_channels 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 8. Verificación
SELECT 'google_accounts' as table_name, count(*) as record_count FROM google_accounts
UNION ALL
SELECT 'google_events', count(*) FROM google_events
UNION ALL
SELECT 'google_watch_channels', count(*) FROM google_watch_channels
UNION ALL
SELECT 'calendar_events_map', count(*) FROM calendar_events_map;





