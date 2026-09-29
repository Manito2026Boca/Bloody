-- Execute only in a disposable database initialized with identity_arca_001_fixture.sql.
create function private.identity_assert(p_ok boolean,p_label text) returns void language plpgsql as $$
begin if not coalesce(p_ok,false) then raise exception 'Identity test failed: %',p_label; end if; end $$;
select private.identity_assert(private.normalize_provider_cuit('99-00000000-7')='99000000007','normalization');
select private.identity_assert(private.provider_cuit_valid('99000000007'),'checksum');
select private.identity_assert(not private.provider_cuit_valid('99000000008'),'invalid checksum');
select private.identity_assert(not private.provider_cuit_valid('00000000000'),'zero invalid');
select private.identity_assert(not has_table_privilege('authenticated','private.provider_identities','SELECT'),'private table');
select private.identity_assert(not has_table_privilege('service_role','private.provider_identity_events','UPDATE'),'no backend audit edits');
select private.identity_assert(not has_function_privilege('anon','public.submit_provider_identity_claim(text,boolean)','EXECUTE'),'anon');
select private.identity_assert(not has_function_privilege('authenticated','private.provider_activity_can_contract(uuid,bigint,bigint)','EXECUTE'),'private helper');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.submit_provider_identity_claim('99-00000000-7',false);
select public.submit_provider_identity_claim('99-00000000-7',false);
reset role;
select private.identity_assert((select count(*)=1 from private.provider_identities),'unique identity');
select private.identity_assert((select count(*)=1 from private.provider_identity_claims),'idempotent own claim');
select private.identity_assert((select canonical_professional_profile_id is null from private.provider_identities),'first is not owner');
select private.identity_assert(not private.provider_activity_can_contract('00000000-0000-0000-0000-000000000001',1,null),'pending gate');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.submit_provider_identity_claim('99000000007',true);
reset role;
select private.identity_assert((select count(*)=1 from private.provider_identities),'duplicate shares identity');
select private.identity_assert((select count(*)=2 from private.provider_identity_claims),'claims remain independent');
do $$ begin
 begin perform public.get_admin_provider_identity('00000000-0000-0000-0000-000000000001'); raise exception 'expected unauthorized';
 exception when others then if sqlerrm='expected unauthorized' then raise; end if; end;
end $$;
select private.identity_assert(not exists(select 1 from private.provider_identity_events where reason_code like '%99000000007%'),'events contain no cuit');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.configure_provider_activity(1,null,'LEVEL_1','{}');
select public.configure_provider_activity(4,null,'LEVEL_2',array['license_fixture']);
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000001'),'ARCA','UNAVAILABLE');
select private.identity_assert((select fiscal_status='NEEDS_REVIEW' from private.provider_identities),'unavailable not verified/rejected');
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000001'),'ARCA','FOUND');
do $$ begin
 begin perform public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000001'),'ACCEPT',null,true); raise exception 'expected missing docs';
 exception when others then if sqlerrm='expected missing docs' then raise; end if; end;
end $$;
insert into public.professional_documents(professional_id,kind,status,file_path)
 select '00000000-0000-0000-0000-000000000001',kind,'approved','local-fixture/'||kind from unnest(array['dni_front','dni_back','selfie','tax']) kind;
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000001'),'ACCEPT',null,true);
select private.identity_assert(not private.provider_activity_can_contract('00000000-0000-0000-0000-000000000001',1,null),'binding not automatic enable');
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000001'),'ENABLE');
select private.identity_assert(private.provider_activity_can_contract('00000000-0000-0000-0000-000000000001',1,null),'level1 allowed');
select private.identity_assert(not private.provider_activity_can_contract('00000000-0000-0000-0000-000000000001',2,null),'level3 blocked');
select private.identity_assert(not private.provider_activity_can_contract('00000000-0000-0000-0000-000000000001',4,null),'level2 missing license');
insert into public.professional_documents(professional_id,kind,status,file_path) values('00000000-0000-0000-0000-000000000001','license_fixture','approved','local-fixture/license');
select private.identity_assert(private.provider_activity_can_contract('00000000-0000-0000-0000-000000000001',4,null),'level2 credential');
select private.identity_assert(private.provider_activity_can_contract('00000000-0000-0000-0000-000000000004',1,null),'explicit existing QA');
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000002'),'ARCA','MISMATCH');
select private.identity_assert((select fiscal_status='VERIFIED' from private.provider_identities),'other claim cannot disable owner');
do $$ begin
 begin perform public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000002'),'ACCEPT',null,true); raise exception 'expected canonical guard';
 exception when others then if sqlerrm='expected canonical guard' then raise; end if; end;
