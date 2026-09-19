-- AGREEMENT-002 notification center event used by the existing NOTIF-001 pipeline.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'order_created','order_status','proposal_received','extra_requested','message_received',
  'payment_status','appointment','manual_request','manual_request_expired',
  'manual_request_rejected','manual_request_auto','complaint_opened',
  'complaint_awaiting_professional','complaint_response','complaint_resolved',
  'price_confirmation_required'
));
