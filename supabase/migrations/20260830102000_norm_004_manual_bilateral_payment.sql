-- NORM-004: manual bilateral payment confirmation.
-- Manual payments are no longer confirmed by the client alone. The client reports
-- payment, then the assigned professional confirms receipt or disputes it.

alter table public.payments
  add column if not exists reported_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists disputed_at timestamptz,
  add column if not exists reported_by uuid references public.profiles(id) on delete set null,
  add column if not exists confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists disputed_by uuid references public.profiles(id) on delete set null,
  add column if not exists receipt_path text;

alter table public.payments
  drop constraint if exists payments_status_check;

alter table public.payments
  add constraint payments_status_check
  check (status in (
    'initiated',
    'pending',
    'awaiting_client_action',
    'reported',
    'confirmed',
    'disputed',
    'approved',
    'rejected',
    'cancelled',
    'refunded',
    'partially_refunded',
    'expired'
  ));

comment on column public.payments.status is
  'Manual NORM-004 statuses: reported means client says paid, confirmed means professional says received, disputed means professional rejected receipt. approved remains legacy/online compatibility.';
comment on column public.payments.receipt_path is
  'Optional future private receipt object path. A receipt is evidence, not automatic confirmation.';

create unique index if not exists payments_one_active_original_per_order
  on public.payments(order_id)
  where source_type = 'original'
    and status in (
      'initiated',
      'pending',
      'awaiting_client_action',
      'reported',
      'confirmed',
      'disputed',
      'approved'
    );

