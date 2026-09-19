-- A manual invitation released after price rejection/expiry returns to the
-- existing client-choice state, whose invariant requires no active invite.
create or replace function private.release_price_confirmation_impl(
  p_order_id uuid, p_outcome text, p_reason text
) returns public.orders language plpgsql security definer set search_path = '' as $$
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
    preferred_professional_id = case when assignment_mode = 'manual' then null else preferred_professional_id end,
    manual_requested_professional_id = case when assignment_mode = 'manual' then null else manual_requested_professional_id end,
    manual_requested_at = case when assignment_mode = 'manual' then null else manual_requested_at end,
    manual_response_deadline_at = case when assignment_mode = 'manual' then null else manual_response_deadline_at end,
    manual_response_status = case when assignment_mode = 'manual' then 'awaiting_client_choice' else manual_response_status end,
    manual_response_reason = case when assignment_mode = 'manual' then p_reason else manual_response_reason end,
    manual_responded_at = case when assignment_mode = 'manual' then null else manual_responded_at end,
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

revoke all on function private.release_price_confirmation_impl(uuid,text,text) from public,anon,authenticated;
