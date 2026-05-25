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

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

create table if not exists public.close_friends (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_id),
  constraint close_friends_no_self check (owner_id <> friend_id)
);

create table if not exists public.post_recipients (
  post_id uuid not null references public.posts(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, recipient_id)
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active',
  constraint invites_status_check check (status in ('active','used','expired','revoked'))
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_body_length check (char_length(body) between 1 and 140)
);

create table if not exists public.post_reposts (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_audio_assets_post_id on public.audio_assets(post_id);
create index if not exists idx_audio_assets_owner_id on public.audio_assets(owner_id);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.audio_assets enable row level security;
alter table public.follows enable row level security;
alter table public.close_friends enable row level security;
alter table public.post_recipients enable row level security;
alter table public.comments enable row level security;
alter table public.post_reposts enable row level security;
alter table public.post_likes enable row level security;
alter table public.invites enable row level security;

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

drop policy if exists "follows_select_authenticated" on public.follows;
drop policy if exists "follows_insert_own" on public.follows;
drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_select_authenticated" on public.follows for select to authenticated using (true);
create policy "follows_insert_own" on public.follows for insert to authenticated with check (auth.uid() = follower_id);
create policy "follows_delete_own" on public.follows for delete to authenticated using (auth.uid() = follower_id);

drop policy if exists "close_friends_select_owner_or_friend" on public.close_friends;
drop policy if exists "close_friends_insert_own" on public.close_friends;
drop policy if exists "close_friends_delete_own" on public.close_friends;
drop policy if exists "post_recipients_select_related" on public.post_recipients;
drop policy if exists "post_recipients_insert_owner" on public.post_recipients;
drop policy if exists "post_recipients_delete_owner" on public.post_recipients;
drop policy if exists "comments_select_authenticated" on public.comments;
drop policy if exists "comments_insert_own" on public.comments;
drop policy if exists "comments_delete_own" on public.comments;
drop policy if exists "post_reposts_select_authenticated" on public.post_reposts;
drop policy if exists "post_reposts_insert_own" on public.post_reposts;
drop policy if exists "post_reposts_delete_own" on public.post_reposts;
drop policy if exists "post_likes_select_authenticated" on public.post_likes;
drop policy if exists "post_likes_insert_own" on public.post_likes;
drop policy if exists "post_likes_delete_own" on public.post_likes;
create policy "close_friends_select_owner_or_friend" on public.close_friends for select to authenticated
using (auth.uid() = owner_id or auth.uid() = friend_id);
create policy "close_friends_insert_own" on public.close_friends for insert to authenticated
with check (auth.uid() = owner_id);
create policy "close_friends_delete_own" on public.close_friends for delete to authenticated
using (auth.uid() = owner_id);

create policy "post_recipients_select_related" on public.post_recipients
for select to authenticated
using (
  recipient_id = auth.uid()
  or exists (
    select 1 from public.posts
    where posts.id = post_recipients.post_id
      and posts.user_id = auth.uid()
  )
);

create policy "post_recipients_insert_owner" on public.post_recipients
for insert to authenticated
with check (
  exists (
    select 1 from public.posts
    where posts.id = post_recipients.post_id
      and posts.user_id = auth.uid()
  )
);

create policy "post_recipients_delete_owner" on public.post_recipients
for delete to authenticated
using (
  exists (
    select 1 from public.posts
    where posts.id = post_recipients.post_id
      and posts.user_id = auth.uid()
  )
);

create policy "comments_select_authenticated" on public.comments
for select to authenticated
using (true);

create policy "comments_insert_own" on public.comments
for insert to authenticated
with check (auth.uid() = user_id);

create policy "comments_delete_own" on public.comments
for delete to authenticated
using (auth.uid() = user_id);


create policy "post_reposts_select_authenticated" on public.post_reposts
for select to authenticated
using (true);

create policy "post_reposts_insert_own" on public.post_reposts
for insert to authenticated
with check (auth.uid() = user_id);

create policy "post_reposts_delete_own" on public.post_reposts
for delete to authenticated
using (auth.uid() = user_id);

create policy "post_likes_select_authenticated" on public.post_likes
for select to authenticated
using (true);

create policy "post_likes_insert_own" on public.post_likes
for insert to authenticated
with check (auth.uid() = user_id);

create policy "post_likes_delete_own" on public.post_likes
for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, update, delete on public.audio_assets to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, insert, delete on public.close_friends to authenticated;
grant select, insert, delete on public.post_recipients to authenticated;
grant select, insert, delete on public.comments to authenticated;
grant select, insert, delete on public.post_reposts to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, update on public.invites to authenticated;


drop policy if exists "invites_select_authenticated" on public.invites;
drop policy if exists "invites_insert_own" on public.invites;
drop policy if exists "invites_update_mvp" on public.invites;
create policy "invites_select_authenticated" on public.invites
for select to authenticated
using (true);
create policy "invites_insert_own" on public.invites
for insert to authenticated
with check (auth.uid() = inviter_id);
create policy "invites_update_mvp" on public.invites
for update to authenticated
using (true)
with check (
  inviter_id = (select inviter_id from public.invites as i where i.id = invites.id)
  and code = (select code from public.invites as i where i.id = invites.id)
);


-- Storage bucket/policies (run in Supabase SQL editor)
insert into storage.buckets (id, name, public)
values ('voice-posts', 'voice-posts', false)
on conflict (id) do nothing;

drop policy if exists "voice_posts_upload_own" on storage.objects;
drop policy if exists "voice_posts_select_authenticated_mvp" on storage.objects;
drop policy if exists "voice_posts_delete_own" on storage.objects;

create policy "voice_posts_upload_own" on storage.objects for insert to authenticated
with check (bucket_id = 'voice-posts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "voice_posts_select_authenticated_mvp" on storage.objects for select to authenticated
using (bucket_id = 'voice-posts');

create policy "voice_posts_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'voice-posts' and (storage.foldername(name))[1] = auth.uid()::text);


insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_select_authenticated" on storage.objects;
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;

create policy "avatars_select_authenticated" on storage.objects for select to authenticated
using (bucket_id = 'avatars');

create policy "avatars_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_update_own" on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
