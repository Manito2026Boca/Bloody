// Isolated live API fixtures. Never log or commit generated credentials.
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const dir='outputs/prep-match-001';
mkdirSync(dir,{recursive:true});
const file=dir+'/fixture.json';
const mode=process.argv[2];
if(mode==='prepare'){
 assert(!existsSync(file),'Cleanup previous fixture first');
 const f={run:randomUUID(),actors:{},url:'https://taovmzxqvacrtjefgbsd.supabase.co'};
 for(const name of ['client','pro','other','admin'])f.actors[name]={id:randomUUID(),email:'pm-'+randomUUID()+'@example.invalid',password:randomBytes(32).toString('hex')};
 writeFileSync(file,JSON.stringify(f),{mode:0o600});
 const sql=['begin;'];
 for(const [name,a] of Object.entries(f.actors)){
 sql.push(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
 values('00000000-0000-0000-0000-000000000000','${a.id}','authenticated','authenticated','${a.email}',extensions.crypt('${a.password}',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"full_name":"PREP MATCH TEST"}',now(),now(),'','','','');
 insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
 values(gen_random_uuid(),'${a.id}','${a.id}','{"sub":"${a.id}","email":"${a.email}"}','email',now(),now(),now());
 update public.profiles set role='${name==='pro'||name==='other'?'professional':name}',is_available=true,lat=-38,lng=-57.55 where id='${a.id}';`);
 }
 sql.push(`select set_config('request.jwt.claim.sub','${f.actors.admin.id}',true);
 insert into public.services(slug,name,base_price,allow_immediate,allow_scheduled,allow_quote,supports_recurring,requires_completion_evidence)
 values('pm-${f.run}','PREP MATCH TEST - NO CONTRATAR',1000,true,true,true,true,false);`);
 for(const name of ['pro','other'])sql.push(`insert into public.professional_profiles(professional_id,verified,service_radius_km,work_days,work_starts_at,work_ends_at)
 values('${f.actors[name].id}',true,8,array['Lun','Mar','Mie','Jue','Vie','Sab','Dom'],'00:00','23:59');
 insert into public.professional_services(professional_id,service_id,price_from) select '${f.actors[name].id}',id,1000 from public.services where slug='pm-${f.run}';`);
 sql.push(`insert into public.specialties(service_id,name) select id,'Especialidad prueba PREP MATCH' from public.services where slug='pm-${f.run}';
 insert into public.professional_specialties(professional_id,service_id,specialty_id)
 select '${f.actors.pro.id}',service_id,id from public.specialties where service_id in(select id from public.services where slug='pm-${f.run}');`);
 sql.push('commit;');
 writeFileSync(dir+'/bootstrap.sql',sql.join('\n'),{mode:0o600});
 console.log('Fixture prepared; bootstrap is private.');
}else if(mode==='cleanup'){
 const f=JSON.parse(readFileSync(file,'utf8'));
 assert.match(f.run,/^[0-9a-f-]{36}$/);
 for(const a of Object.values(f.actors))assert.match(a.id,/^[0-9a-f-]{36}$/);
 const ids=Object.values(f.actors).map(a=>"'"+a.id+"'").join(',');
 const sql=`begin;
 do $$begin if (select count(*) from auth.users where id in (${ids}) and email like 'pm-%@example.invalid')<>4 then raise exception 'Fixture identity mismatch'; end if;
 if exists(select 1 from public.orders where service_id in(select id from public.services where slug='pm-${f.run}') and client_id<>'${f.actors.client.id}') then raise exception 'Nonfixture order';end if;end$$;
 delete from public.orders where client_id='${f.actors.client.id}';
 delete from public.recurring_service_plans where client_id='${f.actors.client.id}';
 delete from auth.users where id in(${ids});
 delete from public.services where slug='pm-${f.run}';
 commit;`;
 writeFileSync(dir+'/cleanup.sql',sql);
 console.log('Cleanup SQL prepared.');
}else if(mode==='test'){
 const f=JSON.parse(readFileSync(file,'utf8')), key=process.env.MATCH_PUBLISHABLE_KEY;
 assert(key,'Missing publishable key');
 const clients={};
 for(const [name,a]of Object.entries(f.actors)){
 const c=createClient(f.url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const r=await c.auth.signInWithPassword({email:a.email,password:a.password});assert.ifError(r.error);clients[name]=c;
 }
 const A=clients.client,B=clients.pro,C=clients.other;
 const service=await A.from('services').select('id').eq('slug','pm-'+f.run).single();assert.ifError(service.error);
 f.serviceId=service.data.id;writeFileSync(file,JSON.stringify(f),{mode:0o600});
 const checks=[];
 const rpc=async(c,n,p)=>{const r=await c.rpc(n,p);assert.ifError(r.error);return r.data;};
 const input={service_id:f.serviceId,client_id:f.actors.client.id,description:'Concurrent acceptance fixture',address:'PRIVATE FIXTURE ADDRESS',mode:'immediate',status:'open',payment_method:'cash',client_lat:-38,client_lng:-57.55};
 let r=await A.from('orders').insert(input).select('id').single();assert.ifError(r.error);const id=r.data.id;
 const results=await Promise.all(Array.from({length:12},(_,i)=>(i%2?B:C).rpc('accept_order',{p_order_id:id})));
 assert.equal(results.filter(r=>!r.error).length,1);checks.push('12 concurrent acceptance requests: exactly one winner');
 const winner=(await A.from('orders').select('professional_id').eq('id',id).single()).data.professional_id;
 const W=winner===f.actors.pro.id?B:C;
 await rpc(W,'advance_order',{p_order_id:id});await rpc(W,'advance_order',{p_order_id:id});
 const pins=await rpc(A,'get_order_pin',{p_order_id:id});
 assert.equal((await rpc(W,'get_order_pin',{p_order_id:id})).length,0);
 assert.equal((await rpc(W,'start_order',{p_order_id:id,p_pin:pins[0].pin_value})).ok,true);
 const end=await rpc(A,'get_order_pin',{p_order_id:id});
 assert.equal((await rpc(W,'complete_order',{p_order_id:id,p_pin:end[0].pin_value})).ok,true);
 checks.push('accepted -> arrived -> start PIN -> end PIN -> completed; professional PIN hidden');
 const bad=await A.from('orders').insert({...input,client_lat:null,client_lng:null});assert(bad.error);checks.push('API rejects request with insufficient location');
 r=await B.from('professional_service_locations').insert({professional_id:f.actors.pro.id,location_id:'ar-ba-mar-del-plata'});assert.ifError(r.error);
 const preview=await rpc(A,'list_eligible_request_professionals',{p_data:{service_id:f.serviceId,mode:'quote',location_id:'ar-ba-mar-del-plata'}});
 assert(preview.includes(f.actors.pro.id));assert(!preview.includes(f.actors.other.id));checks.push('manual coverage fallback API');
 r=await A.from('orders').insert({...input,mode:'quote',status:'waiting_quotes',client_lat:null,client_lng:null,location_id:'ar-ba-mar-del-plata'}).select('id').single();assert.ifError(r.error);const q=r.data.id;
 const args={p_order_id:q,p_labor_price:1000,p_materials_price:0,p_visit_price:0,p_manito_fee:0,p_estimated_minutes:60,p_availability_label:'Tomorrow',p_observation:'Fixture'};
 assert((await C.rpc('send_order_proposal',args)).error);
 const proposal=await rpc(B,'send_order_proposal',args);await rpc(A,'accept_proposal',{p_proposal_id:proposal.id});checks.push('quote API enforces coverage');
 const anon=createClient(f.url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 assert((await anon.rpc('list_eligible_request_professionals',{p_data:{service_id:f.serviceId,mode:'quote'}})).error);checks.push('anon denied');
 for(const c of Object.values(clients))await c.auth.signOut();
 writeFileSync(dir+'/results.json',JSON.stringify({passed:checks.length,checks},null,2));
 console.log(JSON.stringify({passed:checks.length,checks}));
}else throw new Error('Use prepare, test, cleanup');
