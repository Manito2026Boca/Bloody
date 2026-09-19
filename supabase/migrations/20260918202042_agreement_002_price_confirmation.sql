-- AGREEMENT-002: a professional acceptance only contracts immediately when the
-- client previously consented to the same exact backend-calculated amount.

alter table public.orders
  add column if not exists client_price_consent_amount numeric(12, 2),
  add column if not exists client_price_consented_at timestamptz,
  add column if not exists price_confirmation_status text,
  add column if not exists price_confirmation_professional_id uuid references public.profiles(id) on delete set null,
  add column if not exists price_confirmation_estimated_amount numeric(12, 2),
  add column if not exists price_confirmation_proposed_amount numeric(12, 2),
  add column if not exists price_confirmation_scope text,
  add column if not exists price_confirmation_components jsonb,
  add column if not exists price_confirmation_policy_snapshot jsonb,
  add column if not exists price_confirmation_requested_at timestamptz,
  add column if not exists price_confirmation_deadline_at timestamptz,
  add column if not exists price_confirmation_responded_at timestamptz,
  add column if not exists price_confirmation_reason text;

alter table public.orders drop constraint if exists orders_price_confirmation_status_check;
alter table public.orders add constraint orders_price_confirmation_status_check
  check (price_confirmation_status is null or price_confirmation_status in ('pending', 'confirmed', 'rejected', 'expired', 'unavailable'));

alter table public.orders drop constraint if exists orders_price_confirmation_components_object_check;
alter table public.orders add constraint orders_price_confirmation_components_object_check
  check (price_confirmation_components is null or jsonb_typeof(price_confirmation_components) = 'array');

alter table public.orders drop constraint if exists orders_price_confirmation_policy_object_check;
alter table public.orders add constraint orders_price_confirmation_policy_object_check
  check (price_confirmation_policy_snapshot is null or jsonb_typeof(price_confirmation_policy_snapshot) = 'object');

do $$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'orders' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
      and pg_get_constraintdef(c.oid) not ilike '%payment_status%'
      and pg_get_constraintdef(c.oid) not ilike '%manual_response_status%'
      and pg_get_constraintdef(c.oid) not ilike '%price_confirmation_status%'
  loop
    execute format('alter table public.orders drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.orders add constraint orders_status_check check (status in (
  'open', 'scheduled_open', 'waiting_quotes', 'pending_client_confirmation',
  'payment_pending', 'accepted', 'en_camino', 'en_sitio', 'trabajando',
  'completed', 'cancelled', 'matching_failed'
));

alter table public.orders drop constraint if exists orders_manual_response_status_check;
alter table public.orders add constraint orders_manual_response_status_check
  check (manual_response_status is null or manual_response_status in (
    'pending', 'price_confirmation_pending', 'accepted', 'rejected', 'expired', 'awaiting_client_choice'
  ));

create index if not exists idx_orders_price_confirmation_professional
  on public.orders(price_confirmation_professional_id, price_confirmation_deadline_at)
  where status = 'pending_client_confirmation' and price_confirmation_status = 'pending';

insert into public.admin_settings(key, value)
values ('price_confirmation', jsonb_build_object(
  'immediate_minutes', 5,
  'scheduled_minutes', 30,
  'authority', 'backend',
  'schema_version', 1
))
on conflict (key) do update
set value = excluded.value, updated_at = now();

create or replace function private.current_price_confirmation_policy()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'immediate_minutes', greatest(1, least(60, private.policy_number(value, 'immediate_minutes', 5))),
    'scheduled_minutes', greatest(1, least(1440, private.policy_number(value, 'scheduled_minutes', 30))),
    'authority', 'backend',
    'schema_version', 1,
    'source', 'admin_settings.price_confirmation'
  )
  from public.admin_settings where key = 'price_confirmation'
$$;

create or replace function private.price_confirmation_timeout_interval(p_mode text)
returns interval language plpgsql stable security definer set search_path = '' as $$
declare v_policy jsonb := coalesce(private.current_price_confirmation_policy(),
  '{"immediate_minutes":5,"scheduled_minutes":30}'::jsonb);
