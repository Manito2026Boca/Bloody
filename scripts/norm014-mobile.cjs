// Real actors/backend; the final, separate recovery test deliberately injects HTTP 503.
const { readFileSync,writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const f=JSON.parse(readFileSync(resolve('outputs/norm014/fixture.json')));
const key=process.env.NORM014_PUBLISHABLE_KEY;
const base=process.env.NORM014_APP_URL || 'http://localhost:3017';
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const results=[];
  try {
    for(const width of [390,1440]) {
      const pages=[];
      for(const actor of ['client','pro']) {
        const ctx=await browser.newContext({viewport:{width,height:844}});
        await ctx.addInitScript(({url,key})=>localStorage.setItem('manito_v6_supabase',JSON.stringify({url,key})),{url:f.url,key});
        const page=await ctx.newPage();const errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto(base);
        await page.getByLabel('Email',{exact:true}).fill(f.actors[actor].email);
        await page.locator('input[type=password]').fill(f.actors[actor].password);
        await page.locator('button[type=submit]').click();
        await page.locator('.v6-experience-switch').waitFor({timeout:45000});
        if(actor==='pro') await page.getByRole('button',{name:'Profesional',exact:true}).click();
        await page.getByRole('button',{name:'Trabajos',exact:true}).click();
        await page.waitForTimeout(2500);
        assert(await page.getByText('NORM014 TEST - NO CONTRATAR',{exact:true}).count()>0,'real orders visible');
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
        assert(!overflow,`${actor} overflow ${width}`);
        assert.equal(errors.length,0,errors.join('\n'));
        await page.screenshot({path:resolve(`outputs/norm014/${actor}-${width}.png`)});
        results.push({actor,width,realLogin:true,ordersVisible:true,horizontalOverflow:overflow,pageErrors:errors});
        pages.push({ctx,page});
      }
      if (width === 390) {
        const A=createClient(f.url,key,{auth:{persistSession:false}}),B=createClient(f.url,key,{auth:{persistSession:false}});
        try {
          assert.ifError((await A.auth.signInWithPassword(f.actors.client)).error);
          assert.ifError((await B.auth.signInWithPassword(f.actors.pro)).error);
          const rpc=async(c,name,args)=>{const r=await c.rpc(name,args);assert.ifError(r.error);return r.data;};
          const date=new Date(Date.now()+45*86400000);date.setUTCHours(15,0,0,0);
          const o=await rpc(A,'create_scheduled_order',{p_data:{service_id:f.serviceId,location_id:'ar-ba-mar-del-plata',description:'NORM014 mobile realtime',address:'NORM014 test, Mar del Plata',scheduled_at:date.toISOString(),estimated_duration_minutes:60,payment_method:'cash'}});
          await rpc(B,'accept_order',{p_order_id:o.id});
          await rpc(B,'advance_order',{p_order_id:o.id});await rpc(B,'advance_order',{p_order_id:o.id});
          const pin=(await rpc(A,'get_order_pin',{p_order_id:o.id}))[0].pin_value;
          await rpc(B,'start_order',{p_order_id:o.id,p_pin:pin});
          const clientCard=pages[0].page.locator(`[data-order-id="${o.id}"]`);
          const proCard=pages[1].page.locator(`[data-order-id="${o.id}"]`);
          await proCard.getByLabel('Detalle adicional').fill('NORM014 mobile extra');
          await pages[0].page.bringToFront();await pages[1].page.bringToFront();
          await pages[1].page.waitForTimeout(1200);
          assert.equal(await proCard.getByLabel('Detalle adicional').inputValue(),'NORM014 mobile extra','focus does not discard draft');
          await proCard.getByLabel('Monto adicional').fill('150');
          // Two synchronous submits model a rapid double tap before React commits disabled.
          await proCard.getByRole('button',{name:'Pedir adicional',exact:true}).evaluate(button=>{
            button.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
            button.form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
          });
          await clientCard.getByText('NORM014 mobile extra',{exact:true}).waitFor({timeout:20000});
          const extras=(await A.from('order_extras').select('id').eq('order_id',o.id)).data;
          assert.equal(extras.length,1,'double submit creates one extra');
          await clientCard.getByRole('button',{name:'Aprobar',exact:true}).click();
          await proCard.getByText(/150.*approved/).waitFor({timeout:20000});
          results.push({realTwoBrowserExtraFlow:true,doubleSubmitCreatesOne:true,refreshRequired:false,focusPreservesDraft:true});
          await rpc(B,'complete_order',{p_order_id:o.id,p_pin:(await rpc(A,'get_order_pin',{p_order_id:o.id}))[0].pin_value});
        } finally {await A.auth.signOut({scope:'local'});await B.auth.signOut({scope:'local'});A.realtime.disconnect();B.realtime.disconnect();}
      }
      // Both actors remained independently authenticated while navigating.
      for(const {ctx,page} of pages){await page.getByRole('button',{name:'Cuenta',exact:true}).click();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByLabel('Email',{exact:true}).waitFor();await ctx.close();}
    }
    const fault=await browser.newContext({viewport:{width:390,height:844}});
    await fault.addInitScript(({url,key})=>localStorage.setItem('manito_v6_supabase',JSON.stringify({url,key})),{url:f.url,key});
    const retryPage=await fault.newPage();
    await fault.route('**/rest/v1/rpc/get_my_profile',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'temporary unavailable'})}));
    await retryPage.goto(base);
    await retryPage.getByLabel('Email',{exact:true}).fill(f.actors.client.email);
    await retryPage.locator('input[type=password]').fill(f.actors.client.password);
    await retryPage.locator('button[type=submit]').click();
    await retryPage.getByRole('button',{name:'Reintentar',exact:true}).waitFor();
    await fault.unroute('**/rest/v1/rpc/get_my_profile');
    await retryPage.getByRole('button',{name:'Reintentar',exact:true}).click();
    await retryPage.locator('.v6-experience-switch').waitFor({timeout:30000});
    results.push({profileFailureInjection:true,retryRecoversSameAuthSession:true});
    await fault.close();
    console.log(JSON.stringify(results,null,2));
  } catch(e){results.push({pass:false,error:e.message});console.error(e.message);process.exitCode=1;}
  finally{writeFileSync(resolve('outputs/norm014/mobile-results.json'),JSON.stringify(results,null,2));await browser.close();}
})();
