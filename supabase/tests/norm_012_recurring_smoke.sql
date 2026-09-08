-- Every fixture and operational change is rolled back.
begin;
create temporary table recurring_test_ids(name text primary key,id uuid not null default gen_random_uuid());
insert into recurring_test_ids(name) values ('client'),('pro'),('stranger'),('admin'),('source'),('choice'),('immediate'),('backlog');
create temporary table recurring_test_results(label text);
grant select on recurring_test_ids to authenticated,anon;
grant insert,select on recurring_test_results to authenticated,anon;
create function pg_temp.fixture(n text) returns uuid language sql as $$select id from recurring_test_ids where name=n$$;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'TEST FAILED: %',label; end if;
insert into recurring_test_results values(label); end $$;
create function pg_temp.denied(q text,label text) returns void language plpgsql as $$
declare failed boolean:=false;
begin begin execute q; exception when others then failed:=true; end;
if not failed then raise exception 'TEST FAILED (expected denial): %',label; end if;
insert into recurring_test_results values(label); end $$;

insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
select id,'norm012-'||id::text||'@example.invalid','{}','{}' from recurring_test_ids where name in ('client','pro','stranger','admin');
update public.profiles p set role=case t.name when 'pro' then 'professional' when 'admin' then 'admin' else 'client' end,
 full_name='NORM012 temporary fixture',is_available=false
from recurring_test_ids t where p.id=t.id;
select set_config('request.jwt.claim.sub',pg_temp.fixture('admin')::text,true);
insert into public.professional_profiles(professional_id,verified,work_days,work_starts_at,work_ends_at)
values(pg_temp.fixture('pro'),true,array['Lun','Mar','Mie','Jue','Vie','Sab','Dom'],'00:00','23:59')
on conflict(professional_id) do update set verified=true,work_days=excluded.work_days,work_starts_at='00:00',work_ends_at='23:59';
insert into public.services(slug,name,base_price,allow_scheduled,supports_recurring,requires_completion_evidence)
values('norm012-'||pg_temp.fixture('source'),'NORM012 fixture',150,true,true,false);
select set_config('test.service',(select id::text from public.services where slug='norm012-'||pg_temp.fixture('source')),true);
insert into public.professional_services(professional_id,service_id,price_from)
values(pg_temp.fixture('pro'),current_setting('test.service')::bigint,200);
select set_config('test.anchor',(((now() at time zone 'America/Argentina/Buenos_Aires')::date-1+time '12:00')
 at time zone 'America/Argentina/Buenos_Aires')::text,true);
insert into public.orders(id,client_id,professional_id,service_id,description,address,mode,status,scheduled_at,
estimated_duration_minutes,completed_at,estimated_price,agreed_price,agreed_scope,contracted_at,payment_method)
values(pg_temp.fixture('source'),pg_temp.fixture('client'),pg_temp.fixture('pro'),current_setting('test.service')::bigint,
'Weekly clean','Address and City','scheduled','completed',current_setting('test.anchor')::timestamptz,60,now()-interval '1 day',100,100,'Original scope',now()-interval '1 day','cash');

