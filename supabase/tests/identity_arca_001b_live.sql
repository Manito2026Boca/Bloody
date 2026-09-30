-- Operator-only production smoke. Synthetic identities only; ALWAYS rolled back.
-- No password, Auth session, real CUIT, real professional or persistent QA is modified.
begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); adm uuid; c uuid; d uuid;
 plom bigint; gas bigint; arch bigint; response jsonb;
begin
 select id into adm from public.profiles where private.is_manito_admin(id) limit 1;
 if adm is null then raise exception 'No Admin available for synthetic smoke'; end if;
 if exists(select 1 from private.provider_identities where normalized_cuit='99000000007') then raise exception 'Synthetic identity already used; do not modify it'; end if;
 perform set_config('request.jwt.claim.sub',adm::text,true);
 insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('00000000-0000-0000-0000-000000000000',a,'authenticated','authenticated',a::text||'@identity-fixture.invalid','{}','{"full_name":"Synthetic identity fixture"}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',b,'authenticated','authenticated',b::text||'@identity-fixture.invalid','{}','{"full_name":"Synthetic second fixture"}',now(),now());
 insert into public.profiles(id,email,full_name,role) values(a,a::text||'@identity-fixture.invalid','Synthetic identity fixture','professional'),(b,b::text||'@identity-fixture.invalid','Synthetic second fixture','client')
 on conflict(id) do update set role=excluded.role;
 select id into plom from public.services where slug='plomeria';
 select id into gas from public.services where slug='gas';
 select id into arch from public.services where slug='arquitectura';
 perform set_config('request.jwt.claim.sub',a::text,true);
 begin perform public.submit_provider_identity_claim('00000000000',false); raise exception 'expected invalid cuit';
 exception when others then if sqlerrm='expected invalid cuit' then raise; end if; end;
 response:=public.submit_provider_identity_claim('99000000007',false);
 if response<>jsonb_build_object('received',true) then raise exception 'Unexpected claim response'; end if;
 if private.provider_activity_can_contract(a,plom,null) then raise exception 'Pending identity admitted'; end if;
 select id into c from private.provider_identity_claims where claimant_profile_id=a;
 perform set_config('request.jwt.claim.sub',b::text,true);
 response:=public.submit_provider_identity_claim('99000000007',false);
 if response<>jsonb_build_object('received',true) then raise exception 'Duplicate response leaks identity'; end if;
 begin perform public.get_admin_provider_identity(a); raise exception 'expected admin denial';
 exception when others then if sqlerrm='expected admin denial' then raise; end if; end;
 begin perform public.get_provider_activity_reviews(a); raise exception 'expected foreign denial';
 exception when others then if sqlerrm='expected foreign denial' then raise; end if; end;
 begin perform public.review_provider_identity(c,'ARCA','FOUND'); raise exception 'expected review denial';
 exception when others then if sqlerrm='expected review denial' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',adm::text,true);
 insert into public.professional_documents(professional_id,kind,label,status,file_path)
 select a,k,'Synthetic identity evidence','approved','fixture/identity-live/'||k from unnest(array['dni_front','dni_back','selfie','tax'])k;
 perform public.review_provider_identity(c,'ARCA','FOUND');
 perform public.review_provider_identity(c,'ACCEPT',null,true);
 perform public.review_provider_identity(c,'ENABLE');
 if not private.provider_activity_can_contract(a,plom,null) then raise exception 'LEVEL_1 without insurance denied'; end if;
 if private.provider_activity_can_contract(a,gas,null) then raise exception 'LEVEL_2 without credential admitted'; end if;
 if private.provider_activity_can_contract(a,arch,null) then raise exception 'LEVEL_3 admitted'; end if;
 insert into public.professional_documents(professional_id,kind,label,status,file_path)
 values(a,'gas_installer_registration','Synthetic gas registration','approved','fixture/identity-live/gas') returning id into d;
 if private.provider_activity_can_contract(a,gas,null) then raise exception 'Document-only sector approval'; end if;
 perform public.review_provider_activity_document(a,gas,'gas_installer_registration',d,'APPROVED',
 '{"registration_number":"SYNTHETIC ONLY","registry":"Synthetic registry","observation":"Transaction rollback fixture"}');
 if not private.provider_activity_can_contract(a,gas,null) then raise exception 'Reviewed gas credential denied'; end if;
 update public.professional_documents set status='rejected' where id=d;
 if private.provider_activity_can_contract(a,gas,null) then raise exception 'Revoked gas credential admitted'; end if;
 if has_table_privilege('authenticated','private.provider_identities','select') or has_table_privilege('authenticated','private.provider_activity_reviews','select')
 or has_function_privilege('anon','public.submit_provider_identity_claim(text,boolean)','execute') then raise exception 'Unexpected private privileges'; end if;
end $$;
rollback;
select 'PASS: synthetic live smoke rolled back' as smoke;
