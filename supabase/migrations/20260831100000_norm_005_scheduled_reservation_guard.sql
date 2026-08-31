-- NORM-005: scheduled reservations need a real bounded slot and backend overlap guard.

alter table public.orders
  add column if not exists estimated_duration_minutes integer;

alter table public.orders
  add column if not exists scheduled_end timestamptz;

alter table public.orders
  drop constraint if exists orders_estimated_duration_positive;

alter table public.orders
  add constraint orders_estimated_duration_positive
  check (estimated_duration_minutes is null or estimated_duration_minutes > 0);

comment on column public.orders.scheduled_at is
  'Scheduled reservation start. NORM-005: use with estimated_duration_minutes/scheduled_end for backend conflict checks.';

comment on column public.orders.estimated_duration_minutes is
  'Estimated duration for scheduled reservations. Used to derive scheduled_end and prevent double booking.';

comment on column public.orders.scheduled_end is
  'Derived scheduled reservation end. Backend source for overlap checks; do not treat as a user-entered field.';

insert into public.admin_settings (key, value)
values (
  'scheduling',
  jsonb_build_object(
    'schema_version', 1,
    'default_duration_minutes', 120,
    'schedule_buffer_minutes', 0
  )
)
on conflict (key) do update
set value = excluded.value || public.admin_settings.value,
    updated_at = now();

create or replace function private.current_scheduling_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
      'schema_version', 1,
      'default_duration_minutes', 120,
      'schedule_buffer_minutes', 0
    )
    || coalesce(
      (select s.value from public.admin_settings s where s.key = 'scheduling'),
      '{}'::jsonb
    );
$$;

create or replace function private.scheduling_policy_int(
  p_policy jsonb,
  p_key text,
  p_default integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_policy->>p_key, '') ~ '^[0-9]+(\.[0-9]+)?$'
      then floor((p_policy->>p_key)::numeric)::integer
    else p_default
  end;
$$;

create or replace function private.schedule_default_duration_minutes()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    1,
    private.scheduling_policy_int(
      private.current_scheduling_policy(),
      'default_duration_minutes',
      120
    )
  );
$$;

create or replace function private.schedule_buffer_minutes()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    0,
    private.scheduling_policy_int(
      private.current_scheduling_policy(),
      'schedule_buffer_minutes',
      0
    )
  );
$$;

create or replace function private.schedule_end_from(
  p_start timestamptz,
  p_duration_minutes integer
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_start is null then null
    else p_start + make_interval(
      mins => greatest(
        1,
        coalesce(p_duration_minutes, private.schedule_default_duration_minutes())
      )
    )
  end;
$$;

create or replace function private.schedule_day_label(p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case extract(dow from p_at at time zone 'America/Argentina/Buenos_Aires')
    when 0 then 'Dom'
    when 1 then 'Lun'
    when 2 then 'Mar'
    when 3 then 'Mie'
    when 4 then 'Jue'
    when 5 then 'Vie'
    else 'Sab'
  end;
$$;

create or replace function private.professional_schedule_contains(
  p_professional_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_start is not null
    and p_end is not null
    and p_end > p_start
    and (p_start at time zone 'America/Argentina/Buenos_Aires')::date
      = (p_end at time zone 'America/Argentina/Buenos_Aires')::date
    and exists (
      select 1
      from public.profiles p
      left join public.professional_profiles pp
        on pp.professional_id = p.id
      where p.id = p_professional_id
        and p.role = 'professional'
        and array_replace(
          coalesce(pp.work_days, array['Lun','Mar','Mie','Jue','Vie']::text[]),
          'Mié',
          'Mie'
        ) @> array[private.schedule_day_label(p_start)]
        and (p_start at time zone 'America/Argentina/Buenos_Aires')::time
          >= coalesce(pp.work_starts_at, '08:00'::time)
        and (p_end at time zone 'America/Argentina/Buenos_Aires')::time
          <= coalesce(pp.work_ends_at, '18:00'::time)
    );
$$;

create or replace function private.professional_has_schedule_conflict(
  p_professional_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_excluded_order_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.professional_id = p_professional_id
      and o.scheduled_at is not null
      and o.status in ('payment_pending', 'accepted', 'en_camino', 'en_sitio', 'trabajando')
      and (p_excluded_order_id is null or o.id <> p_excluded_order_id)
      and p_start < (
        coalesce(
          o.scheduled_end,
          private.schedule_end_from(
            o.scheduled_at,
            coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())
          )
        )
        + make_interval(mins => private.schedule_buffer_minutes())
      )
      and p_end > (
        o.scheduled_at
        - make_interval(mins => private.schedule_buffer_minutes())
      )
  );
$$;

create or replace function private.set_order_schedule_bounds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode = 'scheduled' and new.scheduled_at is null then
    raise exception 'Elegí día y horario para programar el servicio';
  end if;

  if new.scheduled_at is null then
    new.scheduled_end := null;
    return new;
  end if;

  new.estimated_duration_minutes := greatest(
    1,
    coalesce(new.estimated_duration_minutes, new.eta_minutes, private.schedule_default_duration_minutes())
  );
  new.scheduled_end := private.schedule_end_from(new.scheduled_at, new.estimated_duration_minutes);

  return new;
end;
$$;

update public.orders o
set estimated_duration_minutes = greatest(
      1,
      coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())
    ),
    scheduled_end = private.schedule_end_from(
      o.scheduled_at,
      greatest(1, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes()))
    )
