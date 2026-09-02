-- NORM-008: complete quote proposal lifecycle.
-- Adds real validity, active proposal limits, editable sent proposals,
-- lazy expiration and quote comparison support without changing NORM-003 contracts.

alter table public.order_proposals
  add column if not exists valid_until timestamptz,
  add column if not exists available_from timestamptz;

comment on column public.order_proposals.valid_until is
  'NORM-008 proposal validity deadline. Sent proposals expire lazily when valid_until <= now().';
comment on column public.order_proposals.available_from is
  'NORM-008 optional structured availability start supplied by the professional.';

alter table public.order_proposals drop constraint if exists order_proposals_sent_valid_until_required;
alter table public.order_proposals
  add constraint order_proposals_sent_valid_until_required
  check (status <> 'sent' or valid_until is not null);

alter table public.order_proposals drop constraint if exists order_proposals_estimated_minutes_range;
alter table public.order_proposals
  add constraint order_proposals_estimated_minutes_range
  check (estimated_minutes is null or estimated_minutes between 15 and 1440);

insert into public.admin_settings (key, value)
values (
  'quote_proposals',
  jsonb_build_object(
    'schema_version', 1,
    'quote_proposal_ttl_days', 7,
    'quote_max_active_proposals', 5,
    'source', 'admin_settings.quote_proposals'
  )
)
on conflict (key) do update
set
  value = jsonb_build_object(
    'schema_version', 1,
    'quote_proposal_ttl_days', 7,
    'quote_max_active_proposals', 5,
    'source', 'admin_settings.quote_proposals'
  ) || public.admin_settings.value,
  updated_at = now();

create or replace function private.current_quote_proposals_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'quote_proposal_ttl_days', 7,
    'quote_max_active_proposals', 5,
    'source', 'admin_settings.quote_proposals'
  ) || coalesce((
    select s.value
    from public.admin_settings s
    where s.key = 'quote_proposals'
  ), '{}'::jsonb);
$$;

create or replace function private.quote_policy_int(p_policy jsonb, p_key text, p_default integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(1, coalesce(nullif(p_policy ->> p_key, '')::integer, p_default));
$$;

create or replace function private.quote_proposal_ttl_interval()
returns interval
language sql
stable
set search_path = ''
as $$
  select make_interval(days => private.quote_policy_int(private.current_quote_proposals_policy(), 'quote_proposal_ttl_days', 7));
$$;

create or replace function private.quote_max_active_proposals()
returns integer
language sql
stable
set search_path = ''
as $$
  select private.quote_policy_int(private.current_quote_proposals_policy(), 'quote_max_active_proposals', 5);
$$;

create or replace function private.expire_order_proposals_impl(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer := 0;
begin
  update public.order_proposals op
  set
    status = 'expired',
    updated_at = now()
  where op.order_id = p_order_id
    and op.status = 'sent'
    and op.valid_until <= now();

  get diagnostics v_expired = row_count;
  return v_expired;
end;
$$;

with policy as (
  select private.quote_proposal_ttl_interval() as ttl
)
update public.order_proposals op
set valid_until = now() + policy.ttl
from policy
where op.status = 'sent'
  and op.valid_until is null;

drop function if exists public.send_order_proposal(uuid, numeric, numeric, numeric, numeric, integer, text, text);
drop function if exists private.send_order_proposal_impl(uuid, numeric, numeric, numeric, numeric, integer, text, text);

create function private.send_order_proposal_impl(
  p_order_id uuid,
  p_labor_price numeric,
  p_materials_price numeric,
  p_visit_price numeric,
  p_manito_fee numeric,
  p_estimated_minutes integer,
  p_availability_label text,
  p_observation text,
  p_available_from timestamptz default null
)
returns public.order_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_policy jsonb := private.current_commercial_policy();
  v_manito_fee numeric(12, 2);
  v_existing public.order_proposals;
  v_order public.orders;
  v_active_count integer := 0;
  v_proposal public.order_proposals;
  v_valid_until timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_estimated_minutes is not null and (p_estimated_minutes < 15 or p_estimated_minutes > 1440) then
    raise exception 'La duracion estimada debe estar entre 15 minutos y 24 horas';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 80));

  perform private.expire_order_proposals_impl(p_order_id);

  if not private.professional_can_receive_orders(v_uid) then
    raise exception 'Tu alta profesional todavia no esta aprobada por MANITO';
  end if;

  select o.* into v_order
  from public.orders o
  join public.professional_services ps
    on ps.professional_id = v_uid
   and ps.service_id = o.service_id
  where o.id = p_order_id
    and o.status = 'waiting_quotes'
    and o.professional_id is null
  for update of o;

  if v_order.id is null then
    raise exception 'Esta solicitud no esta disponible para presupuestar';
  end if;

  select op.* into v_existing
  from public.order_proposals op
  where op.order_id = p_order_id
    and op.professional_id = v_uid
  for update;

  if v_existing.id is not null and v_existing.status <> 'sent' then
    raise exception 'El presupuesto ya fue cerrado y no puede modificarse';
  end if;

  if v_existing.id is null then
    select count(*)::integer into v_active_count
    from public.order_proposals op
    where op.order_id = p_order_id
      and op.status = 'sent'
      and op.valid_until > now();

    if v_active_count >= private.quote_max_active_proposals() then
      raise exception 'Este pedido ya recibio el maximo de presupuestos vigentes';
    end if;
  end if;

  v_manito_fee := case
    when private.policy_bool(v_policy, 'proposal_fee_enabled', false)
      then greatest(0, private.policy_number(v_policy, 'proposal_fee', 0))
    else 0
  end;
  v_valid_until := now() + private.quote_proposal_ttl_interval();

  insert into public.order_proposals (
    order_id,
    professional_id,
    labor_price,
    materials_price,
    visit_price,
    manito_fee,
    estimated_minutes,
    availability_label,
    available_from,
    observation,
    valid_until,
    status
  )
  values (
    p_order_id,
    v_uid,
    greatest(0, coalesce(p_labor_price, 0)),
    greatest(0, coalesce(p_materials_price, 0)),
    greatest(0, coalesce(p_visit_price, 0)),
    v_manito_fee,
    p_estimated_minutes,
    nullif(btrim(coalesce(p_availability_label, '')), ''),
    p_available_from,
    nullif(btrim(coalesce(p_observation, '')), ''),
    v_valid_until,
    'sent'
  )
  on conflict (order_id, professional_id) do update
  set
    labor_price = excluded.labor_price,
    materials_price = excluded.materials_price,
    visit_price = excluded.visit_price,
    manito_fee = excluded.manito_fee,
    estimated_minutes = excluded.estimated_minutes,
    availability_label = excluded.availability_label,
    available_from = excluded.available_from,
    observation = excluded.observation,
    valid_until = excluded.valid_until,
    status = 'sent',
    updated_at = now()
  where public.order_proposals.status = 'sent'
    and public.order_proposals.valid_until > now()
  returning * into v_proposal;

  if v_proposal.id is null then
    raise exception 'El presupuesto ya fue cerrado y no puede modificarse';
  end if;

  return v_proposal;
