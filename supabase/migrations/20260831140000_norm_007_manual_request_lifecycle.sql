-- NORM-007: manual professional request lifecycle without automatic fallback.

alter table public.orders
  add column if not exists manual_requested_professional_id uuid references public.profiles(id) on delete set null,
  add column if not exists manual_requested_at timestamptz,
  add column if not exists manual_response_deadline_at timestamptz,
  add column if not exists manual_response_status text,
  add column if not exists manual_response_reason text,
  add column if not exists manual_responded_at timestamptz,
  add column if not exists manual_request_history jsonb not null default '[]'::jsonb;

alter table public.orders drop constraint if exists orders_manual_response_status_check;
alter table public.orders add constraint orders_manual_response_status_check
  check (manual_response_status is null or manual_response_status in ('pending', 'accepted', 'rejected', 'expired'));

comment on column public.orders.manual_requested_professional_id is 'NORM-007 current manually invited professional. Separate from accepted professional_id.';
comment on column public.orders.manual_requested_at is 'NORM-007 timestamp when the current manual invitation was opened.';
comment on column public.orders.manual_response_deadline_at is 'NORM-007 backend deadline for accepting/rejecting the current manual invitation.';
comment on column public.orders.manual_response_status is 'NORM-007 current manual invitation state: pending, accepted, rejected, expired.';
comment on column public.orders.manual_request_history is 'NORM-007 append-only JSON snapshots of previous manual invitations for future matching rounds.';

insert into public.admin_settings (key, value)
values ('manual_requests', jsonb_build_object('schema_version', 1, 'manual_immediate_timeout_seconds', 180, 'manual_scheduled_timeout_minutes', 60))
on conflict (key) do update
set value = excluded.value || public.admin_settings.value,
    updated_at = now();

create or replace function private.current_manual_request_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('schema_version', 1, 'manual_immediate_timeout_seconds', 180, 'manual_scheduled_timeout_minutes', 60)
    || coalesce((select s.value from public.admin_settings s where s.key = 'manual_requests'), '{}'::jsonb);
$$;

create or replace function private.manual_request_timeout_interval(p_mode text)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_mode = 'scheduled' then make_interval(mins => greatest(1, private.scheduling_policy_int(private.current_manual_request_policy(), 'manual_scheduled_timeout_minutes', 60)))
    else make_interval(secs => greatest(1, private.scheduling_policy_int(private.current_manual_request_policy(), 'manual_immediate_timeout_seconds', 180)))
  end;
$$;

create or replace function private.manual_request_deadline(p_mode text, p_requested_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_requested_at, now()) + private.manual_request_timeout_interval(p_mode);
$$;

create or replace function private.manual_request_snapshot(p_order public.orders, p_origin text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'origin', p_origin,
    'professional_id', p_order.manual_requested_professional_id,
    'preferred_professional_id', p_order.preferred_professional_id,
    'requested_at', p_order.manual_requested_at,
    'deadline_at', p_order.manual_response_deadline_at,
    'response_status', p_order.manual_response_status,
    'response_reason', p_order.manual_response_reason,
    'responded_at', p_order.manual_responded_at,
    'recorded_at', now()
  );
$$;

create or replace function private.set_manual_request_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignment_mode = 'manual'
    and new.preferred_professional_id is not null
    and new.professional_id is null
    and new.status in ('open', 'scheduled_open') then
    if tg_op = 'INSERT'
      or old.assignment_mode is distinct from new.assignment_mode
      or old.preferred_professional_id is distinct from new.preferred_professional_id
      or new.manual_requested_at is null then
      new.manual_requested_professional_id := new.preferred_professional_id;
      new.manual_requested_at := coalesce(new.manual_requested_at, now());
      new.manual_response_deadline_at := private.manual_request_deadline(new.mode, new.manual_requested_at);
      new.manual_response_status := coalesce(new.manual_response_status, 'pending');
      new.manual_response_reason := null;
      new.manual_responded_at := null;
    end if;
  elsif new.assignment_mode <> 'manual'
    and new.professional_id is null
    and new.status in ('open', 'scheduled_open') then
    new.preferred_professional_id := null;
    new.manual_requested_professional_id := null;
    new.manual_requested_at := null;
    new.manual_response_deadline_at := null;
    new.manual_response_status := null;
    new.manual_response_reason := null;
    new.manual_responded_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_manual_request_defaults on public.orders;