where o.scheduled_at is not null
  and (o.estimated_duration_minutes is null or o.scheduled_end is null);

drop trigger if exists trg_orders_schedule_bounds on public.orders;
create trigger trg_orders_schedule_bounds
before insert or update of mode, scheduled_at, estimated_duration_minutes, eta_minutes
on public.orders
for each row
execute function private.set_order_schedule_bounds();

create or replace function private.accept_order_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_candidate public.orders;
  v_schedule_end timestamptz;
  v_policy jsonb := private.current_commercial_policy();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if not private.professional_can_receive_orders(v_uid) then
    raise exception 'Tu alta profesional todavia no esta aprobada por MANITO';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_uid
      and p.role = 'professional'
  ) then
    raise exception 'Solo un profesional puede aceptar trabajos';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select o.* into v_candidate
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_candidate.id is not null
    and v_candidate.mode = 'scheduled'
    and v_candidate.status in ('open', 'scheduled_open')
    and v_candidate.professional_id is null then
    v_schedule_end := coalesce(
      v_candidate.scheduled_end,
      private.schedule_end_from(
        v_candidate.scheduled_at,
        coalesce(v_candidate.estimated_duration_minutes, v_candidate.eta_minutes, private.schedule_default_duration_minutes())
      )
    );

    if not private.professional_schedule_contains(v_uid, v_candidate.scheduled_at, v_schedule_end) then
      raise exception 'El horario programado no entra en tu jornada laboral';
    end if;

    if private.professional_has_schedule_conflict(v_uid, v_candidate.scheduled_at, v_schedule_end, v_candidate.id) then
      raise exception 'Ya tenes otro trabajo programado en ese horario';
    end if;
  end if;

  with candidate as (
    select
      o.id,
      o.description,
      o.mode,
      o.scheduled_at,
      o.scheduled_end,
      o.estimated_duration_minutes,
      o.eta_minutes,
      o.service_id,
      s.slug as service_slug,
      s.name as service_name,
      coalesce(ps.price_from, s.base_price, 0)::numeric(12, 2) as base_amount,
      case
        when o.mode = 'scheduled' then greatest(0, private.policy_number(v_policy, 'scheduled_fee', 0))
        else 0
      end::numeric(12, 2) as scheduled_fee,
      case
        when ps.price_from is not null then 'professional_services.price_from'
        else 'services.base_price'
      end as price_source
    from public.orders o
    join public.services s on s.id = o.service_id
    join public.professional_services ps
      on ps.professional_id = v_uid
     and ps.service_id = o.service_id
    where o.id = p_order_id
      and o.status in ('open', 'scheduled_open')
      and o.mode <> 'quote'
      and o.professional_id is null
      and (o.mode <> 'immediate' or exists (
        select 1 from public.profiles p where p.id = v_uid and p.is_available = true
      ))
      and (
        o.assignment_mode <> 'manual'
        or o.preferred_professional_id is null
        or o.preferred_professional_id = v_uid
      )
      and (
        o.mode <> 'scheduled'
        or (
          o.scheduled_at is not null
          and private.professional_schedule_contains(
            v_uid,
            o.scheduled_at,
            coalesce(
              o.scheduled_end,
              private.schedule_end_from(
                o.scheduled_at,
                coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())
              )
            )
          )
          and not private.professional_has_schedule_conflict(
            v_uid,
            o.scheduled_at,
            coalesce(
              o.scheduled_end,
              private.schedule_end_from(
                o.scheduled_at,
                coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())
              )
            ),
            o.id
          )
        )
      )
  )
  update public.orders o
  set
    professional_id = v_uid,
    status = case when o.payment_method = 'card' then 'payment_pending' else 'accepted' end,
    payment_status = case when o.payment_method = 'card' then 'pending' else 'not_required' end,
    online_payment_required = o.payment_method = 'card',
    payment_required_at = case when o.payment_method = 'card' then now() else payment_required_at end,
    accepted_at = now(),
    start_pin = coalesce(o.start_pin, lpad((floor(random() * 10000))::int::text, 4, '0')),
    end_pin = coalesce(o.end_pin, lpad((floor(random() * 10000))::int::text, 4, '0')),
    scheduled_end = case
      when c.scheduled_at is null then null
      else coalesce(c.scheduled_end, private.schedule_end_from(c.scheduled_at, coalesce(c.estimated_duration_minutes, c.eta_minutes, private.schedule_default_duration_minutes())))
    end,
    estimated_duration_minutes = case
      when c.scheduled_at is null then o.estimated_duration_minutes
      else coalesce(c.estimated_duration_minutes, c.eta_minutes, private.schedule_default_duration_minutes())
    end,
    agreed_scope = left(c.description, 2000),
    agreed_price = c.base_amount + c.scheduled_fee,
    contracted_at = now(),
    pricing_policy_snapshot = v_policy,
    contract_snapshot = private.contract_snapshot(
      o.id,
      v_uid,
      c.service_id,
      c.service_slug,
      c.service_name,
      c.mode,
      left(c.description, 2000),
      c.base_amount + c.scheduled_fee,
      jsonb_build_array(
        jsonb_build_object(
          'type', 'service',
          'amount', c.base_amount,
          'source', c.price_source
        )
      )
      || case
        when c.scheduled_fee > 0 then jsonb_build_array(
          jsonb_build_object(
            'type', 'scheduled_fee',
            'amount', c.scheduled_fee,
            'source', 'admin_settings.commercial.scheduled_fee'
          )
        )
        else '[]'::jsonb
      end,
      null,
      v_policy,
      now(),
      'direct_accept'
    ),
    price = c.base_amount + c.scheduled_fee
  from candidate c
  where o.id = c.id
  returning o.* into v_order;

  if v_order.id is null then
    raise exception 'El pedido ya fue tomado o no corresponde a tus servicios';
  end if;

  return v_order;
