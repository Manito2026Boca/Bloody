-- NORM-013 follow-up: public order RPCs are sanitized SECURITY DEFINER wrappers.
-- They must be able to call private implementation functions whose EXECUTE is
-- revoked from authenticated. Authorization remains in the private functions.

alter function public.accept_order(uuid) security definer;
alter function public.accept_proposal(uuid) security definer;
alter function public.advance_order(uuid) security definer;
alter function public.cancel_order(uuid) security definer;
alter function public.complete_order(uuid, text) security definer;
alter function public.confirm_order_payment(uuid) security definer;
alter function public.start_order(uuid, text) security definer;

alter function public.accept_order(uuid) set search_path = '';
alter function public.accept_proposal(uuid) set search_path = '';
alter function public.advance_order(uuid) set search_path = '';
alter function public.cancel_order(uuid) set search_path = '';
alter function public.complete_order(uuid, text) set search_path = '';
alter function public.confirm_order_payment(uuid) set search_path = '';
alter function public.start_order(uuid, text) set search_path = '';
