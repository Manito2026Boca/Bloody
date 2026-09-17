-- DIRECT-REQUEST-TIMEOUT-001: backend-authoritative 10/30 minute direct invitation policy.

insert into public.admin_settings(key, value)
values ('manual_requests', jsonb_build_object(
  'schema_version', 2,
  'direct_request_timeout_now_minutes', 10,
  'direct_request_timeout_scheduled_minutes', 30
))
on conflict (key) do update
set value = (public.admin_settings.value
      - 'manual_immediate_timeout_seconds'
      - 'manual_scheduled_timeout_minutes')
    || excluded.value,
    updated_at = now();

create or replace function private.current_manual_request_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'schema_version', 2,
    'direct_request_timeout_now_minutes', 10,
    'direct_request_timeout_scheduled_minutes', 30
  ) || coalesce((
    select s.value
    from public.admin_settings s
    where s.key = 'manual_requests'
  ), '{}'::jsonb);
$function$;

create or replace function private.manual_request_timeout_interval(p_mode text)
returns interval
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p_mode = 'scheduled' then make_interval(mins => greatest(
      1,
      private.scheduling_policy_int(
        private.current_manual_request_policy(),
        'direct_request_timeout_scheduled_minutes',
        30
      )
    ))
    else make_interval(mins => greatest(
      1,
      private.scheduling_policy_int(
        private.current_manual_request_policy(),
        'direct_request_timeout_now_minutes',
        10
      )
    ))
  end;
$function$;

-- Apply the approved policy to unresolved direct invitations without recreating them.
update public.orders
set manual_response_deadline_at = manual_requested_at + private.manual_request_timeout_interval(mode),
    updated_at = now()
where assignment_mode = 'manual'
  and professional_id is null
  and manual_response_status = 'pending'
  and manual_requested_at is not null
  and mode in ('immediate', 'scheduled');

-- Persist lazy expiry and return an unavailable row instead of raising after the write.
create or replace function private.accept_order_pre_matching_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_before public.orders;
  v_order public.orders;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_before from public.orders where id = p_order_id for update;
  if v_before.id is null then raise exception 'El pedido ya fue tomado o no corresponde a tus servicios'; end if;
  if v_before.assignment_mode = 'manual' then
    if v_before.preferred_professional_id is distinct from v_uid
      or v_before.manual_requested_professional_id is distinct from v_uid then
      raise exception 'Esta solicitud directa no corresponde a este profesional';
    end if;
    if v_before.manual_response_status = 'expired' or v_before.manual_response_deadline_at <= now() then
      return private.refresh_manual_order_request_impl(p_order_id);
    end if;
    if v_before.manual_response_status = 'rejected' then raise exception 'Esta solicitud ya fue rechazada'; end if;
    if v_before.manual_response_status <> 'pending' then raise exception 'Esta solicitud no esta disponible para aceptar'; end if;
  end if;

  v_order := private.accept_order_core_impl(p_order_id);
  if v_before.assignment_mode = 'manual' then
    update public.orders
    set manual_response_status = 'accepted',
        manual_responded_at = now(),
        manual_response_reason = null,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
  end if;
  return v_order;
end;
$function$;

-- Rejection uses the same locked deadline boundary and commits lazy expiry cleanly.
create or replace function private.reject_manual_order_request_impl(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_reason text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null
    or v_order.assignment_mode <> 'manual'
    or v_order.preferred_professional_id is distinct from v_uid
    or v_order.manual_requested_professional_id is distinct from v_uid
    or v_order.professional_id is not null
    or v_order.status not in ('open', 'scheduled_open') then
    raise exception 'Esta solicitud no esta disponible para responder';
  end if;
  if v_order.manual_response_status = 'expired' or v_order.manual_response_deadline_at <= now() then
    return private.refresh_manual_order_request_impl(p_order_id);
  end if;
  if v_order.manual_response_status <> 'pending' then
    raise exception 'Esta solicitud no esta disponible para responder';
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
$function$;

create or replace function public.accept_order(p_order_id uuid)
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
  matching_status text, matching_started_at timestamptz,
  matching_current_round integer, matching_cycle integer,
  matching_round_deadline_at timestamptz, matching_failed_at timestamptz,
  payment_method text, guarantee_days integer, eta_minutes integer,
  payment_status text, online_payment_required boolean,
  payment_required_at timestamptz, paid_at timestamptz
)
language sql
security definer
set search_path = ''
as $function$
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
    o.matching_status, o.matching_started_at,
    o.matching_current_round, o.matching_cycle,
    o.matching_round_deadline_at, o.matching_failed_at,
    o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required,
    o.payment_required_at, o.paid_at
  from private.accept_order_impl(p_order_id) as o
  where o.professional_id = auth.uid();
$function$;

revoke all on function private.current_manual_request_policy() from public, anon, authenticated;
revoke all on function private.manual_request_timeout_interval(text) from public, anon, authenticated;
revoke all on function private.accept_order_pre_matching_impl(uuid) from public, anon, authenticated;
revoke all on function private.reject_manual_order_request_impl(uuid, text) from public, anon, authenticated;
revoke all on function public.accept_order(uuid) from public, anon;
grant execute on function public.accept_order(uuid) to authenticated;

insert into public.admin_settings(key, value)
values ('direct_request_timeout_001', jsonb_build_object(
  'policy_source', 'admin_settings.manual_requests',
  'now_minutes', 10,
  'scheduled_minutes', 30,
  'quote_proposals_unchanged', true,
  'expiration_authority', 'backend',
  'schema_version', 1
))
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