begin
  return make_interval(mins => case when p_mode = 'scheduled'
    then private.policy_number(v_policy, 'scheduled_minutes', 30)::integer
    else private.policy_number(v_policy, 'immediate_minutes', 5)::integer end);
end $$;

create or replace function private.capture_client_price_consent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (
    new.client_price_consent_amount is distinct from old.client_price_consent_amount
    or new.client_price_consented_at is distinct from old.client_price_consented_at
  ) then
    raise exception 'El consentimiento de precio original no puede modificarse';
  end if;
  if tg_op = 'INSERT' then
    if new.client_price_consent_amount is null then new.client_price_consented_at := null;
    else new.client_price_consent_amount := greatest(0, new.client_price_consent_amount);
      new.client_price_consented_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_client_price_consent on public.orders;
create trigger trg_orders_client_price_consent
before insert or update of client_price_consent_amount, client_price_consented_at on public.orders
for each row execute function private.capture_client_price_consent();

create or replace function private.professional_has_pending_price_confirmation(
  p_professional_id uuid, p_excluded_order_id uuid default null
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.price_confirmation_professional_id = p_professional_id
      and o.status = 'pending_client_confirmation'
      and o.price_confirmation_status = 'pending'
      and o.price_confirmation_deadline_at > now()
      and (p_excluded_order_id is null or o.id <> p_excluded_order_id)
  )
$$;

create or replace function private.professional_has_schedule_conflict(
  p_professional_id uuid, p_start timestamptz, p_end timestamptz,
  p_excluded_order_id uuid default null
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where coalesce(o.professional_id, case
            when o.status = 'pending_client_confirmation'
             and o.price_confirmation_status = 'pending'
             and o.price_confirmation_deadline_at > now()
            then o.price_confirmation_professional_id end) = p_professional_id
      and o.scheduled_at is not null
      and (
        o.status in ('payment_pending', 'accepted', 'en_camino', 'en_sitio', 'trabajando')
        or (o.status = 'pending_client_confirmation' and o.price_confirmation_status = 'pending'
            and o.price_confirmation_deadline_at > now())
      )
      and (p_excluded_order_id is null or o.id <> p_excluded_order_id)
      and p_start < coalesce(o.scheduled_end, private.schedule_end_from(
        o.scheduled_at, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())
      )) + make_interval(mins => private.schedule_buffer_minutes())
      and p_end > o.scheduled_at - make_interval(mins => private.schedule_buffer_minutes())
  )
$$;

create or replace function private.finalize_direct_order_contract_impl(
  p_order_id uuid, p_professional_id uuid, p_scope text, p_price numeric,
  p_policy jsonb, p_components jsonb, p_source text
) returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_service public.services;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  select * into v_service from public.services where id = v_order.service_id;
  update public.orders o set
    professional_id = p_professional_id,
    status = case when o.payment_method = 'card' then 'payment_pending' else 'accepted' end,
    payment_status = case when o.payment_method = 'card' then 'pending' else 'not_required' end,
    online_payment_required = coalesce(o.payment_method = 'card', false),
    payment_required_at = case when o.payment_method = 'card' then now() else o.payment_required_at end,
    accepted_at = now(),
    start_pin = coalesce(o.start_pin, lpad((floor(random() * 10000))::int::text, 4, '0')),
    end_pin = coalesce(o.end_pin, lpad((floor(random() * 10000))::int::text, 4, '0')),
    scheduled_end = case when o.scheduled_at is null then null else coalesce(o.scheduled_end,
      private.schedule_end_from(o.scheduled_at, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes()))) end,
    estimated_duration_minutes = case when o.scheduled_at is null then o.estimated_duration_minutes
      else coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes()) end,
    agreed_scope = p_scope,
    agreed_price = p_price,
    contracted_at = now(),
    pricing_policy_snapshot = p_policy,
    contract_snapshot = private.contract_snapshot(
      o.id, p_professional_id, o.service_id, v_service.slug, v_service.name, o.mode,
      p_scope, p_price, p_components, null, p_policy, now(), p_source
    ),
    price = p_price,
    price_confirmation_status = case when p_source = 'client_price_confirmation' then 'confirmed' else o.price_confirmation_status end,
    price_confirmation_responded_at = case when p_source = 'client_price_confirmation' then now() else o.price_confirmation_responded_at end,
    updated_at = now()
  where o.id = p_order_id returning * into v_order;
  return v_order;
