-- WORKROOM-001 live role smoke. Entire fixture is rolled back.
begin;
create temporary table wr_ids(name text primary key, id uuid default gen_random_uuid());
insert into wr_ids(name) values ('client'),('pro_a'),('pro_b'),('stranger'),('admin'),('order'),('quote_order'),('proposal_a'),('proposal_b');
create temporary table wr_results(label text);
grant select on wr_ids to authenticated, anon;
grant select, insert on wr_results to authenticated, anon;
create function pg_temp.id(n text) returns uuid language sql as $$select id from wr_ids where name=n$$;
create function pg_temp.ok(value boolean, label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',label; end if; insert into wr_results values(label); end$$;
create function pg_temp.denied(q text, label text) returns void language plpgsql as $$declare blocked boolean:=false;begin begin execute q; exception when others then blocked:=true; end; perform pg_temp.ok(blocked,label);end$$;

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,'workroom-rollback-'||name||'@example.invalid','{}','{}' from wr_ids where name in ('client','pro_a','pro_b','stranger','admin');
update public.profiles p set full_name='WR '||i.name, role=case when i.name like 'pro_%' then 'professional' when i.name='admin' then 'admin' else 'client' end,
  is_available=case when i.name like 'pro_%' then true else p.is_available end,
  lat=case when i.name like 'pro_%' then -38.0 else p.lat end,
  lng=case when i.name like 'pro_%' then -57.55 else p.lng end
from wr_ids i where p.id=i.id;
select set_config('request.jwt.claim.sub',pg_temp.id('admin')::text,true);
insert into public.services(slug,name) values('workroom-rollback-'||pg_temp.id('order'),'WR Service');
insert into public.professional_profiles(professional_id,verified,service_radius_km,work_days,work_starts_at,work_ends_at)
select id,true,20,array['Lun','Mar','Mie','Jue','Vie','Sab','Dom'],'00:00','23:59' from wr_ids where name in ('pro_a','pro_b');
insert into public.professional_services(professional_id,service_id,price_from)
select p.id,s.id,100 from wr_ids p cross join public.services s
where p.name in ('pro_a','pro_b') and s.slug='workroom-rollback-'||pg_temp.id('order');
insert into public.professional_service_locations(professional_id,location_id)
select id,'ar-ba-mar-del-plata' from wr_ids where name in ('pro_a','pro_b');

insert into public.orders(id,client_id,professional_id,service_id,description,address,location_id,client_lat,client_lng,mode,status,agreed_price,agreed_scope,contracted_at,start_pin,end_pin)
select pg_temp.id('order'),pg_temp.id('client'),pg_temp.id('pro_a'),id,'Need','Private address','ar-ba-mar-del-plata',-38.0,-57.55,'immediate','accepted',100,'Agreed',now(),'1234','5678'
from public.services where slug='workroom-rollback-'||pg_temp.id('order');
select pg_temp.ok((select count(*)=1 from public.workrooms where order_id=pg_temp.id('order') and phase='contracted'),'contract creates one workroom');

insert into public.orders(id,client_id,service_id,description,address,location_id,mode,status)
select pg_temp.id('quote_order'),pg_temp.id('client'),id,'Quote need','Private address','ar-ba-mar-del-plata','quote','waiting_quotes'
from public.services where slug='workroom-rollback-'||pg_temp.id('order');
insert into public.order_proposals(id,order_id,professional_id,labor_price,materials_price,visit_price,manito_fee,estimated_minutes,availability_label,observation,status,valid_until)
values
  (pg_temp.id('proposal_a'),pg_temp.id('quote_order'),pg_temp.id('pro_a'),80,10,10,0,60,'Mañana','A scope','sent',now()+interval '1 day'),
  (pg_temp.id('proposal_b'),pg_temp.id('quote_order'),pg_temp.id('pro_b'),90,10,10,0,60,'Mañana','B scope','sent',now()+interval '1 day');
select pg_temp.ok((select count(*)=2 from public.workrooms where order_id=pg_temp.id('quote_order') and phase='precontractual'),'one isolated room per proposal');
select set_config('test.quote_room_a',(select id::text from public.workrooms where proposal_id=pg_temp.id('proposal_a')),true);
select set_config('test.quote_room_b',(select id::text from public.workrooms where proposal_id=pg_temp.id('proposal_b')),true);

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('pro_a')::text,true);
select pg_temp.ok(jsonb_array_length(public.list_my_workrooms())=2,'pro A sees contracted and own quote room');
select set_config('test.room',(select id::text from public.workrooms where order_id=pg_temp.id('order')),true);
select public.send_workroom_message(current_setting('test.room')::uuid,'Hola','text',null,null,gen_random_uuid());
select pg_temp.ok(jsonb_array_length(public.list_workroom_timeline(current_setting('test.room')::uuid)->'items')>=2,'participant sees message and derived contract event');
select pg_temp.ok((public.get_workroom_order(current_setting('test.room')::uuid) ? 'start_pin') is false,'workroom order omits start PIN');
select pg_temp.ok((public.get_workroom_order(current_setting('test.room')::uuid) ? 'end_pin') is false,'workroom order omits end PIN');
select pg_temp.denied(format('select public.list_workroom_timeline(%L)',current_setting('test.quote_room_b')),'proposal professional cannot read another proposal room');
insert into storage.objects(bucket_id,name,owner) values('manito-workroom',current_setting('test.room')||'/'||pg_temp.id('pro_a')||'/photo.jpg',pg_temp.id('pro_a'));

