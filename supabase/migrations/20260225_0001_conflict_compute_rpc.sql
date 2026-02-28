-- ============================================================
-- ShowFlows – Conflict Intelligence Engine
-- Pro Compute RPC (SECURITY DEFINER)
-- Phase 1 Pro: overlap, missing roles, missing provider
-- ============================================================

-- NOTE:
-- This migration assumes these helper functions already exist:
--   public.is_project_owner(p_project_id uuid) returns boolean
--   public.is_project_editor(p_project_id uuid) returns boolean
--   public.is_project_pro(p_project_id uuid) returns boolean
--
-- And these tables exist (per your current known state):
--   public.conflict_compute_runs
--   public.computed_conflicts
--
-- It also assumes you have:
--   public.shows
--   public.people
--   public.roles
--   public.show_assignments
--   public.project_required_roles
--   public.providers (optional for provider details)
--
-- If your column names differ, adjust the marked sections.

create or replace function public.compute_conflicts_pro(
    p_project_id uuid,
    p_window_start timestamptz,
    p_window_end timestamptz,
    p_engine_version text default 'phase1_v1'
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
    -- 1) Auth
    -- -----------------------------
    v_user_id := auth.uid();
    if v_user_id is null then
        raise exception 'Authentication required';
    end if;

    -- -----------------------------
    -- 2) Authorization: owner/editor
    -- -----------------------------
    if not (public.is_project_owner(p_project_id) or public.is_project_editor(p_project_id)) then
        raise exception 'Access denied (owner/editor only)';
    end if;

    -- -----------------------------
    -- 3) Pro gating
    -- -----------------------------
    if not public.is_project_pro(p_project_id) then
        raise exception 'Conflict Intelligence is a Pro feature';
    end if;

    -- -----------------------------
    -- 4) Create/Upsert compute run (idempotent key)
    -- -----------------------------
    -- Strongly recommended: enforce uniqueness at DB level:
    -- unique(project_id, engine_version, window_start, window_end)
    --
    -- This block creates the run and returns its id.
    insert into public.conflict_compute_runs (
        project_id,
        engine_version,
        window_start,
        window_end,
        computed_by,
        computed_at
    )
    values (
        p_project_id,
        p_engine_version,
        p_window_start,
        p_window_end,
        v_user_id,
        now()
    )
    on conflict (project_id, engine_version, window_start, window_end)
    do update set
        computed_by = excluded.computed_by,
        computed_at = excluded.computed_at
    returning id into v_run_id;

    -- -----------------------------
    -- 5) Clear prior results for this run (idempotent)
    -- -----------------------------
    delete from public.computed_conflicts
    where project_id = p_project_id
      and compute_run_id = v_run_id;

    -- ============================================================
    -- 6) Phase 1 conflict computations
    -- ============================================================

    -- ------------------------------------------------------------
    -- 6.1 Person double-booked across overlapping shows (same project)
    --
    -- Assumed columns:
    --   shows: id, project_id, start_time, end_time
    --   show_assignments: show_id, person_id
    --
    -- computed_conflicts suggested columns (adjust if needed):
    --   id (uuid)
    --   project_id
    --   compute_run_id
    --   conflict_type (text)
    --   severity (text or int)
    --   show_id
    --   related_show_id
    --   person_id
    --   role_id (nullable)
    --   details (jsonb)
    --   created_at
    -- ------------------------------------------------------------

    insert into public.computed_conflicts (
        project_id,
        compute_run_id,
        conflict_type,
        severity,
        show_id,
        related_show_id,
        person_id,
        role_id,
        details,
        created_at
    )
    with window_shows as (
        select s.id, s.project_id, s.start_time, s.end_time
        from public.shows s
        where s.project_id = p_project_id
          and s.start_time is not null
          and s.end_time is not null
          and s.start_time < p_window_end
          and s.end_time > p_window_start
    ),
    person_show as (
        select sa.person_id, ws.id as show_id, ws.start_time, ws.end_time
        from public.show_assignments sa
        join window_shows ws on ws.id = sa.show_id
    ),
    overlaps as (
        select
            a.person_id,
            a.show_id as show_a_id,
            b.show_id as show_b_id,
            greatest(a.start_time, b.start_time) as overlap_start,
            least(a.end_time, b.end_time) as overlap_end
        from person_show a
        join person_show b
          on a.person_id = b.person_id
         and a.show_id < b.show_id
         and a.start_time < b.end_time
         and a.end_time > b.start_time
    )
    select
        p_project_id,
        v_run_id,
        'person_double_booked',
        'high',
        o.show_a_id,
        o.show_b_id,
        o.person_id,
        null,
        jsonb_build_object(
            'overlap_start', o.overlap_start,
            'overlap_end', o.overlap_end
        ),
        now()
    from overlaps o;

    -- ------------------------------------------------------------
    -- 6.2 Missing required roles / headcount
    --
    -- Assumed modeling:
    --   project_required_roles: project_id, role_id, required_count
    --   show_assignments: show_id, role_id (nullable? ideally present)
    --   shows: id, project_id, start_time/end_time
    --
    -- If your required roles are per-show in show_requirements,
    -- we can extend this next. For now: project-level required roles.
    -- ------------------------------------------------------------

    insert into public.computed_conflicts (
        project_id,
        compute_run_id,
        conflict_type,
        severity,
        show_id,
        related_show_id,
        person_id,
        role_id,
        details,
        created_at
    )
    with window_shows as (
        select s.id
        from public.shows s
        where s.project_id = p_project_id
          and (s.start_time is null or s.end_time is null
               or (s.start_time < p_window_end and s.end_time > p_window_start))
    ),
    req as (
        select prr.role_id, prr.required_count
        from public.project_required_roles prr
        where prr.project_id = p_project_id
    ),
    assigned as (
        select sa.show_id, sa.role_id, count(*) as assigned_count
        from public.show_assignments sa
        join window_shows ws on ws.id = sa.show_id
        where sa.role_id is not null
        group by sa.show_id, sa.role_id
    ),
    missing as (
        select
            ws.id as show_id,
            r.role_id,
            r.required_count,
            coalesce(a.assigned_count, 0) as assigned_count
        from window_shows ws
        cross join req r
        left join assigned a
          on a.show_id = ws.id
         and a.role_id = r.role_id
        where coalesce(a.assigned_count, 0) < r.required_count
    )
    select
        p_project_id,
        v_run_id,
        'missing_required_role',
        'medium',
        m.show_id,
        null,
        null,
        m.role_id,
        jsonb_build_object(
            'required_count', m.required_count,
            'assigned_count', m.assigned_count,
            'missing_count', (m.required_count - m.assigned_count)
        ),
        now()
    from missing m;

    -- ------------------------------------------------------------
    -- 6.3 Missing sound provider
    --
    -- Assumed columns:
    --   shows: id, project_id, provider_id (nullable)
    -- ------------------------------------------------------------

    insert into public.computed_conflicts (
        project_id,
        compute_run_id,
        conflict_type,
        severity,
        show_id,
        related_show_id,
        person_id,
        role_id,
        details,
        created_at
    )
    select
        p_project_id,
        v_run_id,
        'missing_sound_provider',
        'low',
        s.id,
        null,
        null,
        null,
        '{}'::jsonb,
        now()
    from public.shows s
    where s.project_id = p_project_id
      and (s.start_time is null or s.end_time is null
           or (s.start_time < p_window_end and s.end_time > p_window_start))
      and s.provider_id is null;

    return v_run_id;
end;
$$;

-- Lock down execution
revoke all on function public.compute_conflicts_pro(uuid, timestamptz, timestamptz, text) from public;
grant execute on function public.compute_conflicts_pro(uuid, timestamptz, timestamptz, text) to authenticated;

-- Strong hardening: make sure the owner is privileged (commonly postgres)
-- NOTE: run only if your migration role has permission
alter function public.compute_conflicts_pro(uuid, timestamptz, timestamptz, text) owner to postgres;

-- ============================================================
-- Recommended supporting constraint (idempotency guarantee)
-- Add only if it doesn't already exist.
-- ============================================================
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
            on public.conflict_compute_runs (project_id, engine_version, window_start, window_end)
        ';
    end if;
end;
$$;