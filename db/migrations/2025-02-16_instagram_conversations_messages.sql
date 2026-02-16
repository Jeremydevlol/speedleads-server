-- Instagram Conversations & Messages - SpeedLeads
-- Ejecutar después de instagram_official_accounts

CREATE TABLE IF NOT EXISTS public.instagram_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    participant_name TEXT,
    participant_username TEXT,
    participant_avatar TEXT,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_group BOOLEAN DEFAULT FALSE,
    unread_count INTEGER DEFAULT 0,
    UNIQUE(user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS public.instagram_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.instagram_conversations(id) ON DELETE CASCADE,
    external_message_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    message TEXT,
    media_url TEXT,
    media_type TEXT,
    is_incoming BOOLEAN DEFAULT TRUE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(external_message_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_conversations_user_id ON public.instagram_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ig_conversations_updated_at ON public.instagram_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_messages_conversation_id ON public.instagram_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ig_messages_timestamp ON public.instagram_messages(timestamp DESC);

ALTER TABLE public.instagram_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role has full access to instagram_conversations" ON public.instagram_conversations
    FOR ALL USING ( auth.role() = 'service_role' ) WITH CHECK ( auth.role() = 'service_role' );
CREATE POLICY "Service Role has full access to instagram_messages" ON public.instagram_messages
    FOR ALL USING ( auth.role() = 'service_role' ) WITH CHECK ( auth.role() = 'service_role' );
CREATE POLICY "Users can access their own conversations" ON public.instagram_conversations
    FOR ALL USING ( auth.uid() = user_id );
CREATE POLICY "Users can access their own messages" ON public.instagram_messages
    FOR ALL USING (
        conversation_id IN ( SELECT id FROM public.instagram_conversations WHERE user_id = auth.uid() )
    );
