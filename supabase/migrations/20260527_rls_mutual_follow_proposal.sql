-- PROPOSAL ONLY (DO NOT APPLY DIRECTLY IN PRODUCTION)
-- Purpose: tighten SELECT RLS to mutual-follow model while preserving owner access.
-- This file intentionally separates "safer first" and "high risk" steps.

-- 0) Helper function for visibility decisions
create or replace function public.is_mutual_follow(viewer_id uuid, target_id uuid)
returns boolean
language sql
stable
as $$
  select
    viewer_id = target_id
    or (
      exists (
        select 1
        from public.follows f1
        where f1.follower_id = viewer_id
          and f1.following_id = target_id
      )
      and exists (
        select 1
        from public.follows f2
        where f2.follower_id = target_id
          and f2.following_id = viewer_id
      )
    );
$$;

comment on function public.is_mutual_follow(uuid, uuid)
  is 'Returns true for self or two-way follow relation.';

-- 1) SAFER FIRST: posts/comments/likes/reposts/audio_assets aligned with mutual-follow
-- posts SELECT
-- drop policy if exists "posts_select_authenticated" on public.posts;
-- create policy "posts_select_mutual_or_own" on public.posts
-- for select to authenticated
-- using (
--   auth.uid() = user_id
--   or public.is_mutual_follow(auth.uid(), user_id)
-- );

-- comments SELECT (depends on readable parent post)
-- drop policy if exists "comments_select_authenticated" on public.comments;
-- create policy "comments_select_if_parent_visible" on public.comments
-- for select to authenticated
-- using (
--   auth.uid() = user_id
--   or exists (
--     select 1 from public.posts p
--     where p.id = comments.post_id
--       and (
--         p.user_id = auth.uid()
--         or public.is_mutual_follow(auth.uid(), p.user_id)
--       )
--   )
-- );

-- post_likes SELECT (same visibility as parent post)
-- drop policy if exists "post_likes_select_authenticated" on public.post_likes;
-- create policy "post_likes_select_if_parent_visible" on public.post_likes
-- for select to authenticated
-- using (
--   auth.uid() = user_id
--   or exists (
--     select 1 from public.posts p
--     where p.id = post_likes.post_id
--       and (
--         p.user_id = auth.uid()
--         or public.is_mutual_follow(auth.uid(), p.user_id)
--       )
--   )
-- );

-- post_reposts SELECT (same visibility as parent post)
-- drop policy if exists "post_reposts_select_authenticated" on public.post_reposts;
-- create policy "post_reposts_select_if_parent_visible" on public.post_reposts
-- for select to authenticated
-- using (
--   auth.uid() = user_id
--   or exists (
--     select 1 from public.posts p
--     where p.id = post_reposts.post_id
--       and (
--         p.user_id = auth.uid()
--         or public.is_mutual_follow(auth.uid(), p.user_id)
--       )
--   )
-- );

-- audio_assets SELECT (voice metadata follows post/owner visibility)
-- drop policy if exists "audio_assets_select_authenticated" on public.audio_assets;
-- create policy "audio_assets_select_mutual_or_own" on public.audio_assets
-- for select to authenticated
-- using (
--   auth.uid() = owner_id
--   or public.is_mutual_follow(auth.uid(), owner_id)
-- );

-- 2) HIGHER RISK: profiles SELECT (can break search/discovery)
-- Option A (recommended transition): keep profiles readable, enforce privacy on posts/audio/comments.
-- Option B (strict): allow only own + mutual follow.
-- drop policy if exists "profiles_select_authenticated" on public.profiles;
-- create policy "profiles_select_mutual_or_own" on public.profiles
-- for select to authenticated
-- using (
--   auth.uid() = id
--   or public.is_mutual_follow(auth.uid(), id)
-- );

-- 3) Storage hardening idea (voice-posts currently all-authenticated read in schema.sql)
-- NOTE: storage.objects policy cannot easily reference posts without path conventions.
-- Recommendation:
--   a) keep voice-posts bucket private
--   b) stop distributing long-lived public URLs
--   c) serve short-lived signed URLs only after DB-level authorization
--   d) (future) encode post_id in storage path and validate via security-definer RPC.
