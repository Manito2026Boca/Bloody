-- NORM-012: no fictitious invitation when the preferred professional is unavailable.
alter table public.orders drop constraint orders_manual_response_status_check;
alter table public.orders add constraint orders_manual_response_status_check
  check (manual_response_status in ('pending','accepted','rejected','expired','awaiting_client_choice'));
alter table public.orders add constraint orders_manual_choice_without_invitation check (
  manual_response_status is distinct from 'awaiting_client_choice' or
  (assignment_mode = 'manual' and professional_id is null and preferred_professional_id is null
   and manual_requested_professional_id is null and manual_requested_at is null
   and manual_response_deadline_at is null and manual_responded_at is null)
);
CREATE OR REPLACE FUNCTION private.choose_manual_order_professional_impl(p_order_id uuid, p_professional_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_history jsonb;
  v_requested_at timestamptz := now();
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_order := private.refresh_manual_order_request_impl(p_order_id);
  select * into v_order
  from public.orders
  where id = p_order_id
    and client_id = v_uid
    and assignment_mode = 'manual'
    and manual_response_status in ('rejected', 'expired', 'awaiting_client_choice')
    and professional_id is null
    and status in ('open', 'scheduled_open')
    and mode <> 'quote'
  for update;
  if v_order.id is null then raise exception 'No podes cambiar el profesional de este pedido'; end if;
  if not private.manual_order_target_is_valid(v_order, p_professional_id) then raise exception 'Ese profesional no esta disponible para este pedido'; end if;
  v_history := coalesce(v_order.manual_request_history, '[]'::jsonb);
  if v_order.manual_requested_professional_id is not null then
    v_history := v_history || jsonb_build_array(private.manual_request_snapshot(v_order, 'choose_another_professional'));
  end if;
  update public.orders
  set assignment_mode = 'manual',
      preferred_professional_id = p_professional_id,
      manual_requested_professional_id = p_professional_id,
      manual_requested_at = v_requested_at,
      manual_response_deadline_at = private.manual_request_deadline(mode, v_requested_at),
      manual_response_status = 'pending',
      manual_response_reason = null,
      manual_responded_at = null,
      manual_request_history = v_history,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;
  return v_order;
end;
$function$;

CREATE OR REPLACE FUNCTION private.fallback_manual_order_to_auto_impl(p_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_history jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  v_order := private.refresh_manual_order_request_impl(p_order_id);
  select * into v_order
  from public.orders
  where id = p_order_id
    and client_id = v_uid
    and assignment_mode = 'manual'
    and manual_response_status in ('rejected', 'expired', 'awaiting_client_choice')
    and professional_id is null
    and status in ('open', 'scheduled_open')
    and mode <> 'quote'
  for update;
  if v_order.id is null then raise exception 'No podes cambiar este pedido a busqueda automatica'; end if;
  v_history := coalesce(v_order.manual_request_history, '[]'::jsonb);
  if v_order.manual_requested_professional_id is not null then
    v_history := v_history || jsonb_build_array(private.manual_request_snapshot(v_order, 'fallback_to_auto'));
  end if;
  update public.orders
  set assignment_mode = 'auto',
      preferred_professional_id = null,
      manual_requested_professional_id = null,
      manual_requested_at = null,
      manual_response_deadline_at = null,
      manual_response_status = null,
      manual_response_reason = null,
      manual_responded_at = null,
      manual_request_history = v_history,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;
  perform private.add_notification(v_order.client_id, 'manual_request_auto', 'Busqueda automatica activada', 'Otros profesionales compatibles ya pueden ver el pedido.', v_order.id, v_uid);
  return v_order;
end;
$function$;

revoke all on function private.choose_manual_order_professional_impl(uuid,uuid) from public,anon,authenticated;
revoke all on function private.fallback_manual_order_to_auto_impl(uuid) from public,anon,authenticated;
