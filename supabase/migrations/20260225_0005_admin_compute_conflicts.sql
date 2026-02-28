-- Admin-only compute wrapper for SQL Editor / service role testing.
-- Keeps the real RPC strict (auth required).

create or replace function public.compute_conflicts_admin(
  p_project_id uuid,
  p_range_start timestamptz,
  p_range_end   timestamptz,
  p_computed_version integer default 1,
  p_created_by_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  -- This wrapper bypasses auth.uid() and directly runs the same logic
  -- by temporarily setting created_by_user_id in conflict_compute_runs.

  -- Basic validation
  if p_project_id is null then
    raise exception 'project_id is required';
  end if;
  if p_range_start is null or p_range_end is null then
    raise exception 'range_start and range_end are required';
  end if;
  if p_range_start >= p_range_end then
    raise exception 'range_start must be < range_end';
  end if;

  -- Still enforce Pro gating (so we don't accidentally compute for Free projects)
  if not public.is_project_pro(p_project_id) then
    raise exception 'Conflict Intelligence is a Pro feature';
  end if;

  -- Create/upsert compute run
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
    p_created_by_user_id,
    '{}'::jsonb
  )
  on conflict (project_id, computed_version, range_start, range_end)
  do update set
    status = 'completed',
    computed_at = excluded.computed_at,
    created_by_user_id = excluded.created_by_user_id
  returning id into v_run_id;

  -- Clear prior results for this run
  delete from public.computed_conflicts
  where project_id = p_project_id
    and run_id = v_run_id;

  -- A) person double-booked (no CTEs)
  insert into public.computed_conflicts (
    project_id, run_id, conflict_type, severity,
    show_id, other_show_id, person_id, role_id,
    title, detail, created_at
  )
  select
    p_project_id,
    v_run_id,
    'person_double_booked',
    3,
    x.show_a_id,
    x.show_b_id,
    x.person_id,
    null,
    'Person double-booked across overlapping shows',
    jsonb_build_object('overlap_start', x.overlap_start, 'overlap_end', x.overlap_end),
    now()
  from (
    select
      a.person_id,
      a.show_id as show_a_id,
      b.show_id as show_b_id,
      greatest(a.starts_at, b.starts_at) as overlap_start,
      least(a.ends_at, b.ends_at) as overlap_end
    from (
      select sa.person_id, s.id as show_id, s.starts_at, s.ends_at
      from public.show_assignments sa
      join public.shows s on s.id = sa.show_id
      where sa.project_id = p_project_id
        and s.project_id = p_project_id
        and s.starts_at < p_range_end
        and s.ends_at   > p_range_start
    ) a
    join (
      select sa.person_id, s.id as show_id, s.starts_at, s.ends_at
      from public.show_assignments sa
      join public.shows s on s.id = sa.show_id
      where sa.project_id = p_project_id
        and s.project_id = p_project_id
        and s.starts_at < p_range_end
        and s.ends_at   > p_range_start
    ) b
      on a.person_id = b.person_id
     and a.show_id < b.show_id
     and a.starts_at < b.ends_at
     and a.ends_at   > b.starts_at
  ) x;

  -- B) missing required roles
  insert into public.computed_conflicts (
    project_id, run_id, conflict_type, severity,
    show_id, other_show_id, person_id, role_id,
    title, detail, created_at
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
  from (
    select
      es.show_id,
      r.role_id,
      r.required_count,
      coalesce(a.assigned_count, 0) as assigned_count
    from (
      select s.id as show_id
      from public.shows s
      left join public.show_requirements sr
        on sr.show_id = s.id
       and sr.project_id = p_project_id
      where s.project_id = p_project_id
        and s.starts_at < p_range_end
        and s.ends_at   > p_range_start
        and coalesce(sr.require_default_roles, true) = true
    ) es
    cross join (
      select prr.role_id, prr.required_count
      from public.project_required_roles prr
      where prr.project_id = p_project_id
        and prr.is_required = true
    ) r
    left join (
      select sa.show_id, sa.role_id, count(*) as assigned_count
      from public.show_assignments sa
      where sa.project_id = p_project_id
        and sa.role_id is not null
      group by sa.show_id, sa.role_id
    ) a
      on a.show_id = es.show_id
     and a.role_id = r.role_id
  ) m
  where m.assigned_count < m.required_count;

  -- C) missing provider
  insert into public.computed_conflicts (
    project_id, run_id, conflict_type, severity,
    show_id, other_show_id, person_id, role_id,
    title, detail, created_at
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

-- IMPORTANT: Do NOT grant this to authenticated.
revoke all on function public.compute_conflicts_admin(uuid, timestamptz, timestamptz, integer, uuid) from public;
revoke all on function public.compute_conflicts_admin(uuid, timestamptz, timestamptz, integer, uuid) from authenticated;

-- Ownership hardening
alter function public.compute_conflicts_admin(uuid, timestamptz, timestamptz, integer, uuid) owner to postgres;