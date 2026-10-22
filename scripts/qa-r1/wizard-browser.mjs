import assert from 'node:assert/strict';
import { runCases, calls, settle, openJobs } from './harness.mjs';

export async function resolution(page, mode = 'Ahora', editing = false) {
  if (!editing) await page.locator('.v6-service').first().click();
  await page.locator('.v6-request-stage textarea').fill('Perdida sintetica debajo de la pileta de la cocina.');
  const next = () => page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true }).click();
  await next();
  await page.getByRole('heading', { name: /D[oó]nde es el trabajo/ }).waitFor();
  await next();
  await page.getByRole('button', { name: new RegExp(mode) }).click();
  await next();
  await page.getByRole('heading', { name: /Eleg[ií] c[oó]mo buscar|Prepar[aá] tu solicitud/ }).waitFor();
}

export async function review(page) {
  await resolution(page);
  await page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('heading', { name: /Revis[aá] antes de publicar/ }).waitFor();
  assert.equal((await calls(page, 'createV6Order')).length, 0, 'Review requires a separate publication action');
}

const cases = ['mouse', 'touch'].map(input => ({
  name: `n1-continue-${input}`, touch: input === 'touch',
  async run(page, result) {
    await resolution(page);
    assert.equal((await calls(page, 'createV6Order')).length, 0, 'No writes before resolution Continue');
    const button = page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true });
    result.before = await button.evaluate(element => ({ type: element.type, label: element.textContent, form: element.form.className }));
    if (input === 'touch') await button.tap(); else await button.click();
    await settle(page);
    const created = await calls(page, 'createV6Order');
    result.observations = { unwantedPublications: created.length, reviewVisible: await page.getByRole('heading', { name: /Revis[aá] antes de publicar/ }).count(), input };
    assert.equal(created.length, 0, 'N1: resolution Continue must not publish');
    await page.getByRole('heading', { name: /Revis[aá] antes de publicar/ }).waitFor();
    const publish = page.locator('.v6-request-actions button[type="submit"]');
    if (input === 'touch') await publish.tap(); else await publish.click();
    await page.waitForFunction(() => window.__qa.calls().filter(call => call.name === 'createV6Order').length === 1);
    assert.equal((await calls(page, 'createV6Order')).length, 1, 'Explicit publish creates exactly one synthetic order');
  },
}));
cases.push({ name: 'n1-earlier-enter', async run(page) {
  await page.locator('.v6-service').first().click();
  const draft = 'Borrador sintetico R1 preservado al navegar.';
  await page.locator('.v6-request-stage textarea').fill(draft);
  await page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true }).click();
  for (const name of ['Direcci\u00f3n', 'Ciudad']) {
    await page.getByLabel(name, { exact: true }).press('Enter');
    await settle(page);
    assert.equal((await calls(page, 'createV6Order')).length, 0, `Enter in ${name} must not publish`);
    await page.getByRole('heading', { name: /D[oó]nde es el trabajo/ }).waitFor();
  }
  await page.locator('.v6-request-actions').getByRole('button', { name: 'Atr\u00e1s', exact: true }).click();
  assert.equal(await page.locator('.v6-request-stage textarea').inputValue(), draft);
} });
for (const key of ['Enter', 'Space']) cases.push({ name: `n1-final-keyboard-${key.toLowerCase()}`, async run(page) {
  await review(page);
  const publish = page.locator('.v6-request-actions button[type="submit"]');
  await publish.focus(); await publish.press(key);
  await page.waitForFunction(() => window.__qa.calls().filter(call => call.name === 'createV6Order').length === 1);
  await settle(page); assert.equal((await calls(page, 'createV6Order')).length, 1);
} });
cases.push({ name: 'n1-delayed-double-click', async run(page, result) {
  await review(page);
  await page.evaluate(() => window.__qa.hold('createV6Order'));
  const publish = page.locator('.v6-request-actions button[type="submit"]');
  await publish.dblclick();
  await page.waitForFunction(() => window.__qa.state.pending.has('createV6Order'));
  await settle(page);
  assert.equal((await calls(page, 'createV6Order')).length, 1, 'Native double click makes one pending API call');
  assert(await publish.isDisabled(), 'Publish disabled while API pending');
  result.observations = { pendingWrites: 1, disabled: true };
  await page.evaluate(() => window.__qa.release('createV6Order'));
  await page.getByRole('heading', { name: 'Tus trabajos', exact: true }).waitFor();
  assert.equal((await calls(page, 'createV6Order')).length, 1);
} });
cases.push({ name: 'n1-failed-retry-back', async run(page) {
  await review(page);
  await page.evaluate(() => window.__qa.hold('createV6Order'));
  await page.locator('.v6-request-actions button[type="submit"]').click();
  await page.waitForFunction(() => window.__qa.state.pending.has('createV6Order'));
  await page.evaluate(() => window.__qa.release('createV6Order', true));
  await page.locator('.v6-toast.error').filter({ hasText: 'Synthetic failure: createV6Order' }).waitFor();
  assert(await page.locator('.v6-request-actions button[type="submit"]').isEnabled());
  await page.locator('.v6-request-actions').getByRole('button', { name: 'Atr\u00e1s', exact: true }).click();
  await page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true }).click();
  await settle(page);
  assert.equal((await calls(page, 'createV6Order')).length, 1, 'Back/Continue after failure must not retain publication intent');
  assert.match(await page.locator('.v6-review-list').innerText(), /Perdida sintetica debajo de la pileta/);
  await page.locator('.v6-request-actions button[type="submit"]').click();
  await page.getByRole('heading', { name: 'Tus trabajos', exact: true }).waitFor();
  assert.equal((await calls(page, 'createV6Order')).length, 2, 'One failed attempt and one explicit retry');
} });
cases.push({ name: 'n1-edit-precontractual', query: { scenario: 'edit' }, async run(page) {
  await openJobs(page);
  await page.getByRole('button', { name: 'Editar solicitud', exact: true }).click();
  await resolution(page, 'Presupuestar', true);
  await page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('heading', { name: /Revis[aá] los cambios/ }).waitFor();
  assert.equal((await calls(page, 'createV6Order')).length, 0);
  assert.equal((await calls(page, 'editV6UncontractedOrder')).length, 0, 'Continue cannot edit');
  await page.locator('.v6-request-actions button[type="submit"]').click();
  await page.getByRole('heading', { name: 'Tus trabajos', exact: true }).waitFor();
  assert.equal((await calls(page, 'editV6UncontractedOrder')).length, 1);
  assert.equal((await calls(page, 'createV6Order')).length, 0, 'Editing cannot create another order');
} });
if (process.argv[1]?.endsWith('wizard-browser.mjs')) await runCases(cases);
