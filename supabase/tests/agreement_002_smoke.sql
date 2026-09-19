-- AGREEMENT-002 executable regression using persistent QA identities; all writes roll back.
begin;

create or replace function pg_temp.a2_ok(value boolean, message text) returns void
language plpgsql as $$ begin if value is distinct from true then raise exception 'FAIL: %', message; end if; end $$;
create or replace function pg_temp.a2_denied(statement text, message text) returns void
language plpgsql as $$ begin
  begin execute statement; raise exception 'FAIL: %', message;
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;

select pg_temp.a2_ok(private.price_confirmation_timeout_interval('immediate')=interval '5 minutes','Ahora timeout');
select pg_temp.a2_ok(private.price_confirmation_timeout_interval('scheduled')=interval '30 minutes','Programar timeout');
select pg_temp.a2_ok(not has_function_privilege('anon','public.confirm_order_price(uuid)','execute'),'anon cannot confirm');
select pg_temp.a2_ok(not has_function_privilege('anon','public.reject_order_price(uuid)','execute'),'anon cannot reject');
select pg_temp.a2_ok(has_function_privilege('authenticated','public.confirm_order_price(uuid)','execute'),'authenticated boundary exists');
select pg_temp.a2_ok(not has_function_privilege('authenticated','private.confirm_order_price_impl(uuid)','execute'),'implementation remains private');

select set_config('test.client',(select id::text from public.profiles where email='cliente.qa1@qa.manito.invalid'),true);
select set_config('test.other_client',(select id::text from public.profiles where email='cliente.qa2@qa.manito.invalid'),true);
select set_config('test.pro',(select id::text from public.profiles where email='prof.plomeria@qa.manito.invalid'),true);
select set_config('test.service',(select id::text from public.services where slug='plomeria'),true);
select set_config('test.specialty',(select specialty_id::text from public.professional_specialties
  where professional_id=current_setting('test.pro')::uuid and service_id=current_setting('test.service')::bigint limit 1),true);
select set_config('test.location',(select location_id from public.professional_service_locations
  where professional_id=current_setting('test.pro')::uuid limit 1),true);

with inserted as (
  insert into public.orders(client_id,service_id,description,address,mode,status,assignment_mode,
    preferred_professional_id,payment_method,location_id,required_specialty_id,estimated_price,price)
  values(current_setting('test.client')::uuid,current_setting('test.service')::bigint,'A2 pending fixture','Mar del Plata',
    'immediate','open','manual',current_setting('test.pro')::uuid,'cash',current_setting('test.location'),
    current_setting('test.specialty')::bigint,1,1) returning id
) select set_config('test.pending_order',id::text,true) from inserted;

select set_config('request.jwt.claim.sub',current_setting('test.pro'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('test.pending_response',
  (select public.accept_order(current_setting('test.pending_order')::uuid))::text,true);
select pg_temp.a2_ok((select status='pending_client_confirmation' and professional_id is null
  and price_confirmation_professional_id=current_setting('test.pro')::uuid and agreed_price is null
  and contracted_at is null from public.orders where id=current_setting('test.pending_order')::uuid),'estimate creates reservation only');
select pg_temp.a2_ok(not (current_setting('test.pending_response')::jsonb ?| array['start_pin','end_pin']),
  'accept response never exposes PIN fields');

select pg_temp.a2_denied(format('select public.confirm_order_price(%L)',current_setting('test.pending_order')),'professional cannot confirm');
select set_config('request.jwt.claim.sub',current_setting('test.other_client'),true);
select pg_temp.a2_denied(format('select public.confirm_order_price(%L)',current_setting('test.pending_order')),'other client cannot confirm');

select set_config('request.jwt.claim.sub',current_setting('test.client'),true);
select public.confirm_order_price(current_setting('test.pending_order')::uuid);
select pg_temp.a2_ok((select status='accepted' and professional_id=current_setting('test.pro')::uuid
  and agreed_price=price_confirmation_proposed_amount and contracted_at is not null
  and price_confirmation_status='confirmed' from public.orders where id=current_setting('test.pending_order')::uuid),'client freezes stored proposal');
select public.confirm_order_price(current_setting('test.pending_order')::uuid);
select pg_temp.a2_ok((select count(*)=1 from public.orders where id=current_setting('test.pending_order')::uuid and contracted_at is not null),'double confirm is idempotent');

with inserted as (
  insert into public.orders(client_id,service_id,description,address,mode,status,assignment_mode,
    preferred_professional_id,payment_method,location_id,required_specialty_id,estimated_price,price)
  values(current_setting('test.client')::uuid,current_setting('test.service')::bigint,'A2 reject fixture','Mar del Plata',
    'immediate','open','manual',current_setting('test.pro')::uuid,'cash',current_setting('test.location'),
    current_setting('test.specialty')::bigint,1,1) returning id
) select set_config('test.reject_order',id::text,true) from inserted;
select set_config('request.jwt.claim.sub',current_setting('test.pro'),true);
select public.accept_order(current_setting('test.reject_order')::uuid);
select set_config('request.jwt.claim.sub',current_setting('test.client'),true);
select public.reject_order_price(current_setting('test.reject_order')::uuid);
select pg_temp.a2_ok((select professional_id is null and contracted_at is null and price_confirmation_status='rejected'
  and manual_response_status='awaiting_client_choice' from public.orders where id=current_setting('test.reject_order')::uuid),'rejection releases without contract');

with inserted as (
  insert into public.orders(client_id,service_id,description,address,mode,status,assignment_mode,
    preferred_professional_id,payment_method,location_id,required_specialty_id,estimated_price,price,
    client_price_consent_amount)
  select current_setting('test.client')::uuid,current_setting('test.service')::bigint,'A2 exact fixture','Mar del Plata',
    'immediate','open','manual',current_setting('test.pro')::uuid,'cash',current_setting('test.location'),
    current_setting('test.specialty')::bigint,ps.price_from,ps.price_from,ps.price_from
  from public.professional_services ps where ps.professional_id=current_setting('test.pro')::uuid
    and ps.service_id=current_setting('test.service')::bigint returning id
) select set_config('test.exact_order',id::text,true) from inserted;
select set_config('request.jwt.claim.sub',current_setting('test.pro'),true);
select public.accept_order(current_setting('test.exact_order')::uuid);
select pg_temp.a2_ok((select professional_id=current_setting('test.pro')::uuid and contracted_at is not null
  and status='accepted' from public.orders where id=current_setting('test.exact_order')::uuid),'exact prior consent contracts immediately');

rollback;
