// Live production R1 retest (read-mostly). Operated by the parent only; never publishes, edits or cancels anything.
// Config (JSON) is read once from stdin; the Playwright module path comes from MANITO_PLAYWRIGHT_MODULE.
// Output: sanitized per-case JSON only. Never logs config, credentials, PINs, tokens, request bodies or page bodies.
// Real app only: no mocks and no request interception. A request monitor (method + path only) halts on any unexpected write.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ORIGIN = 'https://app.manitoapp.com.ar';
const ORDER_ID = '7f5d61d0-d91e-49a7-b1ae-134982ee016e'; // existing expired, unassigned historical fixture (read only)
const CLIENT_EMAIL = 'cliente.qa1@qa.manito.invalid';
const PRO_EMAIL = 'prof.plomeria@qa.manito.invalid';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VIEWPORTS = [['w360', { width: 360, height: 800 }], ['w390', { width: 390, height: 844 }]];
const BUDGET_MS = 240_000;
const SELECTOR_MS = 15_000;
const MASKS = ['.v6-pin-callout', '.v6-pin-entry', 'input[type="password"]'];
const DESCRIPTION = 'Prueba QA R1: perdida de agua bajo la pileta. No publicar.';
const ADDRESS = 'Avenida Independencia 1500';
const CITY = 'Mar del Plata';
// Non-GET requests that are known reads (supabase auth refresh, read-only RPCs). Anything else non-GET halts the run.
const ALLOWED_NON_GET = /^\/auth\/v1\/token$|^\/rest\/v1\/rpc\/(list_|get_|search_|fetch_)/;
const SIGN_MEDIA_POST = /^\/storage\/v1\/object\/sign\/manito-media\/[^/]/;

const started = Date.now();
const result = { status: 'FAIL', reason: null, mode: null, commitVerified: false, viewports: {}, limitations: [
  'N4 (pending price confirmation) is NOT_TESTED: it needs an existing fixture and none was created.',
  'Geometry uses the real viewport and programmatic scrollIntoViewIfNeeded plus an elementFromPoint hit test; it is not a physical touch-scroll test.',
  'The request monitor sees HTTP requests only (method + path); it cannot observe websocket traffic or request bodies.',
  'Only Chromium (msedge) was used; the order-count comparison relies on visible cards in Trabajos and may miss paginated or collapsed orders.',
] };
let halted = false;
class Stop extends Error { constructor(status, reason) { super(reason); this.status = status; this.reason = reason; } }
const stop = (status, reason) => { throw new Stop(status, reason); };
const secrets = []; // supplied QA passwords, memory only, never output
const scrub = text => secrets.reduce((s, secret) => s.split(secret).join('<redacted>'), String(text ?? ''))
  .replace(/https?:\/\/\S+/g, '<url>').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
  .replace(/[\w.+-]+@[\w.-]+/g, '<email>').replace(/\d{4,}/g, '#').replace(/\s+/g, ' ').trim().slice(0, 120);

const tick = () => {
  if (halted) stop('FAIL', 'halted_after_unexpected_write_request');
  if (Date.now() - started > BUDGET_MS - 10_000) stop('BLOCKED', 'runtime_budget_exceeded');
};

async function readConfig() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let cfg;
  try { cfg = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { stop('FAIL', 'config_not_json'); }
  const emails = Array.isArray(cfg?.accounts) ? cfg.accounts.map(a => a?.email).sort().join('|') : '';
  const ok = cfg && typeof cfg === 'object' && cfg.origin === ORIGIN && cfg.orderId === ORDER_ID
    && /^[0-9a-f]{7,40}$/i.test(cfg.expectedCommit || '') && /^[\w-]{1,30}$/.test(cfg.mode || '')
    && typeof cfg.outputDir === 'string' && cfg.outputDir.length > 0
    && cfg.accounts.length === 2 && emails === [CLIENT_EMAIL, PRO_EMAIL].sort().join('|')
    && cfg.accounts.every(a => typeof a.password === 'string' && a.password.length > 0 && UUID.test(a.userId || ''));
  if (!ok) stop('FAIL', 'config_rejected');
  for (const a of cfg.accounts) if (!secrets.includes(a.password)) secrets.push(a.password);
  secrets.sort((a, b) => b.length - a.length);
  return cfg;
}

