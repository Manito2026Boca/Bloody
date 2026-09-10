-- PREP-MATCH-001 executable SQL regression; fixtures are rolled back.
begin;
create temporary table pm_ids(name text primary key,id uuid default gen_random_uuid());
insert into pm_ids(name) values('client'),('pro'),('other'),('admin');
create temporary table pm_results(label text);
create function pg_temp.pm_id(n text) returns uuid language sql as $$select id from pm_ids where name=n$$;
create function pg_temp.pm_ok(b boolean,label text) returns void language plpgsql as $$
begin if b is distinct from true then raise exception 'FAILED %',label; end if;
insert into pm_results values(label); end $$;
create function pg_temp.pm_denied(q text,label text) returns void language plpgsql as $$
declare failed boolean:=false; begin begin execute q; exception when others then failed:=true; end;
perform pg_temp.pm_ok(failed,label); end $$;
grant select on pm_ids to authenticated,anon;
grant select,insert on pm_results to authenticated,anon;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,'prep-match-'||id||'@example.invalid','{}','{}' from pm_ids;
update public.profiles p set role=case i.name when 'admin' then 'admin' when 'client' then 'client' else 'professional' end,
 is_available=true,lat=-38,lng=-57.55 from pm_ids i where i.id=p.id;
select set_config('request.jwt.claim.sub',pg_temp.pm_id('admin')::text,true);
insert into public.professional_profiles(professional_id,verified,service_radius_km,work_days,work_starts_at,work_ends_at)
select id,true,8,array['Lun','Mar','Mie','Jue','Vie','Sab','Dom'],'00:00','23:59' from pm_ids where name in ('pro','other');
insert into public.services(slug,name,base_price,allow_immediate,allow_scheduled,allow_quote,supports_recurring,requires_completion_evidence)
values('prep-match-'||pg_temp.pm_id('client'),'Rollback fixture',1000,true,true,true,true,false);
insert into public.specialties(service_id,name) select id,'Fixture specialty' from public.services where slug='prep-match-'||pg_temp.pm_id('client');
insert into public.professional_services(professional_id,service_id,price_from)
select p.id,s.id,1000 from pm_ids p cross join public.services s
 where p.name in ('pro','other') and s.slug='prep-match-'||pg_temp.pm_id('client');
insert into public.professional_specialties(professional_id,service_id,specialty_id)
select pg_temp.pm_id('pro'),s.service_id,s.id from public.specialties s join public.services v on v.id=s.service_id
 where v.slug='prep-match-'||pg_temp.pm_id('client');
insert into public.professional_service_locations values(pg_temp.pm_id('pro'),'ar-ba-mar-del-plata');

