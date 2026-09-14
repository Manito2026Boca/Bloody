begin;

create or replace function pg_temp.check_true(value boolean, message text) returns void
language plpgsql as $$ begin if not value then raise exception 'FAIL: %', message; end if; end $$;

select pg_temp.check_true(
  (select role = 'client' from public.profiles where lower(email) = lower('jere.rouan97@gmail.com')),
  'Jeremias keeps the client role'
);

select pg_temp.check_true(
  (select count(*) = 1 from private.manito_admin_memberships membership
   join auth.users account on account.id = membership.user_id
   where lower(account.email) = lower('jere.rouan97@gmail.com') and membership.revoked_at is null),
  'exactly one active additive admin membership exists'
);

select set_config('request.jwt.claim.sub', (select id::text from auth.users where lower(email)=lower('jere.rouan97@gmail.com')), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.check_true(private.is_manito_admin(), 'authorized account is admin');
select pg_temp.check_true((public.get_my_manito_capabilities()->>'admin')::boolean, 'capability RPC returns admin');
select pg_temp.check_true(
  exists(select 1 from public.list_admin_professional_reviews() where lower(email)=lower('azuueskesen@gmail.com') and onboarding_status='submitted'),
  'submitted architect is visible for manual review'
);

select set_config('request.jwt.claim.sub', (select id::text from auth.users where lower(email)=lower('cliente.qa2@qa.manito.invalid')), true);
select pg_temp.check_true(not private.is_manito_admin(), 'normal authenticated client is not admin');
select pg_temp.check_true(not (public.get_my_manito_capabilities()->>'admin')::boolean, 'normal capability RPC is false');

select set_config('request.jwt.claim.sub', (select id::text from auth.users where lower(email)=lower('prof.plomeria@qa.manito.invalid')), true);
select pg_temp.check_true(not private.is_manito_admin(), 'normal professional is not admin');

rollback;