create or replace function private.manual_payment_provider(p_payment_method text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_payment_method = 'cash' then 'cash'
    when p_payment_method = 'wallet' then 'wallet'
    else 'manual'
  end;
$$;

create or replace function private.record_payment_event(
  p_payment_id uuid,
  p_provider text,
  p_event_type text,
  p_actor_id uuid,
  p_order_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_events (
    payment_id,
    provider,
    event_type,
    payload,
    processing_status,
    processed_at
  )
  values (
    p_payment_id,
    p_provider,
    p_event_type,
    jsonb_strip_nulls(
      jsonb_build_object(
        'actor_id', p_actor_id,
        'order_id', p_order_id
      ) || coalesce(p_payload, '{}'::jsonb)
    ),
    'processed',
    now()
  );
end;
$$;

create or replace function private.sync_order_payment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_confirmed boolean;
  v_has_reported boolean;
  v_has_disputed boolean;
  v_confirmed_at timestamptz;
begin
  select
    bool_or(status in ('confirmed', 'approved') and source_type = 'original'),
    bool_or(status in ('initiated', 'pending', 'awaiting_client_action', 'reported') and source_type = 'original'),
    bool_or(status in ('disputed', 'rejected') and source_type = 'original'),
    min(coalesce(confirmed_at, approved_at)) filter (
      where status in ('confirmed', 'approved') and source_type = 'original'
    )
  into v_has_confirmed, v_has_reported, v_has_disputed, v_confirmed_at
  from public.payments
  where order_id = new.order_id;

  update public.orders
  set
    payment_status = case
      when coalesce(v_has_confirmed, false) then 'paid'
      when coalesce(v_has_disputed, false) then 'rejected'
      when coalesce(v_has_reported, false) then 'pending'
      else payment_status
    end,
    paid_at = case
      when coalesce(v_has_confirmed, false) then coalesce(v_confirmed_at, now())
      else paid_at
    end
  where id = new.order_id;

  return new;
end;
$$;

drop trigger if exists trg_payments_sync_order_status on public.payments;
create trigger trg_payments_sync_order_status
after insert or update of status, approved_at, confirmed_at on public.payments
for each row execute function private.sync_order_payment_status();

drop policy if exists payment_events_select_admin on public.payment_events;
drop policy if exists payment_events_select_participants_or_admin on public.payment_events;
create policy payment_events_select_participants_or_admin on public.payment_events
for select
to authenticated
using (
  exists (
    select 1
    from public.payments p
    where p.id = payment_events.payment_id
      and (
        p.client_id = (select auth.uid())
        or p.professional_id = (select auth.uid())
        or exists (
          select 1
          from public.profiles admin_profile
          where admin_profile.id = (select auth.uid())
            and admin_profile.role = 'admin'
        )
      )
  )
);

create or replace function private.report_order_payment_impl(
  p_order_id uuid,
  p_receipt_path text default null
)
returns public.orders
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment public.payments;
  v_policy jsonb;
  v_service_total numeric(12, 2);
  v_amount numeric(12, 2);
  v_fee numeric(12, 2);
  v_provider text;
  v_receipt_path text := nullif(btrim(coalesce(p_receipt_path, '')), '');
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and client_id = v_uid
    and professional_id is not null
    and status = 'completed'
    and payment_method in ('cash', 'wallet', 'transfer')
  for update;

  if v_order.id is null then
    raise exception 'El pago manual se puede reportar cuando el trabajo ya fue finalizado';
  end if;

  select * into v_payment
  from public.payments
  where order_id = v_order.id
    and source_type = 'original'
    and status in (
      'initiated',
      'pending',
      'awaiting_client_action',
      'reported',
      'confirmed',
      'disputed',
      'approved'
    )
  order by created_at desc
  limit 1
  for update;

  if v_payment.status in ('confirmed', 'approved') then
    raise exception 'El pago ya fue confirmado';
  end if;

  if v_payment.status = 'disputed' then
    raise exception 'El pago esta en revision';
  end if;

  v_policy := coalesce(v_order.pricing_policy_snapshot, private.current_commercial_policy());
  v_service_total := private.order_service_total_amount(v_order.id);
  v_amount := private.order_client_total_amount(v_order.id);
  v_fee := private.order_commission_amount(v_service_total, v_policy);
  v_provider := private.manual_payment_provider(v_order.payment_method);

  if v_payment.id is null then
    insert into public.payments (
      order_id,
      client_id,
      professional_id,
      provider,
      amount,
      manito_fee,
      professional_amount,
      currency,
      status,
      payment_method,
      reported_at,
      reported_by,
      receipt_path
    )
    values (
      v_order.id,
      v_order.client_id,
      v_order.professional_id,
      v_provider,
      v_amount,
      v_fee,
      greatest(0, v_service_total - v_fee),
      coalesce(v_policy->>'currency', 'ARS'),
      'reported',
      coalesce(v_order.payment_method::text, 'manual'),
      now(),
      v_uid,
      v_receipt_path
    )
    returning * into v_payment;
  else
    update public.payments
    set
      status = 'reported',
      amount = v_amount,
      manito_fee = v_fee,
      professional_amount = greatest(0, v_service_total - v_fee),
      currency = coalesce(v_policy->>'currency', 'ARS'),
      reported_at = coalesce(reported_at, now()),
      reported_by = coalesce(reported_by, v_uid),
      receipt_path = coalesce(v_receipt_path, receipt_path)
    where id = v_payment.id
    returning * into v_payment;
  end if;

  perform private.record_payment_event(
    v_payment.id,
    v_provider,
    'client_reported_payment',
    v_uid,
    v_order.id,
    jsonb_build_object(
      'payment_method', v_order.payment_method,
      'amount', v_amount,
      'receipt_attached', v_payment.receipt_path is not null
    )
  );

  perform private.add_notification(
    v_order.professional_id,
    'payment_status',
    'Pago reportado',
    case
      when v_order.payment_method = 'cash' then 'El cliente marco que entrego el efectivo. Confirmalo si ya lo recibiste.'
      when v_order.payment_method = 'wallet' then 'El cliente marco una transferencia por Cuenta DNI/billetera. Revisala y confirmala.'
      else 'El cliente marco una transferencia realizada. Revisala y confirmala.'
    end,
    v_order.id,
    v_uid
  );

  update public.orders
  set payment_status = 'pending'
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$function$;

create or replace function private.confirm_manual_payment_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment public.payments;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and professional_id = v_uid
    and status = 'completed'
    and payment_method in ('cash', 'wallet', 'transfer')
  for update;

  if v_order.id is null then
    raise exception 'No podes confirmar este pago';
  end if;

  select * into v_payment
  from public.payments
  where order_id = v_order.id
    and source_type = 'original'
    and status = 'reported'
  order by created_at desc
  limit 1
  for update;

  if v_payment.id is null then
    raise exception 'Todavia no hay un pago reportado por el cliente';
  end if;

  update public.payments
  set
    status = 'confirmed',
    confirmed_at = now(),
    approved_at = coalesce(approved_at, now()),
    confirmed_by = v_uid,
    failure_reason = null
  where id = v_payment.id
  returning * into v_payment;

  perform private.record_payment_event(
    v_payment.id,
    v_payment.provider,
    'professional_confirmed_receipt',
    v_uid,
    v_order.id,
    jsonb_build_object(
      'amount', v_payment.amount,
      'payment_method', v_payment.payment_method
    )
  );

  perform private.add_notification(
    v_order.client_id,
    'payment_status',
    'Pago confirmado',
    'El profesional confirmo que recibio el pago.',
    v_order.id,
    v_uid
  );

  select * into v_order
  from public.orders
  where id = p_order_id;

  return v_order;
end;
$function$;

create or replace function private.dispute_manual_payment_impl(
  p_order_id uuid,
  p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_payment public.payments;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and professional_id = v_uid
    and status = 'completed'
    and payment_method in ('cash', 'wallet', 'transfer')
  for update;

  if v_order.id is null then
    raise exception 'No podes disputar este pago';
  end if;

  select * into v_payment
  from public.payments
  where order_id = v_order.id
    and source_type = 'original'
    and status = 'reported'
  order by created_at desc
  limit 1
  for update;

  if v_payment.id is null then
    raise exception 'Todavia no hay un pago reportado por el cliente';
  end if;

  update public.payments
  set
    status = 'disputed',
    disputed_at = now(),
    disputed_by = v_uid,
    failure_reason = coalesce(v_reason, 'El profesional indico que no recibio el pago')
  where id = v_payment.id
  returning * into v_payment;

  perform private.record_payment_event(
    v_payment.id,
    v_payment.provider,
    'professional_disputed_receipt',
    v_uid,
    v_order.id,
    jsonb_build_object(
      'amount', v_payment.amount,
      'payment_method', v_payment.payment_method,
      'reason', v_payment.failure_reason
    )
  );

  perform private.add_notification(
    v_order.client_id,
    'payment_status',
    'Pago en revision',
    'El profesional reporto una diferencia con el pago. MANITO conserva el historial del pedido.',
    v_order.id,
    v_uid
  );

  select * into v_order
  from public.orders
  where id = p_order_id;

  return v_order;
end;
$function$;

drop function if exists public.report_order_payment(uuid, text);
create function public.report_order_payment(
  p_order_id uuid,
  p_receipt_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.report_order_payment_impl(p_order_id, p_receipt_path);
end;
$$;

drop function if exists public.confirm_manual_payment(uuid);
create function public.confirm_manual_payment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.confirm_manual_payment_impl(p_order_id);
end;
$$;

drop function if exists public.dispute_manual_payment(uuid, text);
create function public.dispute_manual_payment(
  p_order_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.dispute_manual_payment_impl(p_order_id, p_reason);
end;
$$;

drop function if exists public.confirm_order_payment(uuid);
create function public.confirm_order_payment(p_order_id uuid)
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
  payment_required_at timestamptz, paid_at timestamptz
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
    o.payment_required_at, o.paid_at
  from private.report_order_payment_impl(p_order_id, null) as o;
$$;

revoke all on function public.report_order_payment(uuid, text) from public, anon;
revoke all on function public.confirm_manual_payment(uuid) from public, anon;
revoke all on function public.dispute_manual_payment(uuid, text) from public, anon;
revoke all on function public.confirm_order_payment(uuid) from public, anon;

grant execute on function public.report_order_payment(uuid, text) to authenticated;
grant execute on function public.confirm_manual_payment(uuid) to authenticated;
grant execute on function public.dispute_manual_payment(uuid, text) to authenticated;
grant execute on function public.confirm_order_payment(uuid) to authenticated;

revoke all on function private.report_order_payment_impl(uuid, text) from public, anon, authenticated;
revoke all on function private.confirm_manual_payment_impl(uuid) from public, anon, authenticated;
revoke all on function private.dispute_manual_payment_impl(uuid, text) from public, anon, authenticated;
revoke all on function private.record_payment_event(uuid, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.manual_payment_provider(text) from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_rel rel
    join pg_publication pub on pub.oid = rel.prpubid
    where pub.pubname = 'supabase_realtime'
      and rel.prrelid = 'public.payment_events'::regclass
  ) then
    alter publication supabase_realtime add table public.payment_events;
  end if;
end $$;

insert into public.admin_settings (key, value)
values (
  'norm_004_manual_bilateral_payment',
  jsonb_build_object(
    'manual_methods', jsonb_build_array('cash', 'wallet', 'transfer'),
    'client_action', 'report_order_payment',
    'professional_confirm_action', 'confirm_manual_payment',
    'professional_dispute_action', 'dispute_manual_payment',
    'payment_source', 'NORM-003 client_total backend obligation',
    'legacy_approved_status', true
  )
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
