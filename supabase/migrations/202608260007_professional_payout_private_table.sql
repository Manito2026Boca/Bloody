create table if not exists public.professional_payout_details (
  professional_id uuid primary key references public.profiles(id) on delete cascade,
  payout_alias text,
  payout_cbu text,
  wallet_payment_link text,
  updated_at timestamptz not null default now()
);

insert into public.professional_payout_details (
  professional_id,
  payout_alias,
  payout_cbu,
  wallet_payment_link
)
select
  professional_id,
  payout_alias,
  payout_cbu,
  wallet_payment_link
from public.professional_profiles
where payout_alias is not null
  or payout_cbu is not null
  or wallet_payment_link is not null
on conflict (professional_id) do update set
  payout_alias = excluded.payout_alias,
  payout_cbu = excluded.payout_cbu,
  wallet_payment_link = excluded.wallet_payment_link,
  updated_at = now();

update public.professional_profiles
set
  payout_alias = null,
  payout_cbu = null,
  wallet_payment_link = null
where payout_alias is not null
  or payout_cbu is not null
  or wallet_payment_link is not null;

alter table public.professional_payout_details enable row level security;

grant select, insert, update on public.professional_payout_details to authenticated;

drop trigger if exists trg_professional_payout_details_updated_at on public.professional_payout_details;
create trigger trg_professional_payout_details_updated_at
before update on public.professional_payout_details
for each row execute function public.touch_updated_at();

drop policy if exists professional_payout_details_select_own on public.professional_payout_details;
create policy professional_payout_details_select_own on public.professional_payout_details
for select to authenticated
using (professional_id = (select auth.uid()));

drop policy if exists professional_payout_details_insert_own on public.professional_payout_details;
create policy professional_payout_details_insert_own on public.professional_payout_details
for insert to authenticated
with check (professional_id = (select auth.uid()));

drop policy if exists professional_payout_details_update_own on public.professional_payout_details;
create policy professional_payout_details_update_own on public.professional_payout_details
for update to authenticated
using (professional_id = (select auth.uid()))
with check (professional_id = (select auth.uid()));
