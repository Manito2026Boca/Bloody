-- ADMIN-001: additive admin capability without replacing the user's client/professional role.

create table if not exists private.manito_admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_reason text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table private.manito_admin_memberships enable row level security;
revoke all on table private.manito_admin_memberships from public, anon, authenticated;

create or replace function private.is_manito_admin(p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.role = 'admin'
  ) or exists (
    select 1
    from private.manito_admin_memberships membership
    where membership.user_id = p_profile_id
      and membership.revoked_at is null
  );
$function$;

create or replace function public.get_my_manito_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when auth.uid() is null then jsonb_build_object('admin', false)
    else jsonb_build_object('admin', private.is_manito_admin(auth.uid()))
  end;
$function$;

revoke all on function private.is_manito_admin(uuid) from public, anon;
grant execute on function private.is_manito_admin(uuid) to authenticated;
revoke all on function public.get_my_manito_capabilities() from public, anon;
grant execute on function public.get_my_manito_capabilities() to authenticated;

do $admin_001$
declare
  v_user_id uuid;
  v_count integer;
begin
  select count(*)
  into v_count
  from auth.users
  where lower(email) = lower('jere.rouan97@gmail.com');

  if v_count <> 1 then
    raise exception 'ADMIN-001 expected exactly one existing auth user';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower('jere.rouan97@gmail.com');

  insert into private.manito_admin_memberships(user_id, granted_reason)
  values (v_user_id, 'ADMIN-001 explicit owner authorization')
  on conflict (user_id) do update set
    granted_reason = excluded.granted_reason,
    revoked_at = null;
end;
$admin_001$;

comment on table private.manito_admin_memberships is
  'Privileged, non-API admin capability assignments. No self-service writes.';
comment on function public.get_my_manito_capabilities() is
  'Returns only the current authenticated user capability flags.';
