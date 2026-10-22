import assert from 'node:assert/strict';
import { runCases, calls, settle, openJobs } from './harness.mjs';

const clientMode = page => page.getByRole('button', { name: 'Cambiar a experiencia Profesional', exact: true });
const proMode = page => page.getByRole('button', { name: 'Cambiar a experiencia Cliente', exact: true });
const key = 'manito:preferred-mode:v1:r1-pro-synthetic';
async function noAvailabilityWrites(page) {
  assert.equal((await calls(page, 'setV6Availability')).length, 0);
}
const cases = [{ name: 'n8-first-switch-reload-accounts', autoProfessional: false, query: { scenario: 'experience', actor: 'professional' }, async run(page) {
  await clientMode(page).waitFor();
  await clientMode(page).click(); await proMode(page).waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), 'professional');
  await page.reload(); await proMode(page).waitFor();
  await page.evaluate(() => window.__qa.signOut());
  await page.waitForFunction(() => !document.querySelector('.v6-bottom'));
  await page.evaluate(() => window.__qa.signIn('professional-b'));
  await clientMode(page).waitFor();
  await page.evaluate(() => window.__qa.signOut());
  await page.waitForFunction(() => !document.querySelector('.v6-bottom'));
  await page.evaluate(() => window.__qa.signIn('professional'));
  await proMode(page).waitFor(); await noAvailabilityWrites(page);
} }];
for (const catalog of ['empty', 'error']) cases.push({ name: `n8-catalog-${catalog}`, autoProfessional: false, query: { scenario: 'experience', actor: 'professional', catalog },
  async init(context) { await context.addInitScript(key => localStorage.setItem(key, 'professional'), key); },
  async run(page) { await proMode(page).waitFor(); await noAvailabilityWrites(page); },
});
cases.push({ name: 'n8-explicit-professional-intent', autoProfessional: false, query: { intent: 'professional' }, async run(page) {
  await proMode(page).waitFor(); assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null); await noAvailabilityWrites(page);
} });
cases.push({ name: 'n8-notification-wins-client-preference', autoProfessional: false, query: { scenario: 'accepted', actor: 'professional', notification: '11111111-1111-4111-8111-111111111111' },
  async init(context) { await context.addInitScript(key => localStorage.setItem(key, 'client'), key); },
  async run(page) { await proMode(page).waitFor(); await settle(page); assert.equal(await page.evaluate(key => localStorage.getItem(key), key), 'client'); await noAvailabilityWrites(page); },
});
for (const width of [360, 390]) for (const actor of ['client', 'professional']) cases.push({
  name: `pd-cancel-guide-${actor}-${width}`, width, height: width === 360 ? 800 : 844, query: { scenario: 'accepted', status: 'trabajando', actor },
  async run(page) {
    await openJobs(page);
    const guide = page.getByLabel('Ayuda durante el trabajo');
    await guide.locator('summary').click();
    assert.match(await guide.innerText(), /no se puede cancelar/);
    assert.match(await guide.innerText(), /todav[ií]a no tiene un canal de asistencia/);
    assert.equal(await page.getByRole('button', { name: /Cancelar servicio|Cancelar trabajo/ }).count(), 0);
    await guide.getByRole('button', { name: 'Ver información de Protección', exact: true }).click();
    assert(await page.locator('.v6-commercial-details').evaluate(element => element.open));
    assert.equal((await calls(page, 'cancelV6Order')).length, 0);
    assert.equal((await calls(page, 'addV6Complaint')).length, 0);
    assert.equal(await page.locator('.v6-order').getByRole('button', { name: 'Solicitar revisión', exact: true }).count(), 0);
    assert.equal(await page.locator('.v6-order').getByRole('button', { name: 'Abrir chat del trabajo', exact: true }).count(), 1);
    if (actor === 'professional') assert.equal(await page.locator('.v6-pin-callout').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  },
});
await runCases(cases);
