-- Keep NORM-013's PIN boundary intact: public order-transition RPCs never return
-- start_pin/end_pin even though their private implementations use the row type.
drop function if exists public.accept_order(uuid);
create function public.accept_order(p_order_id uuid)
returns setof jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  v_order := private.accept_order_impl(p_order_id);
  if v_order.professional_id = auth.uid()
     or (v_order.status='pending_client_confirmation' and v_order.price_confirmation_professional_id=auth.uid()) then
    return next to_jsonb(v_order) - 'start_pin' - 'end_pin';
  end if;
  return;
end $$;

drop function if exists public.confirm_order_price(uuid);
create function public.confirm_order_price(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  v_order := private.confirm_order_price_impl(p_order_id);
  return to_jsonb(v_order) - 'start_pin' - 'end_pin';
end $$;

drop function if exists public.reject_order_price(uuid);
create function public.reject_order_price(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if v_order.id is null or v_order.client_id <> auth.uid() then raise exception 'No podes rechazar este precio'; end if;
  if v_order.price_confirmation_status = 'rejected' then
    return to_jsonb(v_order) - 'start_pin' - 'end_pin';
  end if;
  if v_order.status <> 'pending_client_confirmation' or v_order.price_confirmation_status <> 'pending' then
    raise exception 'Este precio ya no esta disponible';
  end if;
  v_order := private.release_price_confirmation_impl(p_order_id,'rejected','client_rejected');
  return to_jsonb(v_order) - 'start_pin' - 'end_pin';
end $$;

drop function if exists public.refresh_order_price_confirmation(uuid);
create function public.refresh_order_price_confirmation(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v_order from public.orders where id=p_order_id;
  if v_order.id is null or not (
    v_order.client_id=auth.uid() or v_order.professional_id=auth.uid()
    or (v_order.status='pending_client_confirmation' and v_order.price_confirmation_professional_id=auth.uid())
    or private.is_manito_admin(auth.uid())
  ) then raise exception 'No podes consultar esta confirmacion'; end if;
  v_order := private.refresh_order_price_confirmation_impl(p_order_id);
  return to_jsonb(v_order) - 'start_pin' - 'end_pin';
end $$;

revoke all on function public.accept_order(uuid) from public,anon;
revoke all on function public.confirm_order_price(uuid) from public,anon;
revoke all on function public.reject_order_price(uuid) from public,anon;
revoke all on function public.refresh_order_price_confirmation(uuid) from public,anon;
grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.confirm_order_price(uuid) to authenticated;
grant execute on function public.reject_order_price(uuid) to authenticated;
grant execute on function public.refresh_order_price_confirmation(uuid) to authenticated;
