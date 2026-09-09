// PREP001 real REST concurrency. Reuses the explicit NORM014 fixture bootstrap/cleanup.
import {createClient} from '@supabase/supabase-js';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const path=new URL('../outputs/norm014/fixture.json',import.meta.url);
const f=JSON.parse(readFileSync(path));
const key=process.env.NORM014_PUBLISHABLE_KEY;
assert(key);
const clients={};
const results=[];
const ok=label=>{results.push({label,pass:true});console.log('PASS '+label);};
const rpc=async(c,name,args)=>{const r=await c.rpc(name,args);assert.ifError(r.error);return r.data;};
const denied=async(p,label)=>{const r=await p;assert(r.error,label);ok(label);};
const write=()=>writeFileSync(path,JSON.stringify(f));
const mode=process.argv[2]||'block';
let channel;
try {
 for(const name of ['client','pro','other','admin']){
  const c=createClient(f.url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  assert.ifError((await c.auth.signInWithPassword(f.actors[name])).error);clients[name]=c;
 }
 const A=clients.client,B=clients.pro,C=clients.other;
 if(mode==='block'){
  f.serviceId=(await A.from('services').select('id').eq('slug','norm014-'+f.run).single()).data.id;
  const date=new Date(Date.now()+20*86400000);date.setUTCHours(15,0,0,0);
  const o=await rpc(A,'create_scheduled_order',{p_data:{service_id:f.serviceId,description:'PREP001 controlled PIN',address:'PREP001 private',scheduled_at:date.toISOString(),estimated_duration_minutes:60,payment_method:'cash'}});
  f.prepOrder=o.id;write();
  await rpc(B,'accept_order',{p_order_id:o.id});
  await rpc(B,'advance_order',{p_order_id:o.id});await rpc(B,'advance_order',{p_order_id:o.id});
  await denied(C.rpc('start_order',{p_order_id:o.id,p_pin:'invalid'}),'stranger cannot attempt');
  await denied(A.rpc('start_order',{p_order_id:o.id,p_pin:'invalid'}),'client cannot attempt');
  await denied(B.from('orders').select('start_pin,end_pin').eq('id',o.id),'professional cannot SELECT secrets');
  assert.equal((await rpc(B,'get_order_pin',{p_order_id:o.id})).length,0);ok('professional PIN RPC empty');
  const r=await Promise.all(Array.from({length:12},()=>rpc(B,'start_order',{p_order_id:o.id,p_pin:'invalid'})));
  assert.equal(r.filter(x=>x.code==='invalid_pin').length,4);
  assert.equal(r.filter(x=>x.code==='cooldown').length,8);ok('12 concurrent requests enforce 5 comparisons');
  const pin=(await rpc(A,'get_order_pin',{p_order_id:o.id}))[0].pin_value;
  assert.equal((await rpc(B,'start_order',{p_order_id:o.id,p_pin:pin})).code,'cooldown');ok('correct PIN blocked during cooldown');
  await B.auth.signOut({scope:'local'});assert.ifError((await B.auth.signInWithPassword(f.actors.pro)).error);
  assert.equal((await rpc(B,'start_order',{p_order_id:o.id,p_pin:pin})).code,'cooldown');ok('relogin cannot reset cooldown');
  await denied(B.schema('private').from('order_pin_challenges').update({failures:0}).eq('order_id',o.id),'private counter mutation unavailable');
  await denied(B.schema('private').from('order_pin_events').select('*'),'private audit inaccessible');
 } else if(mode==='resume') {
  const id=f.prepOrder;
  const events=[];
  channel=B.channel('prep001-pins').on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders',filter:'id=eq.'+id},p=>events.push(p.new));
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Realtime not ready')),20000);
   channel.on('system',{},p=>{if(p.extension==='postgres_changes'&&p.status==='ok'){clearTimeout(timer);resolve();}});
   channel.subscribe();
  });
  const start=(await rpc(A,'get_order_pin',{p_order_id:id}))[0].pin_value;
  assert.equal((await rpc(B,'start_order',{p_order_id:id,p_pin:start})).ok,true);ok('correct start after fixture cooldown expiry');
  // Explicit rollback preference must not suppress the committed failed attempt.
  const {data:{session}}=await B.auth.getSession();
  const response=await fetch(f.url+'/rest/v1/rpc/complete_order',{
   method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',Prefer:'tx=rollback'},
   body:JSON.stringify({p_order_id:id,p_pin:'invalid'})
  });
  assert.equal(response.status,200);assert.equal((await response.json()).code,'invalid_pin');ok('HTTP business rejection has no SQL exception');
  f.prepRollbackPreferenceTest=true;write();
  const end=(await rpc(A,'get_order_pin',{p_order_id:id}))[0].pin_value;
  assert.equal((await rpc(B,'complete_order',{p_order_id:id,p_pin:end})).ok,true);ok('correct final PIN completes');
  await new Promise(r=>setTimeout(r,1500));
  assert(events.some(e=>e.status==='completed'));
  assert(events.every(e=>!('start_pin'in e)&&!('end_pin'in e)));ok('Realtime changes never include PIN columns');
  await rpc(A,'report_order_payment',{p_order_id:id});
  await rpc(B,'confirm_manual_payment',{p_order_id:id});ok('payment still works after new PIN boundary');
 } else throw new Error('Unknown mode');
} catch(e) {results.push({label:e.message,pass:false});console.error(e.message);process.exitCode=1;}
finally {
 if(channel)await clients.pro.removeChannel(channel);
 for(const c of Object.values(clients)){await c.auth.signOut({scope:'local'});c.realtime.disconnect();}
 writeFileSync(new URL('../outputs/norm014/prep001-'+mode+'.json',import.meta.url),JSON.stringify(results,null,2));
}

