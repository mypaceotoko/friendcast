create table if not exists public.post_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, post_id)
);

alter table public.post_bookmarks enable row level security;

drop policy if exists "post_bookmarks_select_own" on public.post_bookmarks;
create policy "post_bookmarks_select_own" on public.post_bookmarks
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "post_bookmarks_insert_own" on public.post_bookmarks;
create policy "post_bookmarks_insert_own" on public.post_bookmarks
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "post_bookmarks_delete_own" on public.post_bookmarks;
create policy "post_bookmarks_delete_own" on public.post_bookmarks
for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, delete on public.post_bookmarks to authenticated;
