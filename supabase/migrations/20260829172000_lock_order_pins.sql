-- NORM-013: keep order PINs private to database-side validation.
-- Authenticated API clients can read orders, but never start_pin/end_pin.

revoke select, insert on public.orders from anon, authenticated;

grant select (
  id,
  client_id,
  professional_id,
  service_id,
  description,
  address,
  mode,
  scheduled_at,
  status,
  price,
  client_lat,
  client_lng,
  created_at,
  updated_at,
  accepted_at,
  completed_at,
  assignment_mode,
  preferred_professional_id,
  payment_method,
  guarantee_days,
  eta_minutes,
  payment_status,
  online_payment_required,
  payment_required_at,
  paid_at
) on public.orders to authenticated;

grant insert (
  client_id,
  service_id,
  description,
  address,
  mode,
  scheduled_at,
  status,
  price,
  client_lat,
  client_lng,
  assignment_mode,
  preferred_professional_id,
  payment_method,
  guarantee_days,
  eta_minutes,
  payment_status,
  online_payment_required,
  payment_required_at,
  paid_at
) on public.orders to authenticated;

alter publication supabase_realtime drop table public.orders;
alter publication supabase_realtime add table public.orders (
  id,
  client_id,
  professional_id,
  service_id,
  description,
  address,
  mode,
  scheduled_at,
  status,
  price,
  client_lat,
  client_lng,
  created_at,
  updated_at,
  accepted_at,
  completed_at,
  assignment_mode,
  preferred_professional_id,
  payment_method,
  guarantee_days,
  eta_minutes,
  payment_status,
  online_payment_required,
  payment_required_at,
  paid_at
);

drop function if exists public.get_order_pin(uuid);

