-- NORM-003: single economic and contractual source.
-- orders.price remains a legacy compatibility field. New logic must prefer
-- estimated_price for estimates and agreed_price/contract_snapshot for contracts.

alter table public.orders
  add column if not exists estimated_price numeric(12, 2),
  add column if not exists agreed_price numeric(12, 2),
  add column if not exists agreed_scope text,
  add column if not exists contracted_at timestamptz,
  add column if not exists accepted_proposal_id uuid,
  add column if not exists contract_snapshot jsonb,
  add column if not exists pricing_policy_snapshot jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_accepted_proposal_id_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_accepted_proposal_id_fkey
      foreign key (accepted_proposal_id)
      references public.order_proposals(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_orders_accepted_proposal
  on public.orders(accepted_proposal_id)
  where accepted_proposal_id is not null;

create index if not exists idx_orders_contract_state
  on public.orders(status, contracted_at)
  where contracted_at is not null;

comment on column public.orders.price is
  'Legacy compatibility amount. New economic logic must prefer estimated_price for estimates and agreed_price/contract_snapshot for contracts.';
comment on column public.orders.estimated_price is
  'Frontend-visible estimate. It is not contractual.';
comment on column public.orders.agreed_price is
  'Backend-frozen contracted amount before approved extras.';
comment on column public.orders.contract_snapshot is
  'Immutable-at-contracting snapshot used to reconstruct what was accepted.';
comment on column public.orders.pricing_policy_snapshot is
  'Commercial policy captured when the order became contractual.';

update public.admin_settings
set value =
  value
  || jsonb_build_object(
    'schema_version', coalesce(value->'schema_version', '1'::jsonb),
    'currency', coalesce(value->>'currency', 'ARS'),
    'client_fee_enabled', coalesce(value->'client_fee_enabled', 'false'::jsonb),
    'scheduled_fee', coalesce(value->'scheduled_fee', '0'::jsonb),
    'proposal_fee_enabled', coalesce(value->'proposal_fee_enabled', 'false'::jsonb),
    'proposal_fee', coalesce(value->'proposal_fee', '0'::jsonb)
  ),
  updated_at = now()
where key = 'commercial';

insert into public.admin_settings (key, value)
values (
  'commercial',
  jsonb_build_object(
    'schema_version', 1,
    'currency', 'ARS',
    'commission_percent', 0,
    'client_fee', 0,
    'client_fee_enabled', false,
    'scheduled_fee', 0,
    'proposal_fee_enabled', false,
    'proposal_fee', 0,
    'guarantee_days', 7,
    'promo_percent', 0
  )
)
on conflict (key) do nothing;

create or replace function private.policy_number(
  p_policy jsonb,
  p_key text,
  p_default numeric default 0
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_policy ? p_key and coalesce(p_policy->>p_key, '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (p_policy->>p_key)::numeric
    else p_default
  end;
$$;

create or replace function private.policy_bool(
  p_policy jsonb,
  p_key text,
  p_default boolean default false
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_policy->>p_key, ''))
    when 'true' then true
    when 'false' then false
    else p_default
  end;
$$;

create or replace function private.current_commercial_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_setting jsonb := '{}'::jsonb;
begin
  select coalesce(s.value, '{}'::jsonb)
  into v_setting
  from public.admin_settings s
  where s.key = 'commercial';

  return jsonb_build_object(
    'schema_version', 1,
    'currency', coalesce(v_setting->>'currency', 'ARS'),
    'commission_percent', private.policy_number(v_setting, 'commission_percent', 0),
    'client_fee', private.policy_number(v_setting, 'client_fee', 0),
    'client_fee_enabled', private.policy_bool(v_setting, 'client_fee_enabled', false),
    'scheduled_fee', private.policy_number(v_setting, 'scheduled_fee', 0),
    'proposal_fee_enabled', private.policy_bool(v_setting, 'proposal_fee_enabled', false),
    'proposal_fee', private.policy_number(v_setting, 'proposal_fee', 0),
    'guarantee_days', private.policy_number(v_setting, 'guarantee_days', 7),
    'promo_percent', private.policy_number(v_setting, 'promo_percent', 0),
    'source', 'admin_settings.commercial'
  );
end;
$$;

create or replace function private.contract_snapshot(
  p_order_id uuid,
  p_professional_id uuid,
  p_service_id bigint,
  p_service_slug text,
  p_service_name text,
  p_mode text,
  p_agreed_scope text,
  p_agreed_price numeric,
  p_components jsonb,
  p_accepted_proposal_id uuid,
  p_pricing_policy jsonb,
  p_contracted_at timestamptz,
  p_origin text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 1,
    'order_id', p_order_id,
    'professional_id', p_professional_id,
    'service', jsonb_build_object(
      'id', p_service_id,
      'slug', p_service_slug,
      'name', p_service_name
    ),
    'mode', p_mode,
    'agreed_scope', p_agreed_scope,
    'agreed_price', p_agreed_price,
    'components', coalesce(p_components, '[]'::jsonb),
    'accepted_proposal_id', p_accepted_proposal_id,
    'pricing_policy', p_pricing_policy,
    'contracted_at', p_contracted_at,
    'origin', p_origin
  ));
$$;

create or replace function private.order_approved_extras_total(p_order_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(oe.amount), 0)::numeric(12, 2)
  from public.order_extras oe
  where oe.order_id = p_order_id
    and oe.status = 'approved';
$$;

create or replace function private.order_service_total_amount(p_order_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select (
    coalesce(o.agreed_price, o.price, 0)
    + private.order_approved_extras_total(o.id)
  )::numeric(12, 2)
  from public.orders o
  where o.id = p_order_id;
$$;

create or replace function private.order_client_fee_amount(p_policy jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when private.policy_bool(p_policy, 'client_fee_enabled', false)
      then greatest(0, private.policy_number(p_policy, 'client_fee', 0))
    else 0
  end::numeric(12, 2);
$$;

create or replace function private.order_commission_amount(
  p_service_total numeric,
  p_policy jsonb
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select greatest(
    0,
    round(coalesce(p_service_total, 0) * private.policy_number(p_policy, 'commission_percent', 0) / 100, 2)
  )::numeric(12, 2);
$$;

create or replace function private.order_client_total_amount(p_order_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select greatest(
    0,
    coalesce(private.order_service_total_amount(o.id), 0)
    + private.order_client_fee_amount(coalesce(o.pricing_policy_snapshot, private.current_commercial_policy()))
  )::numeric(12, 2)
  from public.orders o
  where o.id = p_order_id;
$$;

with accepted_proposals as (
  select
    op.*,
    row_number() over (
      partition by op.order_id
      order by op.updated_at desc, op.created_at desc, op.id
    ) as rn
  from public.order_proposals op
  where op.status = 'accepted'
)
update public.orders o
set
  estimated_price = coalesce(o.estimated_price, o.price),
  accepted_proposal_id = coalesce(o.accepted_proposal_id, ap.id),
  agreed_price = coalesce(
    o.agreed_price,
    ap.labor_price + ap.materials_price + ap.visit_price + ap.manito_fee,
    o.price
  ),
  agreed_scope = coalesce(o.agreed_scope, nullif(btrim(ap.observation), '')),
  contracted_at = coalesce(o.contracted_at, o.accepted_at, o.updated_at),
  pricing_policy_snapshot = coalesce(
    o.pricing_policy_snapshot,
    private.current_commercial_policy()
    || jsonb_build_object('source', 'legacy_backfill', 'historical_accuracy', 'best_effort')
  ),
  contract_snapshot = coalesce(
    o.contract_snapshot,
    private.contract_snapshot(
      o.id,
      coalesce(o.professional_id, ap.professional_id),
      o.service_id,
      s.slug,
      s.name,
      o.mode,
      nullif(btrim(ap.observation), ''),
      coalesce(ap.labor_price + ap.materials_price + ap.visit_price + ap.manito_fee, o.price),
      jsonb_build_array(
        jsonb_build_object('type', 'labor', 'amount', ap.labor_price),
        jsonb_build_object('type', 'materials', 'amount', ap.materials_price),
        jsonb_build_object('type', 'visit', 'amount', ap.visit_price),
        jsonb_build_object('type', 'manito_fee', 'amount', ap.manito_fee)
      ),
      ap.id,
      private.current_commercial_policy()
      || jsonb_build_object('source', 'legacy_backfill', 'historical_accuracy', 'best_effort'),
      coalesce(o.accepted_at, o.updated_at),
      'accepted_proposal_backfill'
    )
  )
from accepted_proposals ap,
  public.services s
where ap.rn = 1
  and ap.order_id = o.id
  and s.id = o.service_id
  and o.status in ('payment_pending', 'accepted', 'en_camino', 'en_sitio', 'trabajando', 'completed');

update public.orders o
set
  estimated_price = coalesce(o.estimated_price, o.price),
  agreed_price = coalesce(o.agreed_price, o.price),
  contracted_at = coalesce(o.contracted_at, o.accepted_at, o.updated_at),
  pricing_policy_snapshot = coalesce(
    o.pricing_policy_snapshot,
    private.current_commercial_policy()
    || jsonb_build_object('source', 'legacy_backfill', 'historical_accuracy', 'best_effort')
  ),
  contract_snapshot = coalesce(
    o.contract_snapshot,
    private.contract_snapshot(
      o.id,
      o.professional_id,
      o.service_id,
      s.slug,
      s.name,
      o.mode,
      null,
      o.price,
      jsonb_build_array(
        jsonb_build_object('type', 'legacy_order_price', 'amount', o.price)
      ),
      o.accepted_proposal_id,
      private.current_commercial_policy()
      || jsonb_build_object('source', 'legacy_backfill', 'historical_accuracy', 'best_effort'),
      coalesce(o.accepted_at, o.updated_at),
      'legacy_direct_order_backfill'
    )
  )
from public.services s
where s.id = o.service_id
  and o.accepted_proposal_id is null
  and o.status in ('payment_pending', 'accepted', 'en_camino', 'en_sitio', 'trabajando', 'completed')
  and o.professional_id is not null;

update public.orders
set estimated_price = coalesce(estimated_price, price),
    agreed_price = null,
    contracted_at = null,
    accepted_proposal_id = null
where status in ('open', 'scheduled_open', 'waiting_quotes')
  and contracted_at is null;

create or replace function private.accept_order_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
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

  with candidate as (
    select
      o.id,
      o.description,
      o.mode,
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

create or replace function private.send_order_proposal_impl(
  p_order_id uuid,
  p_labor_price numeric,
  p_materials_price numeric,
  p_visit_price numeric,
  p_manito_fee numeric,
  p_estimated_minutes integer,
  p_availability_label text,
  p_observation text
)
returns public.order_proposals
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_policy jsonb := private.current_commercial_policy();
  v_manito_fee numeric(12, 2);
  v_proposal public.order_proposals;
begin
  if not private.professional_can_receive_orders(v_uid) then
    raise exception 'Tu alta profesional todavia no esta aprobada por MANITO';
  end if;

  if not exists (
    select 1
    from public.orders o
    join public.professional_services ps
      on ps.professional_id = v_uid
     and ps.service_id = o.service_id
    where o.id = p_order_id
      and o.status = 'waiting_quotes'
      and o.professional_id is null
  ) then
    raise exception 'Esta solicitud no esta disponible para presupuestar';
  end if;

  v_manito_fee := case
    when private.policy_bool(v_policy, 'proposal_fee_enabled', false)
      then greatest(0, private.policy_number(v_policy, 'proposal_fee', 0))
    else 0
  end;

  insert into public.order_proposals (
    order_id,
    professional_id,
    labor_price,
    materials_price,
    visit_price,
    manito_fee,
    estimated_minutes,
    availability_label,
    observation,
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
    nullif(btrim(coalesce(p_observation, '')), ''),
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
    observation = excluded.observation,
    status = 'sent',
    updated_at = now()
  where public.order_proposals.status = 'sent'
  returning * into v_proposal;

  if v_proposal.id is null then
    raise exception 'El presupuesto ya fue decidido y no puede modificarse';
  end if;

  return v_proposal;
end;
$function$;

create or replace function private.accept_proposal_impl(p_proposal_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_proposal public.order_proposals;
  v_order public.orders;
  v_policy jsonb := private.current_commercial_policy();
  v_agreed_price numeric(12, 2);
  v_agreed_scope text;
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

  v_agreed_price := (
    v_proposal.labor_price
    + v_proposal.materials_price
    + v_proposal.visit_price
    + v_proposal.manito_fee
  )::numeric(12, 2);

  select coalesce(nullif(btrim(v_proposal.observation), ''), left(o.description, 2000))
  into v_agreed_scope
  from public.orders o
  where o.id = v_proposal.order_id;

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

create or replace function private.confirm_order_payment_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_policy jsonb;
  v_service_total numeric(12,2);
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

  if v_order.payment_method = 'card' then
    raise exception 'El pago con tarjeta queda pendiente hasta conectar Mercado Pago';
  end if;

  v_policy := coalesce(v_order.pricing_policy_snapshot, private.current_commercial_policy());
  v_service_total := private.order_service_total_amount(v_order.id);
  v_amount := private.order_client_total_amount(v_order.id);
  v_fee := private.order_commission_amount(v_service_total, v_policy);

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
    greatest(0, v_service_total - v_fee),
    coalesce(v_policy->>'currency', 'ARS'),
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
$function$;

create or replace function private.prevent_accepted_proposal_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'accepted' and (
    new.order_id is distinct from old.order_id
    or new.professional_id is distinct from old.professional_id
    or new.labor_price is distinct from old.labor_price
    or new.materials_price is distinct from old.materials_price
    or new.visit_price is distinct from old.visit_price
    or new.manito_fee is distinct from old.manito_fee
    or new.estimated_minutes is distinct from old.estimated_minutes
    or new.availability_label is distinct from old.availability_label
    or new.observation is distinct from old.observation
    or new.status is distinct from old.status
  ) then
    raise exception 'El presupuesto aceptado no puede modificarse';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_proposals_accepted_immutable on public.order_proposals;
create trigger trg_order_proposals_accepted_immutable
before update on public.order_proposals
for each row execute function private.prevent_accepted_proposal_changes();

create or replace function private.prevent_approved_extra_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'approved' and (
    new.order_id is distinct from old.order_id
    or new.professional_id is distinct from old.professional_id
    or new.title is distinct from old.title
    or new.amount is distinct from old.amount
    or new.status is distinct from old.status
  ) then
    raise exception 'El adicional aprobado no puede modificarse';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_extras_approved_immutable on public.order_extras;
create trigger trg_order_extras_approved_immutable
before update on public.order_extras
for each row execute function private.prevent_approved_extra_changes();

grant select (
  estimated_price,
  agreed_price,
  agreed_scope,
  contracted_at,
  accepted_proposal_id,
  contract_snapshot,
  pricing_policy_snapshot
) on public.orders to authenticated;

grant insert (
  estimated_price
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

drop function if exists public.accept_order(uuid);
drop function if exists public.accept_proposal(uuid);
drop function if exists public.advance_order(uuid);
drop function if exists public.cancel_order(uuid);
drop function if exists public.complete_order(uuid, text);
drop function if exists public.confirm_order_payment(uuid);
drop function if exists public.start_order(uuid, text);

create function public.accept_order(p_order_id uuid)
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
  from private.accept_order_impl(p_order_id) as o;
$$;

create function public.accept_proposal(p_proposal_id uuid)
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
  from private.accept_proposal_impl(p_proposal_id) as o;
$$;

create function public.advance_order(p_order_id uuid)
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
  from private.advance_order_impl(p_order_id) as o;
$$;

create function public.cancel_order(p_order_id uuid)
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
  from private.cancel_order_impl(p_order_id) as o;
$$;

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
  from private.confirm_order_payment_impl(p_order_id) as o;
$$;

create function public.start_order(p_order_id uuid, p_pin text)
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
  from private.start_order_impl(p_order_id, p_pin) as o;
$$;

create function public.complete_order(p_order_id uuid, p_pin text)
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
  estimated_price numeric,
  agreed_price numeric,
  agreed_scope text,
  contracted_at timestamptz,
  accepted_proposal_id uuid,
  contract_snapshot jsonb,
  pricing_policy_snapshot jsonb,
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
    o.estimated_price,
    o.agreed_price,
    o.agreed_scope,
    o.contracted_at,
    o.accepted_proposal_id,
    o.contract_snapshot,
    o.pricing_policy_snapshot,
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

drop function if exists public.get_order_economic_summary(uuid);

create function public.get_order_economic_summary(p_order_id uuid)
returns table (
  order_id uuid,
  estimated_price numeric,
  agreed_price numeric,
  approved_extras_total numeric,
  service_total numeric,
  client_fee numeric,
  discounts_total numeric,
  credits_total numeric,
  client_total numeric,
  commission_amount numeric,
  professional_net numeric,
  pricing_policy_snapshot jsonb,
  contracted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_policy jsonb;
  v_service_total numeric(12, 2);
  v_client_fee numeric(12, 2);
  v_commission numeric(12, 2);
begin
  select * into v_order
  from public.orders o
  where o.id = p_order_id
    and (
      o.client_id = (select auth.uid())
      or o.professional_id = (select auth.uid())
      or private.is_manito_admin()
    );

  if v_order.id is null then
    return;
  end if;

  v_policy := coalesce(v_order.pricing_policy_snapshot, private.current_commercial_policy());
  v_service_total := private.order_service_total_amount(v_order.id);
  v_client_fee := private.order_client_fee_amount(v_policy);
  v_commission := private.order_commission_amount(v_service_total, v_policy);

  return query
  select
    v_order.id,
    v_order.estimated_price,
    v_order.agreed_price,
    private.order_approved_extras_total(v_order.id),
    v_service_total,
    v_client_fee,
    0::numeric(12, 2),
    0::numeric(12, 2),
    greatest(0, v_service_total + v_client_fee)::numeric(12, 2),
    v_commission,
    greatest(0, v_service_total - v_commission)::numeric(12, 2),
    v_policy,
    v_order.contracted_at;
end;
$$;

revoke all on function public.get_order_economic_summary(uuid) from public, anon;
grant execute on function public.get_order_economic_summary(uuid) to authenticated;

insert into public.admin_settings (key, value)
values (
  'norm_003_economic_contract_source',
  jsonb_build_object(
    'orders_price_legacy', true,
    'estimate_source', 'orders.estimated_price',
    'contract_source', 'orders.agreed_price + orders.contract_snapshot',
    'service_total', 'agreed_price + approved order_extras',
    'client_total', 'service_total + enabled client_fee - discounts - credits',
    'payment_transition_source', 'public.get_order_economic_summary/private order totals'
  )
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
