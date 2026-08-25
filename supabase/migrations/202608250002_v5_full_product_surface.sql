-- MANITO V7/V5 product surface.
-- Apply after 202608250001_initial_manito_mvp.sql.

alter table public.orders
  add column if not exists assignment_mode text not null default 'auto'
    check (assignment_mode in ('auto', 'manual')),
  add column if not exists preferred_professional_id uuid references public.profiles(id) on delete set null,
  add column if not exists payment_method text
    check (payment_method in ('card', 'wallet', 'cash', 'transfer')),
  add column if not exists guarantee_days integer not null default 7,
  add column if not exists eta_minutes integer,
  add column if not exists start_pin text,
  add column if not exists end_pin text;

create table if not exists public.client_addresses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Casa',
  line text not null,
  city text,
  lat double precision,
  lng double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('card', 'wallet', 'cash', 'transfer')),
  label text not null,
  last4 text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  client_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, professional_id)
);

create table if not exists public.professional_profiles (
  professional_id uuid primary key references public.profiles(id) on delete cascade,
  headline text not null default '',
  bio text not null default '',
  years_experience integer not null default 0,
  public_slug text unique,
  verified boolean not null default false,
  manito_pro boolean not null default false,
  rating_avg numeric(3, 2) not null default 0,
  jobs_completed integer not null default 0,
  response_minutes integer,
  insurance_label text,
  updated_at timestamptz not null default now()
);

