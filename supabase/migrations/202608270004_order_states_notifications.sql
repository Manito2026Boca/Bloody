-- MANITO operational states and in-app notifications.
-- Keeps old states compatible while adding quote, schedule, and payment checkpoints.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'orders'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
      and pg_get_constraintdef(c.oid) not ilike '%payment_status%'
  loop
    execute format('alter table public.orders drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.orders
  add constraint orders_status_check
  check (status in (
    'open',
    'scheduled_open',
    'waiting_quotes',
    'payment_pending',
    'accepted',
    'en_camino',
    'en_sitio',
    'completed',
    'cancelled'
  ));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  order_id uuid references public.orders(id) on delete cascade,
  kind text not null check (kind in (
    'order_created',
    'order_status',
    'proposal_received',
    'extra_requested',
    'message_received',
    'payment_status',
    'appointment'
  )),
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient
  on public.notifications(recipient_id, read_at, created_at desc);

create index if not exists idx_notifications_order
  on public.notifications(order_id, created_at desc);

alter table public.notifications enable row level security;

revoke all on public.notifications from anon, authenticated;
grant select, update on public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select
to authenticated
using (recipient_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update
to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

create or replace function private.add_notification(
  p_recipient_id uuid,
  p_kind text,
  p_title text,
  p_body text default '',
  p_order_id uuid default null,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_id is null then
    return;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    order_id,
    kind,
    title,
    body
  )
  values (
    p_recipient_id,
    p_actor_id,
    p_order_id,
    p_kind,
    left(coalesce(p_title, 'MANITO'), 140),
    left(coalesce(p_body, ''), 400)
  );
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

    v_body := case new.status
      when 'payment_pending' then 'El precio quedó definido. Confirmá el pago para habilitar el trabajo.'
      when 'accepted' then 'Ya podés coordinar por el chat del pedido.'
      when 'completed' then 'La constancia MANITO queda disponible para protección y reclamos.'
      else 'Revisá el seguimiento del pedido.'
    end;

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

drop trigger if exists trg_orders_notify_status on public.orders;
create trigger trg_orders_notify_status
after insert or update of status, payment_status on public.orders
for each row execute function private.notify_order_status_change();

create or replace function private.notify_proposal_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  select o.client_id into v_client_id
  from public.orders o
  where o.id = new.order_id;

  perform private.add_notification(
    v_client_id,
    'proposal_received',
    'Nuevo presupuesto recibido',
    'Compará precio, disponibilidad y observación antes de elegir.',
    new.order_id,
    new.professional_id
  );

  return new;
end;
$$;

drop trigger if exists trg_order_proposals_notify_insert on public.order_proposals;
create trigger trg_order_proposals_notify_insert
after insert on public.order_proposals
for each row execute function private.notify_proposal_insert();

create or replace function private.notify_extra_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  select o.client_id into v_client_id
  from public.orders o
  where o.id = new.order_id;

  perform private.add_notification(
    v_client_id,
    'extra_requested',
    'Adicional para aprobar',
    new.title || ' por $ ' || trim(to_char(new.amount, '999G999G999D00')),
    new.order_id,
    new.professional_id
  );

  return new;
end;
$$;

drop trigger if exists trg_order_extras_notify_insert on public.order_extras;
create trigger trg_order_extras_notify_insert
after insert on public.order_extras
for each row execute function private.notify_extra_insert();

create or replace function private.notify_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_recipient uuid;
begin
  select * into v_order
  from public.orders
  where id = new.order_id;

  if v_order.id is null then
    return new;
  end if;

  if new.sender_id = v_order.client_id then
    v_recipient := v_order.professional_id;
  else
    v_recipient := v_order.client_id;
  end if;

  perform private.add_notification(
    v_recipient,
    'message_received',
    'Nuevo mensaje en el pedido',
    left(new.body, 180),
    new.order_id,
    new.sender_id
  );

  return new;
end;
$$;

drop trigger if exists trg_messages_notify_insert on public.messages;
create trigger trg_messages_notify_insert
after insert on public.messages
for each row execute function private.notify_message_insert();

create or replace function private.accept_order_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_uid
      and p.role = 'professional'
      and p.is_available = true
  ) then
    raise exception 'El profesional debe estar disponible';
  end if;

  update public.orders o
  set
    professional_id = v_uid,
    status = case when o.payment_method = 'card' then 'payment_pending' else 'accepted' end,
    payment_status = case when o.payment_method = 'card' then 'pending' else 'not_required' end,
    online_payment_required = o.payment_method = 'card',
    payment_required_at = case when o.payment_method = 'card' then now() else payment_required_at end,
    accepted_at = now(),
    price = coalesce(
      (
        select ps.price_from
        from public.professional_services ps
        where ps.professional_id = v_uid
          and ps.service_id = o.service_id
      ),
      (
        select s.base_price
        from public.services s
        where s.id = o.service_id
      )
    )
  where o.id = p_order_id
    and o.status in ('open', 'scheduled_open')
    and o.mode <> 'quote'
    and o.professional_id is null
    and exists (
      select 1
      from public.professional_services ps
      where ps.professional_id = v_uid
        and ps.service_id = o.service_id
    )
  returning o.* into v_order;

  if v_order.id is null then
    raise exception 'El pedido ya fue tomado o no corresponde a tus servicios';
  end if;

  return v_order;
end;
$$;

create or replace function private.accept_proposal_impl(p_proposal_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_proposal public.order_proposals;
  v_order public.orders;
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
  for update;

  if v_proposal.id is null then
    raise exception 'Presupuesto no disponible';
  end if;

  update public.order_proposals
  set status = case when id = p_proposal_id then 'accepted' else 'rejected' end
  where order_id = v_proposal.order_id;

  update public.orders
  set
    professional_id = v_proposal.professional_id,
    status = case when payment_method = 'card' then 'payment_pending' else 'accepted' end,
    payment_status = case when payment_method = 'card' then 'pending' else 'not_required' end,
    online_payment_required = payment_method = 'card',
    payment_required_at = case when payment_method = 'card' then now() else payment_required_at end,
    accepted_at = now(),
    price = v_proposal.labor_price + v_proposal.materials_price + v_proposal.visit_price + v_proposal.manito_fee
  where id = v_proposal.order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function private.advance_order_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current text;
  v_next text;
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select status into v_current
  from public.orders
  where id = p_order_id
    and professional_id = v_uid
  for update;

  if v_current is null then
    raise exception 'Pedido no encontrado';
  end if;

  if v_current = 'payment_pending' then
    raise exception 'Falta confirmar el pago antes de avanzar';
  end if;

  v_next := case v_current
    when 'accepted' then 'en_camino'
    when 'en_camino' then 'en_sitio'
    when 'en_sitio' then 'completed'
    else null
  end;

  if v_next is null then
    raise exception 'No se puede avanzar desde el estado actual';
  end if;

  update public.orders
  set
    status = v_next,
    completed_at = case when v_next = 'completed' then now() else completed_at end
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function private.cancel_order_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  update public.orders
  set status = 'cancelled'
  where id = p_order_id
    and client_id = v_uid
    and status in ('open', 'scheduled_open', 'waiting_quotes', 'payment_pending', 'accepted')
  returning * into v_order;

  if v_order.id is null then
    raise exception 'El pedido ya no puede cancelarse';
  end if;

  return v_order;
end;
$$;

create or replace function private.confirm_order_payment_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_amount numeric(12,2);
  v_fee numeric(12,2);
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and client_id = v_uid
    and status = 'payment_pending'
  for update;

  if v_order.id is null then
    raise exception 'No hay pago pendiente para confirmar';
  end if;

  v_amount := coalesce(v_order.price, 0);
  v_fee := round(v_amount * 0.12, 2);

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
    approved_at
  )
  values (
    v_order.id,
    v_order.client_id,
    v_order.professional_id,
    case
      when v_order.payment_method = 'wallet' then 'wallet'
      when v_order.payment_method = 'cash' then 'cash'
      else 'manual'
    end,
    v_amount,
    v_fee,
    greatest(0, v_amount - v_fee),
    'ARS',
    'approved',
    coalesce(v_order.payment_method::text, 'manual'),
    now()
  );

  update public.orders
  set
    status = 'accepted',
    payment_status = 'paid',
    paid_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.confirm_order_payment(p_order_id uuid)
returns public.orders
language sql
security invoker
set search_path = public, private
as $$
  select * from private.confirm_order_payment_impl(p_order_id);
$$;

revoke all on function private.add_notification(uuid, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function private.notify_order_status_change() from public, anon, authenticated;
revoke all on function private.notify_proposal_insert() from public, anon, authenticated;
revoke all on function private.notify_extra_insert() from public, anon, authenticated;
revoke all on function private.notify_message_insert() from public, anon, authenticated;
revoke all on function private.confirm_order_payment_impl(uuid) from public, anon, authenticated;
revoke all on function public.confirm_order_payment(uuid) from public, anon;
grant execute on function private.confirm_order_payment_impl(uuid) to authenticated;
grant execute on function public.confirm_order_payment(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end if;
end $$;