function loadPlaywright() {
  const path = process.env.MANITO_PLAYWRIGHT_MODULE;
  if (!path) stop('FAIL', 'playwright_module_env_missing');
  try { return createRequire(import.meta.url)(path); } catch { stop('FAIL', 'playwright_module_unloadable'); }
}

const commitOk = (info, expected) => typeof info?.commit === 'string' && info.commit.toLowerCase().startsWith(expected.toLowerCase());

// Request monitor: method + pathname only, armed after login. Never reads bodies, headers or tokens.
function monitor(context, v) {
  context.on('request', req => {
    if (!v.armed) return;
    const method = req.method();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    let path = '?';
    try { path = new URL(req.url()).pathname; } catch { /* keep ? */ }
    if (ALLOWED_NON_GET.test(path)) { const n = path.split('/').pop(); if (v.readRpcs.length < 10 && !v.readRpcs.includes(n)) v.readRpcs.push(n); return; }
    // createSignedUrl is a POST but only reads: allow solely POST .../object/sign/manito-media/ (never upload/update/remove).
    if (method === 'POST' && SIGN_MEDIA_POST.test(path)) { if (v.readRpcs.length < 10 && !v.readRpcs.includes('storage_sign_manito_media')) v.readRpcs.push('storage_sign_manito_media'); return; }
    halted = true;
    if (v.unexpectedWrites.length < 10) v.unexpectedWrites.push({ method, path: scrub(path).slice(0, 80), orderRelated: /order/i.test(path) });
  });
}

async function shot(v, name) {
  try { await v.page.screenshot({ path: join(v.outputDir, `${v.tag}-${name}.png`), mask: MASKS.map(s => v.page.locator(s)), fullPage: false }); } catch { /* diagnostics only */ }
}

// Safe phase labels for BLOCKED/FAIL reports: short visible headings/buttons only, never the body.
const labels = page => page.evaluate(() => {
  const vis = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const t = n => (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const list = (sel, max) => [...document.querySelectorAll(sel)].filter(vis).map(t).filter(Boolean).slice(0, max);
  return { requestStep: list('.v6-request-stage h1', 2), headings: list('h1,h2', 8), buttons: list('button', 14), alerts: list('.v6-alert,.v6-toast', 3) };
}).then(o => JSON.parse(JSON.stringify(o, (_k, x) => typeof x === 'string' ? scrub(x) : x))).catch(() => null);

async function login(v, account) {
  const { page } = v;
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
  const form = page.locator('form:has(input[type="email"])');
  try { await form.first().waitFor({ state: 'visible', timeout: 20_000 }); } catch { stop('BLOCKED', 'login_form_not_found'); }
  if (await form.count() !== 1) stop('BLOCKED', 'login_form_ambiguous');
  await form.getByLabel('Email', { exact: true }).fill(account.email);
  await form.getByLabel('Contraseña', { exact: true }).fill(account.password);
  const submit = form.locator('button[type="submit"]').filter({ hasText: /^\s*Ingresar\s*$/ });
  if (await submit.count() !== 1) stop('BLOCKED', 'login_submit_ambiguous');
  await submit.click();
  try { await page.locator('.v6-bottom').waitFor({ state: 'visible', timeout: 30_000 }); }
  catch { stop('BLOCKED', `login_not_completed_alert=${await page.locator('.v6-alert').count() > 0}`); }
  v.armed = true; // everything from here on is monitored
  const match = await page.evaluate(({ userId, email }) => {
    for (const key of Object.keys(localStorage)) {
      if (!/^sb-.*-auth-token$/.test(key)) continue;
      try {
        const user = JSON.parse(localStorage.getItem(key))?.user;
        if (user) return user.id === userId && String(user.email || '').toLowerCase() === email;
      } catch { /* next key */ }
    }
    return false;
  }, { userId: account.userId, email: account.email });
  if (!match) stop('BLOCKED', 'identity_mismatch');
  if (await page.locator('.v6-bottom').getAttribute('aria-label') !== 'Navegación Cliente') {
    const sw = page.getByRole('button', { name: 'Cambiar a experiencia Cliente', exact: true });
    if (await sw.count() !== 1 || await sw.isDisabled()) stop('BLOCKED', 'client_experience_unavailable');
    await sw.click();
    await page.waitForFunction(() => document.querySelector('.v6-bottom')?.getAttribute('aria-label') === 'Navegación Cliente');
  }
  await page.waitForTimeout(1500);
}

async function goTab(page, name) {
  const btn = page.locator('.v6-bottom').getByRole('button', { name, exact: true });
  if (await btn.count() !== 1) stop('BLOCKED', `nav_${name}_unavailable`);
  await btn.click();
}

const orderCards = page => page.locator('article.v6-order').locator('visible=true');
async function countOrders(page) { // visible cards on Trabajos only; hidden legacy home cards are never counted
  await goTab(page, 'Trabajos');
  await orderCards(page).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => null);
  await page.waitForTimeout(2500);
  return orderCards(page).count();
}

