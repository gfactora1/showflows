begin;

-- Safe entitlement summary for UI.
-- Returns minimal fields only; does not leak Stripe identifiers.
-- Access: project members only.

create or replace function public.get_project_entitlement(p_project_id uuid)
returns table (
  is_pro boolean,
  plan text,
  status text,
  trial_ends_at timestamptz,
  current_period_end timestamptz
)
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
  select
    public.is_project_pro(p_project_id) as is_pro,
    coalesce(pb.plan, 'free') as plan,
    coalesce(pb.status, 'inactive') as status,
    pb.trial_ends_at,
    pb.current_period_end
  from (select 1) as _x
  left join public.project_billing pb
    on pb.project_id = p_project_id
  where public.is_project_member(p_project_id);
$function$;

revoke all on function public.get_project_entitlement(uuid) from public;
grant execute on function public.get_project_entitlement(uuid) to authenticated;

commit;