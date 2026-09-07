-- Controlled integration test. All fixtures/settings are rolled back, including on error.
begin;
create temporary table protection_test_ids(name text primary key,id uuid not null default gen_random_uuid());
insert into protection_test_ids(name) values ('client'),('pro'),('stranger'),('admin'),('order'),('expired'),('active'),('fallback'),('payment');
create temporary table protection_test_results(label text);
grant select on protection_test_ids to authenticated,anon;
grant insert,select on protection_test_results to authenticated,anon;
create function pg_temp.fixture(p_name text) returns uuid language sql as $$select id from protection_test_ids where name=p_name$$;
create function pg_temp.check_true(p_ok boolean,p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'TEST FAILED: %',p_label; end if;
  insert into protection_test_results values(p_label);
end $$;
create function pg_temp.denied(p_sql text,p_expected text,p_label text) returns void language plpgsql as $$
declare v_message text;
begin
  begin execute p_sql; exception when others then v_message:=sqlerrm; end;
  if v_message is null or position(lower(p_expected) in lower(v_message))=0 then
    raise exception 'TEST FAILED: %, expected %, got %',p_label,p_expected,coalesce(v_message,'success');
  end if;
  insert into protection_test_results values(p_label);
end $$;

insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
select id,'norm010-'||id::text||'@example.invalid','{}','{}' from protection_test_ids where name in ('client','pro','stranger','admin');
update public.profiles p set full_name='NORM010 temporary test',role=case t.name when 'admin' then 'admin' when 'pro' then 'professional' else 'client' end
from protection_test_ids t where p.id=t.id;
insert into public.services(slug,name,protection_window_days,requires_completion_evidence)
values ('norm010-'||pg_temp.fixture('order')::text,'NORM010 temporary test',9,false);
select set_config('test.service',(select id::text from public.services where slug='norm010-'||pg_temp.fixture('order')::text),true);
insert into public.orders(id,client_id,professional_id,service_id,description,address,status,completed_at,mode,
  price,agreed_price,agreed_scope,contracted_at,contract_snapshot,pricing_policy_snapshot)
values(pg_temp.fixture('order'),pg_temp.fixture('client'),pg_temp.fixture('pro'),current_setting('test.service')::bigint,
  'Need', 'Test', 'completed',now(),'immediate',100,100,'Agreed scope',now(),'{"schema_version":1,"test":"immutable"}','{"commission_percent":12}');
select pg_temp.check_true((select protection_window_days=9 from public.orders where id=pg_temp.fixture('order')),'service-specific window has priority');
update public.services set protection_window_days=null where id=current_setting('test.service')::bigint;
update public.admin_settings set value=jsonb_set(value,'{default_window_days}','11') where key='protection';
insert into public.orders(id,client_id,professional_id,service_id,description,address,status,completed_at,mode,end_pin)
select t.id,pg_temp.fixture('client'),pg_temp.fixture('pro'),current_setting('test.service')::bigint,'Need','Test',
  case when t.name='active' then 'trabajando' else 'completed' end,
  case when t.name='expired' then now()-interval '20 days' when t.name='fallback' then now() end,'immediate','1234'
from protection_test_ids t where name in ('expired','active','fallback');
select pg_temp.check_true((select protection_window_days=11 from public.orders where id=pg_temp.fixture('fallback')),'general fallback window');
update public.admin_settings set value=jsonb_set(value,'{default_window_days}','1') where key='protection';
select pg_temp.check_true((select protection_window_days=9 from public.orders where id=pg_temp.fixture('order')),'settings do not change historical order');
select pg_temp.denied(format('update public.orders set protection_window_days=40 where id=%L',pg_temp.fixture('order')),'congelada','order window is immutable');

-- Original evidence/payment/chat are context, never copied into the complaint.
insert into storage.objects(bucket_id,name,owner) values('manito-media','norm010-original-'||pg_temp.fixture('order'),pg_temp.fixture('pro'));
insert into public.order_photos(order_id,uploaded_by,stage,file_path,file_name)
values(pg_temp.fixture('order'),pg_temp.fixture('pro'),'after','norm010-original-'||pg_temp.fixture('order'),'original.jpg');
insert into public.order_extras(order_id,professional_id,title,amount,status)
values(pg_temp.fixture('order'),pg_temp.fixture('pro'),'Approved extra',10,'approved'),
      (pg_temp.fixture('order'),pg_temp.fixture('pro'),'Rejected extra',5,'rejected');
insert into public.payments(id,order_id,client_id,professional_id,amount,status,provider)
values(pg_temp.fixture('payment'),pg_temp.fixture('order'),pg_temp.fixture('client'),pg_temp.fixture('pro'),110,'confirmed','manual');
insert into public.payment_events(payment_id,provider,event_type) values(pg_temp.fixture('payment'),'manual','confirmed');
insert into public.messages(order_id,sender_id,body) values(pg_temp.fixture('order'),pg_temp.fixture('client'),'Test agreed scope');
insert into public.ratings(order_id,client_id,professional_id,stars,comment)
values(pg_temp.fixture('order'),pg_temp.fixture('client'),pg_temp.fixture('pro'),3,'Original rating');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('pro')::text,true);
select pg_temp.denied(format('select public.open_order_complaint(%L,%L,%L)',pg_temp.fixture('order'),'damage','Detailed damage report'),'cliente','professional cannot open a claim');
select pg_temp.denied(format('select start_pin from public.orders where id=%L',pg_temp.fixture('order')),'permission denied','NORM013 start PIN remains protected');
select pg_temp.denied(format('select end_pin from public.orders where id=%L',pg_temp.fixture('order')),'permission denied','NORM013 end PIN remains protected');
select pg_temp.denied(format('select public.add_order_evidence(%L,%L,%L,%L)',pg_temp.fixture('order'),'after','orders/'||pg_temp.fixture('order')||'/evidence/'||pg_temp.fixture('pro')||'/photo.jpg','photo.jpg'),'ya no admite','NORM011 original completed evidence remains closed');
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select pg_temp.check_true(not private.is_manito_admin(auth.uid()),'authenticated client is not admin');
select pg_temp.check_true(private.is_manito_admin(pg_temp.fixture('admin')) and not private.is_manito_admin(),
  'querying another role does not change caller administrative privileges');
