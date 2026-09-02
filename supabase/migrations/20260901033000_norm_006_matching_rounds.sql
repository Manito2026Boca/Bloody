-- NORM-006: automatic immediate matching by configurable invitation rounds.
-- Scheduled, quote, and manual request lifecycles keep their existing behavior.

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
      and pg_get_constraintdef(c.oid) not ilike '%manual_response_status%'
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
    'cancelled',
    'matching_failed'
  ));

alter table public.orders
  add column if not exists matching_status text,
  add column if not exists matching_started_at timestamptz,
  add column if not exists matching_current_round integer not null default 0,
  add column if not exists matching_cycle integer not null default 1,
  add column if not exists matching_round_deadline_at timestamptz,
  add column if not exists matching_failed_at timestamptz;

alter table public.orders drop constraint if exists orders_matching_status_check;
alter table public.orders
  add constraint orders_matching_status_check
  check (matching_status is null or matching_status in ('idle', 'round_pending', 'matched', 'failed'));

comment on column public.orders.matching_status is 'NORM-006 automatic immediate matching lifecycle status.';
comment on column public.orders.matching_current_round is 'NORM-006 current automatic matching round inside the active cycle.';
comment on column public.orders.matching_cycle is 'NORM-006 retry cycle. Reintentar busqueda starts a new cycle and preserves old invitations.';

create table if not exists public.order_match_candidates (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  cycle_number integer not null default 1 check (cycle_number > 0),
  invited_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'expired', 'closed')),
  response_reason text,
  responded_at timestamptz,
  score integer not null default 0,
  reasons text[] not null default array[]::text[],
  distance_km double precision,
  radius_km numeric(6, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, professional_id, cycle_number)
);

create index if not exists idx_order_match_candidates_professional
  on public.order_match_candidates(professional_id, status, deadline_at);

create index if not exists idx_order_match_candidates_order_round
  on public.order_match_candidates(order_id, cycle_number, round_number, status);

alter table public.order_match_candidates enable row level security;

revoke all on table public.order_match_candidates from public, anon, authenticated;
grant select on table public.order_match_candidates to authenticated;

drop policy if exists order_match_candidates_select_participants on public.order_match_candidates;
create policy order_match_candidates_select_participants
on public.order_match_candidates
for select
to authenticated
using (
  professional_id = (select auth.uid())
  or exists (
    select 1
    from public.orders o
    where o.id = order_match_candidates.order_id
      and o.client_id = (select auth.uid())
  )
);

insert into public.admin_settings (key, value)
values (
  'matching',
  jsonb_build_object(
    'schema_version', 1,
    'matching_batch_size', 3,
    'matching_round_timeout_seconds', 90,
    'matching_max_rounds', 3,
    'initial_radius_km', 8,
    'radius_increment_km', 4,
    'max_radius_km', 20,
    'specialty_match_bonus', 18,
    'verified_bonus', 10,
    'completed_jobs_cap', 10
  )
)
on conflict (key) do update
set value = jsonb_build_object(
    'schema_version', coalesce(public.admin_settings.value->'schema_version', excluded.value->'schema_version'),
    'matching_batch_size', coalesce(public.admin_settings.value->'matching_batch_size', excluded.value->'matching_batch_size'),
    'matching_round_timeout_seconds', coalesce(public.admin_settings.value->'matching_round_timeout_seconds', excluded.value->'matching_round_timeout_seconds'),
    'matching_max_rounds', coalesce(public.admin_settings.value->'matching_max_rounds', excluded.value->'matching_max_rounds'),
    'initial_radius_km', coalesce(public.admin_settings.value->'initial_radius_km', excluded.value->'initial_radius_km'),
    'radius_increment_km', coalesce(public.admin_settings.value->'radius_increment_km', excluded.value->'radius_increment_km'),
    'max_radius_km', coalesce(public.admin_settings.value->'max_radius_km', excluded.value->'max_radius_km'),
    'specialty_match_bonus', coalesce(public.admin_settings.value->'specialty_match_bonus', excluded.value->'specialty_match_bonus'),
    'verified_bonus', coalesce(public.admin_settings.value->'verified_bonus', excluded.value->'verified_bonus'),
    'completed_jobs_cap', coalesce(public.admin_settings.value->'completed_jobs_cap', excluded.value->'completed_jobs_cap')
  ),
  updated_at = now();

