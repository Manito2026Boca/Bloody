alter table public.professional_profiles
  add column if not exists payout_alias text,
  add column if not exists payout_cbu text,
  add column if not exists wallet_payment_link text;