select pg_temp.check_true(private.recurring_next_at('2026-01-31 12:00-03','monthly','2026-01-31 12:00-03')='2026-02-28 12:00-03'::timestamptz,'monthly clamps short month');
select pg_temp.check_true(private.recurring_next_at('2026-01-31 12:00-03','monthly','2026-02-28 12:00-03')='2026-03-31 12:00-03'::timestamptz,'monthly restores original anchor');
select pg_temp.check_true(private.recurring_next_at('2028-01-31 12:00-03','monthly','2028-01-31 12:00-03')='2028-02-29 12:00-03'::timestamptz,'monthly leap year');
select pg_temp.check_true(private.recurring_next_at('2026-01-01 12:00-03','weekly','2026-01-01 12:00-03')='2026-01-08 12:00-03'::timestamptz,'weekly advances seven local days');
select pg_temp.check_true(private.recurring_next_at('2026-01-01 12:00-03','biweekly','2026-01-01 12:00-03')='2026-01-15 12:00-03'::timestamptz,'biweekly advances fourteen days');
select pg_temp.denied($q$select private.recurring_next_at(now(),'invalid',now())$q$,'invalid frequency rejected');
select pg_temp.check_true(to_regclass('public.recurring_orders') is null,'legacy table removed');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('stranger')::text,true);
select pg_temp.denied(format('select public.create_recurring_plan(%L,%L)',pg_temp.fixture('source'),'weekly'),'stranger cannot use source');
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select set_config('test.plan',(public.create_recurring_plan(pg_temp.fixture('source'),'weekly')).id::text,true);
select pg_temp.check_true((select client_id=auth.uid() and next_scheduled_at>current_setting('test.anchor')::timestamptz from public.recurring_service_plans where id=current_setting('test.plan')::uuid),'own plan and next cursor after first order');
select pg_temp.check_true((public.create_recurring_plan(pg_temp.fixture('source'),'weekly')).id=current_setting('test.plan')::uuid,'create retry is idempotent');
select pg_temp.check_true((select recurring_plan_id=current_setting('test.plan')::uuid from public.orders where id=pg_temp.fixture('source')),'initial Order linked');
select pg_temp.denied(format('update public.recurring_service_plans set status=%L where id=%L','cancelled',current_setting('test.plan')),'direct plan update denied');
select pg_temp.denied('select private.generate_due_recurring_orders()','client cannot run generator');
select pg_temp.check_true(jsonb_array_length(public.list_my_recurring_plans())=1,'client lists plan');
select set_config('request.jwt.claim.sub',pg_temp.fixture('stranger')::text,true);
select pg_temp.check_true(jsonb_array_length(public.list_my_recurring_plans())=0,'stranger cannot list another plan');
select pg_temp.check_true((select count(*)=0 from public.recurring_service_plans),'stranger direct SELECT hidden');
select pg_temp.denied(format('select public.pause_recurring_plan(%L)',current_setting('test.plan')),'stranger pause denied');
select pg_temp.denied(format('select public.update_recurring_plan(%L,%L::jsonb)',current_setting('test.plan'),'{"address":"Other"}'),'stranger edit denied');
select set_config('request.jwt.claim.sub',pg_temp.fixture('pro')::text,true);
select pg_temp.denied(format('select public.cancel_recurring_plan(%L)',current_setting('test.plan')),'professional cannot cancel client plan');
reset role;
set local role anon;
select pg_temp.denied('select public.list_my_recurring_plans()','anon plan RPC denied');
select pg_temp.denied('select private.generate_due_recurring_orders()','anon generator denied');
reset role;

-- Lead time does not generate early; normal seven-day window generates exactly once.
update public.admin_settings set value='{"generation_lead_days":1}' where key='recurring';
select pg_temp.check_true((private.generate_due_recurring_orders()->>'generated')::int=0,'lead window respected');
update public.admin_settings set value='{"generation_lead_days":7}' where key='recurring';
select pg_temp.check_true((private.generate_due_recurring_orders()->>'generated')::int=1,'active plan generates an Order');
select set_config('test.visit',(select id::text from public.orders where recurring_plan_id=current_setting('test.plan')::uuid and id<>pg_temp.fixture('source')),true);
select pg_temp.check_true((select mode='scheduled' and status='scheduled_open' and professional_id is null and agreed_price is null and contracted_at is null and payment_status='unpaid' from public.orders where id=current_setting('test.visit')::uuid),'scheduled request not accepted contracted or paid');
select pg_temp.check_true((select manual_response_status='pending' and manual_requested_professional_id=pg_temp.fixture('pro') and manual_response_deadline_at is not null from public.orders where id=current_setting('test.visit')::uuid),'valid preferred professional receives real pending invitation');
select pg_temp.check_true((select scheduled_end=scheduled_at+interval '60 minutes' from public.orders where id=current_setting('test.visit')::uuid),'NORM005 schedule trigger reused');
select pg_temp.check_true((private.generate_due_recurring_orders()->>'generated')::int=0,'repeat generator does not duplicate');
select pg_temp.check_true((select count(*)=2 from public.orders where recurring_plan_id=current_setting('test.plan')::uuid),'only source and one upcoming occurrence');
select pg_temp.check_true((select count(*)=0 from public.order_match_candidates where order_id=current_setting('test.visit')::uuid),'scheduled recurrence has no NORM006 candidates');
select pg_temp.denied(format('insert into public.orders(client_id,service_id,description,address,mode,status,scheduled_at,recurring_plan_id,recurrence_due_at) select client_id,service_id,description,address,mode,status,scheduled_at,recurring_plan_id,recurrence_due_at from public.orders where id=%L',current_setting('test.visit')),'unique occurrence prevents duplicate insert');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select public.update_recurring_plan(current_setting('test.plan')::uuid,'{"description":"Future scope","frequency":"biweekly"}');
select pg_temp.check_true((select description='Weekly clean' from public.orders where id=current_setting('test.visit')::uuid),'plan edit preserves generated scope');
select public.pause_recurring_plan(current_setting('test.plan')::uuid);
select pg_temp.check_true((select status='scheduled_open' from public.orders where id=current_setting('test.visit')::uuid),'pause does not cancel Order');
reset role;
select pg_temp.check_true((private.generate_due_recurring_orders()->>'generated')::int=0,'paused does not generate');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select public.resume_recurring_plan(current_setting('test.plan')::uuid);
select pg_temp.check_true((select next_scheduled_at>now() from public.recurring_service_plans where id=current_setting('test.plan')::uuid),'resume computes future without backlog');
select set_config('request.jwt.claim.sub',pg_temp.fixture('pro')::text,true);
select public.accept_order(current_setting('test.visit')::uuid);
reset role;
select pg_temp.check_true((select agreed_price=200+greatest(0,private.policy_number(private.current_commercial_policy(),'scheduled_fee',0))
 and contracted_at is not null and agreed_scope='Weekly clean' and contract_snapshot is not null
 from public.orders where id=current_setting('test.visit')::uuid),'NORM003 new contract uses current professional price not old 100');
