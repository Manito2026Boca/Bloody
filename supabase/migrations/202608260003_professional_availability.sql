-- Persist professional coverage, schedule and rate details entered in the app.

alter table public.professional_profiles
  add column if not exists work_city text,
  add column if not exists service_radius_km integer not null default 8
    check (service_radius_km between 1 and 150),
  add column if not exists work_days text[] not null default array['Lun','Mar','Mie','Jue','Vie']::text[],
  add column if not exists work_starts_at time not null default time '08:00',
  add column if not exists work_ends_at time not null default time '18:00';

create index if not exists idx_professional_profiles_work_city
  on public.professional_profiles (lower(work_city));