select set_config('request.jwt.claim.sub',pg_temp.id('client')::text,true);
select pg_temp.ok((select (item->>'unread_count')::integer=1 from jsonb_array_elements(public.list_my_workrooms()) item where item->>'id'=current_setting('test.room')),'recipient has one unread message');
select public.mark_workroom_read(current_setting('test.room')::uuid);
select pg_temp.ok((select (item->>'unread_count')::integer=0 from jsonb_array_elements(public.list_my_workrooms()) item where item->>'id'=current_setting('test.room')),'opening exact room clears only its unread count');
select pg_temp.ok(exists(select 1 from storage.objects where bucket_id='manito-workroom' and name=current_setting('test.room')||'/'||pg_temp.id('pro_a')||'/photo.jpg'),'client can read private room photo');
select public.accept_proposal(pg_temp.id('proposal_a'));
select pg_temp.ok((select phase='contracted' and status='open' from public.workrooms where id=current_setting('test.quote_room_a')::uuid),'winning proposal keeps the same room as contracted workroom');
select pg_temp.ok((select status='read_only' from public.workrooms where id=current_setting('test.quote_room_b')::uuid),'losing proposal room becomes read only');

select set_config('request.jwt.claim.sub',pg_temp.id('pro_b')::text,true);
select pg_temp.denied(format('select public.list_workroom_timeline(%L)',current_setting('test.room')),'other professional denied contracted room');
select pg_temp.denied(format('select public.send_workroom_message(%L,%L)',current_setting('test.room'),'Nope'),'other professional cannot send');
select pg_temp.denied(format('select public.list_workroom_timeline(%L)',current_setting('test.quote_room_a')),'second proposal professional cannot read first proposal room');
select pg_temp.denied(format('select public.send_workroom_message(%L,%L)',current_setting('test.quote_room_b'),'Late message'),'losing proposal room rejects new messages');

select set_config('request.jwt.claim.sub',pg_temp.id('stranger')::text,true);
select pg_temp.ok(jsonb_array_length(public.list_my_workrooms())=0,'stranger lists no rooms');
select pg_temp.denied(format('select public.get_workroom_order(%L)',current_setting('test.room')),'stranger denied safe order payload');
select pg_temp.ok(not exists(select 1 from storage.objects where bucket_id='manito-workroom' and name=current_setting('test.room')||'/'||pg_temp.id('pro_a')||'/photo.jpg'),'stranger cannot read private room photo');

set local role anon;
select pg_temp.denied('select public.list_my_workrooms()','anon cannot list rooms');
reset role;
select pg_temp.ok(not has_function_privilege('anon','public.list_workroom_timeline(uuid,timestamptz,integer)','EXECUTE'),'anon has no timeline execute');
select pg_temp.ok(not has_function_privilege('anon','public.send_workroom_message(uuid,text,text,text,text,uuid)','EXECUTE'),'anon has no send execute');
select pg_temp.ok((select count(*)=3 from pg_publication_tables where pubname='supabase_realtime' and tablename in ('messages','workrooms','workroom_reads')),'workroom realtime tables published');
select count(*) as passed, jsonb_agg(label) as checks from wr_results;
rollback;