create or replace function private.current_matching_policy()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'matching_batch_size', 3,
    'matching_round_timeout_seconds', 90,
    'matching_max_rounds', 3,
    'initial_radius_km', 8,
    'radius_increment_km', 4,
    'max_radius_km', 20,
    'specialty_match_bonus', 18,
    'verified_bonus', 10,
    'completed_jobs_cap', 10
  ) || coalesce((select s.value from public.admin_settings s where s.key = 'matching'), '{}'::jsonb);
$$;

create or replace function private.matching_policy_int(p_policy jsonb, p_key text, p_default integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(p_policy->>p_key, '')::integer, p_default);
$$;

create or replace function private.matching_policy_number(p_policy jsonb, p_key text, p_default numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(p_policy->>p_key, '')::numeric, p_default);
$$;

create or replace function private.matching_round_radius_km(p_round integer)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select least(
    private.matching_policy_number(private.current_matching_policy(), 'max_radius_km', 20),
    private.matching_policy_number(private.current_matching_policy(), 'initial_radius_km', 8)
      + greatest(0, coalesce(p_round, 1) - 1)
        * private.matching_policy_number(private.current_matching_policy(), 'radius_increment_km', 4)
  );
$$;

create or replace function private.matching_deadline(p_invited_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_invited_at, now())
    + make_interval(secs => greatest(1, private.matching_policy_int(private.current_matching_policy(), 'matching_round_timeout_seconds', 90)));
$$;

