import assert from 'node:assert/strict';
import { runCases, calls, openJobs } from './harness.mjs';

const toClient = page => page.getByRole('button', { name: 'Cambiar a experiencia Cliente', exact: true });
const toProfessional = page => page.getByRole('button', { name: 'Cambiar a experiencia Profesional', exact: true });
const prefix = 'manito:preferred-mode:v1:';
const proId = 'r1-pro-synthetic', proBId = 'r1-pro-b-synthetic';
const proKey = `${prefix}${proId}`;
const pendingIntentKey = 'manito_pending_domain_intent_v1';
const orderA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const orderB = 'bbbbbbbb-0000-4000-8000-00000000000b';
const notificationId = 'cccccccc-0000-4000-8000-00000000000c';
const unavailable = 'Este trabajo no está disponible para esta cuenta. Revisá tus trabajos.';
const stored = (page, key) => page.evaluate(key => localStorage.getItem(key), key);
const preferenceKeys = page => page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)), prefix);
// Lets queued promise continuations and two frames run; deterministic, not a timed sleep.
const flush = page => page.evaluate(async () => {
  for (let i = 0; i < 4; i++) await new Promise(done => setTimeout(done, 0));
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
});
const heldCount = (page, count) => page.waitForFunction(count => window.__qa.held().length >= count, count);
const seedRace = config => context => context.addInitScript(config => {
  if (sessionStorage.getItem('qa-r1:race') === null) sessionStorage.setItem('qa-r1:race', JSON.stringify(config));
}, config);
const seedLocal = (key, value) => context => context.addInitScript(([key, value]) => {
  if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
}, [key, value]);

const cases = [];

// 1. Valid order intent, no authorized order, stored Professional.
// Order: mount stores intent -> profile loads -> intent consumed, listV6Orders has no match -> unavailable notice.
// Expected: notice shown AND the account preference (Professional) is restored, not the default Client.
cases.push({ name: 'race-order-intent-unavailable-restores-stored-professional', autoProfessional: false, query: { intent: 'order', order: orderA },
  async init(context) {
    await seedRace({ actor: 'professional', scenario: 'experience' })(context);
    await seedLocal(proKey, 'professional')(context);
  },
  async run(page) {
    await page.getByText(unavailable, { exact: true }).waitFor();
    await flush(page);
    assert.equal(await stored(page, proKey), 'professional');
    assert.equal(await toProfessional(page).count(), 0, 'app fell back to Client although the account preference is Professional');
    assert.equal(await toClient(page).count(), 1);
    assert.equal((await calls(page, 'setV6Availability')).length, 0);
  } });

