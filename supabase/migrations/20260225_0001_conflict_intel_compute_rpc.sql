-- ============================================================
-- ShowFlows – Conflict Intelligence Engine
-- Pro Compute RPC (SECURITY DEFINER)
-- Phase 1: time overlap, missing required roles, missing provider
-- ============================================================

-- This function assumes these helper functions already exist:
--   public.is_project_owner(uuid) returns boolean
--   public.is_project_editor(uuid) returns boolean
--   public.is_project_pro(uuid) returns boolean

-- ------------------------------------------------------------
-- 1) Idempotency index for compute runs
-- ------------------------------------------------------------
-- NOTE: We intentionally require non-null range_start/range_end in the RPC,
-- so uniqueness is reliable.
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'conflict_compute_runs_unique_key'
  ) then
    execute '
      create unique index conflict_compute_runs_unique_key
      on public.conflict_compute_runs (project_id, computed_version, range_start, range_end)
    ';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 2) SECURITY DEFINER RPC
-- ------------------------------------------------------------
create or replace function public.compute_conflicts_pro(
  p_project_id uuid,
  p_range_start timestamptz,
  p_range_end   timestamptz,
  p_computed_version integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_run_id uuid;
begin
  -- -----------------------------
  -- Validate inputs
  -- -----------------------------
  if p_project_id is null then
    raise exception 'project_id is required';
  end if;

  if p_range_start is null or p_range_end is null then
    raise exception 'range_start and range_end are required';
  end if;

  if p_range_start >= p_range_end then
    raise exception 'range_start must be < range_end';
  end if;

  -- -----------------------------
  -- Auth
  -- -----------------------------
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- -----------------------------
  -- Authorization: owner/editor
  -- -----------------------------
  if not (public.is_project_owner(p_project_id) or public.is_project_editor(p_project_id)) then
    raise exception 'Access denied (owner/editor only)';
  end if;

  -- -----------------------------
  -- Pro gating
  -- -----------------------------
  if not public.is_project_pro(p_project_id) then
    raise exception 'Conflict Intelligence is a Pro feature';
  end if;

  -- -----------------------------
  -- Create/upsert compute run (history + idempotent key)
  -- -----------------------------
  insert into public.conflict_compute_runs (
    project_id,
    computed_version,
    range_start,
    range_end,
    status,
    computed_at,
    created_by_user_id,
    meta
  )
  values (
    p_project_id,
    p_computed_version,
    p_range_start,
    p_range_end,
    'completed',
    now(),
    v_user_id,
    '{}'::jsonb
  )
  on conflict (project_id, computed_version, range_start, range_end)
  do update set
    status = 'completed',
    computed_at = excluded.computed_at,
    created_by_user_id = excluded.created_by_user_id
  returning id into v_run_id;

  -- -----------------------------
  -- Clear prior results for this run (idempotent)
  -- -----------------------------
  delete from public.computed_conflicts
  where project_id = p_project_id
    and run_id = v_run_id;

  -- ============================================================
  -- Phase 1 computations
  -- ============================================================

  -- ------------------------------------------------------------
  -- A) Person double-booked across overlapping shows (same project)
  --   shows: starts_at, ends_at (both NOT NULL)
  -- ------------------------------------------------------------
  insert into public.computed_conflicts (
    project_id,
    run_id,
    conflict_type,
    severity,
    show_id,
    other_show_id,
    person_id,
    role_id,
    title,
    detail,
    created_at
  )
  with window_shows as (
    select s.id, s.starts_at, s.ends_at
    from public.shows s
    where s.project_id = p_project_id
      and s.starts_at < p_range_end
      and s.ends_at   > p_range_start
  ),
  person_show as (
    select sa.person_id, ws.id as show_id, ws.starts_at, ws.ends_at
    from public.show_assignments sa
    join window_shows ws on ws.id = sa.show_id
    where sa.project_id = p_project_id
  ),
  overlaps as (
    select
      a.person_id,
      a.show_id as show_a_id,
      b.show_id as show_b_id,
      greatest(a.starts_at, b.starts_at) as overlap_start,
      least(a.ends_at, b.ends_at) as overlap_end
    from person_show a
    join person_show b
      on a.person_id = b.person_id
     and a.show_id < b.show_id
     and a.starts_at < b.ends_at
     and a.ends_at   > b.starts_at
  )
  select
    p_project_id,
    v_run_id,
    'person_double_booked',
    3,
    o.show_a_id,
    o.show_b_id,
    o.person_id,
    null,
    'Person double-booked across overlapping shows',
    jsonb_build_object(
      'overlap_start', o.overlap_start,
      'overlap_end',   o.overlap_end
    ),
    now()
  from overlaps o;

  -- ------------------------------------------------------------
  -- B) Missing required roles / headcount (project defaults)
  --   project_required_roles: is_required, required_count
  --   show_requirements gates evaluation via require_default_roles
  -- ------------------------------------------------------------
  insert into public.computed_conflicts (
    project_id,
    run_id,
    conflict_type,
    severity,
    show_id,
    other_show_id,
    person_id,
    role_id,
    title,
    detail,
    created_at
  )
  with window_shows as (
    select s.id
    from public.shows s
    where s.project_id = p_project_id
      and s.starts_at < p_range_end
      and s.ends_at   > p_range_start
  ),
  eligible_shows as (
    select ws.id as show_id
    from window_shows ws
    left join public.show_requirements sr
      on sr.show_id = ws.id
     and sr.project_id = p_project_id
    where coalesce(sr.require_default_roles, true) = true
  ),
  req as (
    select prr.role_id, prr.required_count
    from public.project_required_roles prr
    where prr.project_id = p_project_id
      and prr.is_required = true
  ),
  assigned as (
    select sa.show_id, sa.role_id, count(*) as assigned_count
    from public.show_assignments sa
    join eligible_shows es on es.show_id = sa.show_id
    where sa.project_id = p_project_id
      and sa.role_id is not null
    group by sa.show_id, sa.role_id
  ),
  missing as (
    select
      es.show_id,
      r.role_id,
      r.required_count,
      coalesce(a.assigned_count, 0) as assigned_count
    from eligible_shows es
    cross join req r
    left join assigned a
      on a.show_id = es.show_id
     and a.role_id = r.role_id
    where coalesce(a.assigned_count, 0) < r.required_count
  )
  select
    p_project_id,
    v_run_id,
    'missing_required_role',
    2,
    m.show_id,
    null,
    null,
    m.role_id,
    'Missing required role coverage',
    jsonb_build_object(
      'required_count', m.required_count,
      'assigned_count', m.assigned_count,
      'missing_count', (m.required_count - m.assigned_count)
    ),
    now()
  from missing m;

  -- ------------------------------------------------------------
  -- C) Missing sound provider (per-show requirement)
  --   show_requirements gates evaluation via require_sound_provider
  -- ------------------------------------------------------------
  insert into public.computed_conflicts (
    project_id,
    run_id,
    conflict_type,
    severity,
    show_id,
    other_show_id,
    person_id,
    role_id,
    title,
    detail,
    created_at
  )
  select
    p_project_id,
    v_run_id,
    'missing_sound_provider',
    1,
    s.id,
    null,
    null,
    null,
    'Missing sound provider assignment',
    '{}'::jsonb,
    now()
  from public.shows s
  left join public.show_requirements sr
    on sr.show_id = s.id
   and sr.project_id = p_project_id
  where s.project_id = p_project_id
    and s.starts_at < p_range_end
    and s.ends_at   > p_range_start
    and coalesce(sr.require_sound_provider, true) = true
    and s.provider_id is null;

  return v_run_id;
end;
$$;

-- ------------------------------------------------------------
-- 3) Lock down execution
-- ------------------------------------------------------------
revoke all on function public.compute_conflicts_pro(uuid, timestamptz, timestamptz, integer) from public;
grant execute on function public.compute_conflicts_pro(uuid, timestamptz, timestamptz, integer) to authenticated;

-- Hardening: ensure a privileged owner for SECURITY DEFINER
alter function public.compute_conflicts_pro(uuid, timestamptz, timestamptz, integer) owner to postgres;