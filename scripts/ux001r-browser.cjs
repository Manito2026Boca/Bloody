const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const baseUrl = process.env.UX001R_APP_URL || 'http://localhost:3010';
const password = process.env.MANITO_QA_PASSWORD;
assert(password, 'Missing MANITO_QA_PASSWORD');
const out = resolve('outputs/ux001r/browser');
mkdirSync(out, { recursive: true });

async function login(page, email) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  if (!(await page.getByLabel('Email', { exact: true }).count())) {
    throw new Error(`Auth form missing at ${baseUrl}: ${(await page.locator('body').innerText()).slice(0, 500)}`);
  }
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form').getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.locator('.v6-bottom').waitFor({ timeout: 45000 });
}

async function checkViewport(page, label) {
  const result = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(result.scrollWidth <= result.width + 1, `${label}: horizontal overflow ${result.scrollWidth}/${result.width}`);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const checks = [];
  try {
    for (const width of [360, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, permissions: ['geolocation'], geolocation: { latitude: -38.0055, longitude: -57.5426 } });
      const page = await context.newPage();
      await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ display_name: 'Centro, Mar del Plata, Buenos Aires, Argentina', address: { city: 'Mar del Plata', state: 'Buenos Aires' } }) }));
      await login(page, 'cliente.qa1@qa.manito.invalid');
      await checkViewport(page, `client-home-${width}`);
      await page.screenshot({ path: resolve(out, `client-home-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Notificaciones', exact: true }).click();
      await page.locator('.v6-notification-panel').waitFor();
      await page.screenshot({ path: resolve(out, `notifications-${width}.png`), fullPage: true });
      await page.locator('.v6-notification-panel').getByRole('button', { name: /Cerrar/ }).click();

      await page.locator('.v6-header-location').click();
      await page.getByRole('heading', { name: 'Tu ubicación', exact: true }).waitFor();
      await page.screenshot({ path: resolve(out, `location-sheet-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: /Usar ubicación del teléfono/ }).click();
      await page.getByText(/Ubicación actualizada:/).waitFor({ timeout: 15000 });
      await checkViewport(page, `location-${width}`);

      const finder = page.getByLabel('Servicio o problema');
      await finder.fill('Plomería pérdida de agua');
      await page.getByRole('button', { name: 'Continuar', exact: true }).click();
      await page.locator('.v6-request-stage textarea').fill('Pierde agua debajo de la pileta desde ayer.');
      const specialty = page.locator('.v6-request-stage .v6-chip-list button').first();
      if (await specialty.count()) await specialty.click();
      await checkViewport(page, `request-${width}`);
      await page.screenshot({ path: resolve(out, `request-need-${width}.png`), fullPage: true });
      await context.close();
      checks.push(`client ${width}px`);
    }

    const proContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pro = await proContext.newPage();
    await login(pro, 'prof.plomeria@qa.manito.invalid');
    if (!(await pro.getByText('Disponible para pedidos Ahora', { exact: true }).count())) {
      await pro.getByRole('button', { name: 'Cambiar a experiencia Profesional', exact: true }).click();
    }
    await pro.getByText('Disponible para pedidos Ahora', { exact: true }).waitFor();
    await checkViewport(pro, 'professional-home');
    await pro.screenshot({ path: resolve(out, 'professional-home-390.png'), fullPage: true });
    await pro.locator('.v6-bottom').getByRole('button', { name: 'Agenda', exact: true }).click();
    await pro.getByRole('heading', { name: 'Agenda', exact: true }).waitFor();
    await pro.getByText('Tu horario habitual', { exact: true }).waitFor({ timeout: 15000 });
    await pro.screenshot({ path: resolve(out, 'professional-agenda-390.png'), fullPage: true });
    await pro.locator('.v6-bottom').getByRole('button', { name: 'Cuenta', exact: true }).click();
    await pro.getByRole('button', { name: 'Editar perfil profesional', exact: true }).click();
    await pro.getByRole('button', { name: '2. Qué hacés', exact: true }).click();
    await pro.getByText('Servicios que ofrecés', { exact: true }).waitFor();
    await pro.screenshot({ path: resolve(out, 'professional-services-390.png'), fullPage: true });
    await pro.getByRole('button', { name: '+ Agregar servicio', exact: true }).click();
    await pro.screenshot({ path: resolve(out, 'professional-service-catalog-390.png'), fullPage: true });
    await checkViewport(pro, 'professional-account');
    await proContext.close();
    checks.push('professional 390px');
    console.log(JSON.stringify({ passed: checks.length, checks }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
