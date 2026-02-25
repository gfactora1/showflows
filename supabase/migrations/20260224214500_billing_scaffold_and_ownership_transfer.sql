begin;

--------------------------------------------------------------------------------
-- 1) Billing scaffolding (no Stripe yet)
--------------------------------------------------------------------------------

create table if not exists public.project_billing (
  project_id uuid primary key references public.projects(id),
  billing_owner_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_billing enable row level security;

-- Basic updated_at trigger (safe even if you later move to a different pattern)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_project_billing_set_updated_at on public.project_billing;

create trigger trg_project_billing_set_updated_at
before update on public.project_billing
for each row execute function public.set_updated_at();

-- RLS: Only the project owner can view/manage billing scaffolding (for now).
drop policy if exists project_billing_select_owner on public.project_billing;
create policy project_billing_select_owner
on public.project_billing
as permissive
for select
to authenticated
using (
  public.is_project_owner(project_id)
);

drop policy if exists project_billing_insert_owner on public.project_billing;
create policy project_billing_insert_owner
on public.project_billing
as permissive
for insert
to authenticated
with check (
  public.is_project_owner(project_id)
);

drop policy if exists project_billing_update_owner on public.project_billing;
create policy project_billing_update_owner
on public.project_billing
as permissive
for update
to authenticated
using (
  public.is_project_owner(project_id)
)
with check (
  public.is_project_owner(project_id)
);

drop policy if exists project_billing_delete_owner on public.project_billing;
create policy project_billing_delete_owner
on public.project_billing
as permissive
for delete
to authenticated
using (
  public.is_project_owner(project_id)
);

--------------------------------------------------------------------------------
-- 2) Tighten: Editors/admins cannot create or promote owner via normal member mgmt
--    (Owner role is reserved for controlled operations like ownership transfer.)
--------------------------------------------------------------------------------

-- Ensure inserts by admins cannot create an 'owner' role.
-- Keep the same policy name you already have: pm_insert_admin
-- We replace deterministically.

drop policy if exists pm_insert_admin on public.project_members;

create policy pm_insert_admin
on public.project_members
as permissive
for insert
to authenticated
with check (
  public.is_project_admin(project_id)
  and role <> 'owner'
);

-- Ensure updates by admins cannot set role to 'owner' nor modify existing owners.
-- Keep same policy name: pm_update_admin

drop policy if exists pm_update_admin on public.project_members;

create policy pm_update_admin
on public.project_members
as permissive
for update
to authenticated
using (
  public.is_project_admin(project_id)
  and role <> 'owner'
)
with check (
  public.is_project_admin(project_id)
  and role <> 'owner'
);

--------------------------------------------------------------------------------
-- 3) Ownership transfer (atomic, DB-enforced, minimal surface area)
--------------------------------------------------------------------------------
-- Rules:
-- - Only current project owner can initiate.
-- - New owner must already be a member by email (canonical).
-- - New owner must have an auth account (auth.users lookup).
-- - Project must not be archived (soft delete).
-- - Prior owner is downgraded to editor (default D).
-- - Only this function can assign role='owner'.

create or replace function public.transfer_project_ownership(
  p_project_id uuid,
  p_new_owner_email text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
declare
  v_new_email text;
  v_new_owner_uid uuid;
  v_old_owner_uid uuid;
  v_old_owner_email text;
  v_archived_at timestamptz;
begin
  -- Normalize and validate input email
  v_new_email := lower(trim(coalesce(p_new_owner_email, '')));
  if v_new_email = '' then
    raise exception 'new owner email is required';
  end if;

  -- Lock project row and verify caller is current owner
  select owner, archived_at
    into v_old_owner_uid, v_archived_at
  from public.projects
  where id = p_project_id
  for update;

  if not found then
    raise exception 'project not found';
  end if;

  if v_archived_at is not null then
    raise exception 'cannot transfer ownership of an archived project';
  end if;

  if v_old_owner_uid <> auth.uid() then
    raise exception 'only the current owner can transfer ownership';
  end if;

  -- Verify target is already a member by email (canonical identity)
  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and lower(pm.member_email) = v_new_email
  ) then
    raise exception 'new owner must already be a project member (by email)';
  end if;

  -- Map email -> auth user id (must have an account)
  select u.id
    into v_new_owner_uid
  from auth.users u
  where lower(u.email) = v_new_email
  limit 1;

  if v_new_owner_uid is null then
    raise exception 'new owner must have a ShowFlows account (auth user not found for email)';
  end if;

  -- Get old owner's email (for role downgrade)
  select u.email
    into v_old_owner_email
  from auth.users u
  where u.id = v_old_owner_uid
  limit 1;

  v_old_owner_email := lower(coalesce(v_old_owner_email, ''));

  -- Assign new owner UUID on project
  update public.projects
  set owner = v_new_owner_uid
  where id = p_project_id;

  -- Ensure the new owner's membership row is owner
  update public.project_members
  set role = 'owner',
      member_user_id = v_new_owner_uid
  where project_id = p_project_id
    and lower(member_email) = v_new_email;

  -- Downgrade prior owner to editor (default D) if we can resolve their email.
  -- If old owner email is empty for some reason, we skip safely.
  if v_old_owner_email <> '' then
    -- If old owner has a membership row, downgrade it.
    update public.project_members
    set role = 'editor',
        member_user_id = v_old_owner_uid
    where project_id = p_project_id
      and lower(member_email) = v_old_owner_email
      and role = 'owner';

    -- If old owner somehow lacks a membership row, insert one as editor.
    insert into public.project_members (project_id, member_email, role, is_managed, member_user_id)
    select p_project_id, v_old_owner_email, 'editor', false, v_old_owner_uid
    where not exists (
      select 1
      from public.project_members pm
      where pm.project_id = p_project_id
        and lower(pm.member_email) = v_old_owner_email
    );
  end if;

end;
$$;

revoke all on function public.transfer_project_ownership(uuid, text) from public;
grant execute on function public.transfer_project_ownership(uuid, text) to authenticated;

commit;