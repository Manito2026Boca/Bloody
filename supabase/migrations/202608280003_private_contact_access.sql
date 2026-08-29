-- MANITO private contact access.
-- Phone and email stay private by default. The browser can read public profile
-- fields for marketplace context, while each user gets full own profile data via RPC.

create or replace function public.get_my_profile()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión';
  end if;

  select p.*
    into v_profile
    from public.profiles p
   where p.id = v_uid;

  if v_profile.id is null then
    raise exception 'No existe tu perfil MANITO';
  end if;

  return v_profile;
end;
$$;

create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text default null,
  p_city text default null,
  p_lat double precision default null,
  p_lng double precision default null
)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión';
  end if;

  update public.profiles
     set full_name = nullif(btrim(coalesce(p_full_name, '')), ''),
         phone = nullif(btrim(coalesce(p_phone, '')), ''),
         city = nullif(btrim(coalesce(p_city, '')), ''),
         lat = p_lat,
         lng = p_lng,
         updated_at = now()
   where id = v_uid
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'No existe tu perfil MANITO';
  end if;

  return v_profile;
end;
$$;

create or replace function public.set_my_availability(p_is_available boolean)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión';
  end if;

  update public.profiles
     set is_available = coalesce(p_is_available, false),
         updated_at = now()
   where id = v_uid
     and role in ('professional', 'admin')
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Solo un prestador puede cambiar disponibilidad';
  end if;

  return v_profile;
end;
$$;

revoke select on public.profiles from authenticated;
grant select (
  id,
  full_name,
  role,
  city,
  is_available,
  lat,
  lng,
  created_at,
  updated_at
) on public.profiles to authenticated;

revoke all on function public.get_my_profile() from public, anon;
revoke all on function public.update_my_profile(text, text, text, double precision, double precision) from public, anon;
revoke all on function public.set_my_availability(boolean) from public, anon;

grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.update_my_profile(text, text, text, double precision, double precision) to authenticated;
grant execute on function public.set_my_availability(boolean) to authenticated;

insert into public.admin_settings (key, value)
values (
  'private_contact_access',
  '{
    "public_profile_columns": ["id", "full_name", "role", "city", "is_available", "lat", "lng"],
    "private_columns": ["email", "phone"],
    "own_profile_access": "get_my_profile_rpc",
    "own_profile_update": "update_my_profile_rpc",
    "availability_update": "set_my_availability_rpc"
  }'::jsonb
)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();
