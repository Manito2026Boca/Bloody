-- UX-001R final refinement: one durable default address per client.

with ranked as (
  select id, client_id,
    row_number() over (
      partition by client_id
      order by is_default desc, updated_at desc, created_at desc, id
    ) as position
  from public.client_addresses
)
update public.client_addresses address
set is_default = ranked.position = 1
from ranked
where ranked.id = address.id
  and address.is_default is distinct from (ranked.position = 1);

create unique index if not exists client_addresses_one_default_per_client
  on public.client_addresses (client_id)
  where is_default;

create or replace function public.upsert_client_address(p_data jsonb)
returns public.client_addresses
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p_data->>'id', '')::uuid;
  v_line text := nullif(btrim(p_data->>'line'), '');
  v_city text := nullif(btrim(p_data->>'city'), '');
  v_label text := coalesce(nullif(btrim(p_data->>'label'), ''), 'Casa');
  v_lat double precision := nullif(p_data->>'lat', '')::double precision;
  v_lng double precision := nullif(p_data->>'lng', '')::double precision;
  v_make_default boolean := coalesce((p_data->>'is_default')::boolean, false);
  v_existing public.client_addresses;
  v_result public.client_addresses;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if v_line is null or v_city is null then
    raise exception 'Direccion y ciudad son obligatorias';
  end if;
  if (v_lat is null) <> (v_lng is null) then
    raise exception 'Las coordenadas deben enviarse juntas';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 0));

  if v_id is not null then
    select * into v_existing
    from public.client_addresses
    where id = v_id
    for update;
    if v_existing.id is null or v_existing.client_id <> v_uid then
      raise exception 'Direccion no disponible';
    end if;
  else
    v_id := gen_random_uuid();
  end if;

  perform 1
  from public.client_addresses
  where client_id = v_uid
  for update;

  if v_make_default or not exists (
    select 1 from public.client_addresses
    where client_id = v_uid and is_default and id <> v_id
  ) then
    v_make_default := true;
    update public.client_addresses
    set is_default = false, updated_at = now()
    where client_id = v_uid and id <> v_id and is_default;
  end if;

  insert into public.client_addresses (
    id, client_id, label, line, city, lat, lng, is_default
  ) values (
    v_id, v_uid, v_label, v_line, v_city, v_lat, v_lng, v_make_default
  )
  on conflict (id) do update set
    label = excluded.label,
    line = excluded.line,
    city = excluded.city,
    lat = excluded.lat,
    lng = excluded.lng,
    is_default = excluded.is_default,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$function$;

revoke all on function public.upsert_client_address(jsonb) from public, anon;
grant execute on function public.upsert_client_address(jsonb) to authenticated;

comment on function public.upsert_client_address(jsonb) is
  'Atomically saves an owned client address and maintains at most one default address.';

insert into public.admin_settings(key, value)
values ('ux_001r_final_refinement', jsonb_build_object(
  'status', 'implemented',
  'default_address', 'client_addresses',
  'order_location', 'immutable_order_snapshot'
))
on conflict (key) do update set value = excluded.value, updated_at = now();
