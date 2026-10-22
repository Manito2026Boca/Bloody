import assert from 'node:assert/strict';
import { runCases, openJobs, settle } from './harness.mjs';

const cases = [];
const rawEnum = /^(pending|price_confirmation_pending|accepted|rejected|expired|awaiting_client_choice)$/;
for (const response of ['pending', 'rejected', 'expired', 'awaiting_client_choice']) cases.push({
  name: `n2-n9-manual-${response}`, query: { scenario: 'manual', response },
  async run(page, result) {
    const problems = [];
    const recovery = response !== 'pending';
    result.home = await page.locator('.v6-focus-card').innerText();
    if (recovery && /Buscando un profesional|Ahora esperamos que un profesional|ya est[aá] buscando otra/i.test(result.home)) problems.push('Home implies automatic search instead of client decision');
    await openJobs(page);
    const card = page.locator('.v6-order'); await card.waitFor(); await settle(page);
    result.guidance = await card.locator('.v6-order-guidance').innerText();
    result.statusCopy = await card.locator('.v6-status').innerText();
    if (recovery) {
      if (/Buscando un profesional|Ahora esperamos que un profesional|ya est[aá] buscando otra/i.test(`${result.guidance} ${result.statusCopy}`)) problems.push('Order implies automatic search instead of client decision');
      if (!(await card.getByRole('button', { name: /Buscar autom[aá]ticamente|Buscar profesionales/ }).count())) problems.push('Missing existing automatic recovery action');
    }
    if (await card.getByRole('button', { name: /Mensaje|Compartir seguimiento/ }).count()) problems.push('Unassigned request offers chat/tracking');
    if (/chat/i.test(await card.locator('.v6-order-hint').allTextContents().then(rows => rows.join(' ')))) problems.push('Unassigned request invites chat');
    if (/ETA\s*\d/i.test(await card.locator('.v6-meta-row').innerText())) problems.push('Unassigned request shows ETA');
    for (const span of await card.locator('.v6-payment-box.action span').allTextContents()) if (rawEnum.test(span.trim())) problems.push(`Raw enum: ${span.trim()}`);
    assert.deepEqual(problems, [], problems.join('; '));
  },
});
cases.push({ name: 'n2-pending-expired-clock', query: { scenario: 'manual', response: 'pending', deadline: 'expired' }, async run(page) {
  await openJobs(page); const card = page.locator('.v6-order'); await card.waitFor();
  assert(await card.getByRole('button', { name: /Buscar autom[aá]ticamente/ }).isVisible(), 'Clock expiry exposes existing recovery');
  assert.doesNotMatch(await card.locator('.v6-order-guidance').innerText(), /tiene que responder|Ahora esperamos que un profesional/i);
} });
for (const actor of ['client', 'professional']) cases.push({ name: `n4-reservation-role-${actor}`, query: { scenario: 'reservation', actor }, async run(page) {
  await openJobs(page); await page.locator('.v6-order').waitFor();
  const status = await page.locator('.v6-order .v6-status').innerText();
  if (actor === 'professional') { assert.match(status, /cliente/i); assert.doesNotMatch(status, /tu confirmaci[oó]n|confirm[aá] el precio/i); }
  assert.match(await page.locator('.v6-price-confirmation').innerText(), actor === 'client' ? /REQUIERE TU DECISI[OÓ]N/i : /Esperando confirmaci[oó]n del Cliente/i);
} });
for (const actor of ['client', 'professional']) for (const paid of ['yes', 'no']) for (const rated of ['yes', 'no']) cases.push({
  name: `n7-${actor}-paid-${paid}-rated-${rated}`, query: { scenario: 'completed', actor, paid, rated },
  async run(page, result) {
    await openJobs(page); await page.getByRole('tab', { name: 'Historial', exact: true }).click();
    const card = page.locator('.v6-order'); await card.waitFor();
    await page.waitForFunction(() => window.__qa.calls().some(call => call.name === 'listV6OrderRatings'));
    await settle(page);
    result.guidance = await card.locator('.v6-order-guidance').innerText();
    const problems = [];
    if (rated === 'yes' && /calific[aá](?:\s|[,.])|dej[aá].*calificaci[oó]n/i.test(result.guidance)) problems.push('Guidance asks to rate already rated work');
    if (paid === 'yes' && /revis[aá].*pago|registr[aá].*pago|confirm[aá].*pago/i.test(result.guidance)) problems.push('Guidance asks payment task after confirmed payment');
    if (/coordin[aá]|cuando.*acepte|antes de finalizar/i.test(await card.locator('.v6-order-hint').allTextContents().then(rows => rows.join(' ')))) problems.push('Terminal header invites active coordination');
    if (/ETA\s*\d/i.test(await card.locator('.v6-meta-row').innerText())) problems.push('Terminal ETA');
    const rateButton = card.getByRole('button', { name: 'Calificar', exact: true });
    if (rated === 'yes' && await rateButton.count()) problems.push('Rating form after existing rating');
    await card.getByRole('region', { name: 'Constancia final del trabajo' }).waitFor();
    assert.deepEqual(problems, [], problems.join('; '));
  },
});
for (const loading of ['error', 'pending']) cases.push({ name: `n7-unknown-closure-${loading}`, query: { scenario: 'completed', paymentLoad: loading, ratingLoad: loading }, async run(page, result) {
  await openJobs(page); await page.getByRole('tab', { name: 'Historial', exact: true }).click();
  const guidance = page.locator('.v6-order-guidance'); await guidance.waitFor(); await settle(page);
  result.guidance = await guidance.innerText();
  assert.doesNotMatch(result.guidance, /pendiente.*pago|registr[aá]\s.*pago|calific[aá](?:\s|[,.])|falta.*calificaci[oó]n/i, 'Unknown loads must not invent unpaid/unrated tasks');
  assert.equal(await page.locator('.v6-order').getByRole('button', { name: 'Calificar', exact: true }).count(), 0, 'Unknown/error rating load cannot expose rating submission');
} });
for (const actor of ['client', 'professional']) for (const payment of ['refunded', 'partially_refunded', 'not_required']) cases.push({
  name: `n7-${actor}-${payment}`, query: { scenario: 'completed', actor, orderPayment: payment, rated: 'yes', ...(payment === 'not_required' ? {} : { payment }) },
  async run(page, result) {
    await openJobs(page); await page.getByRole('tab', { name: 'Historial', exact: true }).click();
    const guidance = page.locator('.v6-order-guidance'); await guidance.waitFor(); await settle(page);
    result.guidance = await guidance.innerText();
    assert.doesNotMatch(result.guidance, /pago.*pendiente|pendiente.*pago|registr[aá]\s.*pago|pago.*confirmado|confirm[aá]\s.*pago/i, 'Refund/no-payment-required must not become debt or confirmed payment');
  },
});
cases.push({ name: 'n7-historical-approval-after-refund', query: { scenario: 'completed', orderPayment: 'refunded', payment: 'refunded', paymentHistory: 'approved-refunded', rated: 'yes' }, async run(page, result) {
  await openJobs(page); await page.getByRole('tab', { name: 'Historial', exact: true }).click();
  const guidance = page.locator('.v6-order-guidance'); await guidance.waitFor(); await settle(page);
  result.guidance = await guidance.innerText();
  assert.doesNotMatch(result.guidance, /pago.*confirmado|pago.*pendiente|pendiente.*pago/i, 'Historical approved payment cannot override the current refund');
} });
cases.push({ name: 'n7-fulfilled-empty-payments-unknown', query: { scenario: 'completed', paid: 'no', rated: 'yes' }, async run(page, result) {
  await openJobs(page); await page.getByRole('tab', { name: 'Historial', exact: true }).click();
  const guidance = page.locator('.v6-order-guidance'); await guidance.waitFor(); await settle(page);
  result.guidance = await guidance.innerText();
  assert.doesNotMatch(result.guidance, /pago.*pendiente|pendiente.*pago|registr[aá]\s.*pago/i, 'Fulfilled empty array, including missing-table fallback, does not prove debt');
} });
cases.push({ name: 'n7-disputed-payment', query: { scenario: 'completed', actor: 'client', payment: 'disputed' }, async run(page) {
  await openJobs(page); await page.getByRole('tab', { name: 'Historial', exact: true }).click();
  await page.locator('.v6-order .v6-alert').filter({ hasText: /Pago en revisi[oó]n/ }).waitFor();
  assert.doesNotMatch(await page.locator('.v6-order-guidance').innerText(), /pago confirmado/i);
} });
for (const status of ['accepted', 'en_camino', 'en_sitio', 'trabajando', 'cancelled']) cases.push({ name: `n9-eta-${status}`, query: { scenario: 'accepted', status }, async run(page) {
  await openJobs(page); if (status === 'cancelled') await page.getByRole('tab', { name: 'Historial', exact: true }).click();
  const meta = page.locator('.v6-order .v6-meta-row'); await meta.waitFor();
  const copy = await meta.innerText();
  if (['accepted', 'en_camino'].includes(status)) assert.match(copy, /estimad[oa].*20|20.*estimad[oa]/i, 'Valid ETA must be explicitly estimated');
  else assert.doesNotMatch(copy, /ETA|20 min/i, 'ETA must be phase-appropriate');
} });
await runCases(cases);
