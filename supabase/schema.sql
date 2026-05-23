-- friendcast v0.3: profiles table (minimum setup)
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
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.handle_updated_at();

alter table public.profiles enable row level security;

-- 最低限のRLS方針:
-- 1) ログインユーザーは自分のprofileのみ参照可能
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

-- 2) ログインユーザーは自分のprofileのみinsert可能
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

-- 3) ログインユーザーは自分のprofileのみupdate可能
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