create function public.get_order_pin(p_order_id uuid)
returns table (
  order_id uuid,
  pin_stage text,
  pin_value text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id as order_id,
    case
      when o.status = 'en_sitio' then 'start'
      when o.status = 'trabajando' then 'end'
      else null
    end as pin_stage,
    case
      when o.status = 'en_sitio' then o.start_pin
      when o.status = 'trabajando' then o.end_pin
      else null
    end as pin_value
  from public.orders o
  where o.id = p_order_id
    and o.client_id = (select auth.uid())
    and (
      (o.status = 'en_sitio' and o.start_pin is not null)
      or (o.status = 'trabajando' and o.end_pin is not null)
    );
$$;

revoke all on function public.get_order_pin(uuid) from public, anon;
grant execute on function public.get_order_pin(uuid) to authenticated;

drop function if exists public.accept_order(uuid);
drop function if exists public.accept_proposal(uuid);
drop function if exists public.advance_order(uuid);
drop function if exists public.cancel_order(uuid);
drop function if exists public.complete_order(uuid, text);
drop function if exists public.confirm_order_payment(uuid);
drop function if exists public.start_order(uuid, text);

create function public.accept_order(p_order_id uuid)
returns table (
  id uuid,
  client_id uuid,
  professional_id uuid,
  service_id bigint,
  description text,
  address text,
  mode text,
  scheduled_at timestamptz,
  status text,
  price numeric,
  client_lat double precision,
  client_lng double precision,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  assignment_mode text,
  preferred_professional_id uuid,
  payment_method text,
  guarantee_days integer,
  eta_minutes integer,
  payment_status text,
  online_payment_required boolean,
  payment_required_at timestamptz,
  paid_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id, o.client_id, o.professional_id, o.service_id, o.description, o.address,
    o.mode, o.scheduled_at, o.status, o.price, o.client_lat, o.client_lng,
    o.created_at, o.updated_at, o.accepted_at, o.completed_at, o.assignment_mode,
    o.preferred_professional_id, o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required, o.payment_required_at, o.paid_at
  from private.accept_order_impl(p_order_id) as o;
$$;

create function public.accept_proposal(p_proposal_id uuid)
returns table (
  id uuid,
  client_id uuid,
  professional_id uuid,
  service_id bigint,
  description text,
  address text,
  mode text,
  scheduled_at timestamptz,
  status text,
  price numeric,
  client_lat double precision,
  client_lng double precision,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  assignment_mode text,
  preferred_professional_id uuid,
  payment_method text,
  guarantee_days integer,
  eta_minutes integer,
  payment_status text,
  online_payment_required boolean,
  payment_required_at timestamptz,
  paid_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id, o.client_id, o.professional_id, o.service_id, o.description, o.address,
    o.mode, o.scheduled_at, o.status, o.price, o.client_lat, o.client_lng,
    o.created_at, o.updated_at, o.accepted_at, o.completed_at, o.assignment_mode,
    o.preferred_professional_id, o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required, o.payment_required_at, o.paid_at
  from private.accept_proposal_impl(p_proposal_id) as o;
$$;

create function public.advance_order(p_order_id uuid)
returns table (
  id uuid,
  client_id uuid,
  professional_id uuid,
  service_id bigint,
  description text,
  address text,
  mode text,
  scheduled_at timestamptz,
  status text,
  price numeric,
  client_lat double precision,
  client_lng double precision,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  assignment_mode text,
  preferred_professional_id uuid,
  payment_method text,
  guarantee_days integer,
  eta_minutes integer,
  payment_status text,
  online_payment_required boolean,
  payment_required_at timestamptz,
  paid_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id, o.client_id, o.professional_id, o.service_id, o.description, o.address,
    o.mode, o.scheduled_at, o.status, o.price, o.client_lat, o.client_lng,
    o.created_at, o.updated_at, o.accepted_at, o.completed_at, o.assignment_mode,
    o.preferred_professional_id, o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required, o.payment_required_at, o.paid_at
  from private.advance_order_impl(p_order_id) as o;
$$;

create function public.cancel_order(p_order_id uuid)
returns table (
  id uuid,
  client_id uuid,
  professional_id uuid,
  service_id bigint,
  description text,
  address text,
  mode text,
  scheduled_at timestamptz,
  status text,
  price numeric,
  client_lat double precision,
  client_lng double precision,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  assignment_mode text,
  preferred_professional_id uuid,
  payment_method text,
  guarantee_days integer,
  eta_minutes integer,
  payment_status text,
  online_payment_required boolean,
  payment_required_at timestamptz,
  paid_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id, o.client_id, o.professional_id, o.service_id, o.description, o.address,
    o.mode, o.scheduled_at, o.status, o.price, o.client_lat, o.client_lng,
    o.created_at, o.updated_at, o.accepted_at, o.completed_at, o.assignment_mode,
    o.preferred_professional_id, o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required, o.payment_required_at, o.paid_at
  from private.cancel_order_impl(p_order_id) as o;
$$;

create function public.confirm_order_payment(p_order_id uuid)
returns table (
  id uuid,
  client_id uuid,
  professional_id uuid,
  service_id bigint,
  description text,
  address text,
  mode text,
  scheduled_at timestamptz,
  status text,
  price numeric,
  client_lat double precision,
  client_lng double precision,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  assignment_mode text,
  preferred_professional_id uuid,
  payment_method text,
  guarantee_days integer,
  eta_minutes integer,
  payment_status text,
  online_payment_required boolean,
  payment_required_at timestamptz,
  paid_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id, o.client_id, o.professional_id, o.service_id, o.description, o.address,
    o.mode, o.scheduled_at, o.status, o.price, o.client_lat, o.client_lng,
    o.created_at, o.updated_at, o.accepted_at, o.completed_at, o.assignment_mode,
    o.preferred_professional_id, o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required, o.payment_required_at, o.paid_at
  from private.confirm_order_payment_impl(p_order_id) as o;
$$;

create function public.start_order(p_order_id uuid, p_pin text)
returns table (
  id uuid,
  client_id uuid,
  professional_id uuid,
  service_id bigint,
  description text,
  address text,
  mode text,
  scheduled_at timestamptz,
  status text,
  price numeric,
  client_lat double precision,
  client_lng double precision,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  assignment_mode text,
  preferred_professional_id uuid,
  payment_method text,
  guarantee_days integer,
  eta_minutes integer,
  payment_status text,
  online_payment_required boolean,
  payment_required_at timestamptz,
  paid_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id, o.client_id, o.professional_id, o.service_id, o.description, o.address,
    o.mode, o.scheduled_at, o.status, o.price, o.client_lat, o.client_lng,
    o.created_at, o.updated_at, o.accepted_at, o.completed_at, o.assignment_mode,
    o.preferred_professional_id, o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required, o.payment_required_at, o.paid_at
  from private.start_order_impl(p_order_id, p_pin) as o;
$$;

create function public.complete_order(p_order_id uuid, p_pin text)
returns table (
  id uuid,
  client_id uuid,
  professional_id uuid,
  service_id bigint,
  description text,
  address text,
  mode text,
  scheduled_at timestamptz,
  status text,
  price numeric,
  client_lat double precision,
  client_lng double precision,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  assignment_mode text,
  preferred_professional_id uuid,
  payment_method text,
  guarantee_days integer,
  eta_minutes integer,
  payment_status text,
  online_payment_required boolean,
  payment_required_at timestamptz,
  paid_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id, o.client_id, o.professional_id, o.service_id, o.description, o.address,
    o.mode, o.scheduled_at, o.status, o.price, o.client_lat, o.client_lng,
    o.created_at, o.updated_at, o.accepted_at, o.completed_at, o.assignment_mode,
    o.preferred_professional_id, o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required, o.payment_required_at, o.paid_at
  from private.complete_order_impl(p_order_id, p_pin) as o;
$$;

revoke all on function public.accept_order(uuid) from public, anon;
revoke all on function public.accept_proposal(uuid) from public, anon;
revoke all on function public.advance_order(uuid) from public, anon;
revoke all on function public.cancel_order(uuid) from public, anon;
revoke all on function public.complete_order(uuid, text) from public, anon;
revoke all on function public.confirm_order_payment(uuid) from public, anon;
revoke all on function public.start_order(uuid, text) from public, anon;

grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.accept_proposal(uuid) to authenticated;
grant execute on function public.advance_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.complete_order(uuid, text) to authenticated;
grant execute on function public.confirm_order_payment(uuid) to authenticated;
grant execute on function public.start_order(uuid, text) to authenticated;

drop function if exists public.list_professional_opportunities();

create function public.list_professional_opportunities()
returns table (
  id uuid,
  client_id uuid,
  professional_id uuid,
  service_id bigint,
  description text,
  address text,
  mode text,
  scheduled_at timestamptz,
  status text,
  price numeric,
  assignment_mode text,
  preferred_professional_id uuid,
  payment_method text,
  payment_status text,
  online_payment_required boolean,
  payment_required_at timestamptz,
  paid_at timestamptz,
  guarantee_days integer,
  eta_minutes integer,
  client_lat double precision,
  client_lng double precision,
  created_at timestamptz,
  updated_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  service jsonb,
  match_score integer,
  match_reasons text[],
  distance_km double precision
)
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
    raise exception 'No autenticado';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_uid;

  if v_profile.id is null
    or v_profile.role <> 'professional'
    or not private.professional_can_receive_orders(v_uid) then
    return;
  end if;

  return query
  select
    o.id,
    o.client_id,
    o.professional_id,
    o.service_id,
    o.description,
    private.order_public_zone(o.address) as address,
    o.mode,
    o.scheduled_at,
    o.status,
    o.price,
    o.assignment_mode,
    o.preferred_professional_id,
    o.payment_method,
    o.payment_status,
    o.online_payment_required,
    o.payment_required_at,
    o.paid_at,
    o.guarantee_days,
    o.eta_minutes,
    null::double precision as client_lat,
    null::double precision as client_lng,
    o.created_at,
    o.updated_at,
    o.accepted_at,
    o.completed_at,
    to_jsonb(s.*) as service,
    (
      70
      + case when pp.verified then 10 else 0 end
      + least(10, coalesce(pp.jobs_completed, 0))
      + case
          when private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) is null then 4
          else greatest(0, 12 - round(private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng))::integer)
        end
    )::integer as match_score,
    array_remove(array[
      case
        when o.mode = 'immediate' then 'Disponible ahora'
        when o.mode = 'scheduled' then 'Agenda compatible'
        else 'Puede presupuestar'
      end,
      case when pp.verified then 'Verificado por MANITO' else 'Revision MANITO aprobada' end,
      case
        when private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) is not null
          then round(private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng)::numeric, 1)::text || ' km'
        else private.order_public_zone(o.address)
      end
    ], null) as match_reasons,
    private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) as distance_km
  from public.orders o
  join public.services s on s.id = o.service_id
  join public.professional_services ps
    on ps.professional_id = v_uid
   and ps.service_id = o.service_id
  left join public.professional_profiles pp
    on pp.professional_id = v_uid
  where o.professional_id is null
    and o.status in ('open', 'scheduled_open', 'waiting_quotes')
    and (
      o.assignment_mode <> 'manual'
      or o.preferred_professional_id is null
      or o.preferred_professional_id = v_uid
    )
    and (o.mode <> 'immediate' or v_profile.is_available = true)
    and (
      private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) is null
      or private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) <= coalesce(pp.service_radius_km, 8)
    )
    and (
      o.scheduled_at is null
      or array_replace(coalesce(pp.work_days, array['Lun','Mar','Mie','Jue','Vie']), 'Mié', 'Mie') @> array[
        case extract(dow from o.scheduled_at)
          when 0 then 'Dom'
          when 1 then 'Lun'
          when 2 then 'Mar'
          when 3 then 'Mie'
          when 4 then 'Jue'
          when 5 then 'Vie'
          else 'Sab'
        end
      ]
    )
    and (
      o.scheduled_at is null
      or pp.work_starts_at is null
      or pp.work_ends_at is null
      or o.scheduled_at::time between pp.work_starts_at::time and pp.work_ends_at::time
    )
  order by o.created_at desc;
end;
$$;

revoke all on function public.list_professional_opportunities() from public, anon;
grant execute on function public.list_professional_opportunities() to authenticated;

insert into public.admin_settings (key, value)
values (
  'norm_013_pin_security',
  '{
    "pin_storage": "public.orders backend-only columns",
    "direct_authenticated_pin_select": false,
    "client_pin_access": "get_order_pin_rpc_only_for_own_order_current_stage",
    "professional_pin_access": "attempt_only_start_order_complete_order",
    "realtime_orders_columns": "start_pin_end_pin_removed",
    "admin_pin_access": false
  }'::jsonb
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