end $$;
insert into public.orders(professional_id,client_id,service_id,mode,contracted_at,status) values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005',1,'immediate',now(),'accepted');
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000001'),'SUSPEND');
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000001'),'ARCA','FOUND');
select private.identity_assert((select operational_status='SUSPENDED' from private.provider_identities),'arca cannot lift suspension');
update public.orders set status='completed';
select private.identity_assert((select status='completed' from public.orders),'old contract execution not blocked');
do $$ begin
 begin insert into public.orders(professional_id,client_id,service_id,mode,contracted_at,status) values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005',1,'immediate',now(),'accepted'); raise exception 'expected suspended gate';
 exception when others then if sqlerrm='expected suspended gate' then raise; end if; end;
 begin delete from auth.users where id='00000000-0000-0000-0000-000000000001'; raise exception 'expected protected cascade';
 exception when foreign_key_violation then null; end;
 begin delete from private.provider_identity_events; raise exception 'expected append only';
 exception when others then if sqlerrm='expected append only' then raise; end if; end;
end $$;
select private.identity_assert((select count(*)=1 from public.ratings),'ratings retained');
select private.identity_assert((select count(*)=1 from public.profiles where id='00000000-0000-0000-0000-000000000001'),'canonical profile retained');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.get_my_provider_identity();
reset role;
select private.identity_assert((public.get_my_provider_identity()->>'status')='NEEDS_REVIEW','own claim no owner status leak');

-- Recovery selection regression: an older accepted claim dominates newer rejected history.
insert into auth.users(id,email,raw_app_meta_data) values('00000000-0000-0000-0000-000000000006','recovery-fixture@invalid','{}');
insert into public.profiles(id,role,full_name) values('00000000-0000-0000-0000-000000000006','professional','Synthetic recovery');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
select public.submit_provider_identity_claim('99000000015',false);
update private.provider_identity_claims set created_at=now()-interval '1 hour' where claimant_profile_id='00000000-0000-0000-0000-000000000006';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000006'),'REJECT');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
select public.submit_provider_identity_claim('99000000023',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000006' and status='PENDING'),'REJECT');
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000006' order by created_at limit 1),'NEEDS_REVIEW');
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000006' and status='NEEDS_REVIEW'),'ARCA','FOUND');
insert into public.professional_documents(professional_id,kind,status,file_path)
 select '00000000-0000-0000-0000-000000000006',kind,'approved','local-fixture/'||kind from unnest(array['dni_front','dni_back','selfie','tax']) kind;
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000006' and status='NEEDS_REVIEW'),'ACCEPT',null,true);
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000006' and status='ACCEPTED'),'ENABLE');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
select private.identity_assert(public.get_my_provider_identity()->>'status'='VERIFIED','older canonical claim wins');
select private.identity_assert((public.get_my_provider_identity()->>'can_submit')::boolean=false,'canonical cannot resubmit silently');

insert into auth.users(id,email,raw_app_meta_data) values('00000000-0000-0000-0000-000000000007','missing-original-fixture@invalid','{}');
insert into public.profiles(id,role,full_name) values('00000000-0000-0000-0000-000000000007','professional','Synthetic lost original');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',false);
select public.submit_provider_identity_claim('99000000058',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000007'),'ARCA','FOUND');
insert into public.professional_documents(professional_id,kind,status,file_path)
 select '00000000-0000-0000-0000-000000000007',kind,'approved','local-fixture/'||kind from unnest(array['dni_front','dni_back','selfie','tax']) kind;
do $$ begin
 begin perform public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id='00000000-0000-0000-0000-000000000007'),'ACCEPT',null,true); raise exception 'expected original recovery guard';
 exception when others then if sqlerrm='expected original recovery guard' then raise; end if; end;
end $$;
select private.identity_assert(not exists(select 1 from private.provider_identities where canonical_professional_profile_id='00000000-0000-0000-0000-000000000007'),'recovery cannot create clean canonical profile');
