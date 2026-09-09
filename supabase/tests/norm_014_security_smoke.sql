-- Real PostgreSQL role tests, always rolled back. No permanent fixture users.
begin;
create temporary table n14_ids(name text primary key,id uuid default gen_random_uuid());
insert into n14_ids(name) values('client'),('pro'),('stranger'),('admin'),('order'),('recovery');
create temporary table n14_results(label text);
grant select on n14_ids to authenticated,anon;
grant select,insert on n14_results to authenticated,anon;
create function pg_temp.id(n text) returns uuid language sql as $$select id from n14_ids where name=n$$;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$begin
  if ok is distinct from true then raise exception 'FAILED: %',label;end if;
  insert into n14_results values(label);
end$$;
create function pg_temp.denied(q text,label text) returns void language plpgsql as $$declare failed boolean:=false;begin
  begin execute q;exception when others then failed:=true;end;
  perform pg_temp.check_true(failed,label);
end$$;

select pg_temp.check_true(not has_column_privilege('authenticated','public.orders','start_pin','SELECT'),'start PIN column denied');
select pg_temp.check_true(not has_column_privilege('authenticated','public.orders','end_pin','SELECT'),'end PIN column denied');
select pg_temp.check_true(not exists(select 1 from pg_attribute a where a.attrelid='public.orders'::regclass and a.attnum>0 and not a.attisdropped and a.attname not in ('start_pin','end_pin') and not has_column_privilege('authenticated','public.orders',a.attname,'SELECT')),'all normal order columns readable through RLS');
select pg_temp.check_true(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')),'no anonymous SECURITY DEFINER endpoints');
select pg_temp.check_true(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.prosecdef and not exists(select 1 from unnest(p.proconfig) c where c like 'search_path=%')),'all SECURITY DEFINER search paths explicit');
select pg_temp.check_true(not has_schema_privilege('authenticated','public','CREATE') and not has_schema_privilege('anon','public','CREATE'),'public search paths not user writable');
select pg_temp.check_true(not has_function_privilege('authenticated','private.current_commercial_policy()','EXECUTE'),'commercial helper remains private');
select pg_temp.check_true(not has_function_privilege('authenticated','private.propose_order_extra_impl(uuid,text,numeric)','EXECUTE'),'extra implementation remains private');
select pg_temp.check_true((select count(*)=3 from pg_publication_tables where pubname='supabase_realtime' and tablename in ('order_proposals','order_extras','order_photos')),'detail tables published');

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,'norm014-rollback-'||id||'@example.invalid','{}','{}' from n14_ids where name<>'order';
update public.profiles p set full_name='NORM014 rollback',role=case i.name when 'admin' then 'admin' when 'pro' then 'professional' else 'client' end from n14_ids i where i.id=p.id;
insert into public.services(slug,name,requires_completion_evidence) values('norm014-rollback-'||pg_temp.id('order'),'NORM014 rollback',true);
insert into public.orders(id,client_id,professional_id,service_id,description,address,mode,status,agreed_price,agreed_scope,contracted_at,start_pin,end_pin)
select pg_temp.id('order'),pg_temp.id('client'),pg_temp.id('pro'),id,'Need','Private address','immediate','trabajando',100,'Agreed',now(),'1234','5678' from public.services where slug='norm014-rollback-'||pg_temp.id('order');
delete from public.profiles where id=pg_temp.id('recovery');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('recovery')::text,true);
select pg_temp.denied('select public.get_my_profile()','missing profile explicitly reported');
select public.complete_profile('NORM014 recovered','client',null,'Test');
select pg_temp.check_true((public.get_my_profile()).id=pg_temp.id('recovery'),'safe profile recovery works');
select public.complete_profile('NORM014 recovered','client',null,'Test');
select pg_temp.check_true((select count(*)=1 from public.profiles where id=auth.uid()),'recovery idempotent');
select pg_temp.denied($q$select public.complete_profile('NORM014','admin',null,null)$q$,'cannot recover as admin');
select set_config('request.jwt.claim.sub',pg_temp.id('stranger')::text,true);
select pg_temp.check_true(not exists(select 1 from public.orders where id=pg_temp.id('order')),'stranger order hidden');
select pg_temp.denied(format('select public.propose_order_extra(%L,%L,5)',pg_temp.id('order'),'Invalid'),'stranger cannot propose extra');
select set_config('request.jwt.claim.sub',pg_temp.id('client')::text,true);
select pg_temp.denied(format('select public.propose_order_extra(%L,%L,5)',pg_temp.id('order'),'Invalid'),'client cannot propose professional extra');
select pg_temp.check_true((select pin_value='5678' from public.get_order_pin(pg_temp.id('order'))),'owner gets current stage PIN');
select set_config('request.jwt.claim.sub',pg_temp.id('pro')::text,true);
select pg_temp.check_true(not exists(select 1 from public.get_order_pin(pg_temp.id('order'))),'assigned RPC never returns PIN');
select set_config('test.extra',(public.propose_order_extra(pg_temp.id('order'),'Repair',25)).id::text,true);
select pg_temp.denied(format('select public.decide_order_extra(%L,%L)',current_setting('test.extra'),'approved'),'professional cannot approve own extra');
select pg_temp.denied(format('select public.complete_order(%L,%L)',pg_temp.id('order'),'5678'),'mandatory final evidence enforced');
select set_config('request.jwt.claim.sub',pg_temp.id('stranger')::text,true);
select pg_temp.denied(format('select public.decide_order_extra(%L,%L)',current_setting('test.extra'),'approved'),'stranger cannot decide extra');
select set_config('request.jwt.claim.sub',pg_temp.id('client')::text,true);
select public.decide_order_extra(current_setting('test.extra')::uuid,'approved');
select pg_temp.check_true((select agreed_price=100 from public.orders where id=pg_temp.id('order')),'extra approval does not rewrite contract');
select pg_temp.denied(format('select public.decide_order_extra(%L,%L)',current_setting('test.extra'),'rejected'),'approved extra cannot be changed');
select set_config('request.jwt.claim.sub',pg_temp.id('admin')::text,true);
select pg_temp.check_true(private.is_manito_admin(),'admin can evaluate policies');
select pg_temp.check_true(not exists(select 1 from public.get_order_pin(pg_temp.id('order'))),'admin has no PIN by RPC');
reset role;
select pg_temp.check_true(private.order_service_total_amount(pg_temp.id('order'))=125,'approved extra affects service total exactly once');
select pg_temp.denied(format('update public.order_extras set amount=5 where id=%L',current_setting('test.extra')),'DB freezes approved extra even privileged writes');
set local role anon;
select pg_temp.denied(format('select public.propose_order_extra(%L,%L,5)',pg_temp.id('order'),'Invalid'),'anon cannot invoke extra API');
reset role;
select count(*) as passed,jsonb_agg(label) as checks from n14_results;
rollback;
