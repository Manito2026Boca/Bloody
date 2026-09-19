-- TRUST-001 executable regression; all fixture writes roll back.
begin;

create or replace function pg_temp.trust_ok(value boolean, message text) returns void
language plpgsql as $$ begin if value is distinct from true then raise exception 'FAIL: %', message; end if; end $$;

select pg_temp.trust_ok(not has_function_privilege('anon','public.list_public_professional_trust()','execute'),'anon cannot list trust');
select pg_temp.trust_ok(has_function_privilege('authenticated','public.list_public_professional_trust()','execute'),'authenticated can list public trust');
select pg_temp.trust_ok(not has_function_privilege('authenticated','private.professional_public_trust(uuid)','execute'),'private trust helper stays private');

select set_config('test.client',(select id::text from public.profiles where email='cliente.qa1@qa.manito.invalid'),true);
select set_config('test.pro',(select id::text from public.profiles where email='prof.plomeria@qa.manito.invalid'),true);
select set_config('test.service',(select id::text from public.services where slug='plomeria'),true);

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.client'),true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.trust_ok(
  exists(select 1 from public.list_public_professional_trust() where professional_id=current_setting('test.pro')::uuid),
  'authenticated client receives public trust aggregate'
);
select pg_temp.trust_ok(
  not (public.get_professional_trust_signals(current_setting('test.pro')::uuid) ?| array['file_path','observation','document_number']),
  'public trust RPC returns no private document fields'
);
reset role;

with inserted as (
  insert into public.orders(client_id,professional_id,service_id,description,address,location_id,mode,status,assignment_mode,payment_method,agreed_price,contracted_at,completed_at)
  values(current_setting('test.client')::uuid,current_setting('test.pro')::uuid,current_setting('test.service')::bigint,
    'TRUST-001 completed fixture','Mar del Plata','ar-ba-mar-del-plata','immediate','completed','auto','cash',1000,now(),now())
  returning id
) select set_config('test.completed_order',id::text,true) from inserted;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.client'),true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.ratings(order_id,client_id,professional_id,stars,comment)
values(current_setting('test.completed_order')::uuid,current_setting('test.client')::uuid,current_setting('test.pro')::uuid,4,'TRUST-001');
reset role;

select pg_temp.trust_ok(
  ((private.professional_public_trust(current_setting('test.pro')::uuid)->>'trust_review_count')::integer >= 1),
  'real completed review contributes to count'
);
select pg_temp.trust_ok(
  not (private.professional_public_trust(current_setting('test.pro')::uuid) ?| array['file_path','observation','document_number']),
  'public trust aggregate contains no private document fields'
);

with inserted as (
  insert into public.orders(client_id,professional_id,service_id,description,address,location_id,mode,status,assignment_mode,payment_method)
  values(current_setting('test.client')::uuid,current_setting('test.pro')::uuid,current_setting('test.service')::bigint,
    'TRUST-001 open fixture','Mar del Plata','ar-ba-mar-del-plata','immediate','open','auto','cash')
  returning id
) select set_config('test.open_order',id::text,true) from inserted;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.client'),true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
begin
  begin
    insert into public.ratings(order_id,client_id,professional_id,stars)
    values(current_setting('test.open_order')::uuid,current_setting('test.client')::uuid,current_setting('test.pro')::uuid,5);
    raise exception 'FAIL: uncompleted order accepted a rating';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.client'),true);
select pg_temp.trust_ok(
  not exists(select 1 from public.professional_documents where professional_id=current_setting('test.pro')::uuid),
  'unrelated client cannot read professional documents'
);
reset role;

rollback;