end;
$$;

create function public.send_order_proposal(
  p_order_id uuid,
  p_labor_price numeric,
  p_materials_price numeric,
  p_visit_price numeric,
  p_manito_fee numeric,
  p_estimated_minutes integer default null,
  p_availability_label text default null,
  p_observation text default null,
  p_available_from timestamptz default null
)
returns public.order_proposals
language sql
security definer
set search_path = ''
as $$
  select * from private.send_order_proposal_impl(
    p_order_id,
    p_labor_price,
    p_materials_price,
    p_visit_price,
    p_manito_fee,
    p_estimated_minutes,
    p_availability_label,
    p_observation,
    p_available_from
  );
$$;

create or replace function private.notify_proposal_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  if old.status = 'sent'
    and new.status = 'sent'
    and (
      new.labor_price is distinct from old.labor_price
      or new.materials_price is distinct from old.materials_price
      or new.visit_price is distinct from old.visit_price
      or new.manito_fee is distinct from old.manito_fee
      or new.estimated_minutes is distinct from old.estimated_minutes
      or new.availability_label is distinct from old.availability_label
      or new.available_from is distinct from old.available_from
      or new.observation is distinct from old.observation
    )
  then
    select o.client_id into v_client_id
    from public.orders o
    where o.id = new.order_id;

    perform private.add_notification(
      v_client_id,
      'proposal_received',
      'Presupuesto actualizado',
      'Un profesional actualizo su presupuesto. Revisalo antes de elegir.',
      new.order_id,
      new.professional_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_proposals_notify_material_update on public.order_proposals;
create trigger trg_order_proposals_notify_material_update
after update of labor_price, materials_price, visit_price, manito_fee, estimated_minutes, availability_label, available_from, observation
on public.order_proposals
for each row execute function private.notify_proposal_update();

create or replace function private.accept_proposal_impl(p_proposal_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_proposal public.order_proposals;
  v_source_order public.orders;
  v_order public.orders;
  v_policy jsonb := private.current_commercial_policy();
  v_agreed_price numeric(12, 2);
  v_agreed_scope text;
  v_schedule_end timestamptz;
  v_order_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select op.order_id into v_order_id
  from public.order_proposals op
  where op.id = p_proposal_id;

  if v_order_id is null then
    raise exception 'Presupuesto no disponible';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_order_id::text, 80));
  perform private.expire_order_proposals_impl(v_order_id);

  select op.* into v_proposal
  from public.order_proposals op
  join public.orders o on o.id = op.order_id
  where op.id = p_proposal_id
    and op.status = 'sent'
    and op.valid_until > now()
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

  if not private.professional_can_receive_orders(v_proposal.professional_id) then
    raise exception 'El profesional ya no esta habilitado para recibir pedidos';
  end if;

  if not exists (
    select 1
    from public.professional_services ps
    where ps.professional_id = v_proposal.professional_id
      and ps.service_id = v_source_order.service_id
  ) then
    raise exception 'El profesional ya no ofrece este servicio';
  end if;

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
  set status = case
    when id = p_proposal_id then 'accepted'
    when status = 'sent' then 'rejected'
    else status
  end
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
$$;

