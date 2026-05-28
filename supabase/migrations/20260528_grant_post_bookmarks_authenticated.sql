-- Ensure authenticated role has minimum required privileges for post_bookmarks access.
-- RLS remains enabled and existing policies continue to enforce row-level ownership.

grant usage on schema public to authenticated;

grant select, insert, delete
on table public.post_bookmarks
to authenticated;

grant usage, select
on all sequences in schema public
to authenticated;
