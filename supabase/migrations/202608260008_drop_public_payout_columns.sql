alter table public.professional_profiles
  drop column if exists payout_alias,
  drop column if exists payout_cbu,
  drop column if exists wallet_payment_link;
