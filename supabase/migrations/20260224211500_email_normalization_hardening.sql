begin;

-- 0) Normalize existing data (safe no-ops if already normalized)
update public.project_members
set member_email = lower(member_email)
where member_email is not null and member_email <> lower(member_email);

update public.project_invites
set invited_email = lower(invited_email)
where invited_email is not null and invited_email <> lower(invited_email);

-- 1) Add constraints to prevent empty or mixed-case emails going forward
-- NOTE: These will fail if there are any bad rows. The updates above should fix case,
-- but empty strings must not exist. If they do, fix manually before applying constraints.

alter table public.project_members
  add constraint project_members_member_email_not_empty
  check (member_email is not null and length(trim(member_email)) > 0);

alter table public.project_members
  add constraint project_members_member_email_lowercase
  check (member_email = lower(member_email));

alter table public.project_invites
  add constraint project_invites_invited_email_not_empty
  check (invited_email is not null and length(trim(invited_email)) > 0);

alter table public.project_invites
  add constraint project_invites_invited_email_lowercase
  check (invited_email = lower(invited_email));

-- 2) Fix helper function to be case-safe and avoid empty-email matching
create or replace function public.is_project_member(pid uuid)
returns boolean
language sql
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = pid
      and lower(pm.member_email) = lower(nullif(coalesce(auth.jwt() ->> 'email', ''), ''))
  );
$function$;

commit;