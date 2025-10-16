-- =========================================================
-- 0) Extensiones necesarias
-- =========================================================
create extension if not exists pgcrypto;

-- =========================================================
-- 1) Tablas (crea si no existen)
-- =========================================================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  color text default 'blue',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.leads_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text default '',
  message text default '',
  avatar_url text,
  column_id uuid not null references public.leads(id) on delete cascade,
  conversation_id text,                    -- JID de WhatsApp (ej: 346XXXXXXXX@s.whatsapp.net)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =========================================================
-- 2) Correcciones de columnas existentes (si venías de otra versión)
-- =========================================================
do $$
begin
  -- leads.tittle -> leads.title
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='leads' and column_name='tittle'
  ) then
    alter table public.leads rename column tittle to title;
  end if;

  -- leads_contacts."columnId" -> column_id
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='leads_contacts' and column_name='columnId'
  ) then
    alter table public.leads_contacts rename column "columnId" to column_id;
  end if;

  -- leads_contacts."conversationId" -> conversation_id
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='leads_contacts' and column_name='conversationId'
  ) then
    alter table public.leads_contacts rename column "conversationId" to conversation_id;
  end if;
exception
  when others then
    null;
end $$;

-- =========================================================
-- 3) Índices y constraints de performance/consistencia
-- =========================================================
create index if not exists idx_leads_user                    on public.leads(user_id);
create index if not exists idx_leads_contacts_user           on public.leads_contacts(user_id);
create index if not exists idx_leads_contacts_column         on public.leads_contacts(column_id);
create index if not exists idx_leads_contacts_conversation   on public.leads_contacts(conversation_id);
create index if not exists idx_conv_user_external            on public.conversations_new(user_id, external_id);

-- Evita duplicados del mismo chat como lead por usuario
do $$
begin
  alter table public.leads_contacts
    add constraint leads_contacts_unique_conv unique (user_id, conversation_id);
exception
  when duplicate_table then null;
  when duplicate_object then null;
  when others then
    -- Si falla por duplicados previos, limpia antes o elimina esta parte.
    null;
end $$;

-- (Opcional) Evita columnas duplicadas por usuario con mismo título
do $$
begin
  alter table public.leads
    add constraint leads_owner_title_unique unique (user_id, title);
exception
  when duplicate_object then null;
  when others then null;
end $$;

-- =========================================================
-- 4) Trigger para updated_at
-- =========================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
before update on public.leads
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_leads_contacts_updated_at on public.leads_contacts;
create trigger trg_leads_contacts_updated_at
before update on public.leads_contacts
for each row execute procedure public.set_updated_at();

-- =========================================================
-- 5) RLS activado + políticas por operación
-- =========================================================
alter table public.leads          enable row level security;
alter table public.leads_contacts enable row level security;

-- Limpia políticas antiguas si las hubiera (opcional)
-- drop policy if exists "Users can manage own leads" on public.leads;
-- drop policy if exists "Users can manage own leads_contacts" on public.leads_contacts;

-- LEADS
create policy leads_select on public.leads
  for select using (auth.uid() = user_id);

create policy leads_insert on public.leads
  for insert with check (auth.uid() = user_id);

create policy leads_update on public.leads
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy leads_delete on public.leads
  for delete using (auth.uid() = user_id);

-- LEADS_CONTACTS
create policy leads_contacts_select on public.leads_contacts
  for select using (auth.uid() = user_id);

create policy leads_contacts_insert on public.leads_contacts
  for insert with check (auth.uid() = user_id);

create policy leads_contacts_update on public.leads_contacts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy leads_contacts_delete on public.leads_contacts
  for delete using (auth.uid() = user_id);

-- =========================================================
-- 6) (Opcional) Crea una columna por defecto si no existe para cada usuario
--    Mejor hazlo "on demand" en el endpoint; si igual lo quieres masivo:
-- =========================================================
-- insert into public.leads (user_id, title, color)
-- select id as user_id, 'Nuevos Contactos', 'blue'
-- from auth.users u
-- where not exists (select 1 from public.leads l where l.user_id = u.id)
-- on conflict do nothing;
