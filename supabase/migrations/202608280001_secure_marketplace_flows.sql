-- MANITO secure marketplace flows.
-- Backend is the source of truth for professional authorization, opportunity
-- visibility, manual assignment, extras, proposals, payments and PIN steps.

create schema if not exists private;

create or replace function private.is_manito_admin(p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.role = 'admin'
  );
$$;

create or replace function private.professional_can_receive_orders(p_professional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.professional_onboarding po
      on po.professional_id = p.id
    left join public.professional_profiles pp
      on pp.professional_id = p.id
    where p.id = p_professional_id
      and p.role = 'professional'
      and coalesce(po.status, 'draft') <> 'suspended'
      and (
        po.status = 'approved'
        or pp.verified = true
      )
  );
$$;

create or replace function private.order_public_zone(p_address text)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[];
  v_last text;
begin
  v_parts := string_to_array(coalesce(p_address, ''), ',');
  if array_length(v_parts, 1) > 1 then
    v_last := btrim(v_parts[array_length(v_parts, 1)]);
    if v_last <> '' then
      return v_last;
    end if;
  end if;

  return 'Zona aproximada';
end;
$$;

create or replace function private.distance_km(
  p_lat_a double precision,
  p_lng_a double precision,
  p_lat_b double precision,
  p_lng_b double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when p_lat_a is null or p_lng_a is null or p_lat_b is null or p_lng_b is null then null
    else 6371 * acos(
      least(
        1,
        greatest(
          -1,
          cos(radians(p_lat_a)) * cos(radians(p_lat_b)) *
          cos(radians(p_lng_b) - radians(p_lng_a)) +
          sin(radians(p_lat_a)) * sin(radians(p_lat_b))
        )
      )
    )
  end;
$$;

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
    'trabajando',
    'completed',
    'cancelled'
  ));

create or replace function private.enforce_professional_profile_trust_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_manito_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.verified := false;
    new.manito_pro := false;
    new.rating_avg := 0;
    new.jobs_completed := 0;
  else
    new.verified := old.verified;
    new.manito_pro := old.manito_pro;
    new.rating_avg := old.rating_avg;
    new.jobs_completed := old.jobs_completed;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_professional_profiles_trust_fields on public.professional_profiles;
create trigger trg_professional_profiles_trust_fields
before insert or update on public.professional_profiles
for each row execute function private.enforce_professional_profile_trust_fields();

create or replace function private.enforce_professional_onboarding_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_manito_admin() then
    if new.status in ('approved', 'observed', 'rejected', 'suspended') then
      new.reviewed_at := coalesce(new.reviewed_at, now());
    end if;
    return new;
  end if;

  if new.status not in ('draft', 'submitted') then
    raise exception 'La revision profesional la realiza MANITO';
  end if;

  if tg_op = 'UPDATE' and old.status in ('approved', 'rejected', 'suspended') then
    new.status := old.status;
  end if;

  if new.status = 'submitted' then
    new.submitted_at := coalesce(new.submitted_at, now());
  else
    new.reviewed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_professional_onboarding_status_guard on public.professional_onboarding;
create trigger trg_professional_onboarding_status_guard
before insert or update on public.professional_onboarding
for each row execute function private.enforce_professional_onboarding_status();

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or private.is_manito_admin()
  or exists (
    select 1
    from public.orders o
    where o.professional_id is not null
      and o.status not in ('open', 'scheduled_open', 'waiting_quotes', 'cancelled')
      and (
        (o.client_id = (select auth.uid()) and o.professional_id = profiles.id)
        or (o.professional_id = (select auth.uid()) and o.client_id = profiles.id)
      )
  )
);

