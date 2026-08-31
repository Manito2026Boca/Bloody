-- NORM-004 follow-up: harden SECURITY DEFINER payment RPC implementation search paths.

alter function private.report_order_payment_impl(uuid, text) set search_path = '';
alter function private.confirm_manual_payment_impl(uuid) set search_path = '';
alter function private.dispute_manual_payment_impl(uuid, text) set search_path = '';
