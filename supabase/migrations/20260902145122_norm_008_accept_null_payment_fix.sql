-- NORM-008: keep quote proposal acceptance compatible with null payment_method.
-- Quote orders can be created without a payment method; accepting a proposal must
-- not write null into orders.online_payment_required.

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
  v_requires_online_payment boolean;
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

  v_requires_online_payment := coalesce(v_source_order.payment_method = 'card', false);
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
    status = case when v_requires_online_payment then 'payment_pending' else 'accepted' end,
    payment_status = case when v_requires_online_payment then 'pending' else 'not_required' end,
    online_payment_required = v_requires_online_payment,
    payment_required_at = case when v_requires_online_payment then now() else payment_required_at end,
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

revoke all on function private.accept_proposal_impl(uuid) from public, anon, authenticated;

insert into public.admin_settings (key, value)
values (
  'norm_008_accept_null_payment_fix',
  jsonb_build_object(
    'status', 'implemented',
    'fix', 'accept_proposal uses explicit boolean for null payment_method',
    'implemented_at', now()
  )
)
on conflict (key) do update
set value = excluded.value, updated_at = now();