// N6: no horizontal overflow, and the last control can be reached and is not covered (no force click, no hiding bars).
const specialtyWarningCount = page => page.getByText(/Eleg[ií] la especialidad/).locator('visible=true').count();

async function geometry(v, name, scopeSel, lastSel) {
  const { page } = v;
  const g = await page.evaluate(({ scopeSel }) => {
    const W = innerWidth;
    const vis = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const scope = [...document.querySelectorAll(scopeSel)].find(vis) || document.body;
    const bad = [...scope.querySelectorAll('select,input,textarea,button,article,.v6-price-label,.v6-choice,.v6-status,h1,h2,h3')].filter(vis)
      .map(e => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && (r.right > W + 1 || r.left < -1));
    const price = scope.querySelector('.v6-price-label b');
    const pr = price?.getBoundingClientRect();
    return {
      docOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > W + 1,
      offenders: bad.length, sample: bad.slice(0, 4).map(({ e }) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`),
      selects: [...scope.querySelectorAll('select')].filter(vis).map(s => Math.round(s.getBoundingClientRect().width)),
      priceVisible: price ? Boolean(vis(price) && (price.textContent || '').trim() && pr.left >= 0 && pr.right <= W + 1) : null,
    };
  }, { scopeSel });
  const last = page.locator(lastSel).locator('visible=true').last();
  let lastControl = 'none';
  if (await last.count()) {
    await last.scrollIntoViewIfNeeded();
    lastControl = await last.evaluate(el => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, unobstructed: Boolean(top && (el === top || el.contains(top))) };
    });
  }
  const pass = !g.docOverflow && g.offenders === 0 && g.priceVisible !== false && (lastControl === 'none' || (lastControl.inView && lastControl.unobstructed));
  v.geometry[name] = { pass, ...g, lastControl };
  return pass;
}

async function runCase(v, id, fn) {
  const rec = { status: 'PASS', checks: {}, failed: [] };
  v.cases[id] = rec;
  const check = (key, cond, value) => { rec.checks[key] = value === undefined ? Boolean(cond) : value; if (!cond) rec.failed.push(key); };
  try {
    tick();
    await fn(rec, check);
    if (halted) stop('FAIL', 'unexpected_write_request_observed');
    if (rec.failed.length) rec.status = 'FAIL';
  } catch (error) {
    const isStop = error instanceof Stop;
    rec.status = isStop ? error.status : 'FAIL';
    rec.reason = isStop ? error.reason : `unexpected_${scrub(error?.name)}:${scrub(error?.message)}`;
    rec.labels = await labels(v.page);
    await shot(v, `${id}-failure`);
  }
  if (halted) throw new Stop('FAIL', 'unexpected_write_request_observed');
}

const heading = (page, re) => page.locator('.v6-request-stage h1').filter({ hasText: re });
const stepActions = page => page.locator('.v6-request-actions');
const waitHeading = (page, re, ms = SELECTOR_MS) => heading(page, re).first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const advance = async (page, re, label) => {
  await stepActions(page).getByRole('button', { name: 'Continuar', exact: true }).click();
  if (!await waitHeading(page, re)) stop('BLOCKED', `wizard_step_not_reached_${label}`);
};
const back = async (page, re, label) => {
  await stepActions(page).getByRole('button', { name: /^Atr[aá]s$/ }).click();
  if (!await waitHeading(page, re)) stop('BLOCKED', `wizard_back_not_reached_${label}`);
};
const RE = { need: /necesit/i, place: /D[oó]nde es el trabajo/, mode: /C[oó]mo quer[eé]s avanzar/, resolution: /Eleg[ií] c[oó]mo buscar/, review: /Revis[aá] antes de publicar/ };

// N2/N9: read-only inspection of the historical expired, unassigned order on Trabajos.
async function expiredOrder(v, rec, check) {
  const { page } = v;
  await goTab(page, 'Trabajos');
  const card = page.locator(`article.v6-order[data-order-id="${ORDER_ID}"]`).locator('visible=true');
  await card.first().waitFor({ state: 'visible', timeout: SELECTOR_MS }).catch(() => null);
  const count = await card.count();
  rec.cards = count;
  if (count !== 1) stop(count === 0 ? 'BLOCKED' : 'FAIL', count === 0 ? 'fixture_order_not_rendered_in_trabajos' : 'fixture_order_ambiguous');
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  const snap = await card.evaluate(el => {
    const t = n => (n?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    const text = t(el) + ' ' + (el.textContent || '');
    return {
      status: t(el.querySelector('.v6-status')), nextStep: t(el.querySelector('.v6-order-guidance p')), price: t(el.querySelector('.v6-price-label')),
      buttons: [...el.querySelectorAll('button')].map(t).filter(Boolean).slice(0, 12),
      etaText: /\bETA\b|llega(r[aá])? en \d+|\d+\s*min\b/i.test(text),
      chatButtons: [...el.querySelectorAll('button')].filter(b => /chat/i.test(b.textContent || '')).length + el.querySelectorAll('.v6-message-action').length,
      chatHint: Boolean(el.querySelector('.v6-order-hint')),
    };
  });
  rec.observed = JSON.parse(JSON.stringify(snap, (_k, x) => typeof x === 'string' ? scrub(x) : x));
  check('nextStepIsClientDecision', /no se confirm[oó]|Elegí otro profesional|decidir|cómo seguir/i.test(snap.nextStep));
  check('nextStepNotSearching', !/esperamos que|est[aá] buscando/i.test(snap.nextStep));
  check('noEta', !snap.etaText);
  check('noChatUntilAssigned', snap.chatButtons === 0 && !snap.chatHint);
  check('geometry', await geometry(v, 'expired_order_card', `article.v6-order[data-order-id="${ORDER_ID}"]`, `article.v6-order[data-order-id="${ORDER_ID}"] button`));
  await shot(v, 'n2-expired-order');
}

// N1: wizard through Revision. Never clicks the publish button.
async function wizard(v, rec, check) {
  const { page } = v;
  rec.ordersBefore = await countOrders(page);
  await goTab(page, 'Inicio');
  await page.locator('.v6-service').first().waitFor({ state: 'visible' });
  const svc = page.locator('.v6-service').filter({ hasText: /Plomer/i }).locator('visible=true');
  if (!await svc.count()) {
    const more = page.getByRole('button', { name: 'Ver todos los servicios', exact: true });
    if (await more.count() === 1) await more.click();
  }
  if (!await svc.count()) stop('BLOCKED', 'plomeria_service_not_listed_on_home');
  await svc.first().click();
  if (!await waitHeading(page, RE.need)) stop('BLOCKED', 'need_step_not_reached');
  await page.locator('.v6-request-stage textarea').fill(DESCRIPTION);

  const chips = page.locator('.v6-specialty-panel .v6-chip-list button');
  const chipCount = await chips.count();
  rec.specialtyOptions = chipCount;
  if (chipCount > 0) {
    await stepActions(page).getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.waitForTimeout(1000);
    check('specialtyRequiredBeforePlace', await heading(page, RE.need).count() > 0 && await heading(page, RE.place).count() === 0);
    await chips.first().click();
    check('specialtySelected', await chips.first().getAttribute('aria-pressed') === 'true');
    rec.specialtyChosen = scrub(await chips.first().textContent());
  }
  await advance(page, RE.place, 'place');
  check('specialtyWarningAbsentAfterNeedToPlace', await specialtyWarningCount(page) === 0);

  await page.locator('.v6-location-action').filter({ hasText: /Ingresar ubicación manualmente/ }).click();
  const address = page.locator('.v6-request-stage').getByLabel('Dirección', { exact: true });
  const city = page.locator('.v6-request-stage').getByLabel('Ciudad', { exact: true });
  await address.fill(ADDRESS);
  await city.fill(CITY);
  await address.press('Enter'); // Enter in an input must not submit or advance
  await city.press('Enter');
  await page.waitForTimeout(1500);
  check('enterInInputDoesNotSubmitOrAdvance', await heading(page, RE.place).count() > 0 && !halted);
  check('geometry_place', await geometry(v, 'wizard_place', '.v6-request-shell', '.v6-request-actions button'));
  await shot(v, 'n1-place');

  await stepActions(page).getByRole('button', { name: 'Continuar', exact: true }).click();
  rec.locationPath = 'geocoded_or_accepted';
  if (!await waitHeading(page, RE.mode, 20_000)) {
    // Real fallback in the UI: choose the matching locality from the visible select, then continue.
    const select = page.getByLabel('Localidad del servicio', { exact: true });
    const option = select.locator('option').filter({ hasText: /^Mar del Plata/ });
    if (await option.count() < 1) stop('BLOCKED', 'manual_location_not_accepted_and_no_mar_del_plata_locality');
    await select.selectOption({ value: await option.first().getAttribute('value') });
    rec.locationPath = 'locality_select';
    await advance(page, RE.mode, 'mode');
  }

  const ahora = page.locator('.v6-mode-row').filter({ hasText: /Ahora/ });
  if (await ahora.getAttribute('aria-disabled') === 'true') stop('BLOCKED', 'immediate_mode_unsupported_for_service');
  await ahora.click();
  check('modeAhoraSelected', await ahora.getAttribute('aria-pressed') === 'true');
  await advance(page, RE.resolution, 'resolution');

  // Back-and-forth must preserve every field before leaving.
  await back(page, RE.mode, 'mode');
  await back(page, RE.place, 'place');
  check('placePreserved', await address.inputValue() === ADDRESS && await city.inputValue() === CITY);
  await back(page, RE.need, 'need');
  check('descriptionPreserved', await page.locator('.v6-request-stage textarea').inputValue() === DESCRIPTION);
  if (chipCount > 0) check('specialtyPreserved', await chips.first().getAttribute('aria-pressed') === 'true');
  await advance(page, RE.place, 'place_again');
  await advance(page, RE.mode, 'mode_again');
  check('modePreserved', await ahora.getAttribute('aria-pressed') === 'true');
  await advance(page, RE.resolution, 'resolution_again');

  // Real compatibility backend behaviour, observed only (no simulated failure).
  const status = page.locator('.v6-section-head [role="status"]').first();
  const compat = { initial: scrub(await status.textContent().catch(() => '')) };
  const t0 = Date.now();
  while (Date.now() - t0 < 12_000 && /Verificando/.test(await status.textContent().catch(() => ''))) await page.waitForTimeout(400);
  compat.final = scrub(await status.textContent().catch(() => ''));
  compat.sawLoading = /Verificando/.test(compat.initial);
  compat.stuckLoading = /Verificando/.test(compat.final);
  compat.errorNote = await page.getByText(/No pudimos verificar qui[eé]nes son compatibles/).count() > 0;
  compat.noCompatibleNotice = await page.getByText(/No encontramos profesionales compatibles/).count() > 0;
  compat.zeroShownWhileError = compat.errorNote && /\b0\b/.test(compat.final);
  rec.compatibility = compat;
  check('compatibilityNotStuckLoading', !compat.stuckLoading);
  check('compatibilityNoFakeZeroOnError', !compat.zeroShownWhileError);
  check('geometry_resolution', await geometry(v, 'wizard_resolution', '.v6-request-shell', '.v6-request-actions button'));
  await shot(v, 'n1-resolution');

  // Tap resolution Continuar: review must appear and nothing may be written.
  await stepActions(page).getByRole('button', { name: 'Continuar', exact: true }).tap();
  const reviewShown = await waitHeading(page, RE.review);
  check('reviewVisible', reviewShown);
  if (!reviewShown) stop('BLOCKED', 'review_not_reached_after_resolution_continue');
  const publish = page.locator('.v6-request-actions button[data-request-action="publish"]');
  check('publishButtonVisible', await publish.count() === 1 && await publish.isVisible());
  rec.publishLabel = scrub(await publish.textContent().catch(() => ''));
  await page.waitForTimeout(3000);
  check('stillOnReviewAfterWait', await heading(page, RE.review).count() > 0);
  check('zeroWriteRequestsToReview', v.unexpectedWrites.length === 0);
  rec.reviewFields = (await page.locator('.v6-review-list dt').allTextContents()).map(scrub).slice(0, 10);
  check('reviewShowsLocation', /Mar del Plata/.test(await page.locator('.v6-review-list').innerText()));
  check('specialtyWarningAbsentInReview', await specialtyWarningCount(page) === 0);
  const reviewOverlaps = await page.evaluate(() => {
    const vis = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    // Painted text line boxes: text can paint outside a narrowed dt/dd border box.
    const textRects = el => {
      const rects = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) rects.push(r);
      }
      return rects;
    };
    const textOverlaps = [], boxOverlaps = [];
    let measuredRows = 0, rowsMissingText = 0;
    [...document.querySelectorAll('.v6-review-list > div')].filter(vis).forEach((row, i) => {
      const dt = row.querySelector('dt'), dd = row.querySelector('dd');
      if (!dt || !dd) return;
      if (hit(dt.getBoundingClientRect(), dd.getBoundingClientRect())) boxOverlaps.push(i);
      const a = textRects(dt), b = textRects(dd);
      if (!a.length || !b.length) { rowsMissingText++; return; }
      measuredRows++;
      if (a.some(ra => b.some(rb => hit(ra, rb)))) textOverlaps.push(i);
    });
    return { textOverlaps, boxOverlaps, measuredRows, rowsMissingText };
  });
  rec.reviewOverlapRows = reviewOverlaps.textOverlaps;
  rec.reviewBoxOverlapRows = reviewOverlaps.boxOverlaps;
  rec.reviewTextMeasuredRows = reviewOverlaps.measuredRows;
  rec.reviewRowsMissingText = reviewOverlaps.rowsMissingText;
  check('reviewTextRangesMeasured', reviewOverlaps.measuredRows > 0);
  check('reviewLabelValueNoOverlap', reviewOverlaps.textOverlaps.length === 0);
  check('geometry_review', await geometry(v, 'wizard_review', '.v6-request-shell', '.v6-request-actions button'));
  await shot(v, 'n1-review');

  // Leave the wizard without publishing, then compare order counts.
  for (let i = 0; i < 7 && !await page.locator('.v6-service').locator('visible=true').count(); i++) {
    await stepActions(page).getByRole('button', { name: /^Atr[aá]s$/ }).click();
    await page.waitForTimeout(700);
  }
  rec.leftWizard = await page.locator('.v6-service').locator('visible=true').count() > 0;
  rec.ordersAfter = await countOrders(page);
  check('noOrderAutoCreated', rec.ordersAfter === rec.ordersBefore);
}

async function runViewport([tag, viewport], browser, cfg, account) {
  const v = { tag, outputDir: resolve(cfg.outputDir), armed: false, unexpectedWrites: [], readRpcs: [], cases: {}, geometry: {}, page: null };
  result.viewports[tag] = { viewport, cases: v.cases, geometry: v.geometry, requestMonitor: { unexpectedWrites: v.unexpectedWrites, allowedReadRpcs: v.readRpcs } };
  const context = await browser.newContext({ viewport, hasTouch: true });
  context.setDefaultTimeout(SELECTOR_MS);
  context.setDefaultNavigationTimeout(30_000);
  monitor(context, v);
  v.page = await context.newPage();
  try {
    await login(v, account);
    const info = await v.page.evaluate(() => fetch('/pwa-version.json', { cache: 'no-store' }).then(r => r.json())).catch(() => null);
    if (!commitOk(info, cfg.expectedCommit)) stop('BLOCKED', 'deployment_commit_mismatch_after_load');
    await runCase(v, 'N2_N9_expired_order_truthful_state_and_N6_card_geometry', (rec, check) => expiredOrder(v, rec, check));
    await runCase(v, 'N1_wizard_to_review_without_publish', (rec, check) => wizard(v, rec, check));
    v.cases.N4_pending_price_confirmation = { status: 'NOT_TESTED', reason: 'no_current_fixture_and_none_may_be_created' };
  } catch (error) {
    v.fatal = error instanceof Stop ? { status: error.status, reason: error.reason } : { status: 'FAIL', reason: `unexpected_${scrub(error?.name)}:${scrub(error?.message)}` };
    v.labels = await labels(v.page);
  } finally {
    await shot(v, 'final');
    await context.close().catch(() => undefined);
  }
}

async function main() {
  let browser = null;
  let cfg = null;
  try {
    cfg = await readConfig();
    result.mode = cfg.mode;
    mkdirSync(resolve(cfg.outputDir), { recursive: true });
    const { chromium } = loadPlaywright();
    const info = await fetch(`${ORIGIN}/pwa-version.json`, { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    result.commitVerified = commitOk(info, cfg.expectedCommit);
    if (!result.commitVerified) stop('BLOCKED', 'deployment_commit_mismatch_before');
    const account = cfg.accounts.find(a => a.email === CLIENT_EMAIL); // the professional account is never used
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    setTimeout(() => { result.watchdog = true; browser?.close().catch(() => undefined); }, BUDGET_MS).unref();
    await Promise.all(VIEWPORTS.map(vp => runViewport(vp, browser, cfg, account).catch(error => {
      result.viewports[vp[0]].fatal = { status: 'FAIL', reason: error instanceof Stop ? error.reason : `unexpected_${scrub(error?.name)}` };
    })));
    const all = Object.values(result.viewports).flatMap(vp => [...Object.values(vp.cases).map(c => c.status), vp.fatal?.status].filter(Boolean));
    const ran = Object.values(result.viewports).every(vp => Object.keys(vp.cases).length > 0);
    result.status = all.includes('FAIL') ? 'FAIL' : all.includes('BLOCKED') || !ran ? 'BLOCKED' : 'PASS';
    result.reason = halted ? 'unexpected_write_request_observed' : null;
  } catch (error) {
    result.status = error instanceof Stop ? error.status : 'FAIL';
    result.reason = error instanceof Stop ? error.reason : `unexpected_${scrub(error?.name)}:${scrub(error?.message)}`;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    result.elapsedSeconds = Math.round((Date.now() - started) / 1000);
    if (cfg) { try { writeFileSync(join(resolve(cfg.outputDir), 'result.json'), JSON.stringify(result, null, 2)); } catch { /* ignore */ } }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  }
}

await main();
