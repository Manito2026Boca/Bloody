-- PREP001 real role and failure-path tests; all fixtures roll back.
begin;
create temporary table p1_ids(name text primary key,id uuid default gen_random_uuid());
insert into p1_ids(name) values('client'),('pro'),('other'),('admin'),('order'),('legacy');
create temporary table p1_results(label text);
grant select on p1_ids to authenticated,anon;
grant select,insert on p1_results to authenticated,anon;
create function pg_temp.id(n text) returns uuid language sql as $$select id from p1_ids where name=n$$;
create function pg_temp.ok(b boolean,label text) returns void language plpgsql as $$begin
 if b is distinct from true then raise exception 'FAILED %',label;end if;
 insert into p1_results values(label);
end$$;
create function pg_temp.denied(q text,label text) returns void language plpgsql as $$declare failed boolean:=false;begin
 begin execute q; exception when others then failed:=true; end;
 perform pg_temp.ok(failed,label);
end$$;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,'prep001-'||id||'@example.invalid','{}','{}' from p1_ids where name in('client','pro','other','admin');
update public.profiles p set role=case i.name when 'pro' then 'professional' when 'other' then 'professional' when 'admin' then 'admin' else 'client' end
from p1_ids i where i.id=p.id;
select set_config('request.jwt.claim.sub',pg_temp.id('admin')::text,true);
insert into public.professional_profiles(professional_id,verified) values(pg_temp.id('pro'),true);
insert into public.services(slug,name,requires_completion_evidence) values('prep001-'||pg_temp.id('order'),'PREP001 rollback',false);
insert into public.orders(id,client_id,professional_id,service_id,status,mode,description,address,start_pin,end_pin)
select pg_temp.id('order'),pg_temp.id('client'),pg_temp.id('pro'),id,'en_sitio','immediate','Need','Private','1234','5678' from public.services where slug='prep001-'||pg_temp.id('order');
insert into public.orders(id,client_id,professional_id,service_id,status,mode,description,address)
select pg_temp.id('legacy'),pg_temp.id('client'),pg_temp.id('pro'),service_id,'accepted','quote','Legacy','Private' from public.orders where id=pg_temp.id('order');
select pg_temp.ok((select start_pin ~ '^[0-9]{4}$' and end_pin ~ '^[0-9]{4}$' from public.orders where id=pg_temp.id('legacy')),'quote/legacy assignment creates missing PIN');
select pg_temp.ok(to_regprocedure('private.start_order_impl(uuid,text)') is null and to_regprocedure('private.complete_order_impl(uuid,text)') is null,'no alternate unlimited implementation');
select pg_temp.ok(not has_function_privilege('authenticated','private.attempt_order_pin(uuid,text,text)','EXECUTE'),'private validator denied');
select pg_temp.ok(not has_table_privilege('authenticated','private.order_pin_challenges','UPDATE'),'counter mutation denied');
select pg_temp.ok(not has_table_privilege('authenticated','private.order_pin_events','SELECT'),'events private');
select pg_temp.ok(not exists(select 1 from pg_publication_tables where schemaname='private' and tablename like '%pin%'),'challenge tables not published');
select pg_temp.denied(format('update public.orders set client_id=%L where id=%L',pg_temp.id('pro'),pg_temp.id('order')),'same actor cannot own both sides');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('client')::text,true);
select pg_temp.denied(format('select public.start_order(%L,%L)',pg_temp.id('order'),'1234'),'client cannot execute professional transition');
select pg_temp.ok((select pin_value='1234' from public.get_order_pin(pg_temp.id('order'))),'client sees own start PIN');
select set_config('request.jwt.claim.sub',pg_temp.id('other')::text,true);
select pg_temp.denied(format('select public.start_order(%L,%L)',pg_temp.id('order'),'1234'),'stranger cannot attempt');
select set_config('request.jwt.claim.sub',pg_temp.id('admin')::text,true);
select pg_temp.ok(not exists(select 1 from public.get_order_pin(pg_temp.id('order'))),'admin does not see PIN');
select set_config('request.jwt.claim.sub',pg_temp.id('pro')::text,true);
select pg_temp.denied(format('select start_pin,end_pin from public.orders where id=%L',pg_temp.id('order')),'PIN direct read denied');
select pg_temp.denied(format('update public.orders set status=%L where id=%L','trabajando',pg_temp.id('order')),'direct transition denied');
select pg_temp.ok(not exists(select 1 from public.get_order_pin(pg_temp.id('order'))),'professional PIN RPC hidden');
select pg_temp.ok(public.start_order(pg_temp.id('order'),'0000')->>'code'='invalid_pin','wrong start returns rejection without exception');
reset role;
select pg_temp.ok((select failures=1 from private.order_pin_challenges where order_id=pg_temp.id('order') and stage='start'),'failed attempt persisted in outer transaction');
-- A later, caught unrelated error must not rewind the earlier increment.
do $$begin begin perform 1/0; exception when division_by_zero then null; end; end$$;
select pg_temp.ok((select failures=1 from private.order_pin_challenges where order_id=pg_temp.id('order') and stage='start'),'caught unrelated exception does not erase attempt');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('pro')::text,true);
select public.start_order(pg_temp.id('order'),'bad') from generate_series(1,3);
select pg_temp.ok(public.start_order(pg_temp.id('order'),'bad')->>'code'='cooldown','fifth failure blocks');
select pg_temp.ok(public.start_order(pg_temp.id('order'),'1234')->>'code'='cooldown','correct PIN cannot bypass active cooldown');
select pg_temp.ok((select status='en_sitio' from public.orders where id=pg_temp.id('order')),'incorrect PIN never advances');
reset role;
select pg_temp.ok((select failures=5 and lockouts=1 and blocked_requests=1 from private.order_pin_challenges where order_id=pg_temp.id('order') and stage='start'),'cooldown state exact');
update private.order_pin_challenges set blocked_until=clock_timestamp()-interval '1 second' where order_id=pg_temp.id('order') and stage='start';
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('pro')::text,true);
select public.start_order(pg_temp.id('order'),'bad') from generate_series(1,4);
select pg_temp.ok((public.start_order(pg_temp.id('order'),'bad')->>'retry_after_seconds')::int=3600,'repeat abuse escalates cooldown to hour');
reset role;
update private.order_pin_challenges set blocked_until=clock_timestamp()-interval '1 second' where order_id=pg_temp.id('order') and stage='start';
-- Simulate a DB trigger failure after matching a correct PIN, without losing earlier history.
create function pg_temp.fail_transition() returns trigger language plpgsql as $$begin
 if new.id=pg_temp.id('order') and new.status='trabajando' then raise exception 'Fixture transient failure';end if;return new;end$$;
