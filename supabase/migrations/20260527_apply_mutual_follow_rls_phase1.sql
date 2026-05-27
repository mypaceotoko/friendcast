-- Phase 1: tighten read access for content tables using mutual-follow visibility.
-- NOTE: profiles SELECT is intentionally left unchanged in this phase.
-- NOTE: follows SELECT is intentionally left unchanged in this phase.

create or replace function public.is_mutual_follow(viewer_id uuid, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when viewer_id is null or target_id is null then false
      when viewer_id = target_id then true
      else (
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
      )
    end;
$$;

comment on function public.is_mutual_follow(uuid, uuid)
  is 'True when viewer/target are same user or have two-way follow relation. Null inputs return false.';

-- posts: own posts always readable; others require mutual follow, and private posts remain owner-only.
drop policy if exists "posts_select_authenticated" on public.posts;
drop policy if exists "posts_select_mutual_or_own" on public.posts;
create policy "posts_select_mutual_or_own" on public.posts
for select to authenticated
using (
  auth.uid() = user_id
  or (
    visibility <> 'private'
    and public.is_mutual_follow(auth.uid(), user_id)
  )
);

-- comments: readable when comment is own, on own post, or parent post is readable by viewer.
drop policy if exists "comments_select_authenticated" on public.comments;
drop policy if exists "comments_select_if_parent_visible" on public.comments;
create policy "comments_select_if_parent_visible" on public.comments
for select to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.posts p
    where p.id = comments.post_id
      and (
        p.user_id = auth.uid()
        or (
          p.visibility <> 'private'
          and public.is_mutual_follow(auth.uid(), p.user_id)
        )
      )
  )
);

-- post_likes: readable when own like, or parent post is readable by viewer.
drop policy if exists "post_likes_select_authenticated" on public.post_likes;
drop policy if exists "post_likes_select_if_parent_visible" on public.post_likes;
create policy "post_likes_select_if_parent_visible" on public.post_likes
for select to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.posts p
    where p.id = post_likes.post_id
      and (
        p.user_id = auth.uid()
        or (
          p.visibility <> 'private'
          and public.is_mutual_follow(auth.uid(), p.user_id)
        )
      )
  )
);

-- post_reposts: readable when own repost, or parent post is readable by viewer.
drop policy if exists "post_reposts_select_authenticated" on public.post_reposts;
drop policy if exists "post_reposts_select_if_parent_visible" on public.post_reposts;
create policy "post_reposts_select_if_parent_visible" on public.post_reposts
for select to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.posts p
    where p.id = post_reposts.post_id
      and (
        p.user_id = auth.uid()
        or (
          p.visibility <> 'private'
          and public.is_mutual_follow(auth.uid(), p.user_id)
        )
      )
  )
);

-- audio_assets: readable when own asset, or linked post is readable by viewer.
drop policy if exists "audio_assets_select_authenticated" on public.audio_assets;
drop policy if exists "audio_assets_select_authenticated_mvp" on public.audio_assets;
drop policy if exists "audio_assets_select_mutual_or_own" on public.audio_assets;
create policy "audio_assets_select_if_parent_visible" on public.audio_assets
for select to authenticated
using (
  auth.uid() = owner_id
  or exists (
    select 1
    from public.posts p
    where p.id = audio_assets.post_id
      and (
        p.user_id = auth.uid()
        or (
          p.visibility <> 'private'
          and public.is_mutual_follow(auth.uid(), p.user_id)
        )
      )
  )
);

-- Storage audit note (no policy change in this migration):
-- storage.objects policy "voice_posts_select_authenticated_mvp" currently allows
-- any authenticated user to read bucket_id = 'voice-posts'.
-- This remains a known risk until phase 2 storage hardening.
