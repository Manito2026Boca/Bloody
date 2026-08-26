with ranked as (
  select
    id,
    row_number() over (
      partition by profile_id, type
      order by is_default desc, created_at desc, id desc
    ) as duplicate_rank
  from public.payment_methods
)
delete from public.payment_methods
using ranked
where public.payment_methods.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists payment_methods_profile_type_unique
  on public.payment_methods (profile_id, type);
