-- =========================================================
-- Migración: Añadir columna phone a leads_contacts
-- =========================================================

-- 1) Añadir columna phone para guardar teléfonos sin WhatsApp
ALTER TABLE public.leads_contacts 
ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2) Índice único para evitar duplicados por usuario + teléfono
CREATE UNIQUE INDEX IF NOT EXISTS leads_contacts_user_phone_uniq
ON public.leads_contacts(user_id, phone) 
WHERE phone IS NOT NULL;

-- 3) Comentarios para documentación
COMMENT ON COLUMN public.leads_contacts.phone IS 'Número de teléfono sin formato WhatsApp JID';
COMMENT ON INDEX leads_contacts_user_phone_uniq IS 'Evita duplicados de teléfono por usuario mientras no hay JID';