select pg_temp.check_true((select professional_id=pg_temp.fixture('pro') from public.orders where id=current_setting('test.visit')::uuid),'Programar accepts with is_available false');
select pg_temp.check_true(private.professional_has_schedule_conflict(pg_temp.fixture('pro'),
 (select scheduled_at from public.orders where id=current_setting('test.visit')::uuid),
 (select scheduled_end from public.orders where id=current_setting('test.visit')::uuid),null),'accepted occurrence reserves agenda');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select public.cancel_recurring_plan(current_setting('test.plan')::uuid);
select pg_temp.denied(format('select public.resume_recurring_plan(%L)',current_setting('test.plan')),'cancelled plan terminal');
select pg_temp.check_true((select status='accepted' from public.orders where id=current_setting('test.visit')::uuid),'cancel plan preserves accepted Order');
reset role;
select pg_temp.check_true((private.generate_due_recurring_orders()->>'generated')::int=0,'cancelled does not generate');

-- Invalid preference creates no invitation; client must choose, never auto publication.
insert into public.orders(id,client_id,service_id,description,address,mode,status,scheduled_at,estimated_duration_minutes)
values(pg_temp.fixture('choice'),pg_temp.fixture('client'),current_setting('test.service')::bigint,'Other need','Other city','scheduled','completed',current_setting('test.anchor')::timestamptz-interval '1 day',60);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select set_config('test.choice_plan',(public.create_recurring_plan(pg_temp.fixture('choice'),'weekly')).id::text,true);
reset role;
update public.recurring_service_plans set preferred_professional_id=gen_random_uuid() where id=current_setting('test.choice_plan')::uuid;
select pg_temp.check_true((private.generate_due_recurring_orders()->>'generated')::int=1,'invalid preference does not break generation');
select set_config('test.choice_visit',(select id::text from public.orders where recurring_plan_id=current_setting('test.choice_plan')::uuid and id<>pg_temp.fixture('choice')),true);
select pg_temp.check_true((select manual_response_status='awaiting_client_choice' and assignment_mode='manual' and professional_id is null
 and preferred_professional_id is null and manual_requested_professional_id is null and manual_response_deadline_at is null and manual_requested_at is null
 from public.orders where id=current_setting('test.choice_visit')::uuid),'no fictitious invite rejection expiration or deadline');