drop function if exists public.accept_proposal(uuid);
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

create or replace function public.list_order_proposals(p_order_id uuid)
returns table (
  id uuid,
  order_id uuid,
  professional_id uuid,
  labor_price numeric,
  materials_price numeric,
  visit_price numeric,
  manito_fee numeric,
  estimated_minutes integer,
  availability_label text,
  available_from timestamptz,
  observation text,
  status text,
  valid_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  professional jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  perform private.expire_order_proposals_impl(p_order_id);

  return query
  select
    op.id,
    op.order_id,
    op.professional_id,
    op.labor_price,
    op.materials_price,
    op.visit_price,
    op.manito_fee,
    op.estimated_minutes,
    op.availability_label,
    op.available_from,
    op.observation,
    op.status,
    op.valid_until,
    op.created_at,
    op.updated_at,
    jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'city', p.city,
      'rating_avg', coalesce(pp.rating_avg, 0),
      'jobs_completed', coalesce(pp.jobs_completed, 0),
      'verified', coalesce(pp.verified, false),
      'manito_pro', coalesce(pp.manito_pro, false)
    ) as professional
  from public.order_proposals op
  join public.orders o on o.id = op.order_id
  join public.profiles p on p.id = op.professional_id
  left join public.professional_profiles pp on pp.professional_id = op.professional_id
  where op.order_id = p_order_id
    and (
      o.client_id = v_uid
      or op.professional_id = v_uid
      or private.is_manito_admin()
    )
  order by
    case when op.status = 'sent' and op.valid_until > now() then 0 else 1 end,
    op.updated_at desc,
    op.created_at desc;