end $$;

create or replace function private.accept_order_core_impl(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_order public.orders;
  v_service_base numeric; v_price_from numeric; v_base numeric(12,2); v_fee numeric(12,2); v_price numeric(12,2);
  v_scope text; v_policy jsonb := private.current_commercial_policy(); v_components jsonb;
  v_schedule_end timestamptz; v_source text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not private.professional_can_receive_orders(v_uid) then raise exception 'Tu alta profesional todavia no esta aprobada por MANITO'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'professional') then
    raise exception 'Solo un profesional puede aceptar trabajos';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.status not in ('open','scheduled_open') or v_order.mode = 'quote'
     or v_order.professional_id is not null or not private.order_professional_eligible(v_order, v_uid)
     or (v_order.assignment_mode = 'manual' and v_order.preferred_professional_id is not null
         and v_order.preferred_professional_id <> v_uid) then
    raise exception 'El pedido ya fue tomado o no corresponde a tus servicios';
  end if;
  if v_order.mode = 'immediate' and private.professional_has_pending_price_confirmation(v_uid, v_order.id) then
    raise exception 'Ya estas esperando la confirmacion de otro trabajo';
  end if;
  if v_order.scheduled_at is not null then
    v_schedule_end := coalesce(v_order.scheduled_end, private.schedule_end_from(v_order.scheduled_at,
      coalesce(v_order.estimated_duration_minutes, v_order.eta_minutes, private.schedule_default_duration_minutes())));
    if not private.professional_schedule_contains(v_uid, v_order.scheduled_at, v_schedule_end) then
      raise exception 'El horario programado no entra en tu jornada laboral';
    end if;
    if private.professional_has_schedule_conflict(v_uid, v_order.scheduled_at, v_schedule_end, v_order.id) then
      raise exception 'Ya tenes otro trabajo programado en ese horario';
    end if;
  end if;
  select s.base_price, ps.price_from into v_service_base, v_price_from
  from public.services s join public.professional_services ps on ps.service_id = s.id and ps.professional_id = v_uid
  where s.id = v_order.service_id;
  if not found then raise exception 'El pedido ya no corresponde a tus servicios'; end if;
  v_base := coalesce(v_price_from, v_service_base, 0)::numeric(12,2);
  v_fee := case when v_order.mode = 'scheduled' then greatest(0, private.policy_number(v_policy, 'scheduled_fee', 0)) else 0 end;
  v_price := (v_base + v_fee)::numeric(12,2);
  v_scope := left(v_order.description, 2000);
  v_source := case when v_price_from is not null then 'professional_services.price_from' else 'services.base_price' end;
  v_components := jsonb_build_array(jsonb_build_object('type','service','amount',v_base,'source',v_source))
    || case when v_fee > 0 then jsonb_build_array(jsonb_build_object(
      'type','scheduled_fee','amount',v_fee,'source','admin_settings.commercial.scheduled_fee')) else '[]'::jsonb end;

  if v_order.client_price_consented_at is not null
     and v_order.client_price_consent_amount = v_price then
    return private.finalize_direct_order_contract_impl(
      v_order.id, v_uid, v_scope, v_price, v_policy, v_components, 'direct_accept_exact_consent'
    );
  end if;

  update public.orders set
    status = 'pending_client_confirmation',
    price_confirmation_status = 'pending',
    price_confirmation_professional_id = v_uid,
    price_confirmation_estimated_amount = estimated_price,
    price_confirmation_proposed_amount = v_price,
    price_confirmation_scope = v_scope,
    price_confirmation_components = v_components,
    price_confirmation_policy_snapshot = v_policy,
    price_confirmation_requested_at = now(),
    price_confirmation_deadline_at = now() + private.price_confirmation_timeout_interval(mode),
    price_confirmation_responded_at = null,
    price_confirmation_reason = null,
    updated_at = now()
  where id = v_order.id returning * into v_order;
  return v_order;
