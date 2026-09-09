import { createClient } from '@supabase/supabase-js';
import { readFileSync,writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const dir=new URL('../outputs/norm014/',import.meta.url),f=JSON.parse(readFileSync(new URL('fixture.json',dir)));
const key=process.env.NORM014_PUBLISHABLE_KEY;assert(key);
const A=createClient(f.url,key,{auth:{persistSession:false}}),B=createClient(f.url,key,{auth:{persistSession:false}}),results=[];
const rpc=async(c,name,args)=>{const r=await c.rpc(name,args);assert.ifError(r.error);return r.data;};
const ok=label=>{results.push({label,pass:true});console.log('PASS',label);};
try{
  assert.ifError((await A.auth.signInWithPassword(f.actors.client)).error);assert.ifError((await B.auth.signInWithPassword(f.actors.pro)).error);
  const rows=(await A.from('orders').select('id,status,scheduled_at,agreed_price,manual_response_deadline_at').eq('recurring_plan_id',f.planId)).data;
  assert.equal(rows.length,2);const visit=rows.find(o=>o.id!==f.evidenceOrderId);assert.equal(visit.status,'scheduled_open');assert.equal(visit.agreed_price,null);ok('cron generated one uncontracted scheduled visit');
  if (visit.manual_response_deadline_at && new Date(visit.manual_response_deadline_at)<new Date()) {
    await rpc(A,'refresh_manual_order_request',{p_order_id:visit.id});
    await rpc(A,'choose_manual_order_professional',{p_order_id:visit.id,p_professional_id:f.actors.pro.id});
    ok('expired recurring invitation requires explicit client choice');
  }
  await rpc(B,'accept_order',{p_order_id:visit.id});await rpc(B,'advance_order',{p_order_id:visit.id});await rpc(B,'advance_order',{p_order_id:visit.id});
  await rpc(B,'start_order',{p_order_id:visit.id,p_pin:(await rpc(A,'get_order_pin',{p_order_id:visit.id}))[0].pin_value});
  await rpc(B,'complete_order',{p_order_id:visit.id,p_pin:(await rpc(A,'get_order_pin',{p_order_id:visit.id}))[0].pin_value});ok('cron visit completes ordinary professional execution and PIN flow');
  const plans=await rpc(A,'list_my_recurring_plans');const plan=plans.find(p=>p.id===f.planId);assert(new Date(plan.next_scheduled_at)>new Date(visit.scheduled_at));ok('next occurrence already advanced');
  await rpc(A,'pause_recurring_plan',{p_plan_id:f.planId});await rpc(A,'cancel_recurring_plan',{p_plan_id:f.planId});
  assert.equal((await A.from('orders').select('id').eq('recurring_plan_id',f.planId)).data.length,2);ok('cancel plan preserves source and completed visit history');
}catch(e){results.push({label:e.message,pass:false});console.error(e.message);process.exitCode=1;}
finally{await A.auth.signOut({scope:'local'});await B.auth.signOut({scope:'local'});A.realtime.disconnect();B.realtime.disconnect();writeFileSync(new URL('recurring-results.json',dir),JSON.stringify(results,null,2));}
