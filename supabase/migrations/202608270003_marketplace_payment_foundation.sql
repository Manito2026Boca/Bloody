-- MANITO marketplace payment foundation.
-- This prepares the data model for Mercado Pago Checkout Pro + OAuth + webhooks
-- without storing provider secrets in exposed public tables.

create schema if not exists private;

alter table public.orders
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in (
      'unpaid',
      'not_required',
      'pending',
      'authorized',
      'paid',
      'rejected',
      'refunded',
      'partially_refunded'
    )),
  add column if not exists online_payment_required boolean not null default false,
  add column if not exists payment_required_at timestamptz,
  add column if not exists paid_at timestamptz;

create table if not exists public.professional_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('mercado_pago')),
  status text not null default 'not_connected'
    check (status in ('not_connected', 'pending_oauth', 'connected', 'restricted', 'disconnected')),
  external_account_id text,
  nickname text,
  country text not null default 'AR',
  currency text not null default 'ARS',
  can_receive_online_payments boolean not null default false,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, provider)
);

create table if not exists private.professional_payment_credentials (
  professional_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('mercado_pago')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (professional_id, provider)
);

revoke all on table private.professional_payment_credentials from public, anon, authenticated;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid references public.profiles(id) on delete set null,
  source_type text not null default 'original'
    check (source_type in ('original', 'additional', 'protection_adjustment', 'refund')),
  extra_id uuid references public.order_extras(id) on delete set null,
  proposal_id uuid references public.order_proposals(id) on delete set null,
  provider text not null default 'manual'
    check (provider in ('mercado_pago', 'manual', 'cash', 'wallet')),
  provider_account_id uuid references public.professional_payment_accounts(id) on delete set null,
  external_preference_id text,
  external_payment_id text,
  checkout_url text,
  amount numeric(12,2) not null check (amount >= 0),
  manito_fee numeric(12,2) not null default 0 check (manito_fee >= 0),
  professional_amount numeric(12,2) not null default 0 check (professional_amount >= 0),
  currency text not null default 'ARS',
  status text not null default 'pending'
    check (status in (
      'pending',
      'awaiting_client_action',
      'approved',
      'rejected',
      'cancelled',
      'refunded',
      'partially_refunded',
      'expired'
    )),
  payment_method text,
  failure_reason text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  refunded_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade,
  provider text not null check (provider in ('mercado_pago', 'manual', 'cash', 'wallet')),
  external_event_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists professional_payment_accounts_provider_account_unique
  on public.professional_payment_accounts(provider, external_account_id)
  where external_account_id is not null;

create index if not exists idx_professional_payment_accounts_professional
  on public.professional_payment_accounts(professional_id, provider);

create index if not exists idx_payments_order
  on public.payments(order_id, created_at desc);

create index if not exists idx_payments_participants
  on public.payments(client_id, professional_id, status);

create unique index if not exists payments_external_payment_provider_unique
  on public.payments(provider, external_payment_id)
  where external_payment_id is not null;

create index if not exists idx_payment_events_payment
  on public.payment_events(payment_id, received_at desc);

drop trigger if exists trg_professional_payment_accounts_updated_at on public.professional_payment_accounts;
create trigger trg_professional_payment_accounts_updated_at
before update on public.professional_payment_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists trg_payment_credentials_updated_at on private.professional_payment_credentials;
create trigger trg_payment_credentials_updated_at
before update on private.professional_payment_credentials
for each row execute function public.touch_updated_at();

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
before update on public.payments
for each row execute function public.touch_updated_at();

create or replace function private.sync_order_payment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_approved boolean;
  v_has_pending boolean;
  v_has_rejected boolean;
  v_paid_at timestamptz;
begin
  select
    bool_or(status = 'approved' and source_type = 'original'),
    bool_or(status in ('pending', 'awaiting_client_action') and source_type = 'original'),
    bool_or(status = 'rejected' and source_type = 'original'),
    min(approved_at) filter (where status = 'approved' and source_type = 'original')
  into v_has_approved, v_has_pending, v_has_rejected, v_paid_at
  from public.payments
  where order_id = new.order_id;

  update public.orders
  set
    payment_status = case
      when coalesce(v_has_approved, false) then 'paid'
      when coalesce(v_has_pending, false) then 'pending'
      when coalesce(v_has_rejected, false) then 'rejected'
      else payment_status
    end,
    paid_at = case
      when coalesce(v_has_approved, false) then coalesce(v_paid_at, new.approved_at, now())
      else paid_at
    end
  where id = new.order_id;

  return new;
end;
$$;

drop trigger if exists trg_payments_sync_order_status on public.payments;
create trigger trg_payments_sync_order_status
after insert or update of status, approved_at on public.payments
for each row execute function private.sync_order_payment_status();

alter table public.professional_payment_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

revoke all on public.professional_payment_accounts from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.payment_events from anon, authenticated;

grant select on public.professional_payment_accounts to authenticated;
grant select on public.payments to authenticated;
grant select on public.payment_events to authenticated;

drop policy if exists professional_payment_accounts_select_own_or_admin on public.professional_payment_accounts;
create policy professional_payment_accounts_select_own_or_admin on public.professional_payment_accounts
for select
to authenticated
using (
  professional_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists payments_select_participants_or_admin on public.payments;
create policy payments_select_participants_or_admin on public.payments
for select
to authenticated
using (
  client_id = (select auth.uid())
  or professional_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists payment_events_select_admin on public.payment_events;
create policy payment_events_select_admin on public.payment_events
for select
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

insert into public.admin_settings (key, value)
values (
  'payments_marketplace',
  '{
    "provider": "mercado_pago",
    "checkout": "checkout_pro",
    "currency": "ARS",
    "manito_fee_percent": 12,
    "mode": "prepared_not_live",
    "requires_professional_oauth": true,
    "requires_webhooks": true
  }'::jsonb
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.payments;
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end if;
end $$;