end $$;

create or replace function private.accept_order_pre_matching_impl(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_before public.orders; v_order public.orders;
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
    update public.orders set
      manual_response_status = case when v_order.status = 'pending_client_confirmation'
        then 'price_confirmation_pending' else 'accepted' end,
      manual_responded_at = now(), manual_response_reason = null, updated_at = now()
    where id = v_order.id returning * into v_order;
  end if;
  return v_order;
end $$;

create or replace function private.release_price_confirmation_impl(p_order_id uuid, p_outcome text, p_reason text)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_next_status text; v_candidate_status text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.status <> 'pending_client_confirmation'
     or v_order.price_confirmation_status <> 'pending' then return v_order; end if;
  v_next_status := case when v_order.mode = 'scheduled' then 'scheduled_open' else 'open' end;
  v_candidate_status := case when p_outcome = 'expired' then 'expired' else 'rejected' end;
  update public.order_match_candidates set status = v_candidate_status,
    responded_at = coalesce(responded_at, now()), updated_at = now()
  where order_id = v_order.id and professional_id = v_order.price_confirmation_professional_id
    and status = 'accepted';
  update public.orders set
    status = v_next_status,
    price_confirmation_status = p_outcome,
    price_confirmation_responded_at = now(),
    price_confirmation_reason = p_reason,
    manual_response_status = case when assignment_mode = 'manual' then 'awaiting_client_choice' else manual_response_status end,
    manual_response_reason = case when assignment_mode = 'manual' then p_reason else manual_response_reason end,
    matching_status = case when mode = 'immediate' and coalesce(assignment_mode,'auto') = 'auto' then 'idle' else matching_status end,
    matching_round_deadline_at = case when mode = 'immediate' and coalesce(assignment_mode,'auto') = 'auto' then null else matching_round_deadline_at end,
    updated_at = now()
  where id = v_order.id returning * into v_order;
  perform private.add_notification_event(
    v_order.price_confirmation_professional_id, 'order_status',
    case when p_outcome = 'expired' then 'La reserva venció' else 'El precio no fue confirmado' end,
    'El trabajo no quedó contratado y la reserva fue liberada.', v_order.id, v_order.client_id,
    concat_ws(':','price-confirmation-release',v_order.id::text,p_outcome,v_order.price_confirmation_requested_at::text),
    'open_order','order',v_order.id::text,jsonb_build_object('outcome',p_outcome)
  );
  return v_order;
end $$;

create or replace function private.refresh_order_price_confirmation_impl(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.status = 'pending_client_confirmation' and v_order.price_confirmation_status = 'pending'
     and v_order.price_confirmation_deadline_at <= now() then
    return private.release_price_confirmation_impl(p_order_id, 'expired', 'confirmation_timeout');
  end if;
  return v_order;
end $$;

create or replace function private.confirm_order_price_impl(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_order public.orders; v_professional uuid; v_schedule_end timestamptz;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 802));
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.client_id <> v_uid then raise exception 'No podes confirmar este precio'; end if;
  if v_order.price_confirmation_status = 'confirmed' and v_order.contracted_at is not null then return v_order; end if;
  if v_order.status <> 'pending_client_confirmation' or v_order.price_confirmation_status <> 'pending' then
    raise exception 'Este precio ya no esta disponible para confirmar';
  end if;
  if v_order.price_confirmation_deadline_at <= now() then
    return private.release_price_confirmation_impl(p_order_id, 'expired', 'confirmation_timeout');
  end if;
  v_professional := v_order.price_confirmation_professional_id;
  perform pg_advisory_xact_lock(hashtextextended(v_professional::text, 0));
  if not private.order_professional_eligible(v_order, v_professional) then
    return private.release_price_confirmation_impl(p_order_id, 'unavailable', 'professional_no_longer_eligible');
  end if;
  if v_order.scheduled_at is not null then
    v_schedule_end := coalesce(v_order.scheduled_end, private.schedule_end_from(v_order.scheduled_at,
      coalesce(v_order.estimated_duration_minutes,v_order.eta_minutes,private.schedule_default_duration_minutes())));
    if private.professional_has_schedule_conflict(v_professional,v_order.scheduled_at,v_schedule_end,v_order.id) then
      return private.release_price_confirmation_impl(p_order_id,'unavailable','schedule_conflict');
    end if;
  elsif private.professional_has_pending_price_confirmation(v_professional,v_order.id) then
    return private.release_price_confirmation_impl(p_order_id,'unavailable','professional_conflict');
  end if;
  v_order := private.finalize_direct_order_contract_impl(
    v_order.id, v_professional, v_order.price_confirmation_scope,
    v_order.price_confirmation_proposed_amount, v_order.price_confirmation_policy_snapshot,
    v_order.price_confirmation_components, 'client_price_confirmation'
  );
  if v_order.assignment_mode = 'manual' then
    update public.orders set manual_response_status='accepted', manual_response_reason=null,
      manual_responded_at=now(), updated_at=now() where id=v_order.id returning * into v_order;
  end if;
  return v_order;
end $$;

create or replace function public.confirm_order_price(p_order_id uuid)
returns public.orders language sql security definer set search_path = '' as $$
  select private.confirm_order_price_impl(p_order_id)
$$;

create or replace function public.reject_order_price(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null or v_order.client_id <> auth.uid() then raise exception 'No podes rechazar este precio'; end if;
  if v_order.price_confirmation_status = 'rejected' then return v_order; end if;
  if v_order.status <> 'pending_client_confirmation' or v_order.price_confirmation_status <> 'pending' then
    raise exception 'Este precio ya no esta disponible';
  end if;
  return private.release_price_confirmation_impl(p_order_id,'rejected','client_rejected');
end $$;

create or replace function public.refresh_order_price_confirmation(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v_order from public.orders where id=p_order_id;
  if v_order.id is null or not (
    v_order.client_id=auth.uid() or v_order.professional_id=auth.uid()
    or (v_order.status='pending_client_confirmation' and v_order.price_confirmation_professional_id=auth.uid())
    or private.is_manito_admin(auth.uid())
  ) then raise exception 'No podes consultar esta confirmacion'; end if;
  return private.refresh_order_price_confirmation_impl(p_order_id);
end $$;

-- Return the pending reservation to the accepting professional without pretending
-- that professional_id already represents a contract.
drop function if exists public.accept_order(uuid);
create function public.accept_order(p_order_id uuid)
returns setof public.orders language sql security definer set search_path = '' as $$
  select o.* from private.accept_order_impl(p_order_id) o
  where o.professional_id = auth.uid()
     or (o.status='pending_client_confirmation' and o.price_confirmation_professional_id=auth.uid())
$$;

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select to authenticated using (
  client_id = (select auth.uid()) or professional_id = (select auth.uid())
  or (status='pending_client_confirmation' and price_confirmation_professional_id=(select auth.uid()))
  or private.is_manito_admin()
);

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id=(select auth.uid()) or private.is_manito_admin()
  or exists (select 1 from public.orders o where
    ((o.client_id=(select auth.uid()) and coalesce(o.professional_id,
       case when o.status='pending_client_confirmation' then o.price_confirmation_professional_id end)=profiles.id)
     or (coalesce(o.professional_id,case when o.status='pending_client_confirmation'
       then o.price_confirmation_professional_id end)=(select auth.uid()) and o.client_id=profiles.id))
    and o.status not in ('open','scheduled_open','waiting_quotes','cancelled','matching_failed'))
);

create or replace function private.notification_action_key(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_kind='manual_request' then 'open_direct_request'
    when p_kind='proposal_received' then 'compare_proposals'
    when p_kind='extra_requested' then 'review_extra'
    when p_kind='payment_status' then 'review_payment'
    when p_kind='message_received' then 'open_chat'
    when p_kind like 'complaint_%' then 'open_protection'
    when p_kind='price_confirmation_required' then 'review_price_confirmation'
    else 'open_order' end
$$;

create or replace function private.notify_order_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_title text; v_body text; v_reason_label text; v_professional_name text;
begin
  if tg_op='INSERT' then
    if new.status='waiting_quotes' then v_title:='Solicitud publicada'; v_body:='Los profesionales compatibles ya pueden enviarte presupuestos.';
    elsif new.status='scheduled_open' then v_title:='Pedido programado'; v_body:='MANITO buscará profesionales compatibles con ese horario.';
    else v_title:='Pedido publicado'; v_body:='Estamos buscando un profesional disponible.'; end if;
    perform private.add_notification(new.client_id,'order_created',v_title,v_body,new.id,new.client_id); return new;
  end if;
  if new.status is distinct from old.status then
    if new.status='pending_client_confirmation' then
      select coalesce(nullif(btrim(p.full_name),''),'El profesional') into v_professional_name
      from public.profiles p where p.id=new.price_confirmation_professional_id;
      perform private.add_notification_event(
        new.client_id,'price_confirmation_required',v_professional_name||' aceptó por $'||trim(to_char(new.price_confirmation_proposed_amount,'FM999G999G999G990')),
        'Confirmá el precio para contratar.',new.id,new.price_confirmation_professional_id,
        concat_ws(':','price-confirmation',new.id::text,new.price_confirmation_requested_at::text),
        'review_price_confirmation','order',new.id::text,
        jsonb_build_object('proposed_amount',new.price_confirmation_proposed_amount,'deadline_at',new.price_confirmation_deadline_at)
      ); return new;
    end if;
    if old.status='pending_client_confirmation' and new.status in ('accepted','payment_pending') then
      perform private.add_notification_event(
        new.price_confirmation_professional_id,'order_status','El Cliente confirmó el trabajo',
        'El precio quedó acordado. Ya pueden coordinar dentro de MANITO.',new.id,new.client_id,
        concat_ws(':','price-confirmed',new.id::text,new.price_confirmation_requested_at::text),
        'open_order','order',new.id::text,jsonb_build_object('agreed_price',new.agreed_price)
      );
      perform private.add_notification_event(
        new.client_id,'order_status','Trabajo confirmado','El acuerdo quedó registrado en MANITO.',new.id,new.price_confirmation_professional_id,
        concat_ws(':','price-confirmed-client',new.id::text,new.price_confirmation_requested_at::text),
        'open_order','order',new.id::text,jsonb_build_object('agreed_price',new.agreed_price)
      ); return new;
    end if;
    if new.status in ('open','scheduled_open','waiting_quotes','matching_failed') then return new; end if;
    if new.professional_id is not null then select nullif(btrim(p.full_name),'') into v_professional_name from public.profiles p where p.id=new.professional_id; end if;
    v_title:=case new.status when 'payment_pending' then 'Falta confirmar el pago'
      when 'accepted' then coalesce(v_professional_name,'El profesional')||' aceptó tu pedido'
      when 'en_camino' then coalesce(v_professional_name,'El profesional')||' está en camino'
      when 'en_sitio' then coalesce(v_professional_name,'El profesional')||' llegó'
      when 'trabajando' then 'Trabajo en curso' when 'completed' then 'Trabajo finalizado'
      when 'cancelled' then 'Pedido cancelado' else 'Seguimiento actualizado' end;
    if new.status='cancelled' then v_reason_label:=private.cancellation_reason_label(new.cancellation_reason);
      v_body:='El pedido fue cancelado. Motivo: '||v_reason_label||'.';
    else v_body:=case new.status when 'payment_pending' then 'El precio quedó definido. Confirmá el pago para habilitar el trabajo.'
      when 'accepted' then 'Ya pueden coordinar por el chat del pedido.' when 'en_camino' then 'Podés seguir el estado desde tu pedido.'
      when 'en_sitio' then 'Compartí el PIN de inicio cuando estés listo.' when 'trabajando' then 'El servicio ya comenzó.'
      when 'completed' then 'La constancia MANITO queda disponible para protección y reclamos.' else 'Revisá el seguimiento del pedido.' end; end if;
    perform private.add_notification(new.client_id,'order_status',v_title,v_body,new.id,new.professional_id);
    if new.professional_id is not null then perform private.add_notification(new.professional_id,'order_status',v_title,v_body,new.id,new.client_id); end if;
  elsif new.payment_status is distinct from old.payment_status then
    if new.payment_method in ('cash','wallet','transfer') and new.payment_status in ('pending','paid') then return new; end if;
    perform private.add_notification(new.client_id,'payment_status','Pago actualizado','El estado de pago del pedido cambió.',new.id,new.professional_id);
    if new.professional_id is not null then perform private.add_notification(new.professional_id,'payment_status','Pago actualizado','El estado de pago del pedido cambió.',new.id,new.client_id); end if;
  end if;
  return new;
end $$;

grant select (
  client_price_consent_amount, client_price_consented_at,
  price_confirmation_status, price_confirmation_professional_id,
  price_confirmation_estimated_amount, price_confirmation_proposed_amount,
  price_confirmation_scope, price_confirmation_components,
  price_confirmation_policy_snapshot, price_confirmation_requested_at,
  price_confirmation_deadline_at, price_confirmation_responded_at,
  price_confirmation_reason
) on public.orders to authenticated;
grant insert (client_price_consent_amount) on public.orders to authenticated;

revoke all on function private.current_price_confirmation_policy() from public,anon,authenticated;
revoke all on function private.price_confirmation_timeout_interval(text) from public,anon,authenticated;
revoke all on function private.capture_client_price_consent() from public,anon,authenticated;
revoke all on function private.professional_has_pending_price_confirmation(uuid,uuid) from public,anon,authenticated;
revoke all on function private.professional_has_schedule_conflict(uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated;
revoke all on function private.finalize_direct_order_contract_impl(uuid,uuid,text,numeric,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function private.accept_order_core_impl(uuid) from public,anon,authenticated;
revoke all on function private.accept_order_pre_matching_impl(uuid) from public,anon,authenticated;
revoke all on function private.release_price_confirmation_impl(uuid,text,text) from public,anon,authenticated;
revoke all on function private.refresh_order_price_confirmation_impl(uuid) from public,anon,authenticated;
revoke all on function private.confirm_order_price_impl(uuid) from public,anon,authenticated;
revoke all on function private.notification_action_key(text) from public,anon,authenticated;
revoke all on function private.notify_order_status_change() from public,anon,authenticated;
revoke all on function public.accept_order(uuid) from public,anon;
revoke all on function public.confirm_order_price(uuid) from public,anon;
revoke all on function public.reject_order_price(uuid) from public,anon;
revoke all on function public.refresh_order_price_confirmation(uuid) from public,anon;
grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.confirm_order_price(uuid) to authenticated;
grant execute on function public.reject_order_price(uuid) to authenticated;
grant execute on function public.refresh_order_price_confirmation(uuid) to authenticated;

alter publication supabase_realtime drop table public.orders;
alter publication supabase_realtime add table public.orders (
  id,client_id,professional_id,service_id,description,address,mode,scheduled_at,
  estimated_duration_minutes,scheduled_end,status,price,estimated_price,agreed_price,
  agreed_scope,contracted_at,accepted_proposal_id,contract_snapshot,pricing_policy_snapshot,
  client_lat,client_lng,created_at,updated_at,accepted_at,completed_at,assignment_mode,
  preferred_professional_id,manual_requested_professional_id,manual_requested_at,
  manual_response_deadline_at,manual_response_status,manual_response_reason,manual_responded_at,
  matching_status,matching_started_at,matching_current_round,matching_cycle,
  matching_round_deadline_at,matching_failed_at,payment_method,guarantee_days,eta_minutes,
  payment_status,online_payment_required,payment_required_at,paid_at,
  client_price_consent_amount,client_price_consented_at,price_confirmation_status,
  price_confirmation_professional_id,price_confirmation_estimated_amount,
  price_confirmation_proposed_amount,price_confirmation_scope,price_confirmation_components,
  price_confirmation_policy_snapshot,price_confirmation_requested_at,
  price_confirmation_deadline_at,price_confirmation_responded_at,price_confirmation_reason
);

comment on column public.orders.client_price_consent_amount is
  'Exact amount explicitly consented by the client before professional acceptance; NULL means estimate/no exact consent.';
comment on column public.orders.price_confirmation_professional_id is
  'Temporary reservation only. professional_id remains NULL until the client confirms.';
