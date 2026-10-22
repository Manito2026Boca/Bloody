import assert from 'node:assert/strict';
import { runCases, calls, settle, openJobs } from './harness.mjs';

const clientMode = page => page.getByRole('button', { name: 'Cambiar a experiencia Profesional', exact: true });
const proMode = page => page.getByRole('button', { name: 'Cambiar a experiencia Cliente', exact: true });
const prefix = 'manito:preferred-mode:v1:';
const proKey = `${prefix}r1-pro-synthetic`;
const clientKey = `${prefix}r1-client-synthetic`;
const stored = (page, key) => page.evaluate(key => localStorage.getItem(key), key);
const adminCalls = page => page.evaluate(() => window.__qa.calls().filter(call => /admin/i.test(call.name)).map(call => call.name));
// Seeds only while the key is absent so a reload never overwrites an explicit choice made in the page.
const seedIfAbsent = (key, value) => async context => {
  await context.addInitScript(([key, value]) => { if (localStorage.getItem(key) === null) localStorage.setItem(key, value); }, [key, value]);
};
async function noAvailabilityWrites(page) {
  assert.equal((await calls(page, 'setV6Availability')).length, 0);
}
async function noAdmin(page) {
  assert.deepEqual(await adminCalls(page), []);
  assert.equal(await page.getByRole('button', { name: /admin/i }).count(), 0);
}

const cases = [];

cases.push({ name: 'adv-invalid-stored-preference-admin-is-client', autoProfessional: false, query: { scenario: 'experience' },
  async init(context) { await context.addInitScript(key => localStorage.setItem(key, 'admin'), clientKey); },
  async run(page) {
    await clientMode(page).waitFor(); await settle(page);
    assert.equal(await proMode(page).count(), 0);
    assert.equal(await clientMode(page).count(), 1);
    await noAdmin(page); await noAvailabilityWrites(page);
  } });

cases.push({ name: 'adv-preference-storage-denied-explicit-switch-then-client', autoProfessional: false, query: { scenario: 'experience', actor: 'professional' },
  async init(context) {
    await context.addInitScript(prefix => {
      const getItem = Storage.prototype.getItem, setItem = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) {
        if (String(key).startsWith(prefix)) throw new DOMException('preference storage denied', 'SecurityError');
        return getItem.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (String(key).startsWith(prefix)) throw new DOMException('preference storage denied', 'SecurityError');
        return setItem.call(this, key, value);
      };
    }, prefix);
  },
  async run(page) {
    await clientMode(page).waitFor();
    await clientMode(page).click();
    await proMode(page).waitFor();
    await page.getByRole('heading', { name: 'Hoy', exact: true }).waitFor();
    const preferenceKeys = () => page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)), prefix);
    assert.deepEqual(await preferenceKeys(), []);
    await page.reload();
    await page.locator('.v6-bottom').waitFor();
    await clientMode(page).waitFor(); await settle(page);
    assert.equal(await proMode(page).count(), 0);
    assert.deepEqual(await preferenceKeys(), []);
    await noAvailabilityWrites(page); await noAdmin(page);
  } });

cases.push({ name: 'adv-service-deeplink-beats-professional-without-overwrite', autoProfessional: false, query: { intent: 'service', service: 'plomeria' },
  init: seedIfAbsent(clientKey, 'professional'),
  async run(page) {
    await clientMode(page).waitFor();
    await page.waitForFunction(() => location.search === '');
    await settle(page);
    assert.equal(await proMode(page).count(), 0);
    assert.equal(await stored(page, clientKey), 'professional');
    await noAvailabilityWrites(page); await noAdmin(page);
    await page.reload();
    await page.locator('.v6-bottom').waitFor();
    await proMode(page).waitFor(); await settle(page);
    assert.equal(await clientMode(page).count(), 0);
    assert.equal(await stored(page, clientKey), 'professional');
    await noAvailabilityWrites(page); await noAdmin(page);
  } });

cases.push({ name: 'adv-separate-browser-context-does-not-inherit-preference', autoProfessional: false, query: { scenario: 'experience', actor: 'professional' },
  async run(page, result, { context, base }) {
    await clientMode(page).waitFor();
    await clientMode(page).click(); await proMode(page).waitFor();
    assert.equal(await stored(page, proKey), 'professional');
    const browser = context.browser();
    assert(browser, 'Playwright browser handle unavailable; cannot create a second device context');
    const other = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const problems = [];
    try {
      await other.route('**/*', route => {
        if (new URL(route.request().url()).origin === base) return route.continue();
        problems.push(route.request().url()); return route.abort('blockedbyclient');
      });
      const second = await other.newPage(); second.setDefaultTimeout(6000);
      second.on('pageerror', error => problems.push(error.message));
      second.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
      await second.goto(`${base}/?${new URLSearchParams({ scenario: 'experience', actor: 'professional' })}`);
      await second.locator('.v6-bottom').waitFor();
      await clientMode(second).waitFor(); await settle(second);
      assert.equal(await proMode(second).count(), 0);
      assert.equal(await stored(second, proKey), null);
      assert.equal((await calls(second, 'setV6Availability')).length, 0);
    } finally { await other.close(); }
    assert.deepEqual(problems, []);
    assert.equal(await stored(page, proKey), 'professional');
    await noAvailabilityWrites(page);
  } });

for (const [scenario, label] of [['accepted', 'accepted'], ['completed', 'completed']]) for (const actor of ['client', 'professional']) cases.push({
  name: `adv-no-in-progress-help-${label}-${actor}`, query: { scenario, actor },
  async run(page) {
    await openJobs(page);
    if (scenario === 'completed') await page.getByRole('tab', { name: 'Historial', exact: true }).click();
    await page.locator('.v6-order').first().waitFor();
    assert.equal(await page.locator('.v6-order').count(), 1);
    assert.equal(await page.getByLabel('Ayuda durante el trabajo').count(), 0);
    assert.equal(await page.getByText('Tengo un problema', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Abrir chat del trabajo', exact: true }).count(), 0);
    assert.equal((await calls(page, 'cancelV6Order')).length, 0);
    await noAvailabilityWrites(page); await noAdmin(page);
  },
});

cases.push({ name: 'adv-keyboard-toggle-persists-explicit-choice', autoProfessional: false, query: { scenario: 'experience', actor: 'professional' }, async run(page) {
  await clientMode(page).waitFor();
  assert.equal(await stored(page, proKey), null);
  await clientMode(page).focus(); await page.keyboard.press('Enter');
  await proMode(page).waitFor();
  assert.equal(await stored(page, proKey), 'professional');
  await proMode(page).focus(); await page.keyboard.press('Space');
  await clientMode(page).waitFor();
  assert.equal(await stored(page, proKey), 'client');
  await clientMode(page).focus(); await page.keyboard.press('Enter');
  await proMode(page).waitFor();
  await page.reload();
  await page.locator('.v6-bottom').waitFor();
  await proMode(page).waitFor();
  assert.equal(await stored(page, proKey), 'professional');
  await noAvailabilityWrites(page); await noAdmin(page);
} });

await runCases(cases);
