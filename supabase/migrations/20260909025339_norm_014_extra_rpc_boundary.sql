-- BUG-N014-004: public extra RPCs must be the execution boundary, as with other
-- owned order commands. Internal implementations enforce auth.uid/participant/state.
-- Do not expose private helpers to the API role to repair the invoker chain.
alter function public.propose_order_extra(uuid,text,numeric) security definer;
alter function public.propose_order_extra(uuid,text,numeric) set search_path = '';
alter function public.decide_order_extra(uuid,text) security definer;
alter function public.decide_order_extra(uuid,text) set search_path = '';
alter function private.propose_order_extra_impl(uuid,text,numeric) set search_path = '';
revoke all on function public.propose_order_extra(uuid,text,numeric) from public,anon;
revoke all on function public.decide_order_extra(uuid,text) from public,anon;
grant execute on function public.propose_order_extra(uuid,text,numeric) to authenticated;
grant execute on function public.decide_order_extra(uuid,text) to authenticated;
revoke all on function private.propose_order_extra_impl(uuid,text,numeric) from public,anon,authenticated;
revoke all on function private.decide_order_extra_impl(uuid,text) from public,anon,authenticated;