create trigger trg_orders_manual_request_defaults
before insert or update of assignment_mode, preferred_professional_id, professional_id, status, mode
on public.orders
for each row
execute function private.set_manual_request_defaults();

create or replace function private.notify_manual_request_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignment_mode = 'manual'
    and new.manual_response_status = 'pending'
    and new.preferred_professional_id is not null
    and (tg_op = 'INSERT' or old.preferred_professional_id is distinct from new.preferred_professional_id or old.manual_requested_at is distinct from new.manual_requested_at) then
    perform private.add_notification(
      new.preferred_professional_id,
      'manual_request',
      'Solicitud directa MANITO',
      'Un cliente te eligio para un trabajo. Respondelo antes del vencimiento.',
      new.id,
      new.client_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_manual_request_notify on public.orders;
create trigger trg_orders_manual_request_notify
after insert or update of assignment_mode, preferred_professional_id, manual_requested_at
on public.orders
for each row
execute function private.notify_manual_request_target();

update public.orders o
set manual_requested_professional_id = coalesce(o.manual_requested_professional_id, o.preferred_professional_id),
    manual_requested_at = coalesce(o.manual_requested_at, o.created_at),
    manual_response_deadline_at = coalesce(o.manual_response_deadline_at, private.manual_request_deadline(o.mode, coalesce(o.manual_requested_at, o.created_at))),
    manual_response_status = coalesce(o.manual_response_status, case when private.manual_request_deadline(o.mode, coalesce(o.manual_requested_at, o.created_at)) <= now() then 'expired' else 'pending' end),
    manual_responded_at = case when o.manual_response_status is null and private.manual_request_deadline(o.mode, coalesce(o.manual_requested_at, o.created_at)) <= now() then now() else o.manual_responded_at end
where o.assignment_mode = 'manual'
  and o.preferred_professional_id is not null
  and o.professional_id is null
  and o.status in ('open', 'scheduled_open');

create or replace function private.refresh_manual_order_request_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then return null; end if;
  if v_order.assignment_mode = 'manual'
    and v_order.professional_id is null
    and v_order.status in ('open', 'scheduled_open')
    and v_order.manual_response_status = 'pending'
    and v_order.manual_response_deadline_at <= now() then
    update public.orders
    set manual_response_status = 'expired',
        manual_response_reason = coalesce(manual_response_reason, 'timeout'),
        manual_responded_at = now(),
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
    perform private.add_notification(v_order.client_id, 'manual_request_expired', 'El profesional no respondio a tiempo', 'Podes elegir otro profesional o buscar automaticamente.', v_order.id, v_order.preferred_professional_id);
  end if;
  return v_order;
end;
$$;

create or replace function private.reject_manual_order_request_impl(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_reason text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_order := private.refresh_manual_order_request_impl(p_order_id);
  select * into v_order
  from public.orders
  where id = p_order_id
    and assignment_mode = 'manual'
    and preferred_professional_id = v_uid
    and manual_requested_professional_id = v_uid
    and manual_response_status = 'pending'
    and professional_id is null
    and status in ('open', 'scheduled_open')
  for update;
  if v_order.id is null then raise exception 'Esta solicitud no esta disponible para responder'; end if;
  if v_order.manual_response_deadline_at <= now() then
    v_order := private.refresh_manual_order_request_impl(p_order_id);
    raise exception 'La solicitud ya vencio';
  end if;
  v_reason := case lower(btrim(coalesce(p_reason, '')))
    when 'fuera_de_zona' then 'fuera_de_zona'
    when 'horario' then 'horario'
    when 'trabajo_no_compatible' then 'trabajo_no_compatible'
    when 'otro' then 'otro'
    else 'no_disponible'
  end;
  update public.orders
  set manual_response_status = 'rejected',
      manual_response_reason = v_reason,
      manual_responded_at = now(),
      updated_at = now()
  where id = v_order.id
  returning * into v_order;
  perform private.add_notification(v_order.client_id, 'manual_request_rejected', 'El profesional no pudo tomar el trabajo', 'Podes elegir otro profesional o buscar automaticamente.', v_order.id, v_uid);
  return v_order;
end;
$$;

create or replace function private.manual_order_target_is_valid(p_order public.orders, p_professional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.professional_services ps on ps.professional_id = p.id and ps.service_id = p_order.service_id
    left join public.professional_profiles pp on pp.professional_id = p.id
    where p.id = p_professional_id
      and p.role = 'professional'
      and private.professional_can_receive_orders(p.id)
      and (p_order.mode <> 'immediate' or p.is_available = true)
      and (private.distance_km(p.lat, p.lng, p_order.client_lat, p_order.client_lng) is null or private.distance_km(p.lat, p.lng, p_order.client_lat, p_order.client_lng) <= coalesce(pp.service_radius_km, 8))
      and (
        p_order.scheduled_at is null
        or (
          private.professional_schedule_contains(p.id, p_order.scheduled_at, coalesce(p_order.scheduled_end, private.schedule_end_from(p_order.scheduled_at, coalesce(p_order.estimated_duration_minutes, p_order.eta_minutes, private.schedule_default_duration_minutes()))))
          and not private.professional_has_schedule_conflict(p.id, p_order.scheduled_at, coalesce(p_order.scheduled_end, private.schedule_end_from(p_order.scheduled_at, coalesce(p_order.estimated_duration_minutes, p_order.eta_minutes, private.schedule_default_duration_minutes()))), p_order.id)
        )
      )
  );
$$;

create or replace function private.choose_manual_order_professional_impl(p_order_id uuid, p_professional_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_history jsonb;
  v_requested_at timestamptz := now();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_order := private.refresh_manual_order_request_impl(p_order_id);
  select * into v_order
  from public.orders
  where id = p_order_id
    and client_id = v_uid
    and assignment_mode = 'manual'
    and manual_response_status in ('rejected', 'expired')
    and professional_id is null
    and status in ('open', 'scheduled_open')
    and mode <> 'quote'
  for update;
  if v_order.id is null then raise exception 'No podes cambiar el profesional de este pedido'; end if;
  if not private.manual_order_target_is_valid(v_order, p_professional_id) then raise exception 'Ese profesional no esta disponible para este pedido'; end if;
  v_history := coalesce(v_order.manual_request_history, '[]'::jsonb);
  if v_order.manual_requested_professional_id is not null then
    v_history := v_history || jsonb_build_array(private.manual_request_snapshot(v_order, 'choose_another_professional'));
  end if;
  update public.orders
  set assignment_mode = 'manual',
      preferred_professional_id = p_professional_id,
      manual_requested_professional_id = p_professional_id,
      manual_requested_at = v_requested_at,
      manual_response_deadline_at = private.manual_request_deadline(mode, v_requested_at),
      manual_response_status = 'pending',
      manual_response_reason = null,
      manual_responded_at = null,
      manual_request_history = v_history,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;
  return v_order;
end;
$$;

create or replace function private.fallback_manual_order_to_auto_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_history jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_order := private.refresh_manual_order_request_impl(p_order_id);
  select * into v_order
  from public.orders
  where id = p_order_id
    and client_id = v_uid
    and assignment_mode = 'manual'
    and manual_response_status in ('rejected', 'expired')
    and professional_id is null
    and status in ('open', 'scheduled_open')
    and mode <> 'quote'
  for update;
  if v_order.id is null then raise exception 'No podes cambiar este pedido a busqueda automatica'; end if;
  v_history := coalesce(v_order.manual_request_history, '[]'::jsonb);
  if v_order.manual_requested_professional_id is not null then
    v_history := v_history || jsonb_build_array(private.manual_request_snapshot(v_order, 'fallback_to_auto'));
  end if;
  update public.orders
  set assignment_mode = 'auto',
      preferred_professional_id = null,
      manual_requested_professional_id = null,
      manual_requested_at = null,
      manual_response_deadline_at = null,
      manual_response_status = null,
      manual_response_reason = null,
      manual_responded_at = null,
      manual_request_history = v_history,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;
  perform private.add_notification(v_order.client_id, 'manual_request_auto', 'Busqueda automatica activada', 'Otros profesionales compatibles ya pueden ver el pedido.', v_order.id, v_uid);
  return v_order;
end;
$$;

do $$
begin
  if to_regprocedure('private.accept_order_core_impl(uuid)') is null then
    alter function private.accept_order_impl(uuid) rename to accept_order_core_impl;
  end if;
end $$;

create or replace function private.accept_order_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_before public.orders;
  v_order public.orders;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_before := private.refresh_manual_order_request_impl(p_order_id);
  select * into v_before from public.orders where id = p_order_id for update;
  if v_before.id is null then raise exception 'El pedido ya fue tomado o no corresponde a tus servicios'; end if;
  if v_before.assignment_mode = 'manual' then
    if v_before.preferred_professional_id is distinct from v_uid or v_before.manual_requested_professional_id is distinct from v_uid then
      raise exception 'Esta solicitud directa no corresponde a este profesional';
    end if;
    if v_before.manual_response_status = 'expired' or v_before.manual_response_deadline_at <= now() then
      v_before := private.refresh_manual_order_request_impl(p_order_id);
      raise exception 'La solicitud ya vencio';
    end if;
    if v_before.manual_response_status = 'rejected' then raise exception 'Esta solicitud ya fue rechazada'; end if;
    if v_before.manual_response_status <> 'pending' then raise exception 'Esta solicitud no esta disponible para aceptar'; end if;
  end if;
  v_order := private.accept_order_core_impl(p_order_id);
  if v_before.assignment_mode = 'manual' then
    update public.orders
    set manual_response_status = 'accepted', manual_responded_at = now(), manual_response_reason = null, updated_at = now()
    where id = v_order.id
    returning * into v_order;
  end if;
  return v_order;
end;
$$;

drop function if exists public.accept_order(uuid);
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
  manual_requested_professional_id uuid, manual_requested_at timestamptz,
  manual_response_deadline_at timestamptz, manual_response_status text,
  manual_response_reason text, manual_responded_at timestamptz,
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
    o.manual_requested_professional_id, o.manual_requested_at,
    o.manual_response_deadline_at, o.manual_response_status,
    o.manual_response_reason, o.manual_responded_at,
    o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required,
    o.payment_required_at, o.paid_at
  from private.accept_order_impl(p_order_id) as o;
$$;

drop function if exists public.reject_manual_order_request(uuid, text);
drop function if exists public.refresh_manual_order_request(uuid);
drop function if exists public.choose_manual_order_professional(uuid, uuid);
drop function if exists public.fallback_manual_order_to_auto(uuid);

create function public.reject_manual_order_request(p_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reject_manual_order_request_impl(p_order_id, p_reason);
end;
$$;

create function public.refresh_manual_order_request(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from public.orders o where o.id = p_order_id and v_uid in (o.client_id, o.preferred_professional_id)) then
    raise exception 'No podes actualizar esta solicitud';
  end if;
  perform private.refresh_manual_order_request_impl(p_order_id);
end;
$$;

create function public.choose_manual_order_professional(p_order_id uuid, p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.choose_manual_order_professional_impl(p_order_id, p_professional_id);
end;
$$;

create function public.fallback_manual_order_to_auto(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.fallback_manual_order_to_auto_impl(p_order_id);
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
  assignment_mode text,
  preferred_professional_id uuid,
  manual_requested_professional_id uuid,
  manual_requested_at timestamptz,
  manual_response_deadline_at timestamptz,
  manual_response_status text,
  manual_response_reason text,
  manual_responded_at timestamptz,
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
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.id is null or v_profile.role <> 'professional' or not private.professional_can_receive_orders(v_uid) then return; end if;
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
    o.assignment_mode,
    o.preferred_professional_id,
    o.manual_requested_professional_id,
    o.manual_requested_at,
    o.manual_response_deadline_at,
    o.manual_response_status,
    o.manual_response_reason,
    o.manual_responded_at,
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
    (70 + case when pp.verified then 10 else 0 end + least(10, coalesce(pp.jobs_completed, 0)) + case when private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) is null then 4 else greatest(0, 12 - round(private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng))::integer) end)::integer as match_score,
    array_remove(array[
      case when o.assignment_mode = 'manual' then 'Solicitud directa' when o.mode = 'immediate' then 'Disponible ahora' when o.mode = 'scheduled' then 'Agenda compatible' else 'Puede presupuestar' end,
      case when pp.verified then 'Verificado por MANITO' else 'Revision MANITO aprobada' end,
      case when private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) is not null then round(private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng)::numeric, 1)::text || ' km' else private.order_public_zone(o.address) end
    ], null) as match_reasons,
    private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) as distance_km
  from public.orders o
  join public.services s on s.id = o.service_id
  join public.professional_services ps on ps.professional_id = v_uid and ps.service_id = o.service_id
  left join public.professional_profiles pp on pp.professional_id = v_uid
  where o.professional_id is null
    and o.status in ('open', 'scheduled_open', 'waiting_quotes')
    and (
      o.assignment_mode <> 'manual'
      or (
        o.preferred_professional_id = v_uid
        and o.manual_requested_professional_id = v_uid
        and o.manual_response_status = 'pending'
        and o.manual_response_deadline_at > now()
      )
    )
    and (o.mode <> 'immediate' or v_profile.is_available = true)
    and (private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) is null or private.distance_km(v_profile.lat, v_profile.lng, o.client_lat, o.client_lng) <= coalesce(pp.service_radius_km, 8))
    and (o.scheduled_at is null or private.professional_schedule_contains(v_uid, o.scheduled_at, coalesce(o.scheduled_end, private.schedule_end_from(o.scheduled_at, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())))))
    and (o.scheduled_at is null or not private.professional_has_schedule_conflict(v_uid, o.scheduled_at, coalesce(o.scheduled_end, private.schedule_end_from(o.scheduled_at, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes()))), o.id))
  order by o.created_at desc;
