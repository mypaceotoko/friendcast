-- Add an opt-out flag for appearing in user search and friend suggestions.
alter table public.profiles
add column if not exists is_discoverable boolean not null default true;
