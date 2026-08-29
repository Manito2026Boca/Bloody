-- NORM-002 advisor cleanup: make helper functions independent from caller
-- search_path.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.order_public_zone(p_address text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[];
  v_last text;
begin
  v_parts := string_to_array(coalesce(p_address, ''), ',');
  if array_length(v_parts, 1) > 1 then
    v_last := btrim(v_parts[array_length(v_parts, 1)]);
    if v_last <> '' then
      return v_last;
    end if;
  end if;

  return 'Zona aproximada';
end;
$$;

create or replace function private.distance_km(
  p_lat_a double precision,
  p_lng_a double precision,
  p_lat_b double precision,
  p_lng_b double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case
    when p_lat_a is null or p_lng_a is null or p_lat_b is null or p_lng_b is null then null
    else 6371 * acos(
      least(
        1,
        greatest(
          -1,
          cos(radians(p_lat_a)) * cos(radians(p_lat_b)) *
          cos(radians(p_lng_b) - radians(p_lng_a)) +
          sin(radians(p_lat_a)) * sin(radians(p_lat_b))
        )
      )
    )
  end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function private.order_public_zone(text) from public, anon, authenticated;
revoke all on function private.distance_km(double precision, double precision, double precision, double precision) from public, anon, authenticated;
