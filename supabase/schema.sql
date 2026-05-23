-- friendcast v0.5: audio MVP schema
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  text varchar(140) not null default '',
  visibility text not null check (visibility in ('followers','close_friends','specific','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts add column if not exists kind text not null default 'text';
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind in ('text','audio','text_audio'));

create table if not exists public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  storage_bucket text not null default 'voice-posts',
  storage_path text not null,
  mime_type text,
  duration_ms integer,
  size_bytes integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_audio_assets_post_id on public.audio_assets(post_id);
create index if not exists idx_audio_assets_owner_id on public.audio_assets(owner_id);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.audio_assets enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (true);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "posts_select_authenticated" on public.posts;
drop policy if exists "posts_insert_own" on public.posts;
drop policy if exists "posts_update_own" on public.posts;
drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_select_authenticated" on public.posts for select to authenticated using (true);
create policy "posts_insert_own" on public.posts for insert to authenticated with check (auth.uid() = user_id);
create policy "posts_update_own" on public.posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "posts_delete_own" on public.posts for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "audio_assets_select_authenticated_mvp" on public.audio_assets;
drop policy if exists "audio_assets_select_authenticated" on public.audio_assets;
drop policy if exists "audio_assets_insert_own" on public.audio_assets;
drop policy if exists "audio_assets_update_own" on public.audio_assets;
drop policy if exists "audio_assets_delete_own" on public.audio_assets;
create policy "audio_assets_select_authenticated" on public.audio_assets for select to authenticated using (true);
create policy "audio_assets_insert_own" on public.audio_assets for insert to authenticated with check (auth.uid() = owner_id);
create policy "audio_assets_update_own" on public.audio_assets for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "audio_assets_delete_own" on public.audio_assets for delete to authenticated using (auth.uid() = owner_id);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, update, delete on public.audio_assets to authenticated;

-- Storage bucket/policies (run in Supabase SQL editor)
insert into storage.buckets (id, name, public)
values ('voice-posts', 'voice-posts', false)
on conflict (id) do nothing;

drop policy if exists "voice_posts_upload_own" on storage.objects;
drop policy if exists "voice_posts_select_authenticated_mvp" on storage.objects;

create policy "voice_posts_upload_own" on storage.objects for insert to authenticated
with check (bucket_id = 'voice-posts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "voice_posts_select_authenticated_mvp" on storage.objects for select to authenticated
using (bucket_id = 'voice-posts');
