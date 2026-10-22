import assert from 'node:assert/strict';
import { runCases, calls, settle } from './harness.mjs';
import { resolution } from './wizard-browser.mjs';

const cases = [];
for (const eligibility of ['pending', 'error', 'empty', 'ready']) cases.push({
  name: `n5-eligibility-${eligibility}`, query: { scenario: 'recommendations', eligibility, candidates: 'filtered' },
  async run(page, result) {
    await resolution(page);
    await page.waitForFunction(() => window.__qa.calls().some(call => call.name === 'rpc:list_eligible_request_professionals' && call.args[0].p_data.service_id === 901));
    await settle(page);
    result.observations = { copy: await page.locator('.v6-request-stage').innerText() };
    const none = page.getByText(/No encontramos profesionales compatibles con estos criterios/);
    if (eligibility === 'pending') {
      assert.equal(await none.count(), 0, 'Pending is not zero availability');
      await page.getByText(/Verificando compatibilidad/).waitFor();
      await page.evaluate(() => window.__qa.eligibility(['r1-pro-synthetic']));
    }
    if (eligibility === 'error') {
      assert.equal(await none.count(), 0, 'Failed eligibility is not zero availability');
      await page.getByText(/No pudimos verificar qui[eé]nes son compatibles/).waitFor();
      assert(await page.getByRole('button', { name: /Elegir profesional/ }).isDisabled());
      return;
    }
    if (eligibility === 'empty') {
      await none.waitFor(); assert(await page.getByRole('button', { name: /Elegir profesional/ }).isDisabled()); return;
    }
    const manual = page.getByRole('button', { name: /Elegir profesional/ });
    await manual.click();
    const candidate = page.locator('.v6-pro-card'); await candidate.waitFor();
    assert.equal(await candidate.count(), 1, 'Only eligible backend-returned candidate is selectable');
    assert.match(await candidate.innerText(), /Profesional sintetico R1/);
    assert.doesNotMatch(await page.locator('.v6-request-stage').innerText(), /Profesional excluido sintetico/);
    await page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('heading', { name: /Revis[aá] antes de publicar/ }).waitFor();
    assert.match(await page.locator('.v6-review-list').innerText(), /Profesional sintetico R1/);
    assert.match(await page.locator('.v6-next-step').innerText(), /Profesional sintetico R1/);
    assert.doesNotMatch(await page.locator('.v6-next-step').innerText(), /\d+\s*(?:minutos|min\b)|hasta las \d/i, 'No exact response deadline before publication');
    await page.locator('.v6-request-actions button[type="submit"]').click();
    await page.waitForFunction(() => window.__qa.calls().some(call => call.name === 'createV6Order'));
    const [write] = await calls(page, 'createV6Order');
    assert.equal(write.args[0].assignmentMode, 'manual');
    assert.equal(write.args[0].preferredProfessionalId, 'r1-pro-synthetic');
  },
});
cases.push({ name: 'n5-home-recommendation-unevaluated', query: { scenario: 'recommendations' }, async run(page) {
  await page.locator('.v6-finder textarea').fill('plomero');
  const recommendation = page.locator('.v6-recommendation'); await recommendation.waitFor();
  const copy = await recommendation.innerText();
  assert.doesNotMatch(copy, /No hay profesionales|No encontramos profesionales|sin disponibilidad/i, 'Different/unevaluated service does not mean unavailable');
  assert.doesNotMatch(copy, /Profesional sintetico R1.*compatible|compatible.*Profesional sintetico R1/is, 'Ranking alone cannot claim backend compatibility');
  await recommendation.getByRole('button', { name: 'Pedir', exact: true }).click();
  await page.getByRole('heading', { name: /Qu[eé] necesit[aá]s resolver/ }).waitFor();
} });
cases.push({ name: 'n5-stale-eligibility', query: { scenario: 'recommendations' }, async run(page) {
  await resolution(page);
  const manual = page.getByRole('button', { name: /Elegir profesional/ }); await manual.click();
  await page.locator('.v6-pro-card').waitFor();
  await page.evaluate(() => { window.__qa.state.eligibility = 'pending'; });
  await page.locator('.v6-request-actions').getByRole('button', { name: 'Atr\u00e1s', exact: true }).click();
  await page.getByRole('button', { name: /Presupuestar/ }).click();
  await settle(page);
  await page.getByRole('button', { name: /Ahora/ }).click();
  await page.locator('.v6-request-actions').getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByText(/Verificando compatibilidad/).waitFor();
  assert.equal(await page.locator('.v6-pro-card').count(), 0, 'Old candidate list not reused for unevaluated current key');
  assert.equal(await page.getByText(/No encontramos profesionales compatibles/).count(), 0, 'Stale result is not empty success');
} });
await runCases(cases);
