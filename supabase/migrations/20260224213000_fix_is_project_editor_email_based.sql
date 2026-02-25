begin;

-- Align editor check to canonical email identity.
-- This prevents privilege loss when member_user_id is not populated yet.
create or replace function public.is_project_editor(p_project_id uuid)
returns boolean
language sql
stable
as $function$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and lower(pm.member_email) = lower(nullif(coalesce(auth.jwt() ->> 'email', ''), ''))
      and pm.role = 'editor'
  );
$function$;

-- is_project_admin depends on is_project_owner OR is_project_editor, so it auto-aligns.

commit;