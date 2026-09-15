-- Keep the structured specialty visible in the sanitized professional opportunity payload.
drop function if exists public.list_professional_opportunities();

create function public.list_professional_opportunities()
 returns table(id uuid, client_id uuid, professional_id uuid, service_id bigint, required_specialty_id bigint, description text, address text, mode text, scheduled_at timestamp with time zone, estimated_duration_minutes integer, scheduled_end timestamp with time zone, status text, price numeric, estimated_price numeric, agreed_price numeric, agreed_scope text, contracted_at timestamp with time zone, accepted_proposal_id uuid, contract_snapshot jsonb, pricing_policy_snapshot jsonb, assignment_mode text, preferred_professional_id uuid, manual_requested_professional_id uuid, manual_requested_at timestamp with time zone, manual_response_deadline_at timestamp with time zone, manual_response_status text, manual_response_reason text, manual_responded_at timestamp with time zone, matching_status text, matching_started_at timestamp with time zone, matching_current_round integer, matching_cycle integer, matching_round_deadline_at timestamp with time zone, matching_failed_at timestamp with time zone, matching_candidate_id uuid, matching_candidate_status text, matching_candidate_round integer, matching_candidate_deadline_at timestamp with time zone, payment_method text, payment_status text, online_payment_required boolean, payment_required_at timestamp with time zone, paid_at timestamp with time zone, guarantee_days integer, eta_minutes integer, client_lat double precision, client_lng double precision, created_at timestamp with time zone, updated_at timestamp with time zone, accepted_at timestamp with time zone, completed_at timestamp with time zone, service jsonb, match_score integer, match_reasons text[], distance_km double precision)
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
    o.required_specialty_id,
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

revoke all on function public.list_professional_opportunities() from public, anon;
grant execute on function public.list_professional_opportunities() to authenticated;
