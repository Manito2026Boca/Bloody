select private.identity_assert((select count(*)=20 from private.provider_activity_requirements r join public.services s on s.id=r.service_id where r.specialty_id is null and r.level='LEVEL_1'),'20 LEVEL_1');
select private.identity_assert((select count(*)=3 from private.provider_activity_requirements r join public.services s on s.id=r.service_id where specialty_id is null and level='LEVEL_2' and s.slug in ('gas','mudanzas','fumigacion')),'3 LEVEL_2');
select private.identity_assert((select count(*)=2 from private.provider_activity_requirements where specialty_id is null and level='LEVEL_3'),'2 LEVEL_3');
select private.identity_assert((select level='LEVEL_2' from private.provider_activity_requirements where specialty_id=100),'electricity installations restricted');
select private.identity_assert((select level='LEVEL_1' from private.provider_activity_requirements where specialty_id=101),'electricity lighting LEVEL_1');
select private.identity_assert(not exists(select 1 from public.admin_settings a,jsonb_array_elements(a.value->'default') item where item->>'kind'='insurance'),'insurance not universal');
select private.identity_assert(not has_table_privilege('authenticated','private.provider_activity_reviews','select'),'sector private');
select private.identity_assert(not has_function_privilege('anon','public.get_provider_activity_reviews(uuid)','execute'),'anon denied');
select private.identity_assert(private.provider_activity_can_contract('00000000-0000-0000-0000-000000000006',1,null),'LEVEL_1 without insurance works');
select private.identity_assert(not private.provider_activity_can_contract('00000000-0000-0000-0000-000000000006',2,null),'LEVEL_3 denied');

insert into public.professional_documents(professional_id,kind,status,file_path)
values('00000000-0000-0000-0000-000000000006','gas_installer_registration','approved','local-fixture/gas');
select private.identity_assert(not private.provider_activity_can_contract('00000000-0000-0000-0000-000000000006',(select id from public.services where slug='gas'),null),'document alone not sufficient');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.review_provider_activity_document('00000000-0000-0000-0000-000000000006',(select id from public.services where slug='gas'),'gas_installer_registration',
 (select id from public.professional_documents where kind='gas_installer_registration'),'APPROVED','{"registration_number":"FIXTURE","registry":"Synthetic registry","observation":"Synthetic review"}');
select private.identity_assert(private.provider_activity_can_contract('00000000-0000-0000-0000-000000000006',(select id from public.services where slug='gas'),null),'sector approved enables gas');
update public.professional_documents set status='rejected' where kind='gas_installer_registration';
update public.professional_documents set status='approved' where kind='gas_installer_registration';
select private.identity_assert(not private.provider_activity_can_contract('00000000-0000-0000-0000-000000000006',(select id from public.services where slug='gas'),null),'reapproval cannot revive review');

insert into public.professional_documents(professional_id,kind,status,file_path)
values('00000000-0000-0000-0000-000000000006','transport_vehicle_review','approved','local-fixture/transport');
select public.review_provider_activity_document('00000000-0000-0000-0000-000000000006',(select id from public.services where slug='mudanzas'),'transport_vehicle_review',
 (select id from public.professional_documents where kind='transport_vehicle_review'),'APPROVED',
 '{"vehicle_scope":"Synthetic local vehicle","observation":"Synthetic review","checks":{"pba_cargo":{"applicable":false,"reference":"Fixture does not apply"},"professional_license":{"applicable":true,"verified":true,"reference":"Fixture license"},"vehicle_documents":{"applicable":true,"verified":true,"reference":"Fixture vehicle"},"motor_insurance":{"applicable":true,"verified":true,"reference":"Fixture policy"},"vtv":{"applicable":false,"reference":"Fixture not applicable"}}}');
select private.identity_assert(private.provider_activity_can_contract('00000000-0000-0000-0000-000000000006',(select id from public.services where slug='mudanzas'),null),'conditional transport review');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
do $$ begin
 begin perform public.get_provider_activity_reviews('00000000-0000-0000-0000-000000000006'); raise exception 'expected private access guard';
 exception when others then if sqlerrm='expected private access guard' then raise; end if; end;
 begin perform public.review_provider_activity_document('00000000-0000-0000-0000-000000000006',1,'gas_installer_registration',null,'APPROVED','{}'); raise exception 'expected admin guard';
 exception when others then if sqlerrm='expected admin guard' then raise; end if; end;
end $$;
reset role;