select pg_temp.denied(format('select public.open_order_complaint(%L,%L,%L)',pg_temp.fixture('active'),'damage','Detailed damage report'),'finalizar','noncompleted order is ineligible');
select pg_temp.denied(format('select public.open_order_complaint(%L,%L,%L)',pg_temp.fixture('expired'),'damage','Detailed damage report'),'ventana','expired order is ineligible');
select pg_temp.denied(format('select public.open_order_complaint(%L,%L,%L)',pg_temp.fixture('order'),'invalid','Detailed damage report'),'tipo','claim type is validated');
select pg_temp.denied(format('select public.open_order_complaint(%L,%L,%L)',pg_temp.fixture('order'),'other','short'),'detalle','other needs sufficient detail');
select set_config('test.case',(public.open_order_complaint(pg_temp.fixture('order'),'damage','Damage after the completed service')).id::text,true);
select pg_temp.check_true((select opened_by_role='client' and protection_window_days=9 from public.complaints where id=current_setting('test.case')::uuid),'client opens case with window snapshot');
select pg_temp.denied(format('select public.open_order_complaint(%L,%L,%L)',pg_temp.fixture('order'),'damage','Detailed damage report'),'ya tiene','only one active case');
select pg_temp.denied(format('select public.review_order_complaint(%L,%L)',current_setting('test.case'),'under_review'),'Solo MANITO','client cannot review');
select pg_temp.denied(format('update public.complaints set professional_response=%L where id=%L','Unauthorized reply',current_setting('test.case')),'permission denied','client cannot forge response');
select pg_temp.denied(format('select public.get_admin_complaint_detail(%L)',current_setting('test.case')),'Solo MANITO','client cannot query administrative chat context');

select set_config('test.path','complaints/'||current_setting('test.case')||'/'||pg_temp.fixture('client')||'/test.jpg',true);
insert into storage.objects(bucket_id,name,owner) values('manito-media',current_setting('test.path'),pg_temp.fixture('client'));
select public.add_complaint_evidence(current_setting('test.case')::uuid,current_setting('test.path'),'test.jpg','Post-service problem');
select pg_temp.check_true((select count(*)=1 from public.complaint_evidence where complaint_id=current_setting('test.case')::uuid),'client can attach private complaint evidence');
select pg_temp.denied(format('delete from public.complaint_evidence where complaint_id=%L',current_setting('test.case')),'permission denied','linked evidence cannot be deleted');
-- Supabase rejects SQL DELETE before row policies; the app uses the Storage API.
select pg_temp.denied(format('delete from storage.objects where bucket_id=%L and name=%L',
  'manito-media',current_setting('test.path')),'Direct deletion from storage tables is not allowed','Storage blocks direct SQL deletion');
select pg_temp.check_true((select count(*)=1 from storage.objects where bucket_id='manito-media' and name=current_setting('test.path')),'client cannot delete linked Storage file');

