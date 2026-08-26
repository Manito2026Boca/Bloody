with ranked as (
  select
    id,
    profile_id,
    row_number() over (
      partition by profile_id
      order by is_default desc, created_at desc, id desc
    ) as rn,
    bool_or(is_default) over (partition by profile_id) as has_default
  from public.payment_methods
)
update public.payment_methods as payment
set is_default = true
from ranked
where payment.id = ranked.id
  and ranked.rn = 1
  and not ranked.has_default;

with ranked as (
  select
    id,
    row_number() over (
      partition by profile_id
      order by is_default desc, created_at desc, id desc
    ) as rn
  from public.payment_methods
  where is_default
)
update public.payment_methods as payment
set is_default = false
from ranked
where payment.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists payment_methods_one_default_per_profile
  on public.payment_methods (profile_id)
  where is_default;
