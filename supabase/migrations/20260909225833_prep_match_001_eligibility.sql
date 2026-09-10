-- PREP-MATCH-001: explicit coverage and specialty, shared across all request paths.
create table public.service_locations (

  id text primary key,
  name text not null,
  region text not null,
  country_code text not null,
  active boolean not null default true,
  unique(country_code,region,name)
);
alter table public.service_locations enable row level security;
revoke all on public.service_locations from public,anon,authenticated;
create policy service_locations_read on public.service_locations for select to authenticated using (active);
grant select on public.service_locations to authenticated;
revoke all on public.service_locations from anon;
insert into public.service_locations(id,name,region,country_code) values
 ('ar-ba-mar-del-plata','Mar del Plata','Buenos Aires','AR'),
 ('ar-ba-tres-arroyos','Tres Arroyos','Buenos Aires','AR'),
 ('ar-ba-batan','Batan','Buenos Aires','AR');

create table public.professional_service_locations (
  professional_id uuid not null references public.profiles(id) on delete cascade,
  location_id text not null references public.service_locations(id),
  primary key(professional_id,location_id)
);
alter table public.professional_service_locations enable row level security;
revoke all on public.professional_service_locations from public,anon,authenticated;
create policy professional_locations_read on public.professional_service_locations
 for select to authenticated using(professional_id=(select auth.uid()));
create policy professional_locations_insert on public.professional_service_locations
 for insert to authenticated with check(professional_id=(select auth.uid()) and exists(
 select 1 from public.service_locations l where l.id=location_id and l.active));
create policy professional_locations_delete on public.professional_service_locations
 for delete to authenticated using(professional_id=(select auth.uid()));
grant select,insert,delete on public.professional_service_locations to authenticated;
revoke all on public.professional_service_locations from anon;

alter table public.orders add column location_id text references public.service_locations(id),
 add column required_specialty_id bigint references public.specialties(id);
alter table public.recurring_service_plans add column location_id text references public.service_locations(id),
 add column required_specialty_id bigint references public.specialties(id);
grant select(location_id,required_specialty_id),insert(location_id,required_specialty_id) on public.orders to authenticated;
comment on column public.orders.required_specialty_id is 'Explicit client selection only. NULL means service-only; never inferred from description.';
comment on column public.orders.location_id is 'Explicit normalized manual location. Legacy unknown locations stay NULL; no inference from address.';
comment on table public.professional_service_locations is 'Explicit whole-locality coverage for fallback when distance cannot be measured. work_city is NOT coverage.';

create function private.match_coordinates_valid(p_lat double precision,p_lng double precision)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_lat between -90 and 90 and p_lng between -180 and 180,false)
$$;

create function private.order_professional_eligible(p_order public.orders,p_professional_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
 select 1 from public.profiles p
 join public.professional_services ps on ps.professional_id=p.id and ps.service_id=p_order.service_id
 join public.services s on s.id=ps.service_id and s.active
 left join public.professional_profiles pp on pp.professional_id=p.id
 where p.id=p_professional_id and p.id is distinct from p_order.client_id
 and p.role='professional' and private.professional_can_receive_orders(p.id)
 and (p_order.mode<>'immediate' or p.is_available)
 and (p_order.required_specialty_id is null or exists(
   select 1 from public.professional_specialties x join public.specialties sp on sp.id=x.specialty_id
   where x.professional_id=p.id and x.service_id=p_order.service_id
     and sp.service_id=p_order.service_id and sp.id=p_order.required_specialty_id and sp.active))
 and case when private.match_coordinates_valid(p_order.client_lat,p_order.client_lng)
                and private.match_coordinates_valid(p.lat,p.lng)
   then private.distance_km(p.lat,p.lng,p_order.client_lat,p_order.client_lng)<=coalesce(pp.service_radius_km,8)
   else exists(select 1 from public.professional_service_locations c
     join public.service_locations l on l.id=c.location_id and l.active
     where c.professional_id=p.id and c.location_id=p_order.location_id)
   end
 and (coalesce(p_order.assignment_mode,'auto')<>'manual'
      or p_order.preferred_professional_id is null or p_order.preferred_professional_id=p.id)
 and (p_order.scheduled_at is null or (
   private.professional_schedule_contains(p.id,p_order.scheduled_at,coalesce(p_order.scheduled_end,
     private.schedule_end_from(p_order.scheduled_at,coalesce(p_order.estimated_duration_minutes,p_order.eta_minutes,private.schedule_default_duration_minutes()))))
   and not private.professional_has_schedule_conflict(p.id,p_order.scheduled_at,coalesce(p_order.scheduled_end,
     private.schedule_end_from(p_order.scheduled_at,coalesce(p_order.estimated_duration_minutes,p_order.eta_minutes,private.schedule_default_duration_minutes()))),p_order.id)))
 )