end;
$$;

revoke all on function public.accept_order(uuid) from public, anon;
revoke all on function public.reject_manual_order_request(uuid, text) from public, anon;
revoke all on function public.refresh_manual_order_request(uuid) from public, anon;
revoke all on function public.choose_manual_order_professional(uuid, uuid) from public, anon;
revoke all on function public.fallback_manual_order_to_auto(uuid) from public, anon;
revoke all on function public.list_professional_opportunities() from public, anon;
grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.reject_manual_order_request(uuid, text) to authenticated;
grant execute on function public.refresh_manual_order_request(uuid) to authenticated;
grant execute on function public.choose_manual_order_professional(uuid, uuid) to authenticated;
grant execute on function public.fallback_manual_order_to_auto(uuid) to authenticated;
grant execute on function public.list_professional_opportunities() to authenticated;

revoke all on function private.current_manual_request_policy() from public, anon, authenticated;
revoke all on function private.manual_request_timeout_interval(text) from public, anon, authenticated;
revoke all on function private.manual_request_deadline(text, timestamptz) from public, anon, authenticated;
revoke all on function private.manual_request_snapshot(public.orders, text) from public, anon, authenticated;
revoke all on function private.set_manual_request_defaults() from public, anon, authenticated;
revoke all on function private.notify_manual_request_target() from public, anon, authenticated;
revoke all on function private.refresh_manual_order_request_impl(uuid) from public, anon, authenticated;
revoke all on function private.reject_manual_order_request_impl(uuid, text) from public, anon, authenticated;
revoke all on function private.manual_order_target_is_valid(public.orders, uuid) from public, anon, authenticated;
revoke all on function private.choose_manual_order_professional_impl(uuid, uuid) from public, anon, authenticated;
revoke all on function private.fallback_manual_order_to_auto_impl(uuid) from public, anon, authenticated;
revoke all on function private.accept_order_impl(uuid) from public, anon, authenticated;
revoke all on function private.accept_order_core_impl(uuid) from public, anon, authenticated;

