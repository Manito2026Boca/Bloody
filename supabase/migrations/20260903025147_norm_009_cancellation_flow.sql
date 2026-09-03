-- NORM-009: traceable cancellations by order phase.
-- Cancellation is a terminal operational state and must not erase contract,
-- payment, chat, evidence, extra, or proposal history.

alter table public.orders
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_actor text,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_note text,
  add column if not exists cancellation_phase text,
  add column if not exists cancellation_responsibility text,
  add column if not exists cancellation_fee numeric(12, 2) not null default 0;

comment on column public.orders.cancelled_by is
  'NORM-009: authenticated participant who cancelled the order when cancellation was user-initiated.';
comment on column public.orders.cancelled_at is
  'NORM-009: timestamp when the order entered cancelled.';
comment on column public.orders.cancellation_actor is
  'NORM-009: participant role that initiated cancellation: client or professional.';
comment on column public.orders.cancellation_reason is
  'NORM-009: normalized cancellation reason code selected from the actor catalog.';
comment on column public.orders.cancellation_note is
  'NORM-009: optional human note; required for reason other by the RPC.';
comment on column public.orders.cancellation_phase is
  'NORM-009: order status immediately before cancellation.';
comment on column public.orders.cancellation_responsibility is
  'NORM-009: backend-calculated responsibility: client, professional, shared, manito, or undetermined.';
comment on column public.orders.cancellation_fee is
  'NORM-009: backend-calculated cancellation charge. Pilot value is always 0.';

update public.orders
set cancellation_fee = 0
where cancellation_fee is null;

update public.orders
set
  cancelled_at = coalesce(cancelled_at, updated_at, now()),
  cancellation_phase = coalesce(cancellation_phase, 'cancelled'),
  cancellation_responsibility = coalesce(cancellation_responsibility, 'undetermined')
where status = 'cancelled';

alter table public.orders drop constraint if exists orders_cancellation_actor_check;
alter table public.orders add constraint orders_cancellation_actor_check
  check (cancellation_actor is null or cancellation_actor in ('client', 'professional'));

alter table public.orders drop constraint if exists orders_cancellation_reason_check;
alter table public.orders add constraint orders_cancellation_reason_check
  check (
    cancellation_reason is null or cancellation_reason in (
      'service_no_longer_needed',
      'schedule_changed',
      'professional_unavailable_or_delayed',
      'unavailable',
      'schedule_problem',
      'service_not_compatible',
      'emergency',
      'other'
    )
  );

alter table public.orders drop constraint if exists orders_cancellation_phase_check;
alter table public.orders add constraint orders_cancellation_phase_check
  check (
    cancellation_phase is null or cancellation_phase in (
      'open',
      'scheduled_open',
      'waiting_quotes',
      'matching_failed',
      'payment_pending',
      'accepted',
      'en_camino',
      'en_sitio',
      'trabajando',
      'completed',
      'cancelled'
    )
  );

alter table public.orders drop constraint if exists orders_cancellation_responsibility_check;
alter table public.orders add constraint orders_cancellation_responsibility_check
  check (
    cancellation_responsibility is null or cancellation_responsibility in (
      'client',
      'professional',
      'shared',
      'manito',
      'undetermined'
    )
  );

alter table public.orders drop constraint if exists orders_cancellation_fee_check;
alter table public.orders add constraint orders_cancellation_fee_check
  check (cancellation_fee >= 0);

create index if not exists idx_orders_cancelled_at
  on public.orders(cancelled_at desc)
  where status = 'cancelled';

create index if not exists idx_orders_cancelled_by
  on public.orders(cancelled_by)
  where cancelled_by is not null;