create or replace function public.list_public_professionals()
returns table (
  id uuid,
  full_name text,
  city text,
  is_available boolean,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.city,
    p.is_available,
    case when p.lat is null then null else round(p.lat::numeric, 2)::double precision end as lat,
    case when p.lng is null then null else round(p.lng::numeric, 2)::double precision end as lng
  from public.profiles p
  where p.role = 'professional'
    and private.professional_can_receive_orders(p.id)
  order by p.full_name;
$$;

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
for select to authenticated
using (
  client_id = (select auth.uid())
  or professional_id = (select auth.uid())
  or private.is_manito_admin()
);

create or replace function public.list_professional_opportunities()
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
  assignment_mode text,
  preferred_professional_id uuid,
  payment_method text,
  payment_status text,
  online_payment_required boolean,
  payment_required_at timestamptz,
  paid_at timestamptz,
  guarantee_days integer,
  eta_minutes integer,
  start_pin text,
  end_pin text,
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
  with pro as (
    select
      pp.*,
      coalesce(pp.service_radius_km, 8) as radius_km
    from public.professional_profiles pp
    where pp.professional_id = v_uid
  )
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
    o.assignment_mode,
    o.preferred_professional_id,
    o.payment_method,
    o.payment_status,
    o.online_payment_required,
    o.payment_required_at,
    o.paid_at,
    o.guarantee_days,
    o.eta_minutes,
    null::text as start_pin,
    null::text as end_pin,
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
    and (o.mode <> 'immediate' or exists (
      select 1 from public.profiles p where p.id = v_uid and p.is_available = true
    ))
    and (
      o.assignment_mode <> 'manual'
      or o.preferred_professional_id is null
      or o.preferred_professional_id = v_uid
    )
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
    else null
  end;

  if v_next is null then
    raise exception 'Usa el PIN del cliente para iniciar o finalizar el trabajo';
  end if;

  update public.orders
  set status = v_next
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function private.start_order_impl(p_order_id uuid, p_pin text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  update public.orders
  set status = 'trabajando'
  where id = p_order_id
    and professional_id = v_uid
    and status = 'en_sitio'
    and start_pin = btrim(coalesce(p_pin, ''))
  returning * into v_order;

  if v_order.id is null then
    raise exception 'PIN de inicio incorrecto o pedido no disponible';
  end if;

  return v_order;
end;
$$;

create or replace function private.complete_order_impl(p_order_id uuid, p_pin text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  update public.orders
  set
    status = 'completed',
    completed_at = now()
  where id = p_order_id
    and professional_id = v_uid
    and status = 'trabajando'
    and end_pin = btrim(coalesce(p_pin, ''))
  returning * into v_order;

  if v_order.id is null then
    raise exception 'PIN de cierre incorrecto o pedido no disponible';
  end if;

  return v_order;
end;
$$;

create or replace function public.start_order(p_order_id uuid, p_pin text)
returns public.orders
language sql
security invoker
set search_path = public, private
as $$
  select * from private.start_order_impl(p_order_id, p_pin);
$$;

create or replace function public.complete_order(p_order_id uuid, p_pin text)
returns public.orders
language sql
security invoker
set search_path = public, private
as $$
  select * from private.complete_order_impl(p_order_id, p_pin);
$$;

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
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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
    greatest(0, coalesce(p_manito_fee, 0)),
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
$$;

create or replace function public.send_order_proposal(
  p_order_id uuid,
  p_labor_price numeric,
  p_materials_price numeric,
  p_visit_price numeric,
  p_manito_fee numeric,
  p_estimated_minutes integer default null,
  p_availability_label text default null,
  p_observation text default null
)
returns public.order_proposals
language sql
security invoker
set search_path = public, private
as $$
  select * from private.send_order_proposal_impl(
    p_order_id,
    p_labor_price,
    p_materials_price,
    p_visit_price,
    p_manito_fee,
    p_estimated_minutes,
    p_availability_label,
    p_observation
  );
$$;

create or replace function private.propose_order_extra_impl(
  p_order_id uuid,
  p_title text,
  p_amount numeric
)
returns public.order_extras
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_extra public.order_extras;
begin
  insert into public.order_extras (
    order_id,
    professional_id,
    title,
    amount,
    status
  )
  select
    o.id,
    v_uid,
    left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), 'Adicional'), 120),
    greatest(0, coalesce(p_amount, 0)),
    'pending'
  from public.orders o
  where o.id = p_order_id
    and o.professional_id = v_uid
    and o.status in ('en_sitio', 'trabajando')
  returning * into v_extra;

  if v_extra.id is null then
    raise exception 'Solo el profesional asignado puede pedir adicionales en el domicilio';
  end if;

  return v_extra;
end;
$$;

create or replace function public.propose_order_extra(
  p_order_id uuid,
  p_title text,
  p_amount numeric
)
returns public.order_extras
language sql
security invoker
set search_path = public, private
as $$
  select * from private.propose_order_extra_impl(p_order_id, p_title, p_amount);
$$;

create or replace function private.decide_order_extra_impl(p_extra_id uuid, p_status text)
returns public.order_extras
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_extra public.order_extras;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Decision de adicional invalida';
  end if;

  update public.order_extras oe
  set
    status = p_status,
    decided_at = now()
  from public.orders o
  where oe.id = p_extra_id
    and o.id = oe.order_id
    and o.client_id = v_uid
    and oe.status = 'pending'
  returning oe.* into v_extra;

  if v_extra.id is null then
    raise exception 'El adicional ya fue decidido o no corresponde a tu pedido';
  end if;

  return v_extra;
