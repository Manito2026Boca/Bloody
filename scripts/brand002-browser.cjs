const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

const baseUrl = process.env.BRAND002_BASE_URL || 'http://localhost:3010';
const qaPassword = process.env.MANITO_QA_PASSWORD;
assert(qaPassword, 'Missing MANITO_QA_PASSWORD');
const output = resolve(__dirname, '..', 'outputs', 'brand002');
mkdirSync(output, { recursive: true });

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(dimensions.scrollWidth <= dimensions.width + 1, `${label}: horizontal overflow`);
}

async function login(page, email) {
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(qaPassword);
  await page.locator('form').getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.getByRole('button', { name: 'Notificaciones', exact: true }).waitFor({ timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const checks = [];
  try {
    const authContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const auth = await authContext.newPage();
    await auth.goto(baseUrl, { waitUntil: 'networkidle' });
    const authLogo = auth.locator('img[alt="MANITO"]').first();
    await authLogo.waitFor();
    assert.match(await authLogo.getAttribute('src'), /brand%2Fmanito-logo\.svg|brand\/manito-logo\.svg/);
    await assertNoOverflow(auth, 'auth-390');
    await auth.screenshot({ path: resolve(output, 'auth-390.png') });
    await authContext.close();
    checks.push('auth 390');

    for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 1280, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await login(page, 'cliente.qa1@qa.manito.invalid');
      const header = page.locator('.v6-top');
      const mark = header.locator('img[alt="MANITO"]');
      assert.match(await mark.getAttribute('src'), /brand%2Fmanito-mark-light\.svg|brand\/manito-mark-light\.svg/);
      const box = await mark.boundingBox();
      assert(box && box.width <= 46 && box.height <= 46, `header mark too large at ${viewport.width}`);
      if (viewport.width <= 390) {
        const headerBox = await header.boundingBox();
        assert(headerBox && headerBox.height <= 86, `header too tall at ${viewport.width}: ${headerBox?.height}`);
      }
      await assertNoOverflow(page, `client-${viewport.width}`);
      await page.screenshot({ path: resolve(output, `client-${viewport.width}.png`) });

      await context.close();
      checks.push(`client ${viewport.width}`);
    }

    const proContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pro = await proContext.newPage();
    await pro.goto(baseUrl, { waitUntil: 'networkidle' });
    await login(pro, 'prof.plomeria@qa.manito.invalid');
    if (!(await pro.getByText('Disponible para pedidos Ahora', { exact: true }).count())) {
      await pro.getByRole('button', { name: 'Cambiar a experiencia Profesional', exact: true }).click();
    }
    await pro.getByText('Disponible para pedidos Ahora', { exact: true }).waitFor();
    const proMark = pro.locator('.v6-top img[alt="MANITO"]');
    assert.match(await proMark.getAttribute('src'), /brand%2Fmanito-mark-light\.svg|brand\/manito-mark-light\.svg/);
    await assertNoOverflow(pro, 'professional-390');
    await pro.screenshot({ path: resolve(output, 'professional-390.png') });
    await proContext.close();
    checks.push('professional 390');

    const manifest = await (await fetch(`${baseUrl}/manifest.webmanifest`)).json();
    assert(manifest.icons.every(icon => icon.src.startsWith('/brand/')), 'manifest contains legacy icons');
    for (const asset of manifest.icons) {
      const response = await fetch(`${baseUrl}${asset.src}`);
      assert(response.ok, `missing PWA asset ${asset.src}`);
    }
    checks.push('manifest and PWA icons');
    console.log(JSON.stringify({ passed: checks.length, checks }));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