// 2. Account A's order-intent lookup is pending while A logs out and B logs in; A's response is released late.
// Order: A loads -> A's intent listV6Orders held (2nd call, A only) -> signOut -> signIn B, B settles in Client
// -> release A's snapshot (contains A's professional order). B must keep mode, orders, notices, chat and URL.
cases.push({ name: 'race-stale-account-a-order-intent-cannot-affect-b', autoProfessional: false, query: { intent: 'order', order: orderA },
  async init(context) {
    await seedRace({ actor: 'professional', scenario: 'experience', holds: [{ name: 'listV6Orders', actorId: proId, skip: 1 }],
      orders: {
        [proId]: [{ id: orderA, client_id: 'r1-client-synthetic', professional_id: proId, description: 'Pedido privado de A sintetico' }],
        [proBId]: [{ id: orderB, client_id: proBId, professional_id: null, status: 'open', description: 'Pedido propio de B sintetico' }],
      } })(context);
  },
  async run(page) {
    await heldCount(page, 1);
    assert.equal((await page.evaluate(() => window.__qa.held()))[0].actorId, proId);
    await page.evaluate(() => window.__qa.signOut());
    await page.evaluate(() => window.__qa.signIn('professional-b'));
    await page.waitForFunction(() => window.__qa.calls().filter(call => call.name === 'listV6Orders').length >= 3);
    await page.locator('.v6-bottom').waitFor();
    await flush(page);
    assert.equal(await toProfessional(page).count(), 1, 'B must start in Client');
    await page.evaluate(() => window.__qa.releaseHeld(0));
    await flush(page);
    assert.equal(await toProfessional(page).count(), 1, 'stale A response switched B out of Client');
    assert.equal(await toClient(page).count(), 0);
    assert.equal(await page.getByText(unavailable, { exact: true }).count(), 0);
    assert.equal(await page.getByText('No pudimos abrir ese trabajo', { exact: false }).count(), 0);
    assert.equal(await page.getByText('Pedido privado de A sintetico', { exact: false }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Abrir chat del trabajo', exact: true }).count(), 0);
    assert.equal((await calls(page, 'listV6Workrooms')).length, 0);
    await openJobs(page);
    await page.locator('.v6-order').first().waitFor();
    assert.equal(await page.locator('.v6-order').count(), 1);
    assert.equal(await page.getByText('Pedido privado de A sintetico', { exact: false }).count(), 0);
    assert.equal(await toProfessional(page).count(), 1);
    assert.deepEqual(await preferenceKeys(page), []);
    const search = new URLSearchParams(await page.evaluate(() => location.search));
    assert.deepEqual([...search.keys()].sort(), ['actor'], 'unexpected URL state after stale A response');
  } });

// 3. Notification destination resolves while a secondary loadData request (listV6Services) is held, so
// profileLoading stays true. Only the pending-intent sessionStorage write fails (other storage intact).
// Order: profile set -> destination resolves -> authorized professional order opens Professional -> URL cleaned
// (still loading) -> in-page watcher releases services -> profileLoading false -> layout effect runs.
// The harness waits for .v6-bottom before run(), so the release happens from an init-script watcher keyed on
// observable facts (URL cleaned, destination fetched, order list fetched, call held), never on a timer.
// Expected: Professional survives; stored Client preference is not rewritten.
cases.push({ name: 'race-notification-destination-survives-late-profile-loading', autoProfessional: false, query: { notification: notificationId },
  async init(context) {
    await seedRace({ actor: 'professional', scenario: 'experience', holds: [{ name: 'listV6Services', actorId: proId }],
      orders: { [proId]: [{ id: orderA, client_id: 'r1-client-synthetic', professional_id: proId, description: 'Pedido de notificacion sintetico' }] } })(context);
    await seedLocal(proKey, 'client')(context);
    await context.addInitScript(key => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (String(name) === key) throw new DOMException('pending intent storage denied', 'SecurityError');
        return setItem.call(this, name, value);
      };
    }, pendingIntentKey);
    await context.addInitScript(() => {
      const count = name => window.__qa.calls().filter(call => call.name === name).length;
      const watch = () => {
        const qa = window.__qa;
        if (qa && qa.held().length === 1 && !qa.held()[0].released && !location.search.includes('notification')
          && count('getV6NotificationDestination') === 1 && count('listV6Orders') >= 2) {
          window.__raceReleasedAt = { search: location.search };
          qa.releaseHeld(0);
          return;
        }
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });
  },
  async run(page) {
    assert((await page.evaluate(() => window.__raceReleasedAt)), 'watcher did not release the held secondary request');
    await flush(page);
    assert.equal(await stored(page, proKey), 'client', 'stored preference must stay Client');
    assert.equal(await toProfessional(page).count(), 0, 'late profile loading reverted the notification destination to the stored Client preference');
    assert.equal(await toClient(page).count(), 1);
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), pendingIntentKey), null);
    assert.equal((await calls(page, 'getV6NotificationDestination')).length, 1);
    assert.equal((await calls(page, 'setV6Availability')).length, 0);
  } });

// 4. Unavailable order intent is delayed (held); the user explicitly picks an experience after it began;
// the empty order list then arrives. Order: stored Professional + pending intent -> held listV6Orders ->
// user clicks the visible experience toggle -> release empty list -> unavailable notice.
// Expected: the explicit choice (and its stored value) is not overridden by the fallback to account preference.
// Note: may pass on the unmodified app (it never sets a mode on this path); it guards the planned fallback.
cases.push({ name: 'race-delayed-unavailable-intent-keeps-later-explicit-choice', autoProfessional: false, query: { intent: 'order', order: orderA },
  async init(context) {
    await seedRace({ actor: 'professional', scenario: 'experience', holds: [{ name: 'listV6Orders', actorId: proId, skip: 1 }] })(context);
    await seedLocal(proKey, 'professional')(context);
  },
  async run(page) {
    await heldCount(page, 1);
    const clickingClient = (await toClient(page).count()) === 1;
    assert.equal((await toClient(page).count()) + (await toProfessional(page).count()), 1);
    const target = clickingClient ? 'client' : 'professional';
    await (clickingClient ? toClient(page) : toProfessional(page)).click();
    await (target === 'professional' ? toClient(page) : toProfessional(page)).waitFor();
    assert.equal(await stored(page, proKey), target);
    await page.evaluate(() => window.__qa.releaseHeld(0));
    await page.getByText(unavailable, { exact: true }).waitFor();
    await flush(page);
    assert.equal(await (target === 'professional' ? toClient(page) : toProfessional(page)).count(), 1, `delayed fallback overrode the explicit ${target} choice`);
    assert.equal(await stored(page, proKey), target);
    assert.equal((await calls(page, 'setV6Availability')).length, 0);
  } });

await runCases(cases);