$$;

create or replace function private.manual_order_target_is_valid(p_order public.orders,p_professional_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 p_order.preferred_professional_id:=p_professional_id;
 return private.order_professional_eligible(p_order,p_professional_id);
end
$$;

create function private.validate_match_requirements()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' then
   if (new.location_id,new.required_specialty_id,new.client_lat,new.client_lng,new.service_id,new.address)
      is not distinct from
      (old.location_id,old.required_specialty_id,old.client_lat,old.client_lng,old.service_id,old.address) then return new; end if;
   if (to_jsonb(old)->>'contracted_at') is not null then
     raise exception 'Los requisitos del trabajo contratado no pueden cambiar';
   end if;
 end if;
 if not private.match_coordinates_valid(new.client_lat,new.client_lng) and new.location_id is null then
   raise exception 'Elegi una localidad o usa GPS para ubicar el servicio';
 end if;
 if (new.client_lat is null)<>(new.client_lng is null)
   or (new.client_lat is not null and not private.match_coordinates_valid(new.client_lat,new.client_lng)) then
   raise exception 'La ubicacion GPS no es valida. Elegi una localidad';
 end if;
 if new.location_id is not null and not exists(select 1 from public.service_locations where id=new.location_id and active) then
   raise exception 'Elegi una localidad disponible';
 end if;
 if new.required_specialty_id is not null and not exists(select 1 from public.specialties
   where id=new.required_specialty_id and service_id=new.service_id and active) then
   raise exception 'La especialidad no corresponde al servicio';
 end if;
 return new;
end $$;
create trigger a_match_requirements before insert or update on public.orders
 for each row execute function private.validate_match_requirements();
create trigger a_match_requirements before insert or update on public.recurring_service_plans
 for each row execute function private.validate_match_requirements();

create function private.enforce_order_assignment_eligibility()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.preferred_professional_id is not null and new.professional_id is null
    and (TG_OP='INSERT' or old.preferred_professional_id is distinct from new.preferred_professional_id)
    and not private.manual_order_target_is_valid(new,new.preferred_professional_id) then
   raise exception 'El profesional elegido no cubre los requisitos de este pedido';
 end if;
 if new.professional_id is not null and (TG_OP='INSERT' or old.professional_id is distinct from new.professional_id)
    and not private.order_professional_eligible(new,new.professional_id) then
   raise exception 'El profesional no cumple los requisitos de este pedido';
 end if;
 return new;
end $$;
create trigger b_match_assignment before insert or update of professional_id,preferred_professional_id on public.orders
 for each row execute function private.enforce_order_assignment_eligibility();

create function public.list_eligible_request_professionals(p_data jsonb)
returns setof uuid language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 o.client_id:=auth.uid(); o.service_id:=(p_data->>'service_id')::bigint;
 o.mode:=p_data->>'mode'; o.assignment_mode:='auto';
 o.location_id:=nullif(p_data->>'location_id','');
 o.required_specialty_id:=(p_data->>'required_specialty_id')::bigint;
 o.client_lat:=(p_data->>'client_lat')::double precision; o.client_lng:=(p_data->>'client_lng')::double precision;
 o.scheduled_at:=(p_data->>'scheduled_at')::timestamptz;
 o.estimated_duration_minutes:=(p_data->>'estimated_duration_minutes')::integer;
 if o.mode is null or o.mode not in ('immediate','scheduled','quote') then return; end if;
 return query select p.id from public.profiles p where private.order_professional_eligible(o,p.id);
end $$;

create function public.complete_order_location(p_order_id uuid,p_location_id text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 update public.orders set location_id=p_location_id where id=p_order_id and client_id=auth.uid()
   and contracted_at is null and professional_id is null and status in ('open','scheduled_open','waiting_quotes','matching_failed');
 if not found then raise exception 'No podes actualizar la ubicacion de este pedido'; end if;
end $$;

revoke all on function private.match_coordinates_valid(double precision,double precision),
 private.order_professional_eligible(public.orders,uuid),private.validate_match_requirements(),
 private.enforce_order_assignment_eligibility() from public,anon,authenticated;
revoke all on function public.list_eligible_request_professionals(jsonb),
 public.complete_order_location(uuid,text) from public,anon,authenticated;
grant execute on function public.list_eligible_request_professionals(jsonb),
 public.complete_order_location(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION private.start_immediate_matching_round_impl(p_order_id uuid, p_restart boolean DEFAULT false)
 RETURNS public.orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then return null; end if;
  if v_order.mode <> 'immediate' or coalesce(v_order.assignment_mode, 'auto') <> 'auto' then return v_order; end if;
  if v_order.professional_id is not null then return v_order; end if;
  if v_order.status not in ('open', 'matching_failed') then return v_order; end if;
  if v_order.status = 'matching_failed' and not p_restart then return v_order; end if;
  if p_restart then
    update public.orders set status = 'open', matching_status = 'idle', matching_cycle = coalesce(matching_cycle, 1) + 1, matching_current_round = 0, matching_round_deadline_at = null, matching_failed_at = null, updated_at = now() where id = p_order_id returning * into v_order;
  end if;
  if v_order.matching_status = 'round_pending' and v_order.matching_round_deadline_at > now() and exists (select 1 from public.order_match_candidates c where c.order_id = p_order_id and c.cycle_number = coalesce(v_order.matching_cycle, 1) and c.round_number = v_order.matching_current_round and c.status = 'pending') then
    return v_order;
  end if;
  v_round := greatest(1, coalesce(v_order.matching_current_round, 0) + 1);
  v_cycle := greatest(1, coalesce(v_order.matching_cycle, 1));
  while v_round <= v_max_rounds loop
    v_radius := private.matching_round_radius_km(v_round);
    v_invited_at := now();
    v_deadline := private.matching_deadline(v_invited_at);
    with ranked as (
      select o.id as order_id, p.id as professional_id, v_round as round_number, v_cycle as cycle_number, v_invited_at as invited_at, v_deadline as deadline_at,
        (70 + case when exists (select 1 from public.professional_specialties psp where psp.professional_id = p.id and psp.service_id = o.service_id and o.required_specialty_id is not null and psp.specialty_id=o.required_specialty_id) then private.matching_policy_int(v_policy, 'specialty_match_bonus', 18) else 0 end + case when coalesce(pp.verified, false) then private.matching_policy_int(v_policy, 'verified_bonus', 10) else 0 end + least(private.matching_policy_int(v_policy, 'completed_jobs_cap', 10), coalesce(pp.jobs_completed, 0)) + case when private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) is null then 2 else greatest(0, 12 - round(private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng))::integer) end)::integer as score,
        array_remove(array['Invitacion ronda ' || v_round::text, case when exists (select 1 from public.professional_specialties psp where psp.professional_id = p.id and psp.service_id = o.service_id and o.required_specialty_id is not null and psp.specialty_id=o.required_specialty_id) then 'Especialidad compatible' else 'Servicio compatible' end, case when coalesce(pp.verified, false) then 'Verificado por MANITO' else 'Revision MANITO aprobada' end, case when private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) is not null then round(private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng)::numeric, 1)::text || ' km' else private.order_public_zone(o.address) end], null) as reasons,
        private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) as distance_km
      from public.orders o
      join public.professional_services ps on ps.service_id = o.service_id
      join public.profiles p on p.id = ps.professional_id
      left join public.professional_profiles pp on pp.professional_id = p.id
      where o.id = p_order_id and p.role = 'professional' and p.id <> o.client_id and p.is_available = true and private.order_professional_eligible(o,p.id)
        and not exists (select 1 from public.order_match_candidates c where c.order_id = o.id and c.professional_id = p.id and c.cycle_number = v_cycle)
        and (private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) is null or private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) <= v_radius)
        and (private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) is null or private.distance_km(p.lat, p.lng, o.client_lat, o.client_lng) <= coalesce(pp.service_radius_km, v_radius))
      order by score desc, distance_km asc nulls last, p.created_at asc
      limit v_batch_size
    ), inserted as (
      insert into public.order_match_candidates (order_id, professional_id, round_number, cycle_number, invited_at, deadline_at, score, reasons, distance_km, radius_km)
      select order_id, professional_id, round_number, cycle_number, invited_at, deadline_at, score, reasons, distance_km, v_radius from ranked
      on conflict (order_id, professional_id, cycle_number) do nothing
      returning *
    ) select count(*) into v_inserted from inserted;
    if v_inserted > 0 then
      update public.orders set matching_status = 'round_pending', matching_started_at = coalesce(matching_started_at, v_invited_at), matching_current_round = v_round, matching_cycle = v_cycle, matching_round_deadline_at = v_deadline, matching_failed_at = null, updated_at = now() where id = p_order_id returning * into v_order;
      insert into public.notifications (recipient_id, order_id, kind, title, body)
      select c.professional_id, c.order_id, 'order_created', 'Nuevo pedido disponible', 'Tenes una invitacion de MANITO para tomar este trabajo ahora.' from public.order_match_candidates c where c.order_id = p_order_id and c.cycle_number = v_cycle and c.round_number = v_round and c.status = 'pending';
      return v_order;
    end if;
    v_round := v_round + 1;
  end loop;
  update public.orders set status = 'matching_failed', matching_status = 'failed', matching_current_round = v_max_rounds, matching_round_deadline_at = null, matching_failed_at = now(), updated_at = now() where id = p_order_id returning * into v_order;
  insert into public.notifications (recipient_id, order_id, kind, title, body) values (v_order.client_id, v_order.id, 'order_status', 'No encontramos profesional disponible', 'Podes reintentar la busqueda, programar el pedido o pedir presupuestos.');
  return v_order;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_professional_opportunities()
 RETURNS TABLE(id uuid, client_id uuid, professional_id uuid, service_id bigint, description text, address text, mode text, scheduled_at timestamp with time zone, estimated_duration_minutes integer, scheduled_end timestamp with time zone, status text, price numeric, estimated_price numeric, agreed_price numeric, agreed_scope text, contracted_at timestamp with time zone, accepted_proposal_id uuid, contract_snapshot jsonb, pricing_policy_snapshot jsonb, assignment_mode text, preferred_professional_id uuid, manual_requested_professional_id uuid, manual_requested_at timestamp with time zone, manual_response_deadline_at timestamp with time zone, manual_response_status text, manual_response_reason text, manual_responded_at timestamp with time zone, matching_status text, matching_started_at timestamp with time zone, matching_current_round integer, matching_cycle integer, matching_round_deadline_at timestamp with time zone, matching_failed_at timestamp with time zone, matching_candidate_id uuid, matching_candidate_status text, matching_candidate_round integer, matching_candidate_deadline_at timestamp with time zone, payment_method text, payment_status text, online_payment_required boolean, payment_required_at timestamp with time zone, paid_at timestamp with time zone, guarantee_days integer, eta_minutes integer, client_lat double precision, client_lng double precision, created_at timestamp with time zone, updated_at timestamp with time zone, accepted_at timestamp with time zone, completed_at timestamp with time zone, service jsonb, match_score integer, match_reasons text[], distance_km double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select p.* into v_profile from public.profiles p where p.id = v_uid;
  if v_profile.id is null or v_profile.role <> 'professional' or not private.professional_can_receive_orders(v_uid) then return; end if;

  perform private.refresh_immediate_matching_for_professional_impl(v_uid);
  perform private.expire_order_proposals_impl(o.id)
  from public.orders o
  where o.status = 'waiting_quotes';

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
  where private.order_professional_eligible(o,v_uid) and o.professional_id is null
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
    and (
      o.mode <> 'quote'
      or exists (
        select 1
        from public.order_proposals own_op
        where own_op.order_id = o.id
          and own_op.professional_id = v_uid
          and own_op.status = 'sent'
          and own_op.valid_until > now()
      )
      or (
        select count(*)::integer
        from public.order_proposals active_op
        where active_op.order_id = o.id
          and active_op.status = 'sent'
          and active_op.valid_until > now()
      ) < private.quote_max_active_proposals()
    )
    and (o.scheduled_at is null or private.professional_schedule_contains(v_uid, o.scheduled_at, coalesce(o.scheduled_end, private.schedule_end_from(o.scheduled_at, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())))))
    and (o.scheduled_at is null or not private.professional_has_schedule_conflict(v_uid, o.scheduled_at, coalesce(o.scheduled_end, private.schedule_end_from(o.scheduled_at, coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes()))), o.id))
  order by coalesce(mc.score, 0) desc, o.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION private.accept_order_impl(p_order_id uuid)
 RETURNS public.orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_before public.orders;
  v_order public.orders;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_before := private.expire_immediate_matching_impl(p_order_id);
  select * into v_before from public.orders where id = p_order_id for update;
  if not private.order_professional_eligible(v_before,v_uid) then raise exception 'El pedido no corresponde a tu cobertura o especialidad'; end if;
  if v_before.mode = 'immediate' and coalesce(v_before.assignment_mode, 'auto') = 'auto' and v_before.professional_id is null and v_before.status = 'open' then
    if not exists (select 1 from public.order_match_candidates c where c.order_id = p_order_id and c.professional_id = v_uid and c.cycle_number = coalesce(v_before.matching_cycle, 1) and c.round_number = v_before.matching_current_round and c.status = 'pending' and c.deadline_at > now()) then
      raise exception 'Este pedido no esta disponible para este profesional';
    end if;
  end if;
  v_order := private.accept_order_pre_matching_impl(p_order_id);
  if v_before.mode = 'immediate' and coalesce(v_before.assignment_mode, 'auto') = 'auto' then
    update public.order_match_candidates set status = 'accepted', responded_at = now(), updated_at = now()
    where order_id = p_order_id and professional_id = v_uid and cycle_number = coalesce(v_before.matching_cycle, 1) and status = 'pending';
    update public.order_match_candidates set status = 'closed', responded_at = coalesce(responded_at, now()), updated_at = now()
    where order_id = p_order_id and cycle_number = coalesce(v_before.matching_cycle, 1) and professional_id <> v_uid and status = 'pending';
    update public.orders set matching_status = 'matched', matching_round_deadline_at = null, updated_at = now() where id = p_order_id returning * into v_order;
  end if;
  return v_order;
