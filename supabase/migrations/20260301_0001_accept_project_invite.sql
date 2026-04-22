create or replace function public.accept_project_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
  v_inv public.project_invites%rowtype;
  v_now timestamptz := now();
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'token is required';
  end if;

  if p_token !~* '^[0-9a-f]{48}$' then
    raise exception 'Invalid token format';
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'Authenticated user has no email';
  end if;

  select *
    into v_inv
  from public.project_invites
  where token = p_token
  limit 1;

  if not found then
    raise exception 'Invalid invite token';
  end if;

  if v_inv.accepted_at is not null then
    raise exception 'Invite already accepted';
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at < v_now then
    raise exception 'Invite expired';
  end if;

  if lower(v_inv.invited_email) <> v_email then
    raise exception 'Invite email does not match the signed-in user';
  end if;

  update public.project_invites
  set accepted_at = v_now
  where id = v_inv.id;

  -- If a row exists by email, link it; else insert.
  update public.project_members
  set member_user_id = v_user_id,
      role = v_inv.role,
      is_managed = v_inv.is_managed
  where project_id = v_inv.project_id
    and lower(member_email) = v_email;

  if not found then
    insert into public.project_members (project_id, member_email, role, is_managed, member_user_id, created_at)
    values (v_inv.project_id, v_email, v_inv.role, v_inv.is_managed, v_user_id, v_now)
    on conflict (project_id, member_user_id)
    do update set
      member_email = excluded.member_email,
      role = excluded.role,
      is_managed = excluded.is_managed;
  end if;

  return jsonb_build_object(
    'project_id', v_inv.project_id,
    'invited_email', v_email,
    'role', v_inv.role,
    'accepted_at', v_now
  );
end;
$$;

revoke all on function public.accept_project_invite(text) from public;
grant execute on function public.accept_project_invite(text) to authenticated;