create or replace function private.start_immediate_matching_round_impl(p_order_id uuid, p_restart boolean default false)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_policy jsonb := private.current_matching_policy();
  v_batch_size integer := greatest(1, private.matching_policy_int(v_policy, 'matching_batch_size', 3));
  v_max_rounds integer := greatest(1, private.matching_policy_int(v_policy, 'matching_max_rounds', 3));
  v_round integer;
  v_cycle integer;
  v_radius numeric;
  v_invited_at timestamptz;
  v_deadline timestamptz;
  v_inserted integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 606));

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then return null; end if;
  if v_order.mode <> 'immediate' or coalesce(v_order.assignment_mode, 'auto') <> 'auto' then return v_order; end if;
  if v_order.professional_id is not null then return v_order; end if;
  if v_order.status not in ('open', 'matching_failed') then return v_order; end if;
  if v_order.status = 'matching_failed' and not p_restart then return v_order; end if;

  if p_restart then
    update public.orders
    set status = 'open',
        matching_status = 'idle',
        matching_cycle = coalesce(matching_cycle, 1) + 1,
        matching_current_round = 0,
        matching_round_deadline_at = null,
        matching_failed_at = null,
        updated_at = now()
    where id = p_order_id
    returning * into v_order;
  end if;

  if v_order.matching_status = 'round_pending'
     and v_order.matching_round_deadline_at > now()
     and exists (
       select 1
       from public.order_match_candidates c
       where c.order_id = p_order_id
         and c.cycle_number = coalesce(v_order.matching_cycle, 1)
         and c.round_number = v_order.matching_current_round
         and c.status = 'pending'
     ) then
    return v_order;
  end if;

  v_round := greatest(1, coalesce(v_order.matching_current_round, 0) + 1);
  v_cycle := greatest(1, coalesce(v_order.matching_cycle, 1));

  while v_round <= v_max_rounds loop
    v_radius := private.matching_round_radius_km(v_round);
    v_invited_at := now();
    v_deadline := private.matching_deadline(v_invited_at);

    with ranked as (
      select
        o.id as order_id,
        p.id as professional_id,
        v_round as round_number,
        v_cycle as cycle_number,
        v_invited_at as invited_at,
        v_deadline as deadline_at,
        (
          70
          + case when exists (
              select 1
              from public.professional_specialties psp
              where psp.professional_id = p.id
                and psp.service_id = o.service_id
            ) then private.matching_policy_int(v_policy, 'specialty_match_bonus', 18) else 0 end
          + case when coalesce(pp.verified, false) then private.matching_policy_int(v_policy, 'verified_bonus', 10) else 0 end
          + least(private.matching_policy_int(v_policy, 'completed_jobs_cap', 10), coalesce(pp.jobs_completed, 0))
          + case
              when private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) is null then 2
              else greatest(0, 12 - round(private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng))::integer)
            end
        )::integer as score,
        array_remove(array[
          'Invitacion ronda ' || v_round::text,
          case when exists (
              select 1
              from public.professional_specialties psp
              where psp.professional_id = p.id
                and psp.service_id = o.service_id
            ) then 'Especialidad compatible' else 'Servicio compatible' end,
          case when coalesce(pp.verified, false) then 'Verificado por MANITO' else 'Revision MANITO aprobada' end,
          case
            when private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) is not null
            then round(private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng)::numeric, 1)::text || ' km'
            else private.order_public_zone(o.address)
          end
        ], null) as reasons,
        private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) as distance_km
      from public.orders o
      join public.professional_services ps on ps.service_id = o.service_id
      join public.profiles p on p.id = ps.professional_id
      left join public.professional_profiles pp on pp.professional_id = p.id
      where o.id = p_order_id
        and p.role = 'professional'
        and p.id <> o.client_id
        and p.is_available = true
        and private.professional_can_receive_orders(p.id)
        and not exists (
          select 1
          from public.order_match_candidates c
          where c.order_id = o.id
            and c.professional_id = p.id
            and c.cycle_number = v_cycle
        )
        and (
          private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) is null
          or private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) <= v_radius
        )
        and (
          private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) is null
          or private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) <= coalesce(pp.service_radius_km, v_radius)
        )
      order by score desc, distance_km asc nulls last, p.created_at asc
      limit v_batch_size
    ),
    inserted as (
      insert into public.order_match_candidates (
        order_id, professional_id, round_number, cycle_number, invited_at, deadline_at,
        score, reasons, distance_km, radius_km
      )
      select order_id, professional_id, round_number, cycle_number, invited_at, deadline_at,
        score, reasons, distance_km, v_radius
      from ranked
      on conflict (order_id, professional_id, cycle_number) do nothing
      returning *
    )
    select count(*) into v_inserted from inserted;

    if v_inserted > 0 then
      update public.orders
      set matching_status = 'round_pending',
          matching_started_at = coalesce(matching_started_at, v_invited_at),
          matching_current_round = v_round,
          matching_cycle = v_cycle,
          matching_round_deadline_at = v_deadline,
          matching_failed_at = null,
          updated_at = now()
      where id = p_order_id
      returning * into v_order;

      insert into public.notifications (recipient_id, order_id, kind, title, body)
      select
        c.professional_id,
        c.order_id,
        'order_created',
        'Nuevo pedido disponible',
        'Tenes una invitacion de MANITO para tomar este trabajo ahora.'
      from public.order_match_candidates c
      where c.order_id = p_order_id
        and c.cycle_number = v_cycle
        and c.round_number = v_round
        and c.status = 'pending';

      return v_order;
    end if;

    v_round := v_round + 1;
  end loop;

  update public.orders
  set status = 'matching_failed',
      matching_status = 'failed',
      matching_current_round = v_max_rounds,
      matching_round_deadline_at = null,
      matching_failed_at = now(),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.notifications (recipient_id, order_id, kind, title, body)
  values (
    v_order.client_id,
    v_order.id,
    'order_status',
    'No encontramos profesional disponible',
    'Podes reintentar la busqueda, programar el pedido o pedir presupuestos.'
  );

  return v_order;
end;
$$;

create or replace function private.expire_immediate_matching_impl(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 606));

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then return null; end if;
  if v_order.mode <> 'immediate' or coalesce(v_order.assignment_mode, 'auto') <> 'auto' then return v_order; end if;
  if v_order.professional_id is not null or v_order.status <> 'open' then return v_order; end if;

  update public.order_match_candidates
  set status = 'expired',
      responded_at = coalesce(responded_at, now()),
      updated_at = now()
  where order_id = p_order_id
    and cycle_number = coalesce(v_order.matching_cycle, 1)
    and round_number = v_order.matching_current_round
    and status = 'pending'
    and deadline_at <= now();

  if v_order.matching_status = 'round_pending'
     and not exists (
       select 1
       from public.order_match_candidates c
       where c.order_id = p_order_id
         and c.cycle_number = coalesce(v_order.matching_cycle, 1)
         and c.round_number = v_order.matching_current_round
         and c.status = 'pending'
     ) then
    return private.start_immediate_matching_round_impl(p_order_id, false);
  end if;

  return v_order;
end;
$$;

