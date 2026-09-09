// Controlled API/Realtime integration harness. Credentials live only in ignored outputs.
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../outputs/norm014/', import.meta.url);
mkdirSync(dir, { recursive: true });
const fixturePath = new URL('fixture.json', dir);
const mode = process.argv[2];
if (mode === 'prepare') {
  assert(!existsSync(fixturePath), 'Existing fixture: clean it up before preparing another run');
  const run = randomUUID();
  const actors = Object.fromEntries(['client','pro','other','admin','pending','suspended','unapproved'].map(name => [name, {
    id: randomUUID(), email: `norm014-${run}-${name}@example.invalid`, password: randomBytes(32).toString('hex'),
  }]));
  const f = { run, actors, url: 'https://taovmzxqvacrtjefgbsd.supabase.co' };
  writeFileSync(fixturePath, JSON.stringify(f), { mode: 0o600 });
  const sql = ['begin;'];
  for (const [name,a] of Object.entries(actors)) {
    sql.push(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
    values('00000000-0000-0000-0000-000000000000','${a.id}','authenticated','authenticated','${a.email}',extensions.crypt('${a.password}',extensions.gen_salt('bf')),${name==='pending'?'null':'now()'},'{"provider":"email","providers":["email"]}','{"full_name":"NORM014 ${name}"}',now(),now(),'','','','');
    insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(gen_random_uuid(),'${a.id}','${a.id}','{"sub":"${a.id}","email":"${a.email}"}','email',now(),now(),now());
    update public.profiles set role='${['pro','other','suspended','unapproved'].includes(name)?'professional':name==='admin'?'admin':'client'}',city='NORM014 TEST',lat=-38,lng=-57.55,is_available=true where id='${a.id}';`);
  }
  sql.push(`select set_config('request.jwt.claim.sub','${actors.admin.id}',true);
    insert into public.services(slug,name,base_price,allow_immediate,allow_scheduled,allow_quote,supports_recurring,requires_completion_evidence)
    values('norm014-${run}','NORM014 TEST - NO CONTRATAR',1000,true,true,true,true,false);`);
  for (const name of ['pro','other','suspended','unapproved']) {
    const a=actors[name];
    sql.push(`insert into public.professional_profiles(professional_id,verified,work_days,work_starts_at,work_ends_at)
    values('${a.id}',${name!=='unapproved'},array['Lun','Mar','Mie','Jue','Vie','Sab','Dom'],'00:00','23:59')
    on conflict(professional_id) do update set verified=excluded.verified,work_days=excluded.work_days,work_starts_at='00:00',work_ends_at='23:59';
    insert into public.professional_services(professional_id,service_id,price_from) select '${a.id}',id,1200 from public.services where slug='norm014-${run}';`);
  }
  sql.push(`insert into public.professional_onboarding(professional_id,status) values('${actors.suspended.id}','suspended') on conflict(professional_id) do update set status='suspended'; commit;
  select id as service_id from public.services where slug='norm014-${run}';`);
  // Bootstrap contains temporary credentials. Keep it ignored and out of console logs.
  writeFileSync(new URL('bootstrap.sql',dir),sql.join('\n'),{mode:0o600});
  console.log('Prepared outputs/norm014/bootstrap.sql; execute with an authorized SQL connection.');
} else if (mode === 'cleanup-orders-sql' || mode === 'cleanup-users-sql') {
  const f=JSON.parse(readFileSync(fixturePath));
  assert.match(f.run,/^[a-f0-9-]{36}$/);
  for(const a of Object.values(f.actors)) {
    assert.match(a.id,/^[a-f0-9-]{36}$/);
    assert(a.email.startsWith(`norm014-${f.run}-`) && a.email.endsWith('@example.invalid'));
  }
  const ids=Object.values(f.actors).map(a=>`'${a.id}'`).join(',');
  const preflight=`do $$ begin
    if (select count(*) from auth.users where id in (${ids}) and email like 'norm014-${f.run}-%@example.invalid') <> 7 then
      raise exception 'Fixture identities do not match'; end if;
    if exists(select 1 from public.orders o join public.services s on s.id=o.service_id where s.slug='norm014-${f.run}' and o.client_id<>'${f.actors.client.id}') then
      raise exception 'Non-fixture order uses service: stop cleanup'; end if;
    end $$;`;
  const sql=mode==='cleanup-orders-sql' ? `begin;
    set local lock_timeout='3s';
    ${preflight}
    lock table public.complaints in access exclusive mode;
    alter table public.complaints disable trigger trg_complaints_immutable;
    delete from public.complaint_events where complaint_id in (select c.id from public.complaints c join public.orders o on o.id=c.order_id where o.client_id='${f.actors.client.id}');
    delete from public.complaint_evidence where complaint_id in (select c.id from public.complaints c join public.orders o on o.id=c.order_id where o.client_id='${f.actors.client.id}');
    delete from public.orders where client_id='${f.actors.client.id}';
    delete from public.recurring_service_plans where client_id='${f.actors.client.id}';
    alter table public.complaints enable trigger trg_complaints_immutable;
    commit;` : `begin;
    ${preflight}
    do $$ begin
      if exists(select 1 from storage.objects where owner in (${ids})) then
        raise exception 'Remove fixture Storage objects through API first'; end if;
    end $$;
    delete from auth.sessions where user_id in (${ids});
    delete from auth.users where id in (${ids}) and email like 'norm014-${f.run}-%@example.invalid';
    delete from public.services where slug='norm014-${f.run}'; commit;
    select count(*) as remaining_fixture_users from auth.users where email like 'norm014-${f.run}-%@example.invalid';`;
  writeFileSync(new URL(`${mode}.sql`,dir),sql);
  console.log(`Prepared outputs/norm014/${mode}.sql. Review before executing.`);
} else if (mode === 'cleanup-storage') {
  const f=JSON.parse(readFileSync(fixturePath));
  const key=process.env.NORM014_PUBLISHABLE_KEY;
  assert(key);
  for(const name of ['client','pro','other']) {
    const c=createClient(f.url,key,{auth:{persistSession:false}});
    try {
      assert.ifError((await c.auth.signInWithPassword(f.actors[name])).error);
      const paths=(f.storagePaths||[]).filter(path=>path.includes(`/${f.actors[name].id}/`));
      if(paths.length) assert.ifError((await c.storage.from('manito-media').remove(paths)).error);
    } finally { await c.auth.signOut(); c.realtime.disconnect(); }
  }
  console.log('Fixture Storage removal requested; verify remaining objects with SQL.');
} else if (mode === 'run') {
  const f=JSON.parse(readFileSync(fixturePath));
  const key=process.env.NORM014_PUBLISHABLE_KEY;
  assert(key, 'NORM014_PUBLISHABLE_KEY required');
  const clients={},results=[],channels=[];
  const ok=(label)=>{results.push({label,pass:true}); console.log(`PASS ${label}`);};
  const rpc=async(c,name,args={})=>{const r=await c.rpc(name,args); if(r.error) throw new Error(`${name}: ${r.error.code} ${r.error.message}`); return r.data;};
  const denied=async(p,label)=>{const r=await p; assert(r.error,`Expected denied: ${label}`);ok(label);};
  const events=[];
  const waitFor=async(predicate,label)=>{const end=Date.now()+12000; while(Date.now()<end){if(predicate()){ok(label);return;}await new Promise(r=>setTimeout(r,100));} throw new Error(`Timeout: ${label}`);};
  const watch=async(name,orderId)=>{
    const channel=clients[name].channel(`norm014-${name}-${randomUUID()}`);
    for(const table of ['orders','messages','order_proposals','order_extras','payments','order_photos','complaints']) {
      channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`${table==='orders'?'id':'order_id'}=eq.${orderId}`},p=>events.push({actor:name,table,new:p.new}));
    }
    channels.push([clients[name],channel]);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Postgres subscription timeout')),20000);
      channel.on('system',{},p=>{if(p.extension==='postgres_changes'&&p.status==='ok'){clearTimeout(timer);resolve();}});
      channel.subscribe(s=>{if(s==='CHANNEL_ERROR'){clearTimeout(timer);reject(new Error('Subscribe error'));}});
    });
  };
  try {
    for(const [name,a] of Object.entries(f.actors)) {
      const c=createClient(f.url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});clients[name]=c;
      const r=await c.auth.signInWithPassword({email:a.email,password:a.password});
      if(name==='pending'){assert.equal(r.error?.code,'email_not_confirmed');ok('unconfirmed account cannot login');continue;}
      assert.ifError(r.error); assert.equal(r.data.user.id,a.id);ok(`independent Auth login ${name}`);
    }
    const A=clients.client,B=clients.pro,C=clients.other,D=clients.admin;
    const service=(await A.from('services').select('id').eq('slug',`norm014-${f.run}`).single()).data;
    assert(service); f.serviceId=service.id;writeFileSync(fixturePath,JSON.stringify(f),{mode:0o600});
    assert.equal((await rpc(A,'get_my_profile')).id,f.actors.client.id);ok('profile available after Auth');
    await denied(A.from('profiles').update({role:'admin'}).eq('id',f.actors.client.id),'client cannot self promote');
    const create=async(mode='immediate',extra={})=>{
      const r=await A.from('orders').insert({client_id:f.actors.client.id,service_id:service.id,description:'NORM014 fix a leak',address:'NORM014 private address',client_lat:-38,client_lng:-57.55,mode,status:mode==='quote'?'waiting_quotes':'open',assignment_mode:'auto',payment_method:'cash',estimated_price:5,price:5,...extra}).select('id,status').single();
      assert.ifError(r.error);return r.data.id;
    };
    const order=await create();f.orderId=order;writeFileSync(fixturePath,JSON.stringify(f),{mode:0o600});ok('client creates Ahora');
    await watch('client',order);await watch('pro',order);await watch('other',order);
    for(const name of ['suspended','unapproved']) {assert(!(await rpc(clients[name],'list_professional_opportunities')).some(o=>o.id===order));await denied(clients[name].rpc('accept_order',{p_order_id:order}),`${name} cannot accept`);}
    const opp=(await rpc(B,'list_professional_opportunities')).find(o=>o.id===order);assert(opp);assert(!opp.address||opp.address!=='NORM014 private address');ok('matching eligible and hides address');
    assert.equal((await B.from('orders').select('id,address').eq('id',order)).data?.length,0);ok('preaccept direct address hidden');
    // Truly independent HTTP requests racing the same DB row.
    const racing=await Promise.all([B.rpc('accept_order',{p_order_id:order}),C.rpc('accept_order',{p_order_id:order})]);
    assert.equal(racing.filter(r=>!r.error).length,1);ok('concurrent acceptance has one winner');
    const winner=racing[0].error?'other':'pro',P=clients[winner],loser=winner==='pro'?'other':'pro',L=clients[loser];
    f.winner=winner;writeFileSync(fixturePath,JSON.stringify(f),{mode:0o600});
    const readOrder=async()=>{const r=await A.from('orders').select('id,status,agreed_price,agreed_scope,contract_snapshot,professional_id').eq('id',order).single();assert.ifError(r.error);return r.data;};
    assert.equal((await readOrder()).agreed_price,1200);ok('backend contract ignores estimate 5');
    await waitFor(()=>events.some(e=>e.actor==='client'&&e.table==='orders'&&e.new.status==='accepted'),'Realtime acceptance');
    assert.equal((await P.from('orders').select('address').eq('id',order).single()).data?.address,'NORM014 private address');ok('assigned address visible');
    await denied(L.rpc('advance_order',{p_order_id:order}),'unassigned cannot advance');
    for(const who of [P,L,D]) for(const pin of ['start_pin','end_pin']) await denied(who.from('orders').select(pin).eq('id',order),`PIN column denied ${who===D?'admin':who===P?'assigned':'other'} ${pin}`);
    await rpc(P,'advance_order',{p_order_id:order});await rpc(P,'advance_order',{p_order_id:order});
    assert.equal((await rpc(P,'get_order_pin',{p_order_id:order})).length,0);assert.equal((await rpc(L,'get_order_pin',{p_order_id:order})).length,0);ok('professional PIN RPC hidden');
    await denied(P.rpc('start_order',{p_order_id:order,p_pin:'invalid'}),'wrong start PIN denied');
    assert.equal((await readOrder()).status,'en_sitio');
    const pin=(await rpc(A,'get_order_pin',{p_order_id:order}))[0].pin_value;
    await rpc(P,'start_order',{p_order_id:order,p_pin:pin});ok('correct start PIN starts work');
    assert(!events.some(e=>e.actor!== 'client' && (e.new.start_pin||e.new.end_pin)));ok('Realtime payload has no professional PIN');
    const msg=await A.from('messages').insert({order_id:order,sender_id:f.actors.client.id,body:'NORM014 private chat'});assert.ifError(msg.error);
    await waitFor(()=>events.some(e=>e.actor===winner&&e.table==='messages'),'Realtime chat');
    assert.equal((await L.from('messages').select('id').eq('order_id',order)).data?.length,0);ok('unassigned chat hidden');
    const extra=await rpc(P,'propose_order_extra',{p_order_id:order,p_title:'NORM014 approved repair',p_amount:100});
    await waitFor(()=>events.some(e=>e.actor==='client'&&e.table==='order_extras'),'Realtime extra proposed');
    await rpc(A,'decide_order_extra',{p_extra_id:extra.id,p_status:'approved'});
    const rejected=await rpc(P,'propose_order_extra',{p_order_id:order,p_title:'NORM014 unnecessary',p_amount:300});
    await rpc(A,'decide_order_extra',{p_extra_id:rejected.id,p_status:'rejected'});
    assert.equal((await readOrder()).agreed_price,1200);ok('extras preserve contract');
    await denied(A.from('order_extras').update({amount:1}).eq('id',extra.id),'direct extra amount mutation denied');
    await denied(P.rpc('complete_order',{p_order_id:order,p_pin:'invalid'}),'wrong end PIN denied');
    const endPin=(await rpc(A,'get_order_pin',{p_order_id:order}))[0].pin_value;
    await rpc(P,'complete_order',{p_order_id:order,p_pin:endPin});assert.equal((await readOrder()).status,'completed');ok('correct end PIN completes work');
    await denied(P.rpc('report_order_payment',{p_order_id:order}),'professional cannot report client payment');
    await rpc(A,'report_order_payment',{p_order_id:order});
    await waitFor(()=>events.some(e=>e.actor===winner&&e.table==='payments'&&e.new.status==='reported'),'Realtime payment reported');
    await denied(A.rpc('confirm_manual_payment',{p_order_id:order}),'client cannot confirm own report');
    await denied(L.rpc('confirm_manual_payment',{p_order_id:order}),'unassigned cannot confirm payment');
    await rpc(P,'confirm_manual_payment',{p_order_id:order});
    const payment=(await A.from('payments').select('amount,status').eq('order_id',order).single()).data;assert.equal(payment.status,'confirmed');assert.equal(payment.amount,1300);ok('bilateral payment backend total 1300');
    assert.equal((await L.from('payments').select('id').eq('order_id',order)).data?.length,0);ok('payment private');
    const quote=await create('quote');await watch('client',quote);
    const args={p_order_id:quote,p_labor_price:500,p_materials_price:100,p_visit_price:50,p_manito_fee:0,p_estimated_minutes:60,p_availability_label:'Tomorrow',p_observation:'NORM014 quoted scope',p_available_from:new Date(Date.now()+86400000).toISOString()};
    let proposal=await rpc(B,'send_order_proposal',args);
    await waitFor(()=>events.some(e=>e.actor==='client'&&e.table==='order_proposals'&&e.new.order_id===quote),'Realtime proposal');
    proposal=await rpc(B,'send_order_proposal',{...args,p_labor_price:600});
    await rpc(C,'send_order_proposal',args);
    await rpc(A,'accept_proposal',{p_proposal_id:proposal.id});
    await denied(B.rpc('send_order_proposal',{...args,p_labor_price:5}),'accepted proposal cannot edit');
    const q=(await A.from('orders').select('agreed_price,accepted_proposal_id,contract_snapshot').eq('id',quote).single()).data;assert.equal(q.accepted_proposal_id,proposal.id);assert.equal(q.agreed_price,750);assert(q.contract_snapshot);ok('quote immutable contract snapshot');
    const rest=(await A.from('order_proposals').select('status').eq('order_id',quote).neq('id',proposal.id)).data;assert(rest.every(p=>p.status!=='sent'));ok('nonchosen proposals closed');
    await clients.client.auth.signOut();const relog=await clients.client.auth.signInWithPassword(f.actors.client);assert.ifError(relog.error);ok('logout/login consistent');
  } catch(e) {results.push({label:e.message,pass:false});console.error(e.message);process.exitCode=1;}
  finally {
    for(const [c,ch] of channels) await c.removeChannel(ch);
    for(const c of Object.values(clients)) { await c.auth.signOut(); c.realtime.disconnect(); }
    writeFileSync(new URL('results.json',dir),JSON.stringify(results,null,2));
  }
}
