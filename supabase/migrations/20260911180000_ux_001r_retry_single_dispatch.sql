-- A retry changes the lifecycle once; the existing order trigger is the sole matching dispatcher.
create or replace function public.retry_immediate_matching(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 607));
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.client_id <> v_uid or v_order.mode <> 'immediate'
     or coalesce(v_order.assignment_mode, 'auto') <> 'auto' or v_order.professional_id is not null
     or v_order.status <> 'matching_failed' then
    raise exception 'No podes reintentar esta busqueda';
  end if;
  if v_order.matching_failed_at is not null and v_order.matching_failed_at > clock_timestamp() - interval '2 seconds' then
    return;
  end if;

  update public.orders
  set status = 'open',
      matching_status = 'idle',
      matching_cycle = coalesce(matching_cycle, 1) + 1,
      matching_current_round = 0,
      matching_round_deadline_at = null,
      matching_failed_at = null,
      updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.retry_immediate_matching(uuid) from public, anon;
grant execute on function public.retry_immediate_matching(uuid) to authenticated;
