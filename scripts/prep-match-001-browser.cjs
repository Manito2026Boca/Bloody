const { readFileSync, writeFileSync } = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const f = JSON.parse(readFileSync('outputs/prep-match-001/fixture.json'));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      await context.addInitScript(({ url, key }) => {
        localStorage.setItem('manito_v6_supabase', JSON.stringify({ url, key }));
        Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } });
      }, { url: f.url, key: process.env.MATCH_PUBLISHABLE_KEY });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
      await page.goto(process.env.MATCH_APP_URL || 'http://localhost:3023');
      await page.getByLabel('Email', { exact: true }).fill(f.actors.client.email);
      await page.locator('input[type=password]').fill(f.actors.client.password);
      await page.locator('button[type=submit]').click();
      await page.locator('.v6-mode-switch').waitFor({ timeout: 45000 });
      await page.locator('.v6-service').filter({ hasText: 'PREP MATCH TEST - NO CONTRATAR' }).click();
      await page.locator('.v6-mode-card').filter({ hasText: 'Presupuestar' }).click();
      await page.getByRole('button', { name: 'Especialidad prueba PREP MATCH', exact: true }).click();
      const chosen = page.getByRole('button', { name: 'Especialidad prueba PREP MATCH', exact: true });
      assert.equal(await chosen.getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'Usar GPS', exact: true }).click();
      await page.getByText('No pudimos obtener tu ubicación. Elegí la localidad y escribí la dirección para continuar.', { exact: true }).waitFor();
      await page.getByLabel('Dirección', { exact: true }).fill('PRIVATE FIXTURE ADDRESS');
      await page.getByLabel('Localidad del servicio', { exact: true }).selectOption('ar-ba-mar-del-plata');
      assert.equal(await page.getByLabel('Ciudad', { exact: true }).inputValue(), 'Mar del Plata');
      await page.getByLabel('Describí el alcance del trabajo').fill('Trabajo de prueba de cobertura sin GPS, no contratar.');
      const requestPromise = page.waitForRequest(r => r.method() === 'POST' && r.url().includes('/rest/v1/orders'));
      const form = page.getByLabel('Describí el alcance del trabajo').locator('xpath=ancestor::form');
      await form.locator('button[type=submit]').click();
      const request = await requestPromise;
      const body = request.postDataJSON();
      assert.equal(body.location_id, 'ar-ba-mar-del-plata');
      assert.equal(body.client_lat, null);
      assert.equal(typeof body.required_specialty_id, 'number');
      await page.getByText('Solicitud de presupuesto publicada.', { exact: false }).waitFor();
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `outputs/prep-match-001/browser-${width}.png` });
      results.push({ width, explicitSpecialty: true, manualFallback: true, realPublication: true, overflow: false });
      await context.close();
    }
    writeFileSync('outputs/prep-match-001/browser-results.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
