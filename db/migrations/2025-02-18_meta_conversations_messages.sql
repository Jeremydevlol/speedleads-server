-- Meta (Instagram) conversations and messages - usado por metaRepo y webhook /api/meta/conversations
-- Ejecutar después de 2025-02-18_meta_connections.sql

CREATE TABLE IF NOT EXISTS public.meta_conversations (
    tenant_id UUID NOT NULL,
    ig_business_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    last_message TEXT,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, ig_business_id, sender_id)
);

CREATE TABLE IF NOT EXISTS public.meta_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    ig_business_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    mid TEXT,
    text TEXT,
    raw JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_conversations_tenant ON public.meta_conversations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_meta_conversations_last_message_at ON public.meta_conversations (tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_messages_conversation ON public.meta_messages (tenant_id, ig_business_id, sender_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_messages_dedup ON public.meta_messages (tenant_id, ig_business_id, sender_id, mid) WHERE mid IS NOT NULL;

COMMENT ON TABLE public.meta_conversations IS 'Conversaciones Instagram por tenant; usado por webhook y GET /api/meta/conversations.';
COMMENT ON TABLE public.meta_messages IS 'Mensajes Instagram; usado por webhook y GET /api/meta/conversations/:senderId/messages.';