drop function if exists private.cancellation_reason_label(text);
create function private.cancellation_reason_label(p_reason text)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_reason
    when 'service_no_longer_needed' then 'ya no necesitaba el servicio'
    when 'schedule_changed' then 'cambio de horario'
    when 'professional_unavailable_or_delayed' then 'el profesional no podia asistir o se demoro'
    when 'unavailable' then 'indisponibilidad'
    when 'schedule_problem' then 'problema de agenda'
    when 'service_not_compatible' then 'trabajo no compatible'
    when 'emergency' then 'emergencia'
    when 'other' then 'otro motivo'
    else 'motivo no especificado'
  end;
$$;

drop function if exists private.cancellation_responsibility(text, text);
create function private.cancellation_responsibility(p_actor text, p_reason text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_actor = 'professional' then 'professional'
    when p_actor = 'client' and p_reason in ('service_no_longer_needed', 'schedule_changed') then 'client'
    when p_actor = 'client' and p_reason = 'professional_unavailable_or_delayed' then 'professional'
    else 'undetermined'
  end;
$$;

drop function if exists public.cancel_order(uuid);
drop function if exists public.cancel_order(uuid, text, text);
drop function if exists private.cancel_order_impl(uuid);
drop function if exists private.cancel_order_impl(uuid, text, text);
create function private.cancel_order_impl(
  p_order_id uuid,
  p_reason text,
  p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_actor text;
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_responsibility text;
  v_payment public.payments;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'El pedido no existe';
  end if;

  if v_order.client_id = v_uid then
    v_actor := 'client';
  elsif v_order.professional_id = v_uid then
    v_actor := 'professional';
  else
    raise exception 'No podés cancelar este pedido';
  end if;

  if v_order.status = 'trabajando' then
    raise exception 'El trabajo ya comenzó. Usá soporte para resolver esta situación.';
  end if;

  if v_order.status in ('completed', 'cancelled') then
    raise exception 'El pedido ya no puede cancelarse';
  end if;

  if v_actor = 'client' then
    if v_order.status not in (
      'open',
      'scheduled_open',
      'waiting_quotes',
      'matching_failed',
      'payment_pending',
      'accepted',
      'en_camino',
      'en_sitio'
    ) then
      raise exception 'El pedido ya no puede cancelarse';
    end if;

    if v_reason not in (
      'service_no_longer_needed',
      'schedule_changed',
      'professional_unavailable_or_delayed',
      'other'
    ) then
      raise exception 'Elegí un motivo de cancelación válido';
    end if;
  else
    if v_order.status not in ('accepted', 'en_camino', 'en_sitio') then
      raise exception 'Usá rechazo de solicitud antes de aceptar el pedido';
    end if;

    if v_reason not in ('unavailable', 'schedule_problem', 'service_not_compatible', 'emergency', 'other') then
      raise exception 'Elegí un motivo de cancelación válido';
    end if;
  end if;

  if v_reason = 'other' and v_note is null then
    raise exception 'Contanos brevemente el motivo de la cancelación';
  end if;

  if exists (
    select 1
    from public.payments p
    where p.order_id = v_order.id
      and p.source_type = 'original'
      and p.status in ('reported', 'confirmed', 'approved', 'disputed')
  ) then
    raise exception 'Este pedido ya tiene un pago informado o en revisión. Usá soporte para resolver esta situación.';
  end if;

  v_responsibility := private.cancellation_responsibility(v_actor, v_reason);

  update public.order_match_candidates
  set
    status = 'closed',
    response_reason = coalesce(response_reason, 'order_cancelled'),
    responded_at = coalesce(responded_at, now()),
    updated_at = now()
  where order_id = v_order.id
    and status = 'pending';

  update public.order_proposals
  set
    status = 'rejected',
    updated_at = now()
  where order_id = v_order.id
    and status = 'sent';

  for v_payment in
    update public.payments
    set
      status = 'cancelled',
      failure_reason = coalesce(failure_reason, 'Pedido cancelado antes de actividad real'),
      updated_at = now()
    where order_id = v_order.id
      and source_type = 'original'
      and status in ('initiated', 'pending', 'awaiting_client_action')
    returning *
  loop
    perform private.record_payment_event(
      v_payment.id,
      v_payment.provider,
      'order_cancelled_before_payment_activity',
      v_uid,
      v_order.id,
      jsonb_build_object(
        'actor', v_actor,
        'reason', v_reason,
        'cancellation_phase', v_order.status
      )
    );
  end loop;

  update public.orders
  set
    status = 'cancelled',
    cancelled_by = v_uid,
    cancelled_at = now(),
    cancellation_actor = v_actor,
    cancellation_reason = v_reason,
    cancellation_note = v_note,
    cancellation_phase = v_order.status,
    cancellation_responsibility = v_responsibility,
    cancellation_fee = 0,
    manual_response_status = case
      when manual_response_status = 'pending' then 'expired'
      else manual_response_status
    end,
    manual_response_reason = case
      when manual_response_status = 'pending' then 'order_cancelled'
      else manual_response_reason
    end,
    manual_responded_at = case
      when manual_response_status = 'pending' then now()
      else manual_responded_at
    end,
    matching_status = case
      when matching_status = 'round_pending' then 'idle'
      else matching_status
    end,
    matching_round_deadline_at = null,
    updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

create function public.cancel_order(
  p_order_id uuid,
  p_reason text,
  p_note text default null
)
returns table (
  id uuid, client_id uuid, professional_id uuid, service_id bigint,
  description text, address text, mode text, scheduled_at timestamptz,
  status text, price numeric, estimated_price numeric, agreed_price numeric,
  agreed_scope text, contracted_at timestamptz, accepted_proposal_id uuid,
  contract_snapshot jsonb, pricing_policy_snapshot jsonb,
  client_lat double precision, client_lng double precision,
  created_at timestamptz, updated_at timestamptz, accepted_at timestamptz,
  completed_at timestamptz, assignment_mode text, preferred_professional_id uuid,
  payment_method text, guarantee_days integer, eta_minutes integer,
  payment_status text, online_payment_required boolean,
  payment_required_at timestamptz, paid_at timestamptz,
  cancelled_by uuid, cancelled_at timestamptz, cancellation_actor text,
  cancellation_reason text, cancellation_note text, cancellation_phase text,
  cancellation_responsibility text, cancellation_fee numeric
)
language sql
security definer
set search_path = ''
as $$
  select
    o.id, o.client_id, o.professional_id, o.service_id,
    o.description, o.address, o.mode, o.scheduled_at,
    o.status, o.price, o.estimated_price, o.agreed_price,
    o.agreed_scope, o.contracted_at, o.accepted_proposal_id,
    o.contract_snapshot, o.pricing_policy_snapshot,
    o.client_lat, o.client_lng,
    o.created_at, o.updated_at, o.accepted_at,
    o.completed_at, o.assignment_mode, o.preferred_professional_id,
    o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required,
    o.payment_required_at, o.paid_at,
    o.cancelled_by, o.cancelled_at, o.cancellation_actor,
    o.cancellation_reason, o.cancellation_note, o.cancellation_phase,
    o.cancellation_responsibility, o.cancellation_fee
  from private.cancel_order_impl(p_order_id, p_reason, p_note) as o;
$$;

create or replace function private.decide_order_extra_impl(p_extra_id uuid, p_status text)
returns public.order_extras
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_extra public.order_extras;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Decisión de adicional inválida';
  end if;

  update public.order_extras oe
  set
    status = p_status,
    decided_at = now()
  from public.orders o
  where oe.id = p_extra_id
    and o.id = oe.order_id
    and o.client_id = v_uid
    and o.status in ('en_sitio', 'trabajando')
    and oe.status = 'pending'
  returning oe.* into v_extra;

  if v_extra.id is null then
    raise exception 'El adicional ya fue decidido o el pedido ya no admite esta acción';
  end if;

  return v_extra;
end;
$$;

create or replace function private.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_reason_label text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'waiting_quotes' then
      v_title := 'Solicitud publicada';
      v_body := 'Los profesionales compatibles ya pueden enviarte presupuestos.';
    elsif new.status = 'scheduled_open' then
      v_title := 'Pedido programado';
      v_body := 'MANITO buscará profesionales compatibles con ese horario.';
    else
      v_title := 'Pedido publicado';
      v_body := 'Estamos buscando un profesional disponible.';
    end if;

    perform private.add_notification(new.client_id, 'order_created', v_title, v_body, new.id, new.client_id);
    return new;
  end if;

  if new.status is distinct from old.status then
    v_title := case new.status
      when 'payment_pending' then 'Falta confirmar el pago'
      when 'accepted' then 'Pedido confirmado'
      when 'en_camino' then 'El profesional va en camino'
      when 'en_sitio' then 'El profesional llegó'
      when 'completed' then 'Trabajo finalizado'
      when 'cancelled' then 'Pedido cancelado'
      else 'Pedido actualizado'
    end;

    if new.status = 'cancelled' then
      v_reason_label := private.cancellation_reason_label(new.cancellation_reason);
      v_body := 'El pedido fue cancelado. Motivo: ' || v_reason_label || '.';
    else
      v_body := case new.status
        when 'payment_pending' then 'El precio quedó definido. Confirmá el pago para habilitar el trabajo.'
        when 'accepted' then 'Ya podés coordinar por el chat del pedido.'
        when 'completed' then 'La constancia MANITO queda disponible para protección y reclamos.'
        else 'Revisá el seguimiento del pedido.'
      end;
    end if;

    perform private.add_notification(new.client_id, 'order_status', v_title, v_body, new.id, new.professional_id);

    if new.professional_id is not null then
      perform private.add_notification(new.professional_id, 'order_status', v_title, v_body, new.id, new.client_id);
    end if;
  elsif new.payment_status is distinct from old.payment_status then
    perform private.add_notification(
      new.client_id,
      'payment_status',
      'Pago actualizado',
      'El estado de pago del pedido cambió.',
      new.id,
      new.professional_id
    );

    if new.professional_id is not null then
      perform private.add_notification(
        new.professional_id,
        'payment_status',
        'Pago actualizado',
        'El estado de pago del pedido cambió.',
        new.id,
        new.client_id
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.cancellation_reason_label(text) from public, anon, authenticated;
revoke all on function private.cancellation_responsibility(text, text) from public, anon, authenticated;
revoke all on function private.cancel_order_impl(uuid, text, text) from public, anon, authenticated;
revoke all on function private.decide_order_extra_impl(uuid, text) from public, anon, authenticated;
revoke all on function private.notify_order_status_change() from public, anon, authenticated;

revoke all on function public.cancel_order(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_order(uuid, text, text) to authenticated;

insert into public.admin_settings (key, value)
values (
  'norm_009_cancellation_flow',
  jsonb_build_object(
    'status', 'implemented',
    'fields', jsonb_build_array(
      'cancelled_by',
      'cancelled_at',
      'cancellation_actor',
      'cancellation_reason',
      'cancellation_note',
      'cancellation_phase',
      'cancellation_responsibility',
      'cancellation_fee'
    ),
    'client_statuses', jsonb_build_array('open', 'scheduled_open', 'waiting_quotes', 'matching_failed', 'payment_pending', 'accepted', 'en_camino', 'en_sitio'),
    'professional_statuses', jsonb_build_array('accepted', 'en_camino', 'en_sitio'),
    'fee_policy', 'pilot_zero_backend_calculated',
    'payment_rule', 'block_reported_confirmed_approved_disputed',
    'notif_debt', 'NOTIF-DEBT-001: NORM-007 manual_request notification kinds are not admitted by notifications_kind_check'
  )
)
on conflict (key) do update set value = excluded.value;