end;
$$;

create or replace function public.decide_order_extra(p_extra_id uuid, p_status text)
returns public.order_extras
language sql
security invoker
set search_path = public, private
as $$
  select * from private.decide_order_extra_impl(p_extra_id, p_status);
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

  if v_order.payment_method = 'card' then
    raise exception 'El pago con tarjeta queda pendiente hasta conectar Mercado Pago';
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

drop policy if exists order_proposals_professional_insert on public.order_proposals;
drop policy if exists order_proposals_participant_update on public.order_proposals;
drop policy if exists order_proposals_visible on public.order_proposals;
drop policy if exists order_proposals_participants on public.order_proposals;
drop policy if exists order_proposals_participants_select on public.order_proposals;

revoke all on public.order_proposals from anon, authenticated;
grant select on public.order_proposals to authenticated;

create policy order_proposals_participants_select on public.order_proposals
for select to authenticated
using (
  professional_id = (select auth.uid())
  or exists (
    select 1
    from public.orders o
    where o.id = order_proposals.order_id
      and o.client_id = (select auth.uid())
  )
  or private.is_manito_admin()
);

drop policy if exists order_extras_participants on public.order_extras;
drop policy if exists order_extras_participants_select on public.order_extras;

revoke all on public.order_extras from anon, authenticated;
grant select on public.order_extras to authenticated;

create policy order_extras_participants_select on public.order_extras
for select to authenticated
using (
  professional_id = (select auth.uid())
  or exists (
    select 1
    from public.orders o
    where o.id = order_extras.order_id
      and o.client_id = (select auth.uid())
  )
  or private.is_manito_admin()
);

revoke all on function private.is_manito_admin(uuid) from public, anon, authenticated;
revoke all on function private.professional_can_receive_orders(uuid) from public, anon, authenticated;
revoke all on function private.order_public_zone(text) from public, anon, authenticated;
revoke all on function private.distance_km(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function private.enforce_professional_profile_trust_fields() from public, anon, authenticated;
revoke all on function private.enforce_professional_onboarding_status() from public, anon, authenticated;
revoke all on function private.start_order_impl(uuid, text) from public, anon, authenticated;
revoke all on function private.complete_order_impl(uuid, text) from public, anon, authenticated;
revoke all on function private.send_order_proposal_impl(uuid, numeric, numeric, numeric, numeric, integer, text, text) from public, anon, authenticated;
revoke all on function private.propose_order_extra_impl(uuid, text, numeric) from public, anon, authenticated;
revoke all on function private.decide_order_extra_impl(uuid, text) from public, anon, authenticated;
revoke all on function public.list_public_professionals() from public, anon;
revoke all on function public.list_professional_opportunities() from public, anon;
revoke all on function public.start_order(uuid, text) from public, anon;
revoke all on function public.complete_order(uuid, text) from public, anon;
revoke all on function public.send_order_proposal(uuid, numeric, numeric, numeric, numeric, integer, text, text) from public, anon;
revoke all on function public.propose_order_extra(uuid, text, numeric) from public, anon;
revoke all on function public.decide_order_extra(uuid, text) from public, anon;

grant execute on function public.list_public_professionals() to authenticated;
grant execute on function public.list_professional_opportunities() to authenticated;
grant execute on function public.start_order(uuid, text) to authenticated;
grant execute on function public.complete_order(uuid, text) to authenticated;
grant execute on function public.send_order_proposal(uuid, numeric, numeric, numeric, numeric, integer, text, text) to authenticated;
grant execute on function public.propose_order_extra(uuid, text, numeric) to authenticated;
grant execute on function public.decide_order_extra(uuid, text) to authenticated;

insert into public.admin_settings (key, value)
values (
  'secure_marketplace_flows',
  '{
    "professional_authorization": "approved_onboarding_or_admin_verified_demo",
    "open_order_visibility": "sanitized_professional_opportunity_rpc",
    "manual_assignment": "preferred_professional_enforced_backend",
    "state_machine": ["accepted", "en_camino", "en_sitio", "trabajando", "completed"],
    "pin_required": ["start_order", "complete_order"],
    "manual_payments": ["cash", "wallet", "transfer"],
    "card_payments": "mercado_pago_required"
  }'::jsonb
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
