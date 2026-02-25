begin;

-- 1) Add soft-delete column
alter table public.projects
  add column if not exists archived_at timestamptz null;

-- Helpful index for filtering active projects quickly
create index if not exists projects_archived_at_idx
  on public.projects (archived_at);

-- 2) Remove hard delete capability at DB level
-- Your current policy name from screenshot: projects_delete_owner
drop policy if exists projects_delete_owner on public.projects;

-- 3) Tighten SELECT to only return active projects
-- Your current policy name from screenshot: projects_select_owner_or_member
drop policy if exists projects_select_owner_or_member on public.projects;

create policy projects_select_owner_or_member
on public.projects
as permissive
for select
to authenticated
using (
  archived_at is null
  and (
    owner = auth.uid()
    or is_project_member(id)
  )
);

-- 4) Ensure INSERT keeps projects active (archived_at must be null)
-- Your current policy name from screenshot: projects_insert_owner
drop policy if exists projects_insert_owner on public.projects;

create policy projects_insert_owner
on public.projects
as permissive
for insert
to authenticated
with check (
  owner = auth.uid()
  and archived_at is null
);

-- 5) Add UPDATE policy to allow owner to archive (soft delete)
-- If you already have an update policy, we’ll replace it deterministically.
drop policy if exists projects_update_owner on public.projects;

create policy projects_update_owner
on public.projects
as permissive
for update
to authenticated
using (
  owner = auth.uid()
)
with check (
  owner = auth.uid()
);

commit;