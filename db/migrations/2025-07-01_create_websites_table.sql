create table public.websites (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  business_name character varying(255) not null,
  slug character varying(255) null,
  theme_colors jsonb null default '{"accent": "#F59E0B", "primary": "#3B82F6", "secondary": "#1F2937"}'::jsonb,
  social_media jsonb null default '{"tiktok": "", "facebook": "", "whatsapp": "", "instagram": ""}'::jsonb,
  is_published boolean null default false,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  business_description text null,
  main_video jsonb null default '{"url": "", "file": null, "previewUrl": null}'::jsonb,
  sections jsonb null default '[]'::jsonb,
  constraint websites_pkey primary key (id),
  constraint websites_slug_key unique (slug),
  constraint websites_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_websites_slug on public.websites using btree (slug) TABLESPACE pg_default;

create index IF not exists idx_websites_user_id on public.websites using btree (user_id) TABLESPACE pg_default;

create trigger update_websites_updated_at BEFORE
update on websites for EACH row
execute FUNCTION update_updated_at_column ();