select set_config('request.jwt.claim.sub',pg_temp.fixture('stranger')::text,true);
select pg_temp.check_true((select count(*)=0 from public.complaints where id=current_setting('test.case')::uuid),'stranger cannot read case');
select pg_temp.check_true((select count(*)=0 from public.complaint_evidence where complaint_id=current_setting('test.case')::uuid),'stranger cannot read evidence');
select pg_temp.check_true((select count(*)=0 from storage.objects where bucket_id='manito-media' and name=current_setting('test.path')),'stranger cannot SELECT file to sign/read');
select pg_temp.denied(format('select public.open_order_complaint(%L,%L,%L)',pg_temp.fixture('order'),'damage','Detailed damage report'),'cliente','stranger cannot open case');
select pg_temp.denied(format('select public.respond_to_complaint(%L,%L)',current_setting('test.case'),'Unauthorized response'),'No podes','stranger cannot respond');
select pg_temp.denied(format('insert into storage.objects(bucket_id,name,owner) values(%L,%L,%L)','manito-media','complaints/'||current_setting('test.case')||'/'||pg_temp.fixture('stranger')||'/test.jpg',pg_temp.fixture('stranger')),'row-level security','stranger cannot upload under case path');

select set_config('request.jwt.claim.sub',pg_temp.fixture('admin')::text,true);
select pg_temp.check_true(private.is_manito_admin(auth.uid()),'admin helper identifies real admin');
select pg_temp.check_true((select count(*)=1 from public.orders where id=pg_temp.fixture('order')),'admin can evaluate orders RLS');
select pg_temp.check_true((select count(*)>0 from public.list_admin_complaint_reviews()),'admin lists cases');
select pg_temp.check_true(public.get_admin_complaint_detail(current_setting('test.case')::uuid)->'order'->>'agreed_scope'='Agreed scope','admin sees NORM003 contract');
select pg_temp.check_true(jsonb_array_length(public.get_admin_complaint_detail(current_setting('test.case')::uuid)->'extras')=2,'admin sees approved and rejected extras');
select pg_temp.check_true(jsonb_array_length(public.get_admin_complaint_detail(current_setting('test.case')::uuid)->'order_evidence')=1,'admin sees NORM011 evidence');
select pg_temp.check_true(jsonb_array_length(public.get_admin_complaint_detail(current_setting('test.case')::uuid)->'payments')=1,'admin sees payment');
select pg_temp.check_true(jsonb_array_length(public.get_admin_complaint_detail(current_setting('test.case')::uuid)->'payment_events')=1,'admin sees payment events');
select pg_temp.check_true(jsonb_array_length(public.get_admin_complaint_detail(current_setting('test.case')::uuid)->'messages')=1,'admin sees case chat');
select pg_temp.check_true(jsonb_array_length(public.get_admin_complaint_detail(current_setting('test.case')::uuid)->'ratings')=1,'admin sees rating');
select pg_temp.check_true((select count(*)=1 from storage.objects where bucket_id='manito-media' and name=current_setting('test.path')),'admin can sign/read evidence');
select public.review_order_complaint(current_setting('test.case')::uuid,'under_review');
select public.review_order_complaint(current_setting('test.case')::uuid,'awaiting_professional');

select set_config('request.jwt.claim.sub',pg_temp.fixture('pro')::text,true);
select pg_temp.check_true((select count(*)=1 from public.complaints where id=current_setting('test.case')::uuid),'assigned professional reads case');
select pg_temp.check_true((select count(*)=1 from storage.objects where bucket_id='manito-media' and name=current_setting('test.path')),'assigned professional reads case evidence');
select pg_temp.denied(format('select public.review_order_complaint(%L,%L)',current_setting('test.case'),'resolved'),'Solo MANITO','professional cannot resolve');
select pg_temp.denied(format('select public.get_admin_complaint_detail(%L)',current_setting('test.case')),'Solo MANITO','professional cannot use admin detail');
select public.respond_to_complaint(current_setting('test.case')::uuid,'This is my professional response');
select pg_temp.check_true((select status='under_review' and professional_responded_at is not null from public.complaints where id=current_setting('test.case')::uuid),'response recorded and ready for review');
select pg_temp.denied(format('select public.respond_to_complaint(%L,%L)',current_setting('test.case'),'Changed professional response'),'ya fue','initial response cannot be overwritten');
select pg_temp.check_true((select count(*)=1 from public.notifications where recipient_id=pg_temp.fixture('pro') and order_id=pg_temp.fixture('order') and kind='complaint_opened'),'opening notification');
select pg_temp.check_true((select count(*)=1 from public.notifications where recipient_id=pg_temp.fixture('pro') and order_id=pg_temp.fixture('order') and kind='complaint_awaiting_professional'),'request response notification');