do $$
declare o public.orders; q public.orders; proposal uuid; sid bigint; spid bigint; plan public.recurring_service_plans;
begin
 select id into sid from public.services where slug='prep-match-'||pg_temp.pm_id('client');
 select id into spid from public.specialties where service_id=sid;
 o.client_id:=pg_temp.pm_id('client'); o.service_id:=sid; o.mode:='quote'; o.assignment_mode:='auto';
 o.client_lat:=-38; o.client_lng:=-57.55;
 perform pg_temp.pm_ok(private.order_professional_eligible(o,pg_temp.pm_id('pro')),'GPS inside radius');
 o.client_lat:=-34;
 o.location_id:='ar-ba-mar-del-plata';
 perform pg_temp.pm_ok(not private.order_professional_eligible(o,pg_temp.pm_id('pro')),'GPS outside radius cannot fall back to city');
 o.client_lat:=null; o.client_lng:=null;
 perform pg_temp.pm_ok(private.order_professional_eligible(o,pg_temp.pm_id('pro')),'manual covered locality');
 perform pg_temp.pm_ok(not private.order_professional_eligible(o,pg_temp.pm_id('other')),'manual uncovered locality');
 o.location_id:='ar-ba-tres-arroyos';
 perform pg_temp.pm_ok(not private.order_professional_eligible(o,pg_temp.pm_id('pro')),'different locality denied');
 o.location_id:=null;
 perform pg_temp.pm_ok(not private.order_professional_eligible(o,pg_temp.pm_id('pro')),'NULL distance and no location denied');
 o.location_id:='ar-ba-mar-del-plata'; o.required_specialty_id:=spid;
 perform pg_temp.pm_ok(private.order_professional_eligible(o,pg_temp.pm_id('pro')),'explicit specialty supported');
 o.client_lat:=-38; o.client_lng:=-57.55;
 perform pg_temp.pm_ok(not private.order_professional_eligible(o,pg_temp.pm_id('other')),'explicit specialty missing');
 o.required_specialty_id:=null; o.description:='Fixture specialty';
 perform pg_temp.pm_ok(private.order_professional_eligible(o,pg_temp.pm_id('other')),'text does not require specialty');
 o.mode:='immediate';
 update public.profiles set is_available=false where id=pg_temp.pm_id('pro');
 perform pg_temp.pm_ok(not private.order_professional_eligible(o,pg_temp.pm_id('pro')),'immediate availability enforced');
 update public.profiles set is_available=true where id=pg_temp.pm_id('pro');
 o.mode:='scheduled'; o.scheduled_at:=(current_date+2)+time '15:00'; o.estimated_duration_minutes:=60;
 perform pg_temp.pm_ok(private.order_professional_eligible(o,pg_temp.pm_id('pro')),'scheduled workday supported');
 update public.professional_profiles set work_starts_at='20:00',work_ends_at='22:00' where professional_id=pg_temp.pm_id('pro');
 perform pg_temp.pm_ok(not private.order_professional_eligible(o,pg_temp.pm_id('pro')),'scheduled outside workday denied');
 update public.professional_profiles set work_starts_at='00:00',work_ends_at='23:59' where professional_id=pg_temp.pm_id('pro');
 o.assignment_mode:='manual'; o.preferred_professional_id:=pg_temp.pm_id('pro');
 perform pg_temp.pm_ok(not private.order_professional_eligible(o,pg_temp.pm_id('other')),'manual target preserved');

 perform set_config('request.jwt.claim.sub',pg_temp.pm_id('client')::text,true);
 insert into public.orders(client_id,service_id,description,address,mode,status,location_id,required_specialty_id)
 values(o.client_id,sid,'Fixture specialty','Private address','quote','waiting_quotes','ar-ba-mar-del-plata',spid) returning * into q;
 perform pg_temp.pm_ok(q.required_specialty_id=spid,'explicit selection stored');
 perform set_config('request.jwt.claim.sub',pg_temp.pm_id('other')::text,true);
 perform pg_temp.pm_denied(format('select public.send_order_proposal(%L,1000,0,0,0,60,%L,%L,null)',q.id,'Tomorrow','Work'),'uncovered or unspecialized quote denied');
 perform set_config('request.jwt.claim.sub',pg_temp.pm_id('pro')::text,true);
 select (public.send_order_proposal(q.id,1000,0,0,0,60,'Tomorrow','Work',null)).id into proposal;
 perform pg_temp.pm_ok(proposal is not null,'eligible quote allowed');
 perform pg_temp.pm_ok(exists(select 1 from public.list_professional_opportunities() x where x.id=q.id),'eligible opportunity visible');
 perform pg_temp.pm_ok(not exists(select 1 from public.list_professional_opportunities() x where x.id=q.id and (x.client_lat is not null or x.client_lng is not null)),'preaccept coordinates hidden');
 delete from public.professional_service_locations where professional_id=pg_temp.pm_id('pro');
 perform set_config('request.jwt.claim.sub',pg_temp.pm_id('client')::text,true);
 perform pg_temp.pm_denied(format('select public.accept_proposal(%L)',proposal),'accept proposal rechecks coverage');
 insert into public.professional_service_locations values(pg_temp.pm_id('pro'),'ar-ba-mar-del-plata');
 perform public.accept_proposal(proposal);
 select * into q from public.orders where id=q.id;
 perform pg_temp.pm_ok(q.agreed_price=1000 and q.accepted_proposal_id=proposal,'contract preserved');
 perform pg_temp.pm_denied(format('update public.orders set required_specialty_id=null where id=%L',q.id),'contract requirement immutable');

 select * into q from jsonb_populate_record(null::public.orders,public.create_scheduled_order(jsonb_build_object(
 'service_id',sid,'description','Scheduled work','address','Private address','scheduled_at',(current_date+3)+time '15:00',
 'estimated_duration_minutes',60,'location_id','ar-ba-mar-del-plata','required_specialty_id',spid)));
 perform pg_temp.pm_ok(q.required_specialty_id=spid and q.location_id='ar-ba-mar-del-plata','scheduled preserves requirements');
 plan:=public.create_recurring_plan(q.id,'weekly');
 perform pg_temp.pm_ok(plan.required_specialty_id=spid and plan.location_id=q.location_id,'recurring plan preserves requirements');
 perform public.cancel_order(q.id,'service_no_longer_needed',null);
 update public.recurring_service_plans set next_scheduled_at=(current_date+5)+time '15:00' where id=plan.id;
 perform private.generate_due_recurring_orders();
 perform pg_temp.pm_ok(exists(select 1 from public.orders x where x.recurring_plan_id=plan.id and x.id<>q.id
   and x.required_specialty_id=spid and x.location_id='ar-ba-mar-del-plata'),'generated recurrence retains requirements');
 perform pg_temp.pm_denied(format('insert into public.orders(client_id,service_id,description,address,mode,status) values(%L,%s,%L,%L,%L,%L)',
   o.client_id,sid,'No location','Private','quote','waiting_quotes'),'new request without sufficient location denied');
 insert into public.orders(client_id,service_id,description,address,mode,status,location_id,required_specialty_id)
 values(o.client_id,sid,'Immediate','Private','immediate','open','ar-ba-mar-del-plata',spid) returning * into q;
 perform pg_temp.pm_ok(exists(select 1 from public.order_match_candidates c where c.order_id=q.id and c.professional_id=pg_temp.pm_id('pro')),'round invites eligible professional');
 perform pg_temp.pm_ok(not exists(select 1 from public.order_match_candidates c where c.order_id=q.id and c.professional_id=pg_temp.pm_id('other')),'round excludes incompatible professional');
 perform set_config('request.jwt.claim.sub',pg_temp.pm_id('pro')::text,true);
 perform public.accept_order(q.id);
 perform pg_temp.pm_ok((select professional_id=pg_temp.pm_id('pro') from public.orders where id=q.id),'eligible round acceptance');
 perform set_config('request.jwt.claim.sub',pg_temp.pm_id('other')::text,true);
 perform pg_temp.pm_denied(format('select public.accept_order(%L)',q.id),'second professional cannot replace assignee');
 perform pg_temp.pm_ok(not private.match_coordinates_valid('NaN'::float8,0),'NaN coordinates denied');
 perform pg_temp.pm_ok(private.match_coordinates_valid(0,0),'coordinate zero valid');
 perform pg_temp.pm_ok(not has_function_privilege('authenticated','private.order_professional_eligible(public.orders,uuid)','EXECUTE'),'eligibility helper private');
 perform pg_temp.pm_ok(not has_table_privilege('authenticated','public.service_locations','INSERT'),'catalog not client editable');
 perform pg_temp.pm_ok(not has_function_privilege('anon','public.list_eligible_request_professionals(jsonb)','EXECUTE'),'anon preview denied');
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.pm_id('other')::text,true);
select pg_temp.pm_denied(format('insert into public.professional_service_locations values(%L,%L)',pg_temp.pm_id('pro'),'ar-ba-tres-arroyos'),'cannot change another professional coverage');

reset role;
select count(*) passed,jsonb_agg(label) checks from pm_results;
rollback;