end;
$function$;

create or replace function private.accept_proposal_impl(p_proposal_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_proposal public.order_proposals;
  v_source_order public.orders;
  v_order public.orders;
  v_policy jsonb := private.current_commercial_policy();
  v_agreed_price numeric(12, 2);
  v_agreed_scope text;
  v_schedule_end timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select op.* into v_proposal
  from public.order_proposals op
  join public.orders o on o.id = op.order_id
  where op.id = p_proposal_id
    and o.client_id = v_uid
    and o.status in ('open', 'waiting_quotes')
  for update of op, o;

  if v_proposal.id is null then
    raise exception 'Presupuesto no disponible';
  end if;

  select o.* into v_source_order
  from public.orders o
  where o.id = v_proposal.order_id
  for update;

  perform pg_advisory_xact_lock(hashtextextended(v_proposal.professional_id::text, 0));

  if v_source_order.scheduled_at is not null then
    v_schedule_end := coalesce(
      v_source_order.scheduled_end,
      private.schedule_end_from(
        v_source_order.scheduled_at,
        coalesce(v_source_order.estimated_duration_minutes, v_source_order.eta_minutes, private.schedule_default_duration_minutes())
      )
    );

    if not private.professional_schedule_contains(v_proposal.professional_id, v_source_order.scheduled_at, v_schedule_end) then
      raise exception 'El horario programado no entra en la jornada laboral del profesional';
    end if;

    if private.professional_has_schedule_conflict(v_proposal.professional_id, v_source_order.scheduled_at, v_schedule_end, v_source_order.id) then
      raise exception 'El profesional ya tiene otro trabajo programado en ese horario';
    end if;
  end if;

  v_agreed_price := (
    v_proposal.labor_price
    + v_proposal.materials_price
    + v_proposal.visit_price
    + v_proposal.manito_fee
  )::numeric(12, 2);

  v_agreed_scope := coalesce(nullif(btrim(v_proposal.observation), ''), left(v_source_order.description, 2000));

  update public.order_proposals
  set status = case when id = p_proposal_id then 'accepted' else 'rejected' end
  where order_id = v_proposal.order_id;

  update public.orders o
  set
    professional_id = v_proposal.professional_id,
    status = case when payment_method = 'card' then 'payment_pending' else 'accepted' end,
    payment_status = case when payment_method = 'card' then 'pending' else 'not_required' end,
    online_payment_required = payment_method = 'card',
    payment_required_at = case when payment_method = 'card' then now() else payment_required_at end,
    accepted_at = now(),
    scheduled_end = case
      when v_source_order.scheduled_at is null then null
      else coalesce(v_source_order.scheduled_end, private.schedule_end_from(v_source_order.scheduled_at, coalesce(v_source_order.estimated_duration_minutes, v_source_order.eta_minutes, private.schedule_default_duration_minutes())))
    end,
    estimated_duration_minutes = case
      when v_source_order.scheduled_at is null then o.estimated_duration_minutes
      else coalesce(v_source_order.estimated_duration_minutes, v_source_order.eta_minutes, private.schedule_default_duration_minutes())
    end,
    agreed_scope = v_agreed_scope,
    agreed_price = v_agreed_price,
    contracted_at = now(),
    accepted_proposal_id = v_proposal.id,
    pricing_policy_snapshot = v_policy,
    contract_snapshot = private.contract_snapshot(
      o.id,
      v_proposal.professional_id,
      o.service_id,
      s.slug,
      s.name,
      o.mode,
      v_agreed_scope,
      v_agreed_price,
      jsonb_build_array(
        jsonb_build_object('type', 'labor', 'amount', v_proposal.labor_price),
        jsonb_build_object('type', 'materials', 'amount', v_proposal.materials_price),
        jsonb_build_object('type', 'visit', 'amount', v_proposal.visit_price),
        jsonb_build_object('type', 'manito_fee', 'amount', v_proposal.manito_fee)
      ),
      v_proposal.id,
      v_policy,
      now(),
      'accepted_proposal'
    ),
    price = v_agreed_price
  from public.services s
  where o.id = v_proposal.order_id
    and s.id = o.service_id
  returning o.* into v_order;

  return v_order;
end;
$function$;

drop function if exists public.accept_order(uuid);
drop function if exists public.accept_proposal(uuid);

create function public.accept_order(p_order_id uuid)
returns table (
  id uuid, client_id uuid, professional_id uuid, service_id bigint,
  description text, address text, mode text, scheduled_at timestamptz,
  estimated_duration_minutes integer, scheduled_end timestamptz,
  status text, price numeric, estimated_price numeric, agreed_price numeric,
  agreed_scope text, contracted_at timestamptz, accepted_proposal_id uuid,
  contract_snapshot jsonb, pricing_policy_snapshot jsonb,
  client_lat double precision, client_lng double precision,
  created_at timestamptz, updated_at timestamptz, accepted_at timestamptz,
  completed_at timestamptz, assignment_mode text, preferred_professional_id uuid,
  payment_method text, guarantee_days integer, eta_minutes integer,
  payment_status text, online_payment_required boolean,
  payment_required_at timestamptz, paid_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id, o.client_id, o.professional_id, o.service_id,
    o.description, o.address, o.mode, o.scheduled_at,
    o.estimated_duration_minutes, o.scheduled_end,
    o.status, o.price, o.estimated_price, o.agreed_price,
    o.agreed_scope, o.contracted_at, o.accepted_proposal_id,
    o.contract_snapshot, o.pricing_policy_snapshot,
    o.client_lat, o.client_lng,
    o.created_at, o.updated_at, o.accepted_at,
    o.completed_at, o.assignment_mode, o.preferred_professional_id,
    o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required,
    o.payment_required_at, o.paid_at
  from private.accept_order_impl(p_order_id) as o;
$$;

create function public.accept_proposal(p_proposal_id uuid)
returns table (
  id uuid, client_id uuid, professional_id uuid, service_id bigint,
  description text, address text, mode text, scheduled_at timestamptz,
  estimated_duration_minutes integer, scheduled_end timestamptz,
  status text, price numeric, estimated_price numeric, agreed_price numeric,
  agreed_scope text, contracted_at timestamptz, accepted_proposal_id uuid,
  contract_snapshot jsonb, pricing_policy_snapshot jsonb,
  client_lat double precision, client_lng double precision,
  created_at timestamptz, updated_at timestamptz, accepted_at timestamptz,
  completed_at timestamptz, assignment_mode text, preferred_professional_id uuid,
  payment_method text, guarantee_days integer, eta_minutes integer,
  payment_status text, online_payment_required boolean,
  payment_required_at timestamptz, paid_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id, o.client_id, o.professional_id, o.service_id,
    o.description, o.address, o.mode, o.scheduled_at,
    o.estimated_duration_minutes, o.scheduled_end,
    o.status, o.price, o.estimated_price, o.agreed_price,
    o.agreed_scope, o.contracted_at, o.accepted_proposal_id,
    o.contract_snapshot, o.pricing_policy_snapshot,
    o.client_lat, o.client_lng,
    o.created_at, o.updated_at, o.accepted_at,
    o.completed_at, o.assignment_mode, o.preferred_professional_id,
    o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required,
    o.payment_required_at, o.paid_at
  from private.accept_proposal_impl(p_proposal_id) as o;
$$;

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
  estimated_duration_minutes integer,
  scheduled_end timestamptz,
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
    o.estimated_duration_minutes,
    coalesce(
      o.scheduled_end,
      private.schedule_end_from(
        o.scheduled_at,
        coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())
      )
    ) as scheduled_end,
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
      or private.professional_schedule_contains(
        v_uid,
        o.scheduled_at,
        coalesce(
          o.scheduled_end,
          private.schedule_end_from(
            o.scheduled_at,
            coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())
          )
        )
      )
    )
    and (
      o.scheduled_at is null
      or not private.professional_has_schedule_conflict(
        v_uid,
        o.scheduled_at,
        coalesce(
          o.scheduled_end,
          private.schedule_end_from(
            o.scheduled_at,
            coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())
          )
        ),
        o.id
      )
    )
  order by o.created_at desc;
