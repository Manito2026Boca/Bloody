import assert from 'node:assert/strict';
import { runCases, calls, settle, openJobs } from './harness.mjs';

const cases = [];
for (const fail of [false, true]) cases.push({ name: `n3-advance-${fail ? 'error-retry' : 'delayed-success'}`, query: { scenario: 'accepted', actor: 'professional' }, async run(page, result) {
  await openJobs(page);
  await page.evaluate(() => window.__qa.hold('advanceV6Order'));
  const action = page.locator('.v6-order-guidance button').first();
  await action.dblclick();
  await page.waitForFunction(() => window.__qa.state.pending.has('advanceV6Order'));
  await settle(page);
  result.observations = { label: await action.innerText(), disabled: await action.isDisabled(), requests: (await calls(page, 'advanceV6Order')).length };
  assert.match(result.observations.label, /Procesando/i);
  assert(result.observations.disabled);
  assert.equal(result.observations.requests, 1);
  if (!fail) await page.evaluate(() => window.__qa.hold('listV6Orders'));
  await page.evaluate(fail => window.__qa.release('advanceV6Order', fail), fail);
  if (fail) {
    await page.locator('.v6-toast.error').filter({ hasText: 'Synthetic failure: advanceV6Order' }).waitFor();
    assert(await action.isEnabled(), 'Error restores actionable CTA');
    await action.click();
    await page.waitForFunction(() => window.__qa.calls().filter(call => call.name === 'advanceV6Order').length === 2);
  } else {
    await page.waitForFunction(() => window.__qa.state.pending.has('listV6Orders'));
    assert(await action.isDisabled(), 'Busy persists through refresh');
    await page.evaluate(() => window.__qa.release('listV6Orders'));
  }
  await page.locator('.v6-order-guidance').getByRole('button', { name: 'Marcar llegada', exact: true }).waitFor();
} });
cases.push({ name: 'n4-reservation-today-jobs-details', query: { scenario: 'manual', response: 'pending', actor: 'professional' }, async run(page, result) {
  await page.getByRole('button', { name: 'Aceptar trabajo', exact: true }).click();
  await page.waitForFunction(() => window.__qa.state.orders[0]?.status === 'pending_client_confirmation');
  const reservation = page.locator('.v6-content').getByText(/Esperando confirmaci[oó]n del Cliente/i);
  await reservation.first().waitFor();
  const today = await page.locator('.v6-content').innerText();
  assert.doesNotMatch(today, /No ten[eé]s trabajos programados para hoy/i, 'Own reservation remains visible in Today');
  const open = page.locator('.v6-content').getByRole('button', { name: /Ver (?:detalle|reserva)|Abrir trabajo/i });
  await open.first().click();
  await page.locator('.v6-price-confirmation').waitFor();
  assert.match(await page.locator('.v6-price-confirmation').innerText(), /todav[ií]a no est[aá] contratado|Esperando confirmaci[oó]n del Cliente/i);
  await page.locator('.v6-bottom').getByRole('button', { name: 'Hoy', exact: true }).click();
  await reservation.first().waitFor();
  await openJobs(page); await page.locator('.v6-price-confirmation').waitFor();
  assert.equal((await calls(page, 'acceptV6Order')).length, 1);
  result.observations = { acceptCalls: 1, todayAndJobs: true };
} });
cases.push({ name: 'n4-reservation-excludes-foreign', query: { scenario: 'reservation', actor: 'professional', reservationOwner: 'foreign' }, async run(page) {
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Reservas pendientes de confirmaci\u00f3n"]').length === 0);
  assert.equal(await page.locator('[aria-label="Reservas pendientes de confirmaci\u00f3n"]').count(), 0, 'Foreign reservation not actionable in Today');
} });
cases.push({ name: 'n4-own-reservation-deadline-elapsed-backend-pending', query: { scenario: 'reservation', actor: 'professional', deadline: 'expired' }, async run(page, result) {
  const reservation = page.getByRole('region', { name: 'Reservas pendientes de confirmaci\u00f3n', exact: true });
  await reservation.waitFor();
  await reservation.getByText(/Plazo terminado\. Actualizando estado\./).waitFor();
  assert.equal(await reservation.getByRole('button', { name: /Aceptar|Confirmar y contratar/i }).count(), 0);
  await reservation.getByRole('button', { name: /Ver (?:detalle|reserva)/i }).click();
  await page.locator('.v6-price-confirmation').waitFor();
  assert.equal(await page.getByRole('button', { name: /Aceptar trabajo|Confirmar y contratar/ }).count(), 0, 'Professional has detail only after deadline');
  result.observations = await page.evaluate(() => ({ backendStatus: window.__qa.state.orders[0].status, priceStatus: window.__qa.state.orders[0].price_confirmation_status }));
  assert.equal(result.observations.backendStatus, 'pending_client_confirmation');
  assert.equal(result.observations.priceStatus, 'pending');
  assert.equal((await calls(page, 'acceptV6Order')).length, 0);
} });
await runCases(cases);