select set_config('request.jwt.claim.sub',pg_temp.fixture('admin')::text,true);
select pg_temp.denied(format('select public.review_order_complaint(%L,%L,%L,%L)',current_setting('test.case'),'resolved','A clear decision note','invalid'),'resolucion','resolution type validated');
select pg_temp.denied(format('select public.review_order_complaint(%L,%L,%L,%L,-1)',current_setting('test.case'),'resolved','A clear decision note','credit'),'monto','negative money decision blocked');
select pg_temp.denied(format('select public.review_order_complaint(%L,%L,%L,%L,20)',current_setting('test.case'),'resolved','A clear decision note','correction'),'no admite','nonfinancial resolution rejects amount');
select public.review_order_complaint(current_setting('test.case')::uuid,'resolved','Credit decision only; no money movement','credit',20);
select pg_temp.check_true((select status='resolved' and resolution_type='credit' and resolution_amount=20 and reviewed_by=pg_temp.fixture('admin') and resolved_at is not null from public.complaints where id=current_setting('test.case')::uuid),'admin resolution persisted');
select pg_temp.denied(format('select public.review_order_complaint(%L,%L)',current_setting('test.case'),'under_review'),'cerrado','resolved case cannot reopen');
select pg_temp.denied(format('select public.review_order_complaint(%L,%L,%L,%L)',current_setting('test.case'),'rejected','Changed final decision','rejected'),'cerrado','resolved case cannot change decision');
select set_config('request.jwt.claim.sub',pg_temp.fixture('pro')::text,true);
select pg_temp.denied(format('select public.respond_to_complaint(%L,%L)',current_setting('test.case'),'Another response after closing'),'cerrado','closed case blocks professional response');
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select pg_temp.denied(format('select public.add_complaint_evidence(%L,%L,%L)',current_setting('test.case'),current_setting('test.path'),'new.jpg'),'no admite','closed case blocks new evidence');
select pg_temp.check_true((select count(*)=1 from public.notifications where recipient_id=pg_temp.fixture('client') and order_id=pg_temp.fixture('order') and kind='complaint_response'),'response notification');
select pg_temp.check_true((select count(*)=1 from public.notifications where recipient_id=pg_temp.fixture('client') and order_id=pg_temp.fixture('order') and kind='complaint_resolved'),'resolution notification');
select set_config('test.second_case',(public.open_order_complaint(pg_temp.fixture('order'),'work_quality','Another specific post-service problem')).id::text,true);
select set_config('request.jwt.claim.sub',pg_temp.fixture('admin')::text,true);
select public.review_order_complaint(current_setting('test.second_case')::uuid,'rejected','Reviewed and rejected with documented reason','rejected');
select pg_temp.denied(format('select public.review_order_complaint(%L,%L)',current_setting('test.second_case'),'under_review'),'cerrado','rejected case cannot reopen');

reset role;
select pg_temp.check_true((select count(*)=1 and min(amount)=110 and min(status)='confirmed' from public.payments where order_id=pg_temp.fixture('order')),'NORM004 payment unchanged by credit decision');
select pg_temp.check_true((select count(*)=1 from public.payment_events where payment_id=pg_temp.fixture('payment')),'no financial event executed');
select pg_temp.check_true((select agreed_scope='Agreed scope' and agreed_price=100 and contract_snapshot='{"schema_version":1,"test":"immutable"}'::jsonb and professional_id=pg_temp.fixture('pro') and status='completed' from public.orders where id=pg_temp.fixture('order')),'NORM003 contract and original professional preserved');
select pg_temp.check_true((select count(*)=2 from public.order_extras where order_id=pg_temp.fixture('order')),'original extras preserved');
select pg_temp.check_true((select count(*)=1 from public.order_photos where order_id=pg_temp.fixture('order')),'NORM011 evidence preserved');
select pg_temp.check_true((select stars=3 and comment='Original rating' from public.ratings where order_id=pg_temp.fixture('order')),'rating unchanged');
select pg_temp.check_true((select count(*)=5 from public.complaint_events where complaint_id=current_setting('test.case')::uuid),'all lifecycle events retained');
select pg_temp.denied(format('update public.complaints set resolution_note=%L where id=%L','Changed outside RPC',current_setting('test.case')),'cerrado','terminal DB trigger prevents direct mutation');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.denied('select * from public.complaints','permission denied','anon cannot read cases');
select pg_temp.denied('select * from public.complaint_evidence','permission denied','anon cannot read evidence');
select pg_temp.denied(format('select private.is_manito_admin(%L)',pg_temp.fixture('admin')),'permission denied','anon cannot execute admin helper');
select pg_temp.denied(format('select public.open_order_complaint(%L,%L,%L)',pg_temp.fixture('order'),'damage','Detailed damage report'),'permission denied','anon cannot execute claim RPC');
reset role;
select pg_temp.check_true(has_function_privilege('authenticated','private.is_manito_admin(uuid)','execute'), 'authenticated has only required helper execution');
select pg_temp.check_true(not has_function_privilege('anon','private.is_manito_admin(uuid)','execute'), 'anon has no helper EXECUTE');
select pg_temp.check_true(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid='private.is_manito_admin(uuid)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'), 'PUBLIC has no helper EXECUTE');
select count(*) as passed_assertions, jsonb_agg(label) as checks from protection_test_results;
rollback;
