-- Redeem invite codes server-side so invite-based connections can safely create
-- both follow directions without allowing clients to impersonate another user.
create or replace function public.redeem_invite_code(target_code text)
returns table (
  success boolean,
  inviter_id uuid,
  invite_status text,
  created_user_to_inviter boolean,
  created_inviter_to_user boolean,
  already_following_inviter boolean,
  already_followed_by_inviter boolean,
  mutual_following boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  normalized_code text;
  invite_record public.invites%rowtype;
  inserted_count integer;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'ログインが必要です。';
  end if;

  normalized_code := upper(trim(coalesce(target_code, '')));
  if normalized_code = '' then
    raise exception '招待コードを入力してください。';
  end if;

  select *
    into invite_record
    from public.invites
   where code = normalized_code
   for update;

  if not found then
    raise exception '招待コードが見つかりませんでした。';
  end if;

  if invite_record.inviter_id = current_user_id then
    raise exception '自分の招待コードは使用できません。';
  end if;

  if not exists (select 1 from public.profiles where id = invite_record.inviter_id) then
    raise exception '招待したユーザーが見つかりませんでした。';
  end if;

  if invite_record.status = 'revoked' then
    raise exception 'この招待コードは取り消されています。';
  end if;

  if invite_record.status = 'expired' or (invite_record.expires_at is not null and invite_record.expires_at <= now()) then
    raise exception 'この招待コードは期限切れです。';
  end if;

  if invite_record.status <> 'active' or invite_record.used_by is not null or invite_record.used_at is not null then
    raise exception 'この招待コードは使用済みです。';
  end if;

  if invite_record.hidden_at is not null then
    raise exception 'この招待コードは使用できません。';
  end if;

  already_following_inviter := exists (
    select 1
      from public.follows
     where follower_id = current_user_id
       and following_id = invite_record.inviter_id
  );
  already_followed_by_inviter := exists (
    select 1
      from public.follows
     where follower_id = invite_record.inviter_id
       and following_id = current_user_id
  );

  insert into public.follows (follower_id, following_id)
  values (current_user_id, invite_record.inviter_id)
  on conflict (follower_id, following_id) do nothing;
  get diagnostics inserted_count = row_count;
  created_user_to_inviter := inserted_count > 0;

  insert into public.follows (follower_id, following_id)
  values (invite_record.inviter_id, current_user_id)
  on conflict (follower_id, following_id) do nothing;
  get diagnostics inserted_count = row_count;
  created_inviter_to_user := inserted_count > 0;

  update public.invites
     set status = 'used',
         used_by = current_user_id,
         used_at = now()
   where id = invite_record.id;

  success := true;
  inviter_id := invite_record.inviter_id;
  invite_status := 'used';
  mutual_following := true;
  return next;
end;
$$;

revoke all on function public.redeem_invite_code(text) from public;
revoke all on function public.redeem_invite_code(text) from anon;
grant execute on function public.redeem_invite_code(text) to authenticated;
