begin;

create temporary table ux001r_fixture(key text primary key, value uuid) on commit drop;
insert into ux001r_fixture values
  ('client', (select id from public.profiles where lower(email) = 'cliente.qa1@qa.manito.invalid')),
  ('plumber', (select id from public.profiles where lower(email) = 'prof.plomeria@qa.manito.invalid')),
  ('electrician', (select id from public.profiles where lower(email) = 'prof.electricidad@qa.manito.invalid'));

create or replace function pg_temp.fixture(p_key text) returns uuid
language sql stable as $$ select value from ux001r_fixture where key = p_key $$;
create or replace function pg_temp.check_true(value boolean, message text) returns void
language plpgsql as $$ begin if not value then raise exception 'FAIL: %', message; end if; end $$;
grant select on ux001r_fixture to authenticated;

select pg_temp.check_true(pg_temp.fixture('client') is not null, 'Cliente QA 1 exists');
select pg_temp.check_true(pg_temp.fixture('plumber') is not null, 'Caño Ibagaza exists');
select pg_temp.check_true(pg_temp.fixture('electrician') is not null, 'Rayo Menseguez exists');

select set_config('request.jwt.claim.sub', pg_temp.fixture('client')::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select set_config(
  'test.address_a',
  (public.upsert_client_address(jsonb_build_object(
    'label', 'Casa QA A', 'line', 'Rivadavia 2401', 'city', 'Mar del Plata',
    'lat', -38.001, 'lng', -57.551, 'is_default', true
  ))).id::text,
  true
);
select set_config(
  'test.address_b',
  (public.upsert_client_address(jsonb_build_object(
    'label', 'Trabajo QA B', 'line', 'Independencia 1800', 'city', 'Mar del Plata',
    'lat', null, 'lng', null, 'is_default', true
  ))).id::text,
  true
);

select pg_temp.check_true(
  (select count(*) = 1 from public.client_addresses where client_id = pg_temp.fixture('client') and is_default),
  'there is exactly one default address'
);
select pg_temp.check_true(
  (select is_default from public.client_addresses where id = current_setting('test.address_b')::uuid),
  'the explicitly selected address is authoritative'
);
select pg_temp.check_true(
  (select lat is null and lng is null from public.client_addresses where id = current_setting('test.address_b')::uuid),
  'manual address does not retain stale GPS coordinates'
);

with inserted as (
  insert into public.orders(
    client_id, service_id, required_specialty_id, description, address, mode, status,
    assignment_mode, preferred_professional_id, payment_method, estimated_price, price,
    client_lat, client_lng
  )
  select
    pg_temp.fixture('client'), service.id,
    (select specialty.id from public.specialties specialty where specialty.service_id = service.id and specialty.active order by specialty.position, specialty.id limit 1),
    'UX-001R smoke solicitud directa', 'Rivadavia 2401, Mar del Plata', 'immediate', 'open',
    'manual', pg_temp.fixture('plumber'), 'cash', service.base_price, service.base_price,
    -38.001, -57.551
  from public.services service where service.slug = 'plomeria'
  returning id
)
select set_config('test.order', id::text, true) from inserted;

select pg_temp.check_true(
  (select manual_response_status = 'pending' and manual_requested_professional_id = pg_temp.fixture('plumber')
   from public.orders where id = current_setting('test.order')::uuid),
  'manual request is pending for Caño'
);
reset role;
select pg_temp.check_true(
  private.order_professional_eligible((select o from public.orders o where o.id = current_setting('test.order')::uuid), pg_temp.fixture('plumber')),
  'Caño is eligible for Plomería'
);
select pg_temp.check_true(
  not private.order_professional_eligible((select o from public.orders o where o.id = current_setting('test.order')::uuid), pg_temp.fixture('electrician')),
  'Rayo is not eligible for Plomería'
);
select pg_temp.check_true(
  not private.order_professional_eligible((select o from public.orders o where o.id = current_setting('test.order')::uuid), pg_temp.fixture('client')),
  'the client cannot self-assign'
);

with inserted as (
  insert into public.orders(
    client_id, service_id, required_specialty_id, description, address, mode, status,
    assignment_mode, preferred_professional_id, payment_method, estimated_price, price,
    client_lat, client_lng
  )
  select
    pg_temp.fixture('client'), service.id,
    (select specialty.id from public.specialties specialty where specialty.service_id = service.id and specialty.active order by specialty.position, specialty.id limit 1),
    'UX-001R smoke electricidad', 'Rivadavia 2401, Mar del Plata', 'immediate', 'open',
    'manual', pg_temp.fixture('electrician'), 'cash', service.base_price, service.base_price,
    -38.001, -57.551
  from public.services service where service.slug = 'electricidad'
  returning id
)
select set_config('test.electric_order', id::text, true) from inserted;
select pg_temp.check_true(
  private.order_professional_eligible((select o from public.orders o where o.id = current_setting('test.electric_order')::uuid), pg_temp.fixture('electrician')),
  'Rayo is eligible for Electricidad'
);
select pg_temp.check_true(
  not private.order_professional_eligible((select o from public.orders o where o.id = current_setting('test.electric_order')::uuid), pg_temp.fixture('plumber')),
  'Caño is not eligible for Electricidad'
);

reset role;
select set_config('request.jwt.claim.sub', pg_temp.fixture('plumber')::text, true);
set local role authenticated;
select pg_temp.check_true(
  exists(select 1 from public.list_professional_opportunities() where id = current_setting('test.order')::uuid),
  'Caño can see the direct request'
);
select public.accept_order(current_setting('test.order')::uuid);
select pg_temp.check_true(
  (select professional_id = pg_temp.fixture('plumber') and manual_response_status = 'accepted'
   from public.orders where id = current_setting('test.order')::uuid),
  'Caño can accept the direct request atomically'
);

reset role;
update public.orders
set payment_method = 'cash', payment_status = 'pending'
where id = current_setting('test.order')::uuid;
update public.orders
set payment_status = 'paid'
where id = current_setting('test.order')::uuid;
select pg_temp.check_true(
  not exists(
    select 1 from public.notifications
    where order_id = current_setting('test.order')::uuid
      and kind = 'payment_status'
      and title = 'Pago actualizado'
  ),
  'manual payment transitions do not create a second generic notification'
);

rollback;
