import { createClient } from '@supabase/supabase-js';
import { readFileSync,writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const dir=new URL('../outputs/norm014/',import.meta.url), file=new URL('fixture.json',dir);
const f=JSON.parse(readFileSync(file)),key=process.env.NORM014_PUBLISHABLE_KEY;
const resume=process.argv.includes('--resume-claim');
assert(key);const clients={},channels=[],events=[],results=resume?JSON.parse(readFileSync(new URL('flows-results.json',dir))).filter(r=>r.pass):[];
const ok=label=>{results.push({label,pass:true});console.log('PASS',label);};
const rpc=async(c,name,args={})=>{const r=await c.rpc(name,args);if(r.error)throw new Error(`${name}: ${r.error.code} ${r.error.message}`);return r.data;};
const denied=async(p,label)=>{assert((await p).error,`Expected denial: ${label}`);ok(label);};
const record=()=>writeFileSync(file,JSON.stringify(f),{mode:0o600});
const watch=async(actor,order)=>{
  const ch=clients[actor].channel(`norm014-flow-${randomUUID()}`);
  for(const table of ['orders','order_photos','complaints','payments']) ch.on('postgres_changes',{event:'*',schema:'public',table,filter:`${table==='orders'?'id':'order_id'}=eq.${order}`},p=>events.push({actor,table,new:p.new}));
  channels.push([clients[actor],ch]);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Postgres subscribe timeout')),20000);ch.on('system',{},p=>{if(p.extension==='postgres_changes'&&p.status==='ok'){clearTimeout(t);resolve();}}).subscribe();});
};
const wait=async(fn,label)=>{const until=Date.now()+12000;while(Date.now()<until){if(fn()){ok(label);return;}await new Promise(r=>setTimeout(r,100));}throw new Error(`Timeout ${label}`);};
try {
  for(const name of ['client','pro','other','admin']) {const c=createClient(f.url,key,{auth:{persistSession:false,autoRefreshToken:false}});clients[name]=c;assert.ifError((await c.auth.signInWithPassword(f.actors[name])).error);}
  const A=clients.client,B=clients.pro,C=clients.other,D=clients.admin;
  const base=new Date();base.setUTCDate(base.getUTCDate()+10);base.setUTCHours(15,0,0,0);
  const scheduled=async(offset=0,preferred=null,method='cash')=>rpc(A,'create_scheduled_order',{p_data:{service_id:f.serviceId,description:'NORM014 scheduled test',address:'NORM014 private address',scheduled_at:new Date(+base+offset*3600000).toISOString(),estimated_duration_minutes:60,preferred_professional_id:preferred,payment_method:method,client_lat:-38,client_lng:-57.55}});
  const cancel=(order)=>rpc(A,'cancel_order',{p_order_id:order,p_reason:'service_no_longer_needed'});
  const state=async(id)=>{const r=await A.from('orders').select('id,status,professional_id,agreed_price,cancelled_at,cancellation_actor,cancellation_reason,cancellation_phase,cancellation_responsibility,cancellation_fee').eq('id',id).single();assert.ifError(r.error);return r.data;};
  let o;
  if (!resume) {
  const one=await scheduled(),two=await scheduled();
  const race=await Promise.all([B.rpc('accept_order',{p_order_id:one.id}),B.rpc('accept_order',{p_order_id:two.id})]);
  assert.equal(race.filter(r=>!r.error).length,1);ok('two simultaneous overlapping bookings: one accepted');
  const accepted=race[0].error?two:one;
  const adjacent=await scheduled(1);await rpc(B,'accept_order',{p_order_id:adjacent.id});ok('exact schedule boundary allowed');
  await cancel(one.id);await cancel(two.id);await cancel(adjacent.id);
  const manual=await scheduled(24,f.actors.pro.id);assert.equal(manual.manual_response_status,'pending');
  await denied(C.rpc('accept_order',{p_order_id:manual.id}),'manual invitation excludes other professional');
  await denied(A.rpc('fallback_manual_order_to_auto',{p_order_id:manual.id}),'no fallback while actual invitation pending');
  await rpc(B,'reject_manual_order_request',{p_order_id:manual.id,p_reason:'schedule_problem'});
  await rpc(A,'choose_manual_order_professional',{p_order_id:manual.id,p_professional_id:f.actors.other.id});
  await rpc(C,'accept_order',{p_order_id:manual.id});ok('manual reject and client changes professional');await cancel(manual.id);
  const fallback=await scheduled(48,f.actors.pro.id);await rpc(B,'reject_manual_order_request',{p_order_id:fallback.id,p_reason:'unavailable'});
  await rpc(A,'fallback_manual_order_to_auto',{p_order_id:fallback.id});assert((await rpc(C,'list_professional_opportunities')).some(o=>o.id===fallback.id));ok('explicit scheduled fallback publishes opportunity');await cancel(fallback.id);
  const timeout=await scheduled(72,f.actors.pro.id);f.timeoutOrderId=timeout.id;record();
  for(const phase of ['scheduled_open','accepted','en_camino','en_sitio']) {
    const o=await scheduled(96);
    if(phase!=='scheduled_open') await rpc(B,'accept_order',{p_order_id:o.id});
    if(['en_camino','en_sitio'].includes(phase))await rpc(B,'advance_order',{p_order_id:o.id});
    if(phase==='en_sitio')await rpc(B,'advance_order',{p_order_id:o.id});
    await cancel(o.id);const s=await state(o.id);assert.equal(s.status,'cancelled');assert.equal(s.cancellation_phase,phase);assert.equal(s.cancellation_actor,'client');assert(s.cancelled_at);ok(`cancellation context ${phase}`);
  }
  o=await scheduled(120,null,'wallet');f.evidenceOrderId=o.id;record();await watch('client',o.id);await watch('other',o.id);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf5kAAAAASUVORK5CYII=','base64');
  const upload=async(actor,stage)=>{
    const path=`orders/${o.id}/evidence/${f.actors[actor].id}/${randomUUID()}.png`;
    const r=await clients[actor].storage.from('manito-media').upload(path,png,{contentType:'image/png'});assert.ifError(r.error);
    f.storagePaths=[...(f.storagePaths||[]),path];record();
    await rpc(clients[actor],'add_order_evidence',{p_order_id:o.id,p_stage:stage,p_file_path:path,p_file_name:'NORM014.png'});return path;
  };
  const before=await upload('client','before');ok('real private Storage upload and initial evidence');
  await denied(C.storage.from('manito-media').createSignedUrl(before,60),'stranger cannot sign evidence');
  await rpc(B,'accept_order',{p_order_id:o.id});
  assert.ifError((await B.storage.from('manito-media').createSignedUrl(before,60)).error);ok('assigned can read initial evidence');
  await rpc(B,'advance_order',{p_order_id:o.id});await rpc(B,'advance_order',{p_order_id:o.id});
  await rpc(B,'start_order',{p_order_id:o.id,p_pin:(await rpc(A,'get_order_pin',{p_order_id:o.id}))[0].pin_value});
  await denied(A.rpc('cancel_order',{p_order_id:o.id,p_reason:'service_no_longer_needed'}),'working cancellation blocked by existing product rule');
  await upload('pro','during');await upload('pro','after');
  await wait(()=>events.some(e=>e.actor==='client'&&e.table==='order_photos'&&e.new.stage==='after'),'Realtime final evidence');
  const removed=await A.storage.from('manito-media').remove([before]);
  // DELETE under RLS may succeed with zero rows; verify the object remains readable.
  const preserved=await A.storage.from('manito-media').createSignedUrl(before,60);assert.ifError(preserved.error);ok('linked evidence preserved against delete');
  await rpc(B,'complete_order',{p_order_id:o.id,p_pin:(await rpc(A,'get_order_pin',{p_order_id:o.id}))[0].pin_value});
  await rpc(A,'report_order_payment',{p_order_id:o.id});await rpc(B,'dispute_manual_payment',{p_order_id:o.id,p_reason:'NORM014 test amount not received'});
  assert.equal((await A.from('payments').select('status').eq('order_id',o.id).single()).data.status,'disputed');ok('wallet manual payment dispute not confirmation');
  } else {
    o={id:f.evidenceOrderId};await watch('client',o.id);await watch('other',o.id);
  }
  const complaint=await rpc(A,'open_order_complaint',{p_order_id:o.id,p_reason:'work_quality',p_detail:'NORM014 controlled quality claim after work'});f.complaintId=complaint.id;record();
  await denied(B.rpc('review_order_complaint',{p_complaint_id:complaint.id,p_status:'under_review'}),'professional cannot review claim');
  await rpc(D,'review_order_complaint',{p_complaint_id:complaint.id,p_status:'under_review'});
  const context=await rpc(D,'get_admin_complaint_detail',{p_complaint_id:complaint.id});assert(context.order.agreed_scope);assert(context.order_evidence.length===3);assert(context.payments.length===1);ok('admin reconstructs contract evidence and payment');
  await rpc(D,'review_order_complaint',{p_complaint_id:complaint.id,p_status:'resolved',p_resolution_type:'correction',p_resolution_note:'NORM014 agreed correction registered in test'});ok('claim reviewed and resolved by admin');
  await wait(()=>events.some(e=>e.actor==='client'&&e.table==='complaints'&&e.new.status==='resolved'),'Realtime claim resolution');
  assert(!events.some(e=>e.actor==='other'&&['order_photos','complaints','payments'].includes(e.table)));ok('unassigned receives no private detail Realtime');
  const plan=await rpc(A,'create_recurring_plan',{p_source_order_id:o.id,p_frequency:'weekly'});f.planId=plan.id;record();
  await rpc(A,'pause_recurring_plan',{p_plan_id:plan.id});await rpc(A,'resume_recurring_plan',{p_plan_id:plan.id});ok('real recurring plan create pause resume');
  const a2=createClient(f.url,key,{auth:{persistSession:false}});assert.equal((await a2.from('orders').select('id').eq('id',o.id)).data?.length||0,0);ok('anon cannot read order');a2.realtime.disconnect();
}catch(e){results.push({pass:false,label:e.message});console.error(e.message);process.exitCode=1;}
finally{for(const[c,ch]of channels)await c.removeChannel(ch);for(const c of Object.values(clients)){await c.auth.signOut();c.realtime.disconnect();}writeFileSync(new URL('flows-results.json',dir),JSON.stringify(results,null,2));}