create table if not exists public.professional_onboarding (
  professional_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'in_review', 'approved', 'observed', 'rejected', 'suspended')),
  current_step integer not null default 1 check (current_step between 1 and 16),
  notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.professional_documents (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  label text not null,
  status text not null default 'pending'
    check (status in ('pending', 'uploaded', 'approved', 'observed', 'rejected')),
  file_path text,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.professional_portfolio (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  before_path text,
  after_path text,
  service_id bigint references public.services(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'problem'
    check (kind in ('problem', 'before', 'after', 'extra', 'complaint')),
  file_path text,
  file_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_proposals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  labor_price numeric(12, 2) not null default 0,
  materials_price numeric(12, 2) not null default 0,
  visit_price numeric(12, 2) not null default 0,
  manito_fee numeric(12, 2) not null default 0,
  estimated_minutes integer,
  availability_label text,
  observation text,
  status text not null default 'sent'
    check (status in ('sent', 'accepted', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, professional_id)
);

create table if not exists public.order_extras (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  amount numeric(12, 2) not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (order_id, client_id)
);

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  opened_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  detail text,
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code text unique not null,
  uses_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  service_id bigint not null references public.services(id) on delete restrict,
  address_id uuid references public.client_addresses(id) on delete set null,
  label text not null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'custom')),
  next_run_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  can_receive_tracking boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_codes (
  code text primary key,
  label text not null,
  discount_percent integer not null default 0 check (discount_percent between 0 and 100),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  marketing_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.tracking_shares (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  contact_name text not null,
  contact_value text,
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.promo_codes (code, label, discount_percent) values
  ('MANITO10', 'Bienvenida MANITO', 10),
  ('AMIGO', 'Referido amigo', 15)
on conflict (code) do nothing;

insert into public.admin_settings (key, value) values
  ('commercial', '{"commission_percent": 12, "client_fee": 2500, "guarantee_days": 7, "promo_percent": 0}'::jsonb),
  ('onboarding', '{"required_steps": 16, "requires_documents": true, "requires_manual_review": true}'::jsonb)
on conflict (key) do nothing;

create index if not exists idx_client_addresses_client on public.client_addresses(client_id, created_at desc);
create index if not exists idx_order_photos_order on public.order_photos(order_id, created_at);
create index if not exists idx_order_proposals_order on public.order_proposals(order_id, created_at desc);
create index if not exists idx_order_extras_order on public.order_extras(order_id, created_at desc);
create index if not exists idx_ratings_professional on public.ratings(professional_id, created_at desc);
create index if not exists idx_complaints_order on public.complaints(order_id, created_at desc);
create index if not exists idx_recurring_orders_client on public.recurring_orders(client_id, active, next_run_at);
create index if not exists idx_tracking_shares_order on public.tracking_shares(order_id, created_at desc);

drop trigger if exists trg_client_addresses_updated_at on public.client_addresses;
create trigger trg_client_addresses_updated_at
before update on public.client_addresses
for each row execute function public.touch_updated_at();

drop trigger if exists trg_professional_profiles_updated_at on public.professional_profiles;
create trigger trg_professional_profiles_updated_at
before update on public.professional_profiles
for each row execute function public.touch_updated_at();

drop trigger if exists trg_professional_onboarding_updated_at on public.professional_onboarding;
create trigger trg_professional_onboarding_updated_at
before update on public.professional_onboarding
for each row execute function public.touch_updated_at();

drop trigger if exists trg_professional_documents_updated_at on public.professional_documents;
create trigger trg_professional_documents_updated_at
before update on public.professional_documents
for each row execute function public.touch_updated_at();

drop trigger if exists trg_order_proposals_updated_at on public.order_proposals;
create trigger trg_order_proposals_updated_at
before update on public.order_proposals
for each row execute function public.touch_updated_at();

drop trigger if exists trg_complaints_updated_at on public.complaints;
create trigger trg_complaints_updated_at
before update on public.complaints
for each row execute function public.touch_updated_at();

drop trigger if exists trg_recurring_orders_updated_at on public.recurring_orders;
create trigger trg_recurring_orders_updated_at
before update on public.recurring_orders
for each row execute function public.touch_updated_at();

drop trigger if exists trg_notification_preferences_updated_at on public.notification_preferences;
create trigger trg_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute function public.touch_updated_at();

alter table public.client_addresses enable row level security;
alter table public.payment_methods enable row level security;
alter table public.favorites enable row level security;
alter table public.professional_profiles enable row level security;
alter table public.professional_onboarding enable row level security;
alter table public.professional_documents enable row level security;
alter table public.professional_portfolio enable row level security;
alter table public.order_photos enable row level security;
alter table public.order_proposals enable row level security;
alter table public.order_extras enable row level security;
alter table public.ratings enable row level security;
alter table public.complaints enable row level security;
alter table public.referrals enable row level security;
alter table public.admin_settings enable row level security;
alter table public.recurring_orders enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.promo_codes enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.tracking_shares enable row level security;

grant select, insert, update, delete on public.client_addresses to authenticated;
grant select, insert, update, delete on public.payment_methods to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update on public.professional_profiles to authenticated;
grant select, insert, update on public.professional_onboarding to authenticated;
grant select, insert, update on public.professional_documents to authenticated;
grant select, insert, update, delete on public.professional_portfolio to authenticated;
grant select, insert on public.order_photos to authenticated;
grant select, insert, update on public.order_proposals to authenticated;
grant select, insert, update on public.order_extras to authenticated;
grant select, insert on public.ratings to authenticated;
grant select, insert, update on public.complaints to authenticated;
grant select, insert, update on public.referrals to authenticated;
grant select on public.admin_settings to authenticated;
grant select, insert, update, delete on public.recurring_orders to authenticated;
grant select, insert, update, delete on public.trusted_contacts to authenticated;
grant select on public.promo_codes to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.tracking_shares to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant update (
  assignment_mode,
  preferred_professional_id,
  payment_method,
  guarantee_days,
  eta_minutes,
  start_pin,
  end_pin
) on public.orders to authenticated;

drop policy if exists client_addresses_own on public.client_addresses;
create policy client_addresses_own on public.client_addresses
for all to authenticated
using (client_id = (select auth.uid()))
with check (client_id = (select auth.uid()));

drop policy if exists payment_methods_own on public.payment_methods;
create policy payment_methods_own on public.payment_methods
for all to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites
for all to authenticated
using (client_id = (select auth.uid()))
with check (client_id = (select auth.uid()));

drop policy if exists professional_profiles_select on public.professional_profiles;
create policy professional_profiles_select on public.professional_profiles
for select to authenticated
using (true);

drop policy if exists professional_profiles_own on public.professional_profiles;
create policy professional_profiles_own on public.professional_profiles
for insert to authenticated
with check (professional_id = (select auth.uid()));

drop policy if exists professional_profiles_update_own on public.professional_profiles;
create policy professional_profiles_update_own on public.professional_profiles
for update to authenticated
using (professional_id = (select auth.uid()))
with check (professional_id = (select auth.uid()));

drop policy if exists professional_onboarding_self_or_admin_select on public.professional_onboarding;
create policy professional_onboarding_self_or_admin_select on public.professional_onboarding
for select to authenticated
using (
  professional_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists professional_onboarding_self_insert on public.professional_onboarding;
create policy professional_onboarding_self_insert on public.professional_onboarding
for insert to authenticated
with check (professional_id = (select auth.uid()));

drop policy if exists professional_onboarding_self_or_admin_update on public.professional_onboarding;
create policy professional_onboarding_self_or_admin_update on public.professional_onboarding
for update to authenticated
using (
  professional_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
)
with check (
  professional_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists professional_documents_self_or_admin on public.professional_documents;
create policy professional_documents_self_or_admin on public.professional_documents
for all to authenticated
using (
  professional_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
)
with check (
  professional_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists professional_portfolio_select on public.professional_portfolio;
create policy professional_portfolio_select on public.professional_portfolio
for select to authenticated
using (true);

drop policy if exists professional_portfolio_own_write on public.professional_portfolio;
create policy professional_portfolio_own_write on public.professional_portfolio
for all to authenticated
using (professional_id = (select auth.uid()))
with check (professional_id = (select auth.uid()));

drop policy if exists order_photos_participants on public.order_photos;
create policy order_photos_participants on public.order_photos
for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_photos.order_id
      and (o.client_id = (select auth.uid()) or o.professional_id = (select auth.uid()))
  )
);

drop policy if exists order_photos_insert_participants on public.order_photos;
create policy order_photos_insert_participants on public.order_photos
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.orders o
    where o.id = order_photos.order_id
      and (o.client_id = (select auth.uid()) or o.professional_id = (select auth.uid()))
  )
);

drop policy if exists order_proposals_visible on public.order_proposals;
create policy order_proposals_visible on public.order_proposals
for select to authenticated
using (
  professional_id = (select auth.uid())
  or exists (select 1 from public.orders o where o.id = order_proposals.order_id and o.client_id = (select auth.uid()))
);

drop policy if exists order_proposals_professional_insert on public.order_proposals;
create policy order_proposals_professional_insert on public.order_proposals
for insert to authenticated
with check (professional_id = (select auth.uid()));

drop policy if exists order_proposals_participant_update on public.order_proposals;
create policy order_proposals_participant_update on public.order_proposals
for update to authenticated
using (
  professional_id = (select auth.uid())
  or exists (select 1 from public.orders o where o.id = order_proposals.order_id and o.client_id = (select auth.uid()))
)
with check (
  professional_id = (select auth.uid())
  or exists (select 1 from public.orders o where o.id = order_proposals.order_id and o.client_id = (select auth.uid()))
);

drop policy if exists order_extras_participants on public.order_extras;
create policy order_extras_participants on public.order_extras
for all to authenticated
using (
  professional_id = (select auth.uid())
  or exists (select 1 from public.orders o where o.id = order_extras.order_id and o.client_id = (select auth.uid()))
)
with check (
  professional_id = (select auth.uid())
  or exists (select 1 from public.orders o where o.id = order_extras.order_id and o.client_id = (select auth.uid()))
);

drop policy if exists ratings_participants on public.ratings;
create policy ratings_participants on public.ratings
for select to authenticated
using (client_id = (select auth.uid()) or professional_id = (select auth.uid()));

drop policy if exists ratings_client_insert on public.ratings;
create policy ratings_client_insert on public.ratings
for insert to authenticated
with check (client_id = (select auth.uid()));

drop policy if exists complaints_participants on public.complaints;
create policy complaints_participants on public.complaints
for all to authenticated
using (
  opened_by = (select auth.uid())
  or exists (
    select 1 from public.orders o
    where o.id = complaints.order_id
      and (o.client_id = (select auth.uid()) or o.professional_id = (select auth.uid()))
  )
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
)
with check (
  opened_by = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists referrals_own on public.referrals;
create policy referrals_own on public.referrals
for all to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists admin_settings_select on public.admin_settings;
create policy admin_settings_select on public.admin_settings
for select to authenticated
using (true);

drop policy if exists recurring_orders_own on public.recurring_orders;
create policy recurring_orders_own on public.recurring_orders
for all to authenticated
using (client_id = (select auth.uid()))
with check (client_id = (select auth.uid()));

drop policy if exists trusted_contacts_own on public.trusted_contacts;
create policy trusted_contacts_own on public.trusted_contacts
for all to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists promo_codes_select_active on public.promo_codes;
create policy promo_codes_select_active on public.promo_codes
for select to authenticated
using (active = true and (expires_at is null or expires_at > now()));

drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
for all to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists tracking_shares_order_owner on public.tracking_shares;
create policy tracking_shares_order_owner on public.tracking_shares
for all to authenticated
using (
  shared_by = (select auth.uid())
  or exists (
    select 1 from public.orders o
    where o.id = tracking_shares.order_id
      and (o.client_id = (select auth.uid()) or o.professional_id = (select auth.uid()))
  )
)
with check (shared_by = (select auth.uid()));

drop policy if exists orders_client_update_v5_details on public.orders;
create policy orders_client_update_v5_details on public.orders
for update to authenticated
using (client_id = (select auth.uid()) and status = 'open')
with check (client_id = (select auth.uid()));

create or replace function private.accept_proposal_impl(p_proposal_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_proposal public.order_proposals;
  v_order public.orders;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select op.* into v_proposal
  from public.order_proposals op
  join public.orders o on o.id = op.order_id
  where op.id = p_proposal_id
    and o.client_id = v_uid
    and o.status = 'open'
  for update;

  if v_proposal.id is null then
    raise exception 'Presupuesto no disponible';
  end if;

  update public.order_proposals
  set status = case when id = p_proposal_id then 'accepted' else 'rejected' end
  where order_id = v_proposal.order_id;

  update public.orders
  set
    professional_id = v_proposal.professional_id,
    status = 'accepted',
    accepted_at = now(),
    price = v_proposal.labor_price + v_proposal.materials_price + v_proposal.visit_price + v_proposal.manito_fee
  where id = v_proposal.order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.accept_proposal(p_proposal_id uuid)
returns public.orders
language sql
security invoker
set search_path = public, private
as $$
  select * from private.accept_proposal_impl(p_proposal_id);
$$;

revoke all on function private.accept_proposal_impl(uuid) from public, anon, authenticated;
revoke all on function public.accept_proposal(uuid) from public, anon;
grant execute on function private.accept_proposal_impl(uuid) to authenticated;
grant execute on function public.accept_proposal(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manito-media',
  'manito-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists manito_media_select_own on storage.objects;
create policy manito_media_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'manito-media'
  and owner = (select auth.uid())
);

drop policy if exists manito_media_insert_own on storage.objects;
create policy manito_media_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'manito-media'
  and owner = (select auth.uid())
);