select pg_temp.check_true((select status='active' from public.recurring_service_plans where id=current_setting('test.choice_plan')::uuid),'invalid preferred keeps plan active');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('pro')::text,true);
select pg_temp.check_true(not exists(select 1 from public.list_professional_opportunities() where id=current_setting('test.choice_visit')::uuid),'awaiting hidden from opportunities');
select pg_temp.check_true(not exists(select 1 from public.orders where id=current_setting('test.choice_visit')::uuid),'awaiting hidden by direct RLS');
select pg_temp.denied(format('select public.accept_order(%L)',current_setting('test.choice_visit')),'professional cannot accept awaiting Order');
select pg_temp.denied(format('select public.fallback_manual_order_to_auto(%L)',current_setting('test.choice_visit')),'professional cannot publish awaiting Order');
select set_config('request.jwt.claim.sub',pg_temp.fixture('stranger')::text,true);
select pg_temp.denied(format('select public.choose_manual_order_professional(%L,%L)',current_setting('test.choice_visit'),pg_temp.fixture('pro')),'stranger cannot choose pro');
select pg_temp.denied(format('select public.fallback_manual_order_to_auto(%L)',current_setting('test.choice_visit')),'stranger cannot publish');
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select public.choose_manual_order_professional(current_setting('test.choice_visit')::uuid,pg_temp.fixture('pro'));
select pg_temp.check_true((select manual_response_status='pending' and manual_response_deadline_at is not null from public.orders where id=current_setting('test.choice_visit')::uuid),'client choice creates real pending');
reset role;
-- Separate branch from same awaiting state, preserving test transaction isolation.
update public.orders set preferred_professional_id=null,manual_requested_professional_id=null,manual_requested_at=null,
manual_response_deadline_at=null,manual_responded_at=null,manual_response_status='awaiting_client_choice'
where id=current_setting('test.choice_visit')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select public.fallback_manual_order_to_auto(current_setting('test.choice_visit')::uuid);
select pg_temp.check_true((select assignment_mode='auto' and mode='scheduled' and manual_response_status is null from public.orders where id=current_setting('test.choice_visit')::uuid),'explicit search enables scheduled opportunities');
select set_config('request.jwt.claim.sub',pg_temp.fixture('pro')::text,true);
select pg_temp.check_true(exists(select 1 from public.list_professional_opportunities() where id=current_setting('test.choice_visit')::uuid),'compatible professional sees scheduled opportunity after choice');
reset role;
select pg_temp.check_true(not exists(select 1 from public.order_match_candidates where order_id=current_setting('test.choice_visit')::uuid),'scheduled fallback never creates rounds');
select pg_temp.check_true(not has_function_privilege('authenticated','private.generate_due_recurring_orders()','EXECUTE'),'generator private grant remains denied');
select pg_temp.check_true(not has_function_privilege('anon','public.create_recurring_plan(uuid,text)','EXECUTE'),'anon execute denied');
select pg_temp.check_true(not exists(select 1 from information_schema.columns where table_name='recurring_service_plans' and column_name in ('agreed_price','contract_snapshot','payment_id','complaint_id','rating')),'no plan contract payment complaint or rating');