end;
$$;

revoke all on function public.accept_order(uuid) from public, anon;
revoke all on function public.accept_proposal(uuid) from public, anon;
revoke all on function public.list_professional_opportunities() from public, anon;

grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.accept_proposal(uuid) to authenticated;
grant execute on function public.list_professional_opportunities() to authenticated;

revoke all on function private.current_scheduling_policy() from public, anon, authenticated;
revoke all on function private.scheduling_policy_int(jsonb, text, integer) from public, anon, authenticated;
revoke all on function private.schedule_default_duration_minutes() from public, anon, authenticated;
revoke all on function private.schedule_buffer_minutes() from public, anon, authenticated;
revoke all on function private.schedule_end_from(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.schedule_day_label(timestamptz) from public, anon, authenticated;
revoke all on function private.professional_schedule_contains(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.professional_has_schedule_conflict(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.set_order_schedule_bounds() from public, anon, authenticated;
revoke all on function private.accept_order_impl(uuid) from public, anon, authenticated;
revoke all on function private.accept_proposal_impl(uuid) from public, anon, authenticated;

grant select (
  estimated_duration_minutes,
  scheduled_end
) on public.orders to authenticated;

grant insert (
  estimated_duration_minutes
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
  estimated_duration_minutes,
  scheduled_end,
  status,
  price,
  estimated_price,
  agreed_price,
  agreed_scope,
  contracted_at,
  accepted_proposal_id,
  contract_snapshot,
  pricing_policy_snapshot,
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

insert into public.admin_settings (key, value)
values (
  'norm_005_scheduled_reservation_guard',
  jsonb_build_object(
    'scheduled_start_column', 'orders.scheduled_at',
    'scheduled_duration_column', 'orders.estimated_duration_minutes',
    'scheduled_end_column', 'orders.scheduled_end',
    'default_duration_source', 'admin_settings.scheduling.default_duration_minutes',
    'buffer_source', 'admin_settings.scheduling.schedule_buffer_minutes',
    'default_duration_minutes', private.schedule_default_duration_minutes(),
    'schedule_buffer_minutes', private.schedule_buffer_minutes(),
    'overlap_rule', 'new_start < existing_end and new_end > existing_start',
    'blocking_statuses', jsonb_build_array('payment_pending', 'accepted', 'en_camino', 'en_sitio', 'trabajando'),
    'immediate_availability_rule', 'orders.mode = immediate still requires profiles.is_available',
    'scheduled_availability_rule', 'orders.mode = scheduled ignores current is_available and checks workdays/work_hours/conflicts'
  )
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
