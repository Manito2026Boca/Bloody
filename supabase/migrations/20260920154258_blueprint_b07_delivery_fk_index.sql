-- Support subscription invalidation/deletion without scanning the delivery outbox.
create index if not exists idx_notification_deliveries_subscription
  on public.notification_deliveries(subscription_id);
