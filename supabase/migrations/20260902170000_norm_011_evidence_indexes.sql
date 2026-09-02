-- NORM-011 follow-up: index evidence uploader FK for participant/admin lookups.

create index if not exists idx_order_photos_uploaded_by
  on public.order_photos(uploaded_by);