grant select (
  manual_requested_professional_id,
  manual_requested_at,
  manual_response_deadline_at,
  manual_response_status,
  manual_response_reason,
  manual_responded_at,
  manual_request_history
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
  manual_requested_professional_id,
  manual_requested_at,
  manual_response_deadline_at,
  manual_response_status,
  manual_response_reason,
  manual_responded_at,
  payment_method,
  guarantee_days,
  eta_minutes,
  payment_status,
  online_payment_required,
  payment_required_at,
  paid_at
);

insert into public.admin_settings (key, value)
values ('norm_007_manual_request_lifecycle', jsonb_build_object(
  'current_request_columns', jsonb_build_array('manual_requested_professional_id', 'manual_requested_at', 'manual_response_deadline_at', 'manual_response_status', 'manual_response_reason', 'manual_responded_at'),
  'history_column', 'manual_request_history',
  'response_states', jsonb_build_array('pending', 'accepted', 'rejected', 'expired'),
  'manual_immediate_timeout_seconds_source', 'admin_settings.manual_requests.manual_immediate_timeout_seconds',
  'manual_scheduled_timeout_minutes_source', 'admin_settings.manual_requests.manual_scheduled_timeout_minutes',
  'fallback_rule', 'client_explicit_only',
  'expiration_rule', 'lazy_backend_refresh_on_accept_or_explicit_refresh',
  'future_norm_006_ready', true
))
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
