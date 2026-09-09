// Real UI PIN errors and cooldown. No mocked PIN RPC.
const {readFileSync,writeFileSync}=require('node:fs');
const {createClient}=require('@supabase/supabase-js');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const f=JSON.parse(readFileSync('outputs/norm014/fixture.json'));
const key=process.env.NORM014_PUBLISHABLE_KEY;
const base=process.env.NORM014_APP_URL||'http://localhost:3019';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const A=createClient(f.url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const B=createClient(f.url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(c,n,a)=>{const r=await c.rpc(n,a);assert.ifError(r.error);return r.data;};
 try{
  await A.auth.signInWithPassword(f.actors.client);await B.auth.signInWithPassword(f.actors.pro);
  f.serviceId ||= (await A.from('services').select('id').eq('slug','norm014-'+f.run).single()).data.id;
  const date=new Date(Date.now()+70*86400000);date.setUTCHours(15,0,0,0);
  const o=await rpc(A,'create_scheduled_order',{p_data:{service_id:f.serviceId,description:'PREP001 mobile PIN',address:'PREP001 Test',scheduled_at:date.toISOString(),estimated_duration_minutes:60,payment_method:'cash'}});
  await rpc(B,'accept_order',{p_order_id:o.id});await rpc(B,'advance_order',{p_order_id:o.id});await rpc(B,'advance_order',{p_order_id:o.id});
  const pages=[],errors=[];
  for(const actor of ['client','pro']){
   const ctx=await browser.newContext({viewport:{width:390,height:844}});
   await ctx.addInitScript(({url,key})=>localStorage.setItem('manito_v6_supabase',JSON.stringify({url,key})),{url:f.url,key});
   const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.goto(base);await p.getByLabel('Email',{exact:true}).fill(f.actors[actor].email);
   await p.locator('input[type=password]').fill(f.actors[actor].password);await p.locator('button[type=submit]').click();
   await p.locator('.v6-mode-switch').waitFor({timeout:45000});
   if(actor==='pro')await p.getByRole('button',{name:'Profesional',exact:true}).click();
   await p.getByRole('button',{name:actor==='pro'?'Trabajos':'Pedidos',exact:true}).click();pages.push(p);
  }
  const p=pages[1],card=p.locator('[data-order-id="'+o.id+'"]');
  for(let i=0;i<5;i++){
   p.once('dialog',d=>d.accept('incorrecto'));
   const response=p.waitForResponse(r=>r.url().includes('/rpc/start_order'));
   await card.getByRole('button',{name:'Ingresar PIN inicio',exact:true}).click();
   const outcome=await(await response).json();assert.equal(outcome.ok,false);
   await p.waitForTimeout(150);
  }
  await p.getByText(/Demasiados intentos/).waitFor();
  assert(await card.getByRole('alert').isVisible());
  assert.equal((await rpc(A,'get_order_pin',{p_order_id:o.id})).length,1);
  assert.equal((await A.from('orders').select('status').eq('id',o.id).single()).data.status,'en_sitio');
  await p.reload();await p.locator('.v6-mode-switch').waitFor();
  await p.getByRole('button',{name:'Profesional',exact:true}).click();
  await p.getByRole('button',{name:'Trabajos',exact:true}).click();
  p.once('dialog',d=>d.accept('incorrecto'));
  await p.locator('[data-order-id="'+o.id+'"]').getByRole('button',{name:'Ingresar PIN inicio',exact:true}).click();
  await p.getByText(/Demasiados intentos/).waitFor();
  assert.equal(errors.length,0);
  await p.screenshot({path:'outputs/norm014/prep001-mobile.png'});
  const result={realActors:true,fiveWrongPinsBlock:true,refreshPreservesBlock:true,clientStillSeesPin:true,stateUnchanged:true,pageErrors:errors};
  writeFileSync('outputs/norm014/prep001-mobile.json',JSON.stringify(result,null,2));console.log(result);
 }finally{await A.auth.signOut({scope:'local'});await B.auth.signOut({scope:'local'});A.realtime.disconnect();B.realtime.disconnect();await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