create or replace function private.refresh_immediate_matching_for_professional_impl(p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select distinct c.order_id
    from public.order_match_candidates c
    where c.professional_id = p_professional_id
      and c.status = 'pending'
      and c.deadline_at <= now()
  loop
    perform private.expire_immediate_matching_impl(v_order_id);
  end loop;
end;
$$;

create or replace function private.start_immediate_matching_on_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mode = 'immediate'
     and coalesce(new.assignment_mode, 'auto') = 'auto'
     and new.professional_id is null
     and new.status = 'open'
     and coalesce(new.matching_status, 'idle') in ('idle', 'failed') then
    perform private.start_immediate_matching_round_impl(new.id, false);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_start_immediate_matching on public.orders;
create trigger trg_orders_start_immediate_matching
after insert or update of assignment_mode, status, mode, professional_id
on public.orders
for each row
execute function private.start_immediate_matching_on_order_change();

do $$
begin
  if to_regprocedure('private.accept_order_pre_matching_impl(uuid)') is null then
    alter function private.accept_order_impl(uuid) rename to accept_order_pre_matching_impl;
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

  v_before := private.expire_immediate_matching_impl(p_order_id);
  select * into v_before
  from public.orders
  where id = p_order_id
  for update;

  if v_before.mode = 'immediate'
     and coalesce(v_before.assignment_mode, 'auto') = 'auto'
     and v_before.professional_id is null
     and v_before.status = 'open' then
    if not exists (
      select 1
      from public.order_match_candidates c
      where c.order_id = p_order_id
        and c.professional_id = v_uid
        and c.cycle_number = coalesce(v_before.matching_cycle, 1)
        and c.round_number = v_before.matching_current_round
        and c.status = 'pending'
        and c.deadline_at > now()
    ) then
      raise exception 'Este pedido no esta disponible para este profesional';
    end if;
  end if;

  v_order := private.accept_order_pre_matching_impl(p_order_id);

  if v_before.mode = 'immediate' and coalesce(v_before.assignment_mode, 'auto') = 'auto' then
    update public.order_match_candidates
    set status = 'accepted',
        responded_at = now(),
        updated_at = now()
    where order_id = p_order_id
      and professional_id = v_uid
      and cycle_number = coalesce(v_before.matching_cycle, 1)
      and status = 'pending';

    update public.order_match_candidates
    set status = 'closed',
        responded_at = coalesce(responded_at, now()),
        updated_at = now()
    where order_id = p_order_id
      and cycle_number = coalesce(v_before.matching_cycle, 1)
      and professional_id <> v_uid
      and status = 'pending';

    update public.orders
    set matching_status = 'matched',
        matching_round_deadline_at = null,
        updated_at = now()
    where id = p_order_id
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
    o.matching_status, o.matching_started_at,
    o.matching_current_round, o.matching_cycle,
    o.matching_round_deadline_at, o.matching_failed_at,
    o.payment_method, o.guarantee_days, o.eta_minutes,
    o.payment_status, o.online_payment_required,
    o.payment_required_at, o.paid_at
  from private.accept_order_impl(p_order_id) as o;
$$;

create or replace function private.reject_matching_candidate_impl(p_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_candidate public.order_match_candidates;
  v_pending_count integer;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform private.expire_immediate_matching_impl(p_order_id);

  select c.* into v_candidate
  from public.order_match_candidates c
  join public.orders o on o.id = c.order_id
  where c.order_id = p_order_id
    and c.professional_id = v_uid
    and c.status = 'pending'
    and c.deadline_at > now()
    and o.mode = 'immediate'
    and coalesce(o.assignment_mode, 'auto') = 'auto'
    and o.professional_id is null
    and o.status = 'open'
  for update of c;

  if v_candidate.id is null then
    raise exception 'Esta invitacion ya no esta disponible';
  end if;

  update public.order_match_candidates
  set status = 'rejected',
      response_reason = p_reason,
      responded_at = now(),
      updated_at = now()
  where id = v_candidate.id;

  select count(*) into v_pending_count
  from public.order_match_candidates c
  where c.order_id = p_order_id
    and c.cycle_number = v_candidate.cycle_number
    and c.round_number = v_candidate.round_number
    and c.status = 'pending';

  if v_pending_count = 0 then
    perform private.start_immediate_matching_round_impl(p_order_id, false);
  end if;
end;
$$;

drop function if exists public.reject_matching_candidate(uuid, text);
create function public.reject_matching_candidate(p_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reject_matching_candidate_impl(p_order_id, p_reason);
end;
$$;

drop function if exists public.refresh_immediate_matching(uuid);
create function public.refresh_immediate_matching(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and (
        o.client_id = v_uid
        or exists (
          select 1
          from public.order_match_candidates c
          where c.order_id = o.id
            and c.professional_id = v_uid
        )
        or private.is_admin(v_uid)
      )
  ) then
    raise exception 'No podes actualizar esta busqueda';
  end if;
  perform private.expire_immediate_matching_impl(p_order_id);
end;
$$;

drop function if exists public.retry_immediate_matching(uuid);
create function public.retry_immediate_matching(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.client_id = v_uid
      and o.mode = 'immediate'
      and coalesce(o.assignment_mode, 'auto') = 'auto'
      and o.professional_id is null
      and o.status = 'matching_failed'
  ) then
    raise exception 'No podes reintentar esta busqueda';
  end if;
  perform private.start_immediate_matching_round_impl(p_order_id, true);
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
    and (o.scheduled_at is null or private.professional_schedule_contains(v_uid, o.scheduled_at, coalesce(o.scheduled_end, private.schedule_end_from(o.scheduled_at, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())))))
    and (o.scheduled_at is null or not private.professional_has_schedule_conflict(v_uid, o.scheduled_at, coalesce(o.scheduled_end, private.schedule_end_from(o.scheduled_at, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes()))), o.id))
  order by coalesce(mc.score, 0) desc, o.created_at desc;
end;
$$;

revoke all on function public.accept_order(uuid) from public, anon;
revoke all on function public.reject_matching_candidate(uuid, text) from public, anon;
revoke all on function public.refresh_immediate_matching(uuid) from public, anon;
revoke all on function public.retry_immediate_matching(uuid) from public, anon;
revoke all on function public.list_professional_opportunities() from public, anon;
grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.reject_matching_candidate(uuid, text) to authenticated;
grant execute on function public.refresh_immediate_matching(uuid) to authenticated;
grant execute on function public.retry_immediate_matching(uuid) to authenticated;
grant execute on function public.list_professional_opportunities() to authenticated;

revoke all on function private.current_matching_policy() from public, anon, authenticated;
revoke all on function private.matching_policy_int(jsonb, text, integer) from public, anon, authenticated;
revoke all on function private.matching_policy_number(jsonb, text, numeric) from public, anon, authenticated;
revoke all on function private.matching_round_radius_km(integer) from public, anon, authenticated;
revoke all on function private.matching_deadline(timestamptz) from public, anon, authenticated;
revoke all on function private.start_immediate_matching_round_impl(uuid, boolean) from public, anon, authenticated;
revoke all on function private.expire_immediate_matching_impl(uuid) from public, anon, authenticated;
revoke all on function private.refresh_immediate_matching_for_professional_impl(uuid) from public, anon, authenticated;
revoke all on function private.start_immediate_matching_on_order_change() from public, anon, authenticated;
revoke all on function private.reject_matching_candidate_impl(uuid, text) from public, anon, authenticated;
revoke all on function private.accept_order_impl(uuid) from public, anon, authenticated;
revoke all on function private.accept_order_pre_matching_impl(uuid) from public, anon, authenticated;

grant select (
  matching_status,
  matching_started_at,
  matching_current_round,
  matching_cycle,
  matching_round_deadline_at,
  matching_failed_at
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
  matching_status,
  matching_started_at,
  matching_current_round,
  matching_cycle,
  matching_round_deadline_at,
  matching_failed_at,
  payment_method,
  guarantee_days,
  eta_minutes,
  payment_status,
  online_payment_required,
  payment_required_at,
  paid_at
);

insert into public.admin_settings (key, value)
values ('norm_006_matching_rounds', jsonb_build_object(
  'matching_table', 'order_match_candidates',
  'statuses', jsonb_build_array('pending', 'accepted', 'rejected', 'expired', 'closed'),
  'policy_source', 'admin_settings.matching',
  'batch_size_default', 3,
  'round_timeout_seconds_default', 90,
  'max_rounds_default', 3,
  'visibility_rule', 'immediate_auto_orders_visible_only_to_invited_pending_candidates',
  'privacy_rule', 'professional_opportunities_use_public_zone_and_null_client_coordinates',
  'realtime_excludes_candidates', true,
  'manual_fallback_starts_rounds', true
))
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
