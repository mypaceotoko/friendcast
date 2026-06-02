alter table public.invites
add column if not exists hidden_at timestamptz;

create index if not exists invites_inviter_id_hidden_at_idx
on public.invites (inviter_id, hidden_at);

drop policy if exists "invites_update_mvp" on public.invites;
drop policy if exists "invites_update_own" on public.invites;
drop policy if exists "invites_use_active" on public.invites;

create policy "invites_update_own" on public.invites
for update to authenticated
using (auth.uid() = inviter_id)
with check (
  auth.uid() = inviter_id
  and inviter_id = (select inviter_id from public.invites as i where i.id = invites.id)
  and code = (select code from public.invites as i where i.id = invites.id)
  and used_by is not distinct from (select used_by from public.invites as i where i.id = invites.id)
  and used_at is not distinct from (select used_at from public.invites as i where i.id = invites.id)
);

create policy "invites_use_active" on public.invites
for update to authenticated
using (
  auth.uid() <> inviter_id
  and status = 'active'
  and used_by is null
)
with check (
  auth.uid() <> inviter_id
  and status = 'used'
  and used_by = auth.uid()
  and used_at is not null
  and inviter_id = (select inviter_id from public.invites as i where i.id = invites.id)
  and code = (select code from public.invites as i where i.id = invites.id)
  and hidden_at is not distinct from (select hidden_at from public.invites as i where i.id = invites.id)
);
