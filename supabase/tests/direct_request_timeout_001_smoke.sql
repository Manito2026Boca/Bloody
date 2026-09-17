begin;

create or replace function pg_temp.check_true(value boolean, message text) returns void
language plpgsql as $$ begin if not value then raise exception 'FAIL: %', message; end if; end $$;
create or replace function pg_temp.denied(statement text, expected text, message text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'FAIL: %', message;
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if position(lower(expected) in lower(sqlerrm)) = 0 then
      raise exception 'FAIL: % (unexpected: %)', message, sqlerrm;
    end if;
  end;
end $$;

select pg_temp.check_true(
  private.manual_request_timeout_interval('immediate') = interval '10 minutes',
  'Ahora direct requests use 10 minutes'
);
select pg_temp.check_true(
  private.manual_request_timeout_interval('scheduled') = interval '30 minutes',
  'Programar direct requests use 30 minutes'
);
select pg_temp.check_true(
  private.manual_request_deadline('immediate', timestamptz '2026-01-01 12:00:00+00') = timestamptz '2026-01-01 12:10:00+00',
  'Ahora deadline derives from request time'
);
select pg_temp.check_true(
  private.manual_request_deadline('scheduled', timestamptz '2026-01-01 12:00:00+00') = timestamptz '2026-01-01 12:30:00+00',
  'Programar deadline derives from request time'
);
select pg_temp.check_true(
  not has_function_privilege('anon', 'private.manual_request_timeout_interval(text)', 'execute')
  and not has_function_privilege('authenticated', 'private.manual_request_timeout_interval(text)', 'execute'),
  'timeout helper remains private'
);
select pg_temp.check_true(
  has_function_privilege('authenticated', 'public.accept_order(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.accept_order(uuid)', 'execute'),
  'accept_order keeps explicit authenticated-only execution'
);
select pg_temp.check_true(
  (select (value->>'direct_request_timeout_now_minutes')::int = 10
      and (value->>'direct_request_timeout_scheduled_minutes')::int = 30
      and not value ? 'manual_immediate_timeout_seconds'
      and not value ? 'manual_scheduled_timeout_minutes'
   from public.admin_settings where key = 'manual_requests'),
  'central policy contains only current timeout keys'
);

select set_config('test.client', (select id::text from public.profiles where email='cliente.qa1@qa.manito.invalid'), true);
select set_config('test.plumber', (select id::text from public.profiles where email='prof.plomeria@qa.manito.invalid'), true);
select set_config('test.electrician', (select id::text from public.profiles where email='prof.electricidad@qa.manito.invalid'), true);
select set_config('test.service', (select id::text from public.services where slug='plomeria'), true);
select set_config('test.specialty', (select specialty_id::text from public.professional_specialties where professional_id=current_setting('test.plumber')::uuid and service_id=current_setting('test.service')::bigint order by specialty_id limit 1), true);
select set_config('test.location', (select location_id from public.professional_service_locations where professional_id=current_setting('test.plumber')::uuid order by location_id limit 1), true);

with inserted as (insert into public.orders(
  id, client_id, service_id, description, address, mode, status,
  assignment_mode, preferred_professional_id, payment_method, location_id, required_specialty_id
) values (
  gen_random_uuid(), current_setting('test.client')::uuid, current_setting('test.service')::bigint,
  'DIRECT-REQUEST-TIMEOUT-001 valid accept', 'Mar del Plata', 'immediate', 'open',
  'manual', current_setting('test.plumber')::uuid, 'cash', current_setting('test.location'), current_setting('test.specialty')::bigint
) returning id)
select set_config('test.accept_order', id::text, true) from inserted;

select pg_temp.check_true(
  (select manual_response_deadline_at between manual_requested_at + interval '9 minutes 59 seconds'
    and manual_requested_at + interval '10 minutes 1 second'
   from public.orders where id=current_setting('test.accept_order')::uuid),
  'new Ahora invitation receives ten minutes'
);

select set_config('request.jwt.claim.sub', current_setting('test.plumber'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.check_true(
  (select count(*)=1 from public.accept_order(current_setting('test.accept_order')::uuid)),
  'requested professional accepts before deadline'
);
select pg_temp.check_true(
  (select professional_id=current_setting('test.plumber')::uuid and manual_response_status='accepted'
   from public.orders where id=current_setting('test.accept_order')::uuid),
  'valid acceptance consumes invitation'
);

with inserted as (insert into public.orders(
  id, client_id, service_id, description, address, mode, status,
  assignment_mode, preferred_professional_id, payment_method, location_id, required_specialty_id
) values (
  gen_random_uuid(), current_setting('test.client')::uuid, current_setting('test.service')::bigint,
  'DIRECT-REQUEST-TIMEOUT-001 expired accept', 'Mar del Plata', 'immediate', 'open',
  'manual', current_setting('test.plumber')::uuid, 'cash', current_setting('test.location'), current_setting('test.specialty')::bigint
) returning id)
select set_config('test.expired_order', id::text, true) from inserted;
update public.orders set manual_response_deadline_at=now()-interval '1 second'
where id=current_setting('test.expired_order')::uuid;

select pg_temp.check_true(
  (select count(*)=0 from public.accept_order(current_setting('test.expired_order')::uuid)),
  'expired invitation returns no accepted row'
);
select pg_temp.check_true(
  (select professional_id is null and manual_response_status='expired' and manual_response_reason='timeout'
   from public.orders where id=current_setting('test.expired_order')::uuid),
  'expired attempt is durably represented inside the transaction'
);

with inserted as (insert into public.orders(
  id, client_id, service_id, description, address, mode, status, scheduled_at,
  assignment_mode, preferred_professional_id, payment_method, location_id, required_specialty_id
) values (
  gen_random_uuid(), current_setting('test.client')::uuid, current_setting('test.service')::bigint,
  'DIRECT-REQUEST-TIMEOUT-001 scheduled deadline', 'Mar del Plata', 'scheduled', 'scheduled_open',
  ((date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires') + interval '1 week 12 hours') at time zone 'America/Argentina/Buenos_Aires'),
  'manual', current_setting('test.plumber')::uuid, 'cash', current_setting('test.location'), current_setting('test.specialty')::bigint
) returning id)
select set_config('test.scheduled_order', id::text, true) from inserted;
select pg_temp.check_true(
  (select manual_response_deadline_at between manual_requested_at + interval '29 minutes 59 seconds'
    and manual_requested_at + interval '30 minutes 1 second'
   from public.orders where id=current_setting('test.scheduled_order')::uuid),
  'new Programar invitation receives thirty minutes'
);

with inserted as (insert into public.orders(
  id, client_id, service_id, description, address, mode, status,
  assignment_mode, preferred_professional_id, payment_method, location_id, required_specialty_id
) values (
  gen_random_uuid(), current_setting('test.client')::uuid, current_setting('test.service')::bigint,
  'DIRECT-REQUEST-TIMEOUT-001 reject', 'Mar del Plata', 'immediate', 'open',
  'manual', current_setting('test.plumber')::uuid, 'cash', current_setting('test.location'), current_setting('test.specialty')::bigint
) returning id)
select set_config('test.rejected_order', id::text, true) from inserted;
select public.reject_manual_order_request(current_setting('test.rejected_order')::uuid, 'no_disponible');
select pg_temp.check_true(
  (select manual_response_status='rejected' and professional_id is null
   from public.orders where id=current_setting('test.rejected_order')::uuid),
  'rejection is terminal for the current invitation'
);

select set_config('request.jwt.claim.sub', current_setting('test.electrician'), true);
select pg_temp.denied(
  format('select * from public.accept_order(%L)', current_setting('test.scheduled_order')),
  'cobertura o especialidad',
  'unrelated professional cannot accept the direct request'
);

rollback;
