begin;

-- 1) Extend project_billing to carry per-project entitlement state (no Stripe yet)

alter table public.project_billing
  add column if not exists plan text not null default 'free',
  add column if not exists status text not null default 'inactive',
  add column if not exists trial_used_at timestamptz null,
  add column if not exists trial_starts_at timestamptz null,
  add column if not exists trial_ends_at timestamptz null,
  add column if not exists current_period_start timestamptz null,
  add column if not exists current_period_end timestamptz null,
  add column if not exists stripe_customer_id text null,
  add column if not exists stripe_subscription_id text null;

-- 2) Guardrails (simple enums via CHECK constraints)

alter table public.project_billing
  add constraint project_billing_plan_check
  check (plan in ('free','pro'));

alter table public.project_billing
  add constraint project_billing_status_check
  check (status in ('inactive','trialing','active','past_due','canceled'));

alter table public.project_billing
  add constraint project_billing_trial_window_check
  check (
    (trial_starts_at is null and trial_ends_at is null)
    or
    (trial_starts_at is not null and trial_ends_at is not null and trial_ends_at > trial_starts_at)
  );

alter table public.project_billing
  add constraint project_billing_period_window_check
  check (
    (current_period_start is null and current_period_end is null)
    or
    (current_period_start is not null and current_period_end is not null and current_period_end > current_period_start)
  );

-- 3) Helper: compute whether a project is currently Pro-entitled.
create or replace function public.is_project_pro(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $function$
  select exists (
    select 1
    from public.project_billing pb
    where pb.project_id = p_project_id
      and pb.plan = 'pro'
      and (
        (pb.status = 'trialing' and pb.trial_ends_at is not null and pb.trial_ends_at > now())
        or
        (pb.status = 'active' and (pb.current_period_end is null or pb.current_period_end > now()))
      )
  );
$function$;

revoke all on function public.is_project_pro(uuid) from public;
grant execute on function public.is_project_pro(uuid) to authenticated;

-- 4) Owner-only function: start a 14-day trial (one-time per project)
create or replace function public.start_project_pro_trial(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
set row_security to 'off'
as $$
declare
  v_trial_used_at timestamptz;
begin
  if not public.is_project_owner(p_project_id) then
    raise exception 'only the project owner can start a trial';
  end if;

  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.archived_at is null
  ) then
    raise exception 'project not found or archived';
  end if;

  -- Ensure billing row exists
  insert into public.project_billing (project_id, billing_owner_user_id)
  values (p_project_id, auth.uid())
  on conflict (project_id) do nothing;

  -- Enforce one trial per project ever
  select pb.trial_used_at
    into v_trial_used_at
  from public.project_billing pb
  where pb.project_id = p_project_id;

  if v_trial_used_at is not null then
    raise exception 'trial already used for this project';
  end if;

  update public.project_billing
  set
    billing_owner_user_id = coalesce(billing_owner_user_id, auth.uid()),
    plan = 'pro',
    status = 'trialing',
    trial_used_at = now(),
    trial_starts_at = now(),
    trial_ends_at = now() + interval '14 days',
    current_period_start = null,
    current_period_end = null
  where project_id = p_project_id;

end;
$$;

revoke all on function public.start_project_pro_trial(uuid) from public;
grant execute on function public.start_project_pro_trial(uuid) to authenticated;

commit;