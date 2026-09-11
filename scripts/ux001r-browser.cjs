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

async function checkLastControlAboveBars(page, control, label) {
  const stage = page.locator('.v6-request-stage');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await stage.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForTimeout(250);
  }
  const [controlBox, actionsBox, navBox] = await Promise.all([
    control.boundingBox(),
    page.locator('.v6-request-actions').boundingBox(),
    page.locator('.v6-bottom').boundingBox(),
  ]);
  assert(controlBox && actionsBox && navBox, `${label}: missing layout boxes`);
  const viewportHeight = await page.evaluate(() => innerHeight);
  assert(controlBox.y + controlBox.height <= actionsBox.y + 1, `${label}: last control is hidden by request actions (${JSON.stringify({ controlBox, actionsBox, navBox, viewportHeight })})`);
  assert(actionsBox.y + actionsBox.height <= navBox.y + 1, `${label}: request actions overlap bottom navigation`);
  assert(actionsBox.y >= 0 && actionsBox.y + actionsBox.height <= viewportHeight + 1, `${label}: request actions are outside viewport`);
  assert(navBox.y >= 0 && navBox.y + navBox.height <= viewportHeight + 1, `${label}: bottom navigation is outside viewport`);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const checks = [];
  try {
    for (const width of [360, 390, 1280]) {
      const height = width === 360 ? 800 : 844;
      const context = await browser.newContext({ viewport: { width, height }, permissions: ['geolocation'], geolocation: { latitude: -38.0055, longitude: -57.5426 } });
      const page = await context.newPage();
      await page.route('https://nominatim.openstreetmap.org/**', route => {
        const isSearch = new URL(route.request().url()).pathname.endsWith('/search');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(isSearch
            ? [{ lat: '-37.9731', lon: '-57.5477', display_name: 'Avenida Constitución 5000, Mar del Plata' }]
            : { display_name: 'Centro, Mar del Plata, Buenos Aires, Argentina', address: { city: 'Mar del Plata', state: 'Buenos Aires' } }),
        });
      });
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
      if (width <= 390) {
        await page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true }).click();
        await page.getByRole('heading', { name: '¿Dónde es el trabajo?', exact: true }).waitFor();
        await page.getByRole('button', { name: /Usar ubicación del teléfono/ }).click();
        await page.getByRole('button', { name: 'Usar esta ubicación', exact: true }).click();
        await page.getByRole('button', { name: 'Cambiar ubicación', exact: true }).click();
        await page.getByLabel('Dirección', { exact: true }).fill('Avenida Constitución 5000');
        await page.getByLabel('Ciudad', { exact: true }).fill('Mar del Plata');
        const locationSelect = page.getByLabel('Localidad del servicio', { exact: true });
        const marDelPlataOption = locationSelect.locator('option').filter({ hasText: 'Mar del Plata' }).first();
        await locationSelect.selectOption(await marDelPlataOption.getAttribute('value'));
        await page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true }).click();
        await page.getByRole('heading', { name: '¿Cómo querés avanzar?', exact: true }).waitFor();
        await checkLastControlAboveBars(page, page.getByRole('button', { name: /Presupuestar/ }), `mode-${width}`);
        await page.screenshot({ path: resolve(out, `request-mode-${width}.png`) });

        await page.locator('.v6-request-actions').getByRole('button', { name: 'Atrás', exact: true }).click();
        await page.getByText('Ubicación manual confirmada', { exact: true }).waitFor();
        assert.match(await page.locator('.v6-location-confirmation.confirmed strong').innerText(), /Constitución 5000/);
        await page.screenshot({ path: resolve(out, `request-location-manual-${width}.png`) });
        await page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true }).click();
        await page.getByRole('button', { name: /Ahora/ }).click();
        await page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true }).click();
        await page.getByRole('heading', { name: 'Elegí cómo buscar', exact: true }).waitFor();
        const manualChoice = page.getByRole('button', { name: /Elegir profesional/ });
        await manualChoice.click({ timeout: 15000 });
        await page.getByText(/Ariel .*Caño.* Ibagaza/).waitFor({ timeout: 15000 });
        const cash = page.locator('.v6-request-stage').getByRole('button', { name: /Efectivo/ });
        await checkLastControlAboveBars(page, cash, `resolution-${width}`);
        await page.screenshot({ path: resolve(out, `request-resolution-${width}.png`) });

        await page.setViewportSize({ width, height: 700 });
        await checkLastControlAboveBars(page, cash, `resolution-dynamic-${width}`);
      }
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