end;
$function$;

CREATE OR REPLACE FUNCTION private.send_order_proposal_impl(p_order_id uuid, p_labor_price numeric, p_materials_price numeric, p_visit_price numeric, p_manito_fee numeric, p_estimated_minutes integer, p_availability_label text, p_observation text, p_available_from timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS public.order_proposals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_policy jsonb := private.current_commercial_policy();
  v_manito_fee numeric(12, 2);
  v_existing public.order_proposals;
  v_order public.orders;
  v_active_count integer := 0;
  v_proposal public.order_proposals;
  v_valid_until timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_estimated_minutes is not null and (p_estimated_minutes < 15 or p_estimated_minutes > 1440) then
    raise exception 'La duracion estimada debe estar entre 15 minutos y 24 horas';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 80));

  perform private.expire_order_proposals_impl(p_order_id);

  if not private.professional_can_receive_orders(v_uid) then
    raise exception 'Tu alta profesional todavia no esta aprobada por MANITO';
  end if;

  select o.* into v_order
  from public.orders o
  join public.professional_services ps
    on ps.professional_id = v_uid
   and ps.service_id = o.service_id
  where o.id = p_order_id
    and private.order_professional_eligible(o,v_uid) and o.status = 'waiting_quotes'
    and o.professional_id is null
  for update of o;

  if v_order.id is null then
    raise exception 'Esta solicitud no esta disponible para presupuestar';
  end if;

  select op.* into v_existing
  from public.order_proposals op
  where op.order_id = p_order_id
    and op.professional_id = v_uid
  for update;

  if v_existing.id is not null and v_existing.status <> 'sent' then
    raise exception 'El presupuesto ya fue cerrado y no puede modificarse';
  end if;

  if v_existing.id is null then
    select count(*)::integer into v_active_count
    from public.order_proposals op
    where op.order_id = p_order_id
      and op.status = 'sent'
      and op.valid_until > now();

    if v_active_count >= private.quote_max_active_proposals() then
      raise exception 'Este pedido ya recibio el maximo de presupuestos vigentes';
    end if;
  end if;

  v_manito_fee := case
    when private.policy_bool(v_policy, 'proposal_fee_enabled', false)
      then greatest(0, private.policy_number(v_policy, 'proposal_fee', 0))
    else 0
  end;
  v_valid_until := now() + private.quote_proposal_ttl_interval();

  insert into public.order_proposals (
    order_id,
    professional_id,
    labor_price,
    materials_price,
    visit_price,
    manito_fee,
    estimated_minutes,
    availability_label,
    available_from,
    observation,
    valid_until,
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
    p_available_from,
    nullif(btrim(coalesce(p_observation, '')), ''),
    v_valid_until,
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
    available_from = excluded.available_from,
    observation = excluded.observation,
    valid_until = excluded.valid_until,
    status = 'sent',
    updated_at = now()
  where public.order_proposals.status = 'sent'
    and public.order_proposals.valid_until > now()
  returning * into v_proposal;

  if v_proposal.id is null then
    raise exception 'El presupuesto ya fue cerrado y no puede modificarse';
  end if;

  return v_proposal;
end;
$function$;

CREATE OR REPLACE FUNCTION private.accept_proposal_impl(p_proposal_id uuid)
 RETURNS public.orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if not private.order_professional_eligible(v_source_order,v_proposal.professional_id) then
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
$function$;

CREATE OR REPLACE FUNCTION private.create_scheduled_request(p_client uuid, p_data jsonb, p_system boolean DEFAULT false)
 RETURNS public.orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.orders; s public.services; target uuid; estimate numeric;
begin
  if not exists(select 1 from public.profiles where id=p_client) then raise exception 'Cuenta no disponible'; end if;
  select * into s from public.services where id=(p_data->>'service_id')::bigint and active and allow_scheduled;
  if s.id is null then raise exception 'Este servicio no permite programar'; end if;
  o.client_id:=p_client; o.service_id:=s.id; o.mode:='scheduled'; o.status:='scheduled_open';
  o.description:=trim(p_data->>'description'); o.address:=trim(p_data->>'address');
  o.scheduled_at:=(p_data->>'scheduled_at')::timestamptz;
  o.estimated_duration_minutes:=coalesce((p_data->>'estimated_duration_minutes')::int,private.schedule_default_duration_minutes());
  o.client_lat:=(p_data->>'client_lat')::double precision; o.client_lng:=(p_data->>'client_lng')::double precision;
  o.payment_method:=p_data->>'payment_method';
  o.location_id:=nullif(p_data->>'location_id','');
  o.required_specialty_id:=(p_data->>'required_specialty_id')::bigint;
  target:=nullif(p_data->>'preferred_professional_id','')::uuid;
  if o.description is null or length(o.description)<2 or o.address is null or length(o.address)<2
     or o.scheduled_at is null or o.scheduled_at<=now()
     or o.estimated_duration_minutes not between 1 and 1440
     or (o.client_lat is not null and o.client_lat not between -90 and 90)
     or (o.client_lng is not null and o.client_lng not between -180 and 180) then
    raise exception 'Revisa descripcion, ubicacion, fecha y duracion del servicio';
  end if;
  o.scheduled_end:=private.schedule_end_from(o.scheduled_at,o.estimated_duration_minutes);
  o.assignment_mode:=case when target is null then 'auto' else 'manual' end;
  if target is not null and not private.manual_order_target_is_valid(o,target) then
    if not p_system then raise exception 'Ese profesional no esta disponible para este pedido'; end if;
    o.manual_response_status:='awaiting_client_choice';
    target:=null;
  end if;
  estimate:=coalesce((select ps.price_from from public.professional_services ps
    where ps.professional_id=target and ps.service_id=s.id),s.base_price,0)
    +greatest(0,private.policy_number(private.current_commercial_policy(),'scheduled_fee',0));
  insert into public.orders(client_id,service_id,description,address,mode,status,scheduled_at,
    estimated_duration_minutes,assignment_mode,preferred_professional_id,manual_response_status,
    payment_method,client_lat,client_lng,estimated_price,price,recurring_plan_id,recurrence_due_at,location_id,required_specialty_id)
  values(p_client,s.id,o.description,o.address,'scheduled','scheduled_open',o.scheduled_at,
    o.estimated_duration_minutes,o.assignment_mode,target,o.manual_response_status,
    o.payment_method,o.client_lat,o.client_lng,estimate,estimate,
    case when p_system then (p_data->>'recurring_plan_id')::uuid end,
    case when p_system then (p_data->>'recurrence_due_at')::timestamptz end,o.location_id,o.required_specialty_id)
  returning * into o;
  return o;
end $function$;

CREATE OR REPLACE FUNCTION public.create_recurring_plan(p_source_order_id uuid, p_frequency text)
 RETURNS public.recurring_service_plans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.orders; p public.recurring_service_plans;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into o from public.orders where id=p_source_order_id and client_id=auth.uid() for update;
  if o.id is null then raise exception 'No podes usar este pedido'; end if;
  select * into p from public.recurring_service_plans where source_order_id=o.id;
  if p.id is not null then return p; end if;
  if o.mode<>'scheduled' or o.scheduled_at is null or o.status in ('cancelled','matching_failed')
    or not exists(select 1 from public.services where id=o.service_id and active and allow_scheduled and supports_recurring) then
    raise exception 'Este pedido no permite crear un servicio recurrente';
  end if;
  insert into public.recurring_service_plans(client_id,service_id,source_order_id,frequency,
    next_scheduled_at,anchor_at,description,address,client_lat,client_lng,estimated_duration_minutes,
    preferred_professional_id,payment_method,location_id,required_specialty_id)
  values(auth.uid(),o.service_id,o.id,p_frequency,
    private.recurring_next_at(o.scheduled_at,p_frequency,greatest(now(),o.scheduled_at)),o.scheduled_at,
    o.description,o.address,o.client_lat,o.client_lng,coalesce(o.estimated_duration_minutes,private.schedule_default_duration_minutes()),
    coalesce(o.preferred_professional_id,o.professional_id),o.payment_method,o.location_id,o.required_specialty_id)
  returning * into p;
  update public.orders set recurring_plan_id=p.id,recurrence_due_at=o.scheduled_at where id=o.id;
  return p;
end $function$;

CREATE OR REPLACE FUNCTION private.generate_due_recurring_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.recurring_service_plans; o public.orders; generated integer:=0; failed integer:=0;
  lead_days integer; last_due timestamptz;
begin
  select greatest(0,least(90,coalesce(private.policy_number(value,'generation_lead_days',7),7)))::integer
    into lead_days from public.admin_settings where key='recurring';
  lead_days:=coalesce(lead_days,7);
  for p in select * from public.recurring_service_plans
    where status='active' and next_scheduled_at<=now()+make_interval(days=>lead_days)
      and not exists(select 1 from public.orders pending_order where pending_order.recurring_plan_id=recurring_service_plans.id
        and pending_order.status not in ('completed','cancelled','matching_failed'))
      and (last_generation_attempt_at is null or last_generation_attempt_at<now()-interval '15 minutes')
    order by last_generation_attempt_at nulls first,next_scheduled_at limit 100 for update skip locked
  loop
    begin
      if exists(select 1 from public.orders where recurring_plan_id=p.id
        and status not in ('completed','cancelled','matching_failed')) then continue; end if;
      select max(recurrence_due_at) into last_due from public.orders where recurring_plan_id=p.id;
      if p.next_scheduled_at<=now() or p.next_scheduled_at<=last_due then
        p.next_scheduled_at:=private.recurring_next_at(p.anchor_at,p.frequency,greatest(now(),last_due));
        update public.recurring_service_plans set next_scheduled_at=p.next_scheduled_at where id=p.id;
      end if;
      if p.next_scheduled_at>now()+make_interval(days=>lead_days) then continue; end if;
      if not exists(select 1 from public.services where id=p.service_id and active and allow_scheduled and supports_recurring) then
        raise exception 'Servicio recurrente no disponible';
      end if;
      o:=private.create_scheduled_request(p.client_id,jsonb_build_object(
        'service_id',p.service_id,'description',p.description,'address',p.address,
        'scheduled_at',p.next_scheduled_at,'estimated_duration_minutes',p.estimated_duration_minutes,
        'preferred_professional_id',p.preferred_professional_id,'payment_method',p.payment_method,
        'location_id',p.location_id,'required_specialty_id',p.required_specialty_id,'client_lat',p.client_lat,'client_lng',p.client_lng,'recurring_plan_id',p.id,'recurrence_due_at',p.next_scheduled_at),true);
      update public.recurring_service_plans set
        next_scheduled_at=private.recurring_next_at(p.anchor_at,p.frequency,p.next_scheduled_at),
        last_generation_attempt_at=now(),generation_error=null where id=p.id;
      perform private.add_notification(p.client_id,'appointment','Nueva visita programada',
        case when o.manual_response_status='awaiting_client_choice'
          then 'Tu profesional preferido no esta disponible para esta visita. Elegi otro profesional o busca profesionales.'
          else 'Creamos la solicitud de tu proxima visita. Todavia necesita aceptacion profesional.' end,o.id,null);
      generated:=generated+1;
    exception when others then
      update public.recurring_service_plans set last_generation_attempt_at=now(),
        generation_error='No pudimos generar la visita. Revisa los datos del plan. Codigo: '||SQLSTATE where id=p.id;
      failed:=failed+1;
    end;
  end loop;
  return jsonb_build_object('generated',generated,'failed',failed);
end $function$;

CREATE OR REPLACE FUNCTION public.update_recurring_plan(p_plan_id uuid, p_changes jsonb)
 RETURNS public.recurring_service_plans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.recurring_service_plans; candidate public.orders; last_due timestamptz;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into p from public.recurring_service_plans where id=p_plan_id and client_id=auth.uid() for update;
  if p.id is null then raise exception 'No podes modificar este plan'; end if;
  if p.status='cancelled' then raise exception 'El plan cancelado no se puede modificar'; end if;
  if jsonb_typeof(p_changes)<>'object' or exists(select 1 from jsonb_object_keys(p_changes) k
    where k not in ('frequency','scheduled_at','preferred_professional_id','description','address','client_lat','client_lng','estimated_duration_minutes','location_id','required_specialty_id')) then
    raise exception 'Datos de plan no permitidos';
  end if;
  if p_changes ? 'frequency' then p.frequency:=p_changes->>'frequency'; end if;
  if p_changes ? 'scheduled_at' then
    p.anchor_at:=(p_changes->>'scheduled_at')::timestamptz;
    if p.anchor_at is null or p.anchor_at<=now() then raise exception 'Elegi una fecha futura'; end if;
  end if;
  if p_changes ? 'location_id' then p.location_id:=nullif(p_changes->>'location_id',''); end if;
  if p_changes ? 'required_specialty_id' then p.required_specialty_id:=(p_changes->>'required_specialty_id')::bigint; end if;
  if p_changes ? 'description' then p.description:=trim(p_changes->>'description'); end if;
  if p_changes ? 'address' then p.address:=trim(p_changes->>'address'); end if;
  if p_changes ? 'client_lat' then p.client_lat:=(p_changes->>'client_lat')::double precision; end if;
  if p_changes ? 'client_lng' then p.client_lng:=(p_changes->>'client_lng')::double precision; end if;
  if p_changes ? 'estimated_duration_minutes' then p.estimated_duration_minutes:=(p_changes->>'estimated_duration_minutes')::int; end if;
  select max(recurrence_due_at) into last_due from public.orders where recurring_plan_id=p.id;
  p.next_scheduled_at:=private.recurring_next_at(p.anchor_at,p.frequency,greatest(now(),last_due));
  if p_changes ? 'preferred_professional_id' then
    p.preferred_professional_id:=nullif(p_changes->>'preferred_professional_id','')::uuid;
    candidate.client_id:=p.client_id; candidate.service_id:=p.service_id; candidate.mode:='scheduled';
    candidate.location_id:=p.location_id; candidate.required_specialty_id:=p.required_specialty_id;
    candidate.client_lat:=p.client_lat; candidate.client_lng:=p.client_lng;
    candidate.scheduled_at:=p.next_scheduled_at;
    candidate.estimated_duration_minutes:=p.estimated_duration_minutes;
    candidate.scheduled_end:=private.schedule_end_from(candidate.scheduled_at,p.estimated_duration_minutes);
    if p.preferred_professional_id is not null and not private.manual_order_target_is_valid(candidate,p.preferred_professional_id) then
      raise exception 'Ese profesional no esta disponible para este servicio';
    end if;
  end if;
  update public.recurring_service_plans set frequency=p.frequency,anchor_at=p.anchor_at,next_scheduled_at=p.next_scheduled_at,
    description=p.description,address=p.address,client_lat=p.client_lat,client_lng=p.client_lng,
    location_id=p.location_id,required_specialty_id=p.required_specialty_id,
    estimated_duration_minutes=p.estimated_duration_minutes,preferred_professional_id=p.preferred_professional_id,
    generation_error=null where id=p.id returning * into p;
  return p;
end $function$;

CREATE OR REPLACE FUNCTION private.accept_order_core_impl(p_order_id uuid)
 RETURNS public.orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_candidate public.orders;
  v_schedule_end timestamptz;
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

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select o.* into v_candidate
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_candidate.id is not null
    and v_candidate.mode = 'scheduled'
    and v_candidate.status in ('open', 'scheduled_open')
    and v_candidate.professional_id is null then
    v_schedule_end := coalesce(
      v_candidate.scheduled_end,
      private.schedule_end_from(
        v_candidate.scheduled_at,
        coalesce(v_candidate.estimated_duration_minutes, v_candidate.eta_minutes, private.schedule_default_duration_minutes())
      )
    );

    if not private.professional_schedule_contains(v_uid, v_candidate.scheduled_at, v_schedule_end) then
      raise exception 'El horario programado no entra en tu jornada laboral';
    end if;

    if private.professional_has_schedule_conflict(v_uid, v_candidate.scheduled_at, v_schedule_end, v_candidate.id) then
      raise exception 'Ya tenes otro trabajo programado en ese horario';
    end if;
  end if;

  with candidate as (
    select
      o.id,
      o.description,
      o.mode,
      o.scheduled_at,
      o.scheduled_end,
      o.estimated_duration_minutes,
      o.eta_minutes,
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
      and private.order_professional_eligible(o,v_uid)
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
      and (
        o.mode <> 'scheduled'
        or (
          o.scheduled_at is not null
          and private.professional_schedule_contains(
            v_uid,
            o.scheduled_at,
            coalesce(
              o.scheduled_end,
              private.schedule_end_from(
                o.scheduled_at,
                coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())
              )
            )
          )
          and not private.professional_has_schedule_conflict(
            v_uid,
            o.scheduled_at,
            coalesce(
              o.scheduled_end,
              private.schedule_end_from(
                o.scheduled_at,
                coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())
              )
            ),
            o.id
          )
        )
      )
  )
  update public.orders o
  set
    professional_id = v_uid,
    status = case when o.payment_method = 'card' then 'payment_pending' else 'accepted' end,
    payment_status = case when o.payment_method = 'card' then 'pending' else 'not_required' end,
    online_payment_required = coalesce(o.payment_method = 'card',false),
    payment_required_at = case when o.payment_method = 'card' then now() else payment_required_at end,
    accepted_at = now(),
    start_pin = coalesce(o.start_pin, lpad((floor(random() * 10000))::int::text, 4, '0')),
    end_pin = coalesce(o.end_pin, lpad((floor(random() * 10000))::int::text, 4, '0')),
    scheduled_end = case
      when c.scheduled_at is null then null
      else coalesce(c.scheduled_end, private.schedule_end_from(c.scheduled_at, coalesce(c.estimated_duration_minutes, c.eta_minutes, private.schedule_default_duration_minutes())))
    end,
    estimated_duration_minutes = case
      when c.scheduled_at is null then o.estimated_duration_minutes
      else coalesce(c.estimated_duration_minutes, c.eta_minutes, private.schedule_default_duration_minutes())
    end,
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