end;
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
  estimated_price numeric,
  agreed_price numeric,
  agreed_scope text,
  contracted_at timestamptz,
  accepted_proposal_id uuid,
  contract_snapshot jsonb,
  pricing_policy_snapshot jsonb,
  assignment_mode text,
  preferred_professional_id uuid,
  manual_requested_professional_id uuid,
  manual_requested_at timestamptz,
  manual_response_deadline_at timestamptz,
  manual_response_status text,
  manual_response_reason text,
  manual_responded_at timestamptz,
  matching_status text,
  matching_started_at timestamptz,
  matching_current_round integer,
  matching_cycle integer,
  matching_round_deadline_at timestamptz,
  matching_failed_at timestamptz,
  matching_candidate_id uuid,
  matching_candidate_status text,
  matching_candidate_round integer,
  matching_candidate_deadline_at timestamptz,
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
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select p.* into v_profile from public.profiles p where p.id = v_uid;
  if v_profile.id is null or v_profile.role <> 'professional' or not private.professional_can_receive_orders(v_uid) then return; end if;

  perform private.refresh_immediate_matching_for_professional_impl(v_uid);
  perform private.expire_order_proposals_impl(o.id)
  from public.orders o
  where o.status = 'waiting_quotes';

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
    coalesce(o.scheduled_end, private.schedule_end_from(o.scheduled_at, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes()))) as scheduled_end,
    o.status,
    o.price,
    o.estimated_price,
    o.agreed_price,
    o.agreed_scope,
    o.contracted_at,
    o.accepted_proposal_id,
    o.contract_snapshot,
    o.pricing_policy_snapshot,
    o.assignment_mode,
    o.preferred_professional_id,
    o.manual_requested_professional_id,
    o.manual_requested_at,
    o.manual_response_deadline_at,
    o.manual_response_status,
    o.manual_response_reason,
    o.manual_responded_at,
    o.matching_status,
    o.matching_started_at,
    o.matching_current_round,
    o.matching_cycle,
    o.matching_round_deadline_at,
    o.matching_failed_at,
    mc.id as matching_candidate_id,
    mc.status as matching_candidate_status,
    mc.round_number as matching_candidate_round,
    mc.deadline_at as matching_candidate_deadline_at,
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
    coalesce(mc.score, (70 + case when pp.verified then 10 else 0 end + least(10, coalesce(pp.jobs_completed, 0)) + case when private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) is null then 4 else greatest(0, 12 - round(private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng))::integer) end)::integer) as match_score,
    coalesce(mc.reasons, array_remove(array[
      case when o.assignment_mode = 'manual' then 'Solicitud directa' when o.mode = 'scheduled' then 'Agenda compatible' else 'Puede presupuestar' end,
      case when pp.verified then 'Verificado por MANITO' else 'Revision MANITO aprobada' end,
      case when private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) is not null then round(private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng)::numeric, 1)::text || ' km' else private.order_public_zone(o.address) end
    ], null)) as match_reasons,
    coalesce(mc.distance_km, private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng)) as distance_km
  from public.orders o
  join public.services s on s.id = o.service_id
  join public.professional_services ps on ps.professional_id = v_uid and ps.service_id = o.service_id
  left join public.professional_profiles pp on pp.professional_id = v_uid
  left join public.order_match_candidates mc
    on mc.order_id = o.id
   and mc.professional_id = v_uid
   and mc.cycle_number = coalesce(o.matching_cycle, 1)
   and mc.round_number = o.matching_current_round
  where o.professional_id is null
    and o.status in ('open', 'scheduled_open', 'waiting_quotes')
    and (
      (
        o.mode = 'immediate'
        and coalesce(o.assignment_mode, 'auto') = 'auto'
        and v_profile.is_available = true
        and mc.status = 'pending'
        and mc.deadline_at > now()
      )
      or (
        o.assignment_mode = 'manual'
        and o.preferred_professional_id = v_uid
        and o.manual_requested_professional_id = v_uid
        and o.manual_response_status = 'pending'
        and o.manual_response_deadline_at > now()
      )
      or (
        o.mode <> 'immediate'
        and coalesce(o.assignment_mode, 'auto') <> 'manual'
      )
    )
    and (
      o.mode <> 'quote'
      or exists (
        select 1
        from public.order_proposals own_op
        where own_op.order_id = o.id
          and own_op.professional_id = v_uid
          and own_op.status = 'sent'
          and own_op.valid_until > now()
      )
      or (
        select count(*)::integer
        from public.order_proposals active_op
        where active_op.order_id = o.id
          and active_op.status = 'sent'
          and active_op.valid_until > now()
      ) < private.quote_max_active_proposals()
    )
    and (o.scheduled_at is null or private.professional_schedule_contains(v_uid, o.scheduled_at, coalesce(o.scheduled_end, private.schedule_end_from(o.scheduled_at, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())))))
    and (o.scheduled_at is null or not private.professional_has_schedule_conflict(v_uid, o.scheduled_at, coalesce(o.scheduled_end, private.schedule_end_from(o.scheduled_at, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes()))), o.id))
  order by coalesce(mc.score, 0) desc, o.created_at desc;
end;
$$;

revoke all on function private.current_quote_proposals_policy() from public, anon, authenticated;
revoke all on function private.quote_policy_int(jsonb, text, integer) from public, anon, authenticated;
revoke all on function private.quote_proposal_ttl_interval() from public, anon, authenticated;
revoke all on function private.quote_max_active_proposals() from public, anon, authenticated;
revoke all on function private.expire_order_proposals_impl(uuid) from public, anon, authenticated;
revoke all on function private.send_order_proposal_impl(uuid, numeric, numeric, numeric, numeric, integer, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.notify_proposal_update() from public, anon, authenticated;
revoke all on function private.prevent_accepted_proposal_changes() from public, anon, authenticated;
revoke all on function public.send_order_proposal(uuid, numeric, numeric, numeric, numeric, integer, text, text, timestamptz) from public, anon;
revoke all on function public.accept_proposal(uuid) from public, anon;
revoke all on function public.list_order_proposals(uuid) from public, anon;
revoke all on function public.list_professional_opportunities() from public, anon;

grant execute on function public.send_order_proposal(uuid, numeric, numeric, numeric, numeric, integer, text, text, timestamptz) to authenticated;
grant execute on function public.accept_proposal(uuid) to authenticated;
grant execute on function public.list_order_proposals(uuid) to authenticated;
grant execute on function public.list_professional_opportunities() to authenticated;

insert into public.admin_settings (key, value)
values (
  'norm_008_budget_flow',
  jsonb_build_object(
    'status', 'implemented',
    'proposal_validity', 'order_proposals.valid_until',
    'expiration', 'lazy_backend_refresh_on_list_send_accept',
    'max_active_source', 'admin_settings.quote_proposals.quote_max_active_proposals',
    'ttl_source', 'admin_settings.quote_proposals.quote_proposal_ttl_days',
    'frontend_fee_rule', 'manito_fee_parameter_ignored_backend_policy_wins',
    'implemented_at', now()
  )
)
on conflict (key) do update
set value = excluded.value, updated_at = now();