create trigger prep001_fixture_error before update on public.orders for each row execute function pg_temp.fail_transition();
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('pro')::text,true);
select pg_temp.ok(public.start_order(pg_temp.id('order'),'1234')->>'code'='temporarily_unavailable','transition exception safely returned');
reset role;
select pg_temp.ok((select count(*)=1 from private.order_pin_events where order_id=pg_temp.id('order') and event='transition_error'),'transition error audit persists');
drop trigger prep001_fixture_error on public.orders;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('pro')::text,true);
select pg_temp.ok(public.start_order(pg_temp.id('order'),'1234')->>'ok'='true','correct start succeeds after expiry');
select pg_temp.ok(public.complete_order(pg_temp.id('order'),'bad')->>'code'='invalid_pin','end challenge independent');
reset role;
select pg_temp.ok((select closed_at is not null and failures=0 from private.order_pin_challenges where order_id=pg_temp.id('order') and stage='start'),'success closes start');
select pg_temp.ok((select failures=1 and lockouts=0 from private.order_pin_challenges where order_id=pg_temp.id('order') and stage='end'),'end failures separate');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('pro')::text,true);
select public.complete_order(pg_temp.id('order'),'bad') from generate_series(1,3);
select pg_temp.ok(public.complete_order(pg_temp.id('order'),'bad')->>'code'='cooldown','end fifth failure blocks independently');
select pg_temp.ok(public.complete_order(pg_temp.id('order'),'5678')->>'code'='cooldown','correct end cannot bypass cooldown');
reset role;
select pg_temp.ok((select status='trabajando' from public.orders where id=pg_temp.id('order')),'wrong final PIN preserves working state');
update private.order_pin_challenges set blocked_until=clock_timestamp()-interval '1 second' where order_id=pg_temp.id('order') and stage='end';
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('client')::text,true);
select pg_temp.ok((select pin_value='5678' from public.get_order_pin(pg_temp.id('order'))),'client sees final PIN');
select set_config('request.jwt.claim.sub',pg_temp.id('pro')::text,true);
select pg_temp.ok(public.complete_order(pg_temp.id('order'),'5678')->>'ok'='true','correct end completes');
select pg_temp.ok((select status='completed' from public.orders where id=pg_temp.id('order')),'completed state persists');
reset role;
select pg_temp.ok(not exists(select 1 from information_schema.columns where table_schema='private' and table_name='order_pin_events' and column_name ~ '(guess|value|candidate|entered|expected)'),'audit has no guess/secret column');
select pg_temp.ok((select count(*)=2 from private.order_pin_events where order_id=pg_temp.id('order') and event='success'),'success audited per challenge');
set local role anon;
select pg_temp.denied(format('select public.start_order(%L,%L)',pg_temp.id('order'),'1234'),'anon denied');
reset role;
select count(*) passed,jsonb_agg(label) checks from p1_results;
rollback;