-- Backlog recovery, failure detection, admin authorization and common workflow regressions.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select pg_temp.denied('select public.list_admin_recurring_plans()','non-admin cannot inspect other plans');
select public.cancel_order(current_setting('test.choice_visit')::uuid,'service_no_longer_needed',null);
select pg_temp.check_true((select status='cancelled' from public.orders where id=current_setting('test.choice_visit')::uuid),'NORM009 cancels one occurrence');
select pg_temp.check_true((select status='active' from public.recurring_service_plans where id=current_setting('test.choice_plan')::uuid),'cancelling one Order preserves plan');
select set_config('request.jwt.claim.sub',pg_temp.fixture('admin')::text,true);
select pg_temp.check_true(jsonb_array_length(public.list_admin_recurring_plans())>=2,'authorized admin sees recurring operations');
reset role;
insert into public.orders(id,client_id,service_id,description,address,mode,status,scheduled_at,estimated_duration_minutes)
values(pg_temp.fixture('backlog'),pg_temp.fixture('client'),current_setting('test.service')::bigint,'Old need','Test city','scheduled','completed','2020-01-01 12:00-03',60);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select set_config('test.backlog_plan',(public.create_recurring_plan(pg_temp.fixture('backlog'),'weekly')).id::text,true);
select public.update_recurring_plan(current_setting('test.backlog_plan')::uuid,'{"frequency":"monthly"}');
select pg_temp.check_true((select frequency='monthly' from public.recurring_service_plans where id=current_setting('test.backlog_plan')::uuid),'monthly plan supported');
select public.update_recurring_plan(current_setting('test.backlog_plan')::uuid,'{"frequency":"weekly"}');
select pg_temp.denied(format('select public.update_recurring_plan(%L,%L::jsonb)',current_setting('test.backlog_plan'),'{"frequency":"custom"}'),'unsupported recurrence rule rejected');
select pg_temp.denied(format('select public.update_recurring_plan(%L,%L::jsonb)',current_setting('test.backlog_plan'),'{"estimated_duration_minutes":-1}'),'invalid duration rejected');
select pg_temp.denied(format('select public.update_recurring_plan(%L,%L::jsonb)',current_setting('test.backlog_plan'),'{"client_id":"00000000-0000-0000-0000-000000000000"}'),'cannot reassign plan identity');
reset role;
update public.recurring_service_plans set next_scheduled_at='2020-01-01 12:00-03' where id=current_setting('test.backlog_plan')::uuid;
update public.services set supports_recurring=false where id=current_setting('test.service')::bigint;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check_true((private.generate_due_recurring_orders()->>'failed')::int>=1,'system failure detected without a user session');
select pg_temp.check_true((select generation_error is not null from public.recurring_service_plans where id=current_setting('test.backlog_plan')::uuid),'generation failure persisted safely');
update public.services set supports_recurring=true where id=current_setting('test.service')::bigint;
update public.recurring_service_plans set last_generation_attempt_at=null where id=current_setting('test.backlog_plan')::uuid;
select pg_temp.check_true((private.generate_due_recurring_orders()->>'generated')::int=1,'system retries with no auth session');
select pg_temp.check_true((select count(*)=1 and min(scheduled_at)>now() from public.orders where recurring_plan_id=current_setting('test.backlog_plan')::uuid and id<>pg_temp.fixture('backlog')),'years of backlog generate only one future visit');
select pg_temp.check_true((select generation_error is null from public.recurring_service_plans where id=current_setting('test.backlog_plan')::uuid),'success clears operational error');
select pg_temp.check_true((select count(*)=0 from public.payments where order_id in (select id from public.orders where recurring_plan_id=current_setting('test.backlog_plan')::uuid)),'generation does not create Payment');
select pg_temp.check_true((select count(*)=0 from public.complaints where order_id in (select id from public.orders where recurring_plan_id=current_setting('test.backlog_plan')::uuid)),'generation does not create complaint');
select pg_temp.check_true((select count(*)=0 from public.ratings where order_id in (select id from public.orders where recurring_plan_id=current_setting('test.backlog_plan')::uuid)),'generation does not create rating');
select pg_temp.check_true((select count(*)=1 from public.notifications where order_id=current_setting('test.choice_visit')::uuid
 and title='Nueva visita programada'),'occurrence notification exactly once');
-- Switching to auto for Ahora continues to invoke NORM006, unlike Programar.
update public.profiles set is_available=true where id=pg_temp.fixture('pro');
insert into public.orders(id,client_id,service_id,description,address,mode,status,assignment_mode,manual_response_status)
values(pg_temp.fixture('immediate'),pg_temp.fixture('client'),current_setting('test.service')::bigint,
'Immediate need','Test city','immediate','open','manual','awaiting_client_choice');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select public.fallback_manual_order_to_auto(pg_temp.fixture('immediate'));
reset role;
select pg_temp.check_true((select matching_current_round=1 and matching_status='round_pending' from public.orders where id=pg_temp.fixture('immediate')),'Ahora explicit fallback starts NORM006 round one');
select pg_temp.check_true(exists(select 1 from public.order_match_candidates where order_id=pg_temp.fixture('immediate')),'Ahora still creates actual matching candidates');
-- Legacy manual rejected/expired paths remain valid.
update public.orders set assignment_mode='manual',preferred_professional_id=pg_temp.fixture('pro'),
 manual_requested_professional_id=pg_temp.fixture('pro'),manual_response_status='rejected'
where id=current_setting('test.choice_visit')::uuid;
-- Fixture gets a fresh open state only for testing existing manual transitions.
update public.orders set status='scheduled_open' where id=current_setting('test.choice_visit')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select public.choose_manual_order_professional(current_setting('test.choice_visit')::uuid,pg_temp.fixture('pro'));
select pg_temp.check_true((select manual_response_status='pending' from public.orders where id=current_setting('test.choice_visit')::uuid),'NORM007 rejected can choose another');
reset role;
update public.orders set manual_response_status='expired' where id=current_setting('test.choice_visit')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture('client')::text,true);
select public.fallback_manual_order_to_auto(current_setting('test.choice_visit')::uuid);
select pg_temp.check_true((select assignment_mode='auto' from public.orders where id=current_setting('test.choice_visit')::uuid),'NORM007 expired can enable search');
reset role;

select count(*) as passed,jsonb_agg(label) as checks from recurring_test_results;
rollback;
