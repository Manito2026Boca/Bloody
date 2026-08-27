alter table public.services
  add column if not exists allow_immediate boolean not null default true,
  add column if not exists allow_scheduled boolean not null default true,
  add column if not exists allow_quote boolean not null default true,
  add column if not exists supports_recurring boolean not null default false;

update public.services
set
  allow_immediate = true,
  allow_scheduled = true,
  allow_quote = true,
  supports_recurring = slug in ('limpieza', 'jardin', 'pileta');

update public.services
set allow_immediate = false
where slug in ('arquitectura', 'ingenieria', 'diseno_interiores', 'fotografia', 'profesores_particulares');

update public.services
set allow_quote = false
where slug in ('cerrajeria', 'gomeria');

create table if not exists public.recurring_service_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  service_id bigint not null references public.services(id) on delete restrict,
  source_order_id uuid references public.orders(id) on delete set null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  next_scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recurring_service_plans enable row level security;

grant select, insert, update on public.recurring_service_plans to authenticated;

drop policy if exists recurring_plans_select_own on public.recurring_service_plans;
create policy recurring_plans_select_own on public.recurring_service_plans
for select
to authenticated
using (client_id = (select auth.uid()));

drop policy if exists recurring_plans_insert_own on public.recurring_service_plans;
create policy recurring_plans_insert_own on public.recurring_service_plans
for insert
to authenticated
with check (client_id = (select auth.uid()));

drop policy if exists recurring_plans_update_own on public.recurring_service_plans;
create policy recurring_plans_update_own on public.recurring_service_plans
for update
to authenticated
using (client_id = (select auth.uid()))
with check (client_id = (select auth.uid()));

create index if not exists idx_recurring_service_plans_client
  on public.recurring_service_plans(client_id, status, created_at desc);

create index if not exists idx_recurring_service_plans_next
  on public.recurring_service_plans(status, next_scheduled_at)
  where status = 'active';
