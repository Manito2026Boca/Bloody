-- NOTIF-001 follow-up: derive proposal actions from the proposal itself, not
-- only from the parent order. This keeps historical notifications visible
-- without offering a stale CTA after expiry or rejection.
create or replace function public.list_notifications(
  p_view text default 'center',
  p_limit integer default 8,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
  v_unread integer;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_view not in ('center', 'history') then raise exception 'Vista invalida'; end if;

  select count(*) into v_unread
  from public.notifications n
  where n.recipient_id = v_uid and n.read_at is null;

  select count(*) into v_total
  from public.notifications n
  where n.recipient_id = v_uid
    and (p_view = 'history' or n.archived_at is null);

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select n.*,
      case
        when n.kind = 'manual_request' then
          o.manual_response_status = 'pending'
          and o.manual_requested_professional_id = v_uid
          and o.professional_id is null
          and (o.manual_response_deadline_at is null or o.manual_response_deadline_at > now())
        when n.kind = 'proposal_received' and n.entity_type = 'proposal' then
          exists (
            select 1
            from public.order_proposals op
            where op.id::text = n.entity_id
              and op.order_id = n.order_id
              and op.status = 'sent'
              and op.valid_until > now()
          )
        when n.kind = 'proposal_received' then o.status = 'waiting_quotes'
        when n.kind = 'extra_requested' and n.entity_type = 'order_extra' then
          exists (select 1 from public.order_extras e where e.id::text = n.entity_id and e.status = 'pending')
        when n.kind = 'extra_requested' then
          exists (select 1 from public.order_extras e where e.order_id = n.order_id and e.status = 'pending')
        when n.kind = 'payment_status' then
          exists (
            select 1 from public.payments p
            where p.order_id = n.order_id
              and (
                (p.professional_id = v_uid and p.status = 'reported')
                or (p.client_id = v_uid and p.status in ('awaiting_client_action', 'disputed'))
              )
          )
        else false
      end as action_pending
    from public.notifications n
    left join public.orders o on o.id = n.order_id
    where n.recipient_id = v_uid
      and (p_view = 'history' or n.archived_at is null)
    order by n.created_at desc
    limit v_limit offset v_offset
  ) q;

  return jsonb_build_object('items', v_items, 'total', v_total, 'unread_count', v_unread);
end;
$function$;

revoke all on function public.list_notifications(text,integer,integer) from public, anon;
grant execute on function public.list_notifications(text,integer,integer) to authenticated;
