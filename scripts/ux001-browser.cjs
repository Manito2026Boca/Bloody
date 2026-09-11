const assert = require('node:assert/strict');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixture = JSON.parse(readFileSync(resolve('outputs/norm014/fixture.json')));
const baseUrl = process.env.UX001_APP_URL || 'http://localhost:3010';
const outputDir = resolve('outputs/ux001');
mkdirSync(outputDir, { recursive: true });

async function login(page, actor) {
  await page.goto(baseUrl);
  await page.getByLabel('Email', { exact: true }).fill(actor.email);
  await page.locator('input[type=password]').fill(actor.password);
  await page.locator('button[type=submit]').click();
  await page.locator('.v6-experience-switch').waitFor({ timeout: 45000 });
}

async function assertViewport(page, label) {
  const metrics = await page.evaluate(() => ({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bottomNavigation: Boolean(document.querySelector('.v6-bottom')),
  }));
  assert(metrics.bottomNavigation, `${label}: missing bottom navigation`);
  assert(metrics.scrollWidth <= metrics.innerWidth + 1, `${label}: horizontal overflow ${metrics.scrollWidth}/${metrics.innerWidth}`);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    for (const width of [390, 1440]) {
      const clientContext = await browser.newContext({ viewport: { width, height: 844 } });
      const clientPage = await clientContext.newPage();
      const clientErrors = [];
      clientPage.on('pageerror', error => clientErrors.push(error.message));
      await login(clientPage, fixture.actors.client);
      await clientPage.getByRole('button', { name: 'Cliente', exact: true }).click();
      await clientPage.getByText('¿Qué necesitás resolver?', { exact: true }).waitFor();
      for (const destination of ['Inicio', 'Trabajos', 'Mensajes', 'Cuenta']) {
        assert.equal(await clientPage.locator('.v6-bottom').getByRole('button', { name: destination, exact: true }).count(), 1);
      }
      await assertViewport(clientPage, `client home ${width}`);
      await clientPage.screenshot({ path: resolve(outputDir, `client-home-${width}.png`), fullPage: true });

      const finder = clientPage.getByLabel('Servicio o problema');
      await finder.fill('Necesito un plomero por una pérdida de agua');
      await clientPage.getByRole('button', { name: 'Continuar', exact: true }).click();
      await clientPage.getByText('Paso 1 de 5', { exact: false }).waitFor();
      const description = clientPage.locator('.v6-request-stage textarea').first();
      await description.fill('Pierde agua debajo de la pileta desde ayer.');
      const specialties = clientPage.locator('.v6-request-stage .v6-chip-list button');
      if (await specialties.count()) await specialties.first().click();
      await clientPage.getByRole('button', { name: 'Continuar', exact: true }).click();
      await clientPage.getByText('¿Dónde es el trabajo?', { exact: true }).waitFor();
      assert.equal(await clientPage.getByText('Te vamos a pedir permiso en este paso.', { exact: true }).count(), 1);
      await clientPage.getByRole('button', { name: 'Atrás', exact: true }).click();
      assert.equal(await description.inputValue(), 'Pierde agua debajo de la pileta desde ayer.');
      await assertViewport(clientPage, `client request ${width}`);
      await clientPage.screenshot({ path: resolve(outputDir, `client-request-${width}.png`), fullPage: true });

      await clientPage.locator('.v6-request-header').getByRole('button', { name: 'Volver', exact: true }).click();
      await clientPage.locator('.v6-bottom').getByRole('button', { name: 'Trabajos', exact: true }).click();
      await clientPage.getByRole('tab', { name: 'Activos', exact: true }).waitFor();
      assert(await clientPage.locator('.v6-order-guidance').count() > 0, `client jobs ${width}: missing next-step guidance`);
      await assertViewport(clientPage, `client jobs ${width}`);
      await clientPage.screenshot({ path: resolve(outputDir, `client-jobs-${width}.png`), fullPage: true });
      await clientPage.locator('.v6-bottom').getByRole('button', { name: 'Mensajes', exact: true }).click();
      await clientPage.getByRole('heading', { name: 'Mensajes', exact: true }).waitFor();
      await assertViewport(clientPage, `client messages ${width}`);
      assert.deepEqual(clientErrors, [], `client page errors: ${clientErrors.join('; ')}`);
      await clientContext.close();

      const professionalContext = await browser.newContext({ viewport: { width, height: 844 } });
      const professionalPage = await professionalContext.newPage();
      const professionalErrors = [];
      professionalPage.on('pageerror', error => professionalErrors.push(error.message));
      await login(professionalPage, fixture.actors.pro);
      await professionalPage.getByRole('button', { name: 'Profesional', exact: true }).click();
      await professionalPage.getByText(/Disponible para pedidos Ahora|Pedidos Ahora pausados/).waitFor();
      for (const destination of ['Hoy', 'Trabajos', 'Agenda', 'Cuenta']) {
        assert.equal(await professionalPage.locator('.v6-bottom').getByRole('button', { name: destination, exact: true }).count(), 1);
      }
      await assertViewport(professionalPage, `professional today ${width}`);
      await professionalPage.screenshot({ path: resolve(outputDir, `professional-today-${width}.png`), fullPage: true });
      await professionalPage.locator('.v6-bottom').getByRole('button', { name: 'Agenda', exact: true }).click();
      await professionalPage.getByRole('heading', { name: 'Agenda', exact: true }).waitFor();
      await assertViewport(professionalPage, `professional agenda ${width}`);
      assert.deepEqual(professionalErrors, [], `professional page errors: ${professionalErrors.join('; ')}`);
      await professionalContext.close();

      results.push({ width, clientNavigation: true, progressiveRequest: true, preservesDraft: true, clientJobs: true, messages: true, professionalNavigation: true, agenda: true, horizontalOverflow: false });
    }
    writeFileSync(resolve(outputDir, 'browser-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
