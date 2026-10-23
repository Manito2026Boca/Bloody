// Live two-account closure QA for ONE authorized order. Operated by the parent only.
// Config (JSON) is read once from stdin; the Playwright module path comes from MANITO_PLAYWRIGHT_MODULE.
// Output: sanitized stage/status JSON only. Never logs config, credentials, PINs, URLs with tokens or bodies.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ORIGIN = 'https://app.manitoapp.com.ar';
const ORDER_ID = '23d5c580-ef67-4bfa-b1c9-187d2e044aeb';
const CLIENT_EMAIL = 'cliente.qa1@qa.manito.invalid';
const PRO_EMAIL = 'prof.plomeria@qa.manito.invalid';
const MARKER = 'QA R2 prueba autorizada';
const FILE_NAME = 'qa-r2-prueba-autorizada.png';
// Resume only: a deliberately DISTINCT second evidence file for the post-fix retest. It is a new retest artifact,
// never a duplicate of the original FILE_NAME, and the original is never deleted or replaced.
const RETEST_FILE_NAME = 'qa-r2-retest-evidence.png';
const BASE_AMOUNT = 18000;
const EXTRA_AMOUNT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REALTIME_MS = 30_000;
// Minimal valid 1x1 PNG, embedded fixture (not a real user image).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MASKS = ['.v6-pin-callout', '.v6-pin-entry', 'input[type="password"]'];

const result = { status: 'FAIL', mode: null, completedStages: [], stage: 'init', reason: null, checks: {}, diagnostics: {}, console: [], pageErrors: [], httpErrors: [] };
const stage = name => { result.stage = name; };
const done = name => { result.completedStages.push(name); result.stage = name; };
class Stop extends Error { constructor(status, reason) { super(reason); this.status = status; this.reason = reason; } }
const stop = (status, reason) => { throw new Stop(status, reason); };

const secrets = []; // supplied QA passwords, memory only, never output
const scrub = text => secrets.reduce((s, secret) => s.split(secret).join('<redacted>'), String(text ?? ''))
  .replace(/https?:\/\/\S+/g, '<url>').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>')
  .replace(/[\w.+-]+@[\w.-]+/g, '<email>').replace(/\d{4,}/g, '#').replace(/\s+/g, ' ').trim().slice(0, 120);

async function readConfig() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let cfg;
  try { cfg = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { stop('FAIL', 'config_not_json'); }
  const ok = cfg && typeof cfg === 'object'
    && cfg.origin === ORIGIN && cfg.orderId === ORDER_ID
    && /^[0-9a-f]{7,40}$/i.test(cfg.expectedCommit || '')
    && (cfg.mode === 'inspect' || cfg.mode === 'r2' || cfg.mode === 'resume')
    && typeof cfg.outputDir === 'string' && cfg.outputDir.length > 0
    && Array.isArray(cfg.accounts) && cfg.accounts.length === 2
    && cfg.accounts[0]?.email === CLIENT_EMAIL && cfg.accounts[1]?.email === PRO_EMAIL
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

const amountOf = text => { const digits = String(text || '').replace(/[^\d,]/g, '').split(',')[0]; return digits ? Number(digits) : null; };
// Visible only: a hidden copy may exist in the legacy home section (.v6-legacy-home-hidden) and must never be targeted.
const card = page => page.locator(`article.v6-order[data-order-id="${ORDER_ID}"]`).locator('visible=true');

async function versionOk(fetcher, expectedCommit) {
  try {
    const info = await fetcher();
    return typeof info?.commit === 'string' && info.commit.toLowerCase().startsWith(expectedCommit.toLowerCase());
  } catch { return false; }
}
const versionFromNode = () => fetch(`${ORIGIN}/pwa-version.json`, { cache: 'no-store' }).then(r => r.json());
const versionFromPage = page => () => page.evaluate(() => fetch('/pwa-version.json', { cache: 'no-store' }).then(r => r.json()));

function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && result.console.length < 20) result.console.push({ who: label, text: scrub(msg.text()) }); });
  page.on('pageerror', err => { if (result.pageErrors.length < 20) result.pageErrors.push({ who: label, text: scrub(err?.message) }); });
  page.on('response', res => {
    if (res.status() < 400 || result.httpErrors.length >= 20) return;
    let path = '';
    try { path = new URL(res.url()).pathname.slice(0, 80); } catch { path = '?'; }
    result.httpErrors.push({ who: label, status: res.status(), method: res.request().method(), path });
  });
}

async function shot(page, outputDir, name) {
  try { await page.screenshot({ path: join(outputDir, `${name}.png`), mask: MASKS.map(s => page.locator(s)), fullPage: false }); } catch { /* diagnostics only */ }
}

async function login(page, account, who) {
  stage(`login-${who}`);
  await page.goto(`${ORIGIN}/?intent=order&order=${ORDER_ID}`, { waitUntil: 'domcontentloaded' });
  // Scope to the one form holding the email input; the "Ingresar" tab button lives outside it.
  const form = page.locator('form:has(input[type="email"])');
  try { await form.first().waitFor({ state: 'visible', timeout: 20_000 }); } catch { stop('BLOCKED', `login_form_not_found_${who}`); }
  if (await form.count() !== 1) stop('BLOCKED', `login_form_ambiguous_${who}`);
  const email = form.getByLabel('Email', { exact: true });
  const password = form.getByLabel('Contraseña', { exact: true });
  await email.fill(account.email);
  await password.fill(account.password);
  const submit = form.locator('button[type="submit"]').filter({ hasText: /^\s*Ingresar\s*$/ });
  if (await submit.count() !== 1) stop('BLOCKED', `login_submit_ambiguous_${who}`);
  await submit.click();
  try { await page.locator('.v6-bottom').waitFor({ state: 'visible', timeout: 30_000 }); }
  catch { stop('BLOCKED', `login_not_completed_${who}_alert=${await page.locator('.v6-alert').count() > 0}`); }
  done(`login-${who}`);
}

async function verifyIdentity(page, account, who) {
  const match = await page.evaluate(({ userId, email }) => {
    for (const key of Object.keys(localStorage)) {
      if (!/^sb-.*-auth-token$/.test(key)) continue;
      try {
        const raw = JSON.parse(localStorage.getItem(key));
        const user = raw?.user ?? raw?.currentSession?.user;
        if (user) return user.id === userId && String(user.email || '').toLowerCase() === email;
      } catch { /* try next key */ }
    }
    return false;
  }, { userId: account.userId, email: account.email });
  result.checks[`identity_${who}`] = match;
  if (!match) stop('BLOCKED', `identity_mismatch_${who}`);
}

async function ensureExperience(page, wanted, who) {
  const nav = page.locator('.v6-bottom');
  const current = async () => (await nav.getAttribute('aria-label')) || '';
  const target = `Navegación ${wanted}`;
  if (await current() !== target) {
    const sw = page.getByRole('button', { name: `Cambiar a experiencia ${wanted}`, exact: true });
    if (await sw.count() !== 1 || await sw.isDisabled()) stop('BLOCKED', `experience_switch_unavailable_${who}`);
    await sw.click();
    try { await page.waitForFunction(label => document.querySelector('.v6-bottom')?.getAttribute('aria-label') === label, target, { timeout: 10_000 }); }
    catch { stop('BLOCKED', `experience_not_applied_${who}`); }
  }
  result.checks[`experience_${who}`] = wanted;
}

// Fail-closed: exactly one VISIBLE article.v6-order with the exact data-order-id, on the Trabajos surface.
async function locateOrder(page, who) {
  const target = card(page);
  const trabajos = page.locator('.v6-bottom').getByRole('button', { name: 'Trabajos', exact: true });
  if (await trabajos.count() !== 1) stop('BLOCKED', `trabajos_nav_unavailable_${who}`);
  await trabajos.click(); // always navigate; never rely on cards in hidden legacy home
  try { await target.first().waitFor({ state: 'visible', timeout: 20_000 }); } catch { /* handled below */ }
  const count = await target.count();
  result.checks[`order_cards_${who}`] = count;
  if (count !== 1) stop(count === 0 ? 'BLOCKED' : 'FAIL', count === 0 ? `order_not_rendered_${who}` : `order_ambiguous_${who}`);
  const rendered = await target.getAttribute('data-order-id');
  if (rendered !== ORDER_ID) stop('FAIL', `order_id_mismatch_${who}`);
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000); // settle: extras/photos/payments/ratings load asynchronously after mount
  return target;
}

// Never auto-waits on a missing card: an absent card reports 'absent' immediately.
const statusOf = async page => {
  if (await card(page).count() === 0) return 'absent';
  return card(page).locator('.v6-status').first().evaluate(el => {
    const known = ['trabajando', 'completed', 'en_sitio', 'en_camino', 'accepted', 'cancelled', 'payment_pending', 'open'];
    return [...el.classList].find(c => known.includes(c)) || [...el.classList].filter(c => c !== 'v6-status').join('+') || 'unknown';
  }, undefined, { timeout: 5000 }).catch(() => 'unreadable');
};

// A completed order leaves the "Activos" list (OrdersList filters completed/cancelled out of it). Only when the exact
// card has disappeared, open the Historial tab once per account (normal UI click, no reload) and re-read the same order.
// A card that is still present is never masked: its status is returned as-is (a stale client stays 'trabajando').
const historyOpened = { client: false, pro: false };
async function statusFollowingHistory(page, who) {
  const status = await statusOf(page);
  if (status !== 'absent' || historyOpened[who]) return status;
  const tab = page.locator('.v6-filter-tabs').getByRole('tab', { name: 'Historial', exact: true }).locator('visible=true');
  if (await tab.count() !== 1) return 'absent';
  historyOpened[who] = true;
  result.checks[`historyTabOpened_${who}`] = true;
  await tab.click();
  await page.waitForTimeout(1000);
  return statusOf(page);
}

async function snapshot(page) {
  const c = card(page);
  if (await c.count() !== 1) return { cardPresent: false };
  return c.evaluate(el => {
    const text = node => (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    const pin = el.querySelector('.v6-pin-callout');
    const status = el.querySelector('.v6-status');
    const nextStepNode = el.querySelector('.v6-order-guidance p'); // never fall back to the card: it contains the PIN callout
    return {
      cardPresent: true,
      statusClasses: status ? [...status.classList] : [],
      statusText: status ? text(status) : null,
      nextStep: nextStepNode ? text(nextStepNode) : null,
      headings: [...el.querySelectorAll('h2,h3')].map(text).slice(0, 12),
      sections: [...el.querySelectorAll('section[aria-label],details[aria-label]')].map(n => n.getAttribute('aria-label')).slice(0, 12),
      buttons: [...el.querySelectorAll('button')].map(b => text(b)).filter(Boolean).slice(0, 25),
      summaries: [...el.querySelectorAll('summary')].map(text).slice(0, 10),
      closureValues: [...el.querySelectorAll('.v6-closure-values > div')].map(text).slice(0, 8),
      agreementTotal: text(el.querySelector('.v6-agreement-total') || document.createElement('i')),
      meta: [...el.querySelectorAll('.v6-meta-row span')].map(text).slice(0, 6),
      extras: [...el.querySelectorAll('.v6-agreement-changes article')].map(text).slice(0, 6),
      helpAvailable: Boolean(el.querySelector('details[aria-label="Ayuda durante el trabajo"]')),
      pinCalloutPresent: Boolean(pin),
      alerts: [...document.querySelectorAll('.v6-alert')].length,
    };
  });
}

// Reads agreed base and resulting total from the exact order card; amounts are not secret.
async function economics(page) {
  const c = card(page);
  // DOM evaluation inside the exact card only: the grid cell whose direct dt text is exactly "Precio acordado", then its direct dd.
  const baseText = await c.first().evaluate(el => {
    for (const cell of el.querySelectorAll('.v6-agreement-grid > div')) {
      const dt = [...cell.children].find(n => n.tagName === 'DT');
      if (!dt || (dt.textContent || '').trim() !== 'Precio acordado') continue;
      const dd = [...cell.children].find(n => n.tagName === 'DD');
      return dd ? (dd.textContent || '').trim().slice(0, 40) : null;
    }
    return null;
  }, undefined, { timeout: 5000 }).catch(() => null);
  const base = amountOf(baseText);
  const total = amountOf(await c.locator('.v6-agreement-total strong').first().textContent({ timeout: 5000 }).catch(() => null));
  return { base, total };
}

async function markerState(page) {
  return card(page).evaluate((el, { marker, file, retest }) => {
    const text = (el.textContent || '');
    const hasFile = name => text.includes(name) || [...el.querySelectorAll('img')].some(i => (i.alt || '').includes(name));
    // Evidence items are figure.v6-photo-item inside section.v6-evidence-group (stage label in its <strong>).
    const itemsFor = name => [...el.querySelectorAll('figure.v6-photo-item')]
      .filter(f => (f.textContent || '').includes(name) || [...f.querySelectorAll('img')].some(i => (i.alt || '').includes(name)));
    const originalItems = itemsFor(file);
    return {
      extraMarker: [...el.querySelectorAll('.v6-agreement-changes article')].some(n => (n.textContent || '').includes(marker)),
      extraCount: el.querySelectorAll('.v6-agreement-changes article').length,
      evidenceMarker: hasFile(file),
      retestMarker: hasFile(retest),
      originalEvidenceCount: originalItems.length,
      originalEvidenceStages: originalItems.map(f => (f.closest('section.v6-evidence-group')?.querySelector('strong')?.textContent || '').trim()),
      ratedNote: text.includes('Tu calificacion de'),
    };
  }, { marker: MARKER, file: FILE_NAME, retest: RETEST_FILE_NAME });
}

// Global error toast (button.v6-toast.error). Returns a count and an allowlisted reason code only; raw text is never kept.
const TOAST_REASONS = [
  ['storage_or_upload', /(subir|upload|storage|archivo|imagen|foto|evidencia)/i],
  ['permission', /(permiso|permission|not allowed|no autorizado|policy|rls)/i],
  ['network', /(network|red|conexi[oó]n|fetch|timeout)/i],
  ['session', /(sesi[oó]n|jwt|token)/i],
];
async function errorToast(page) {
  const toasts = page.locator('button.v6-toast.error');
  const count = await toasts.count();
  if (!count) return { count: 0, reason: null };
  const text = ((await toasts.first().textContent({ timeout: 2000 }).catch(() => '')) || '');
  return { count, reason: TOAST_REASONS.find(([, re]) => re.test(text))?.[0] ?? 'unlisted' };
}
function classifyPageError(text) {
  if (/reset/i.test(text)) return 'form_reset_stale';
  if (/null|undefined/i.test(text)) return 'null_access';
  return 'unlisted';
}

async function waitFor(page, probe, label, timeout = REALTIME_MS) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await probe().catch(() => false)) return true;
    await page.waitForTimeout(500);
  }
  result.checks[`timeout_${label}`] = true;
  return false;
}

async function inspect(ctx) {
  stage('inspect');
  for (const who of ['client', 'pro']) {
    const page = ctx[who];
    result.diagnostics[who] = { status: await statusOf(page), ...(await snapshot(page)) };
    await shot(page, ctx.outputDir, `inspect-${who}`);
  }
  done('inspect');
}

async function r2(ctx) {
  const { client, pro } = ctx;
  // Preconditions (no writes yet).
  stage('preconditions');
  const statuses = { client: await statusOf(client), pro: await statusOf(pro) };
  result.checks.preStatus = statuses;
  if (statuses.client !== 'trabajando' || statuses.pro !== 'trabajando') stop('NEEDS_REVIEW', 'order_not_trabajando');
  for (const [who, page] of [['client', client], ['pro', pro]]) {
    const markers = await markerState(page);
    if (markers.extraMarker || markers.evidenceMarker || markers.ratedNote) stop('NEEDS_REVIEW', `prior_qa_marker_${who}`);
    if (markers.extraCount > 0) stop('NEEDS_REVIEW', `unexpected_existing_extras_${who}`);
  }
  if (await card(client).locator('form:has([aria-label="Detalle adicional"])').count() !== 0) stop('BLOCKED', 'client_sees_professional_extra_form');
  if (await card(pro).locator('form:has([aria-label="Detalle adicional"])').count() !== 1) stop('BLOCKED', 'pro_extra_form_missing');
  const pre = await economics(client);
  result.checks.preEconomics = pre;
  if (pre.base !== BASE_AMOUNT) stop('NEEDS_REVIEW', 'agreed_base_not_18000');
  done('preconditions');

  // 1. Professional proposes the extra.
  stage('pro-propose-extra');
  const form = card(pro).locator('form:has([aria-label="Detalle adicional"])');
  await form.getByLabel('Detalle adicional', { exact: true }).fill(MARKER);
  await form.getByLabel('Monto adicional', { exact: true }).fill(String(EXTRA_AMOUNT));
  if (await form.getByLabel('Detalle adicional', { exact: true }).inputValue() !== MARKER
    || await form.getByLabel('Monto adicional', { exact: true }).inputValue() !== String(EXTRA_AMOUNT)) stop('FAIL', 'extra_form_values_unexpected');
  await form.getByRole('button', { name: 'Pedir adicional', exact: true }).click();
  if (!await waitFor(pro, async () => (await markerState(pro)).extraMarker, 'pro_extra_visible', 20_000)) stop('FAIL', 'extra_not_visible_for_pro');
  done('pro-propose-extra');

  // 2. Client receives it without reload and approves exactly that extra.
  stage('client-approve-extra');
  const extraCard = () => card(client).locator('.v6-agreement-changes article.v6-quote-card', { hasText: MARKER });
  if (!await waitFor(client, async () => await extraCard().count() === 1, 'client_extra_no_reload')) {
    result.checks.realtimeReflectedWithoutReload = false;
    stop('FAIL', 'extra_not_reflected_on_client_without_reload');
  }
  result.checks.realtimeReflectedWithoutReload = true;
  const approve = extraCard().getByRole('button', { name: 'Aprobar modificación', exact: true });
  if (await approve.count() !== 1) stop('BLOCKED', 'approve_button_ambiguous');
  await approve.click();
  if (!await waitFor(client, async () => (await economics(client)).total === BASE_AMOUNT + EXTRA_AMOUNT, 'client_total_after_extra', 20_000)) stop('FAIL', 'total_not_18100_after_approval');
  const post = await economics(client);
  result.checks.postEconomics = post;
  if (post.base !== BASE_AMOUNT) stop('FAIL', 'agreed_base_changed');
  done('client-approve-extra');
  await shot(client, ctx.outputDir, 'r2-extra-approved-client');

  // 3. Professional uploads the final ("Trabajo terminado") evidence image.
  await uploadEvidence(ctx, FILE_NAME, 'evidenceMarker');
  await closureTail(ctx);
}

// Single upload attempt of the final-stage evidence file; `key` is the markerState flag that must turn true for THIS file only.
async function uploadEvidence(ctx, fileName, key) {
  const { pro } = ctx;
  stage('pro-upload-evidence');
  const details = card(pro).locator('details.v6-evidence-details');
  if (await details.count() !== 1) stop('BLOCKED', 'evidence_section_missing');
  if (!(await details.evaluate(el => el.open))) await details.locator('summary').click();
  const evForm = details.locator('form.v6-evidence-form');
  if (await evForm.count() !== 1) stop('BLOCKED', 'evidence_form_missing');
  await evForm.locator('select').selectOption({ value: 'after' });
  await evForm.locator('input[type="file"]').setInputFiles({ name: fileName, mimeType: 'image/png', buffer: PNG });
  const pageErrorsBefore = result.pageErrors.length;
  await evForm.getByRole('button', { name: 'Agregar evidencia', exact: true }).click();
  await waitFor(pro, async () => (await markerState(pro))[key] || (await errorToast(pro)).count > 0 || result.pageErrors.length > pageErrorsBefore, 'pro_evidence_visible', 30_000);
  // Never report upload success when the UI surfaced a global error toast or a page error; record safe codes only and stop.
  const toast = await errorToast(pro);
  const newPageErrors = result.pageErrors.slice(pageErrorsBefore).filter(e => e.who === 'pro');
  result.checks.evidenceErrorToastCount = toast.count;
  result.checks.evidenceErrorToastReason = toast.count ? toast.reason : null;
  result.checks.evidencePageErrorCount = newPageErrors.length;
  result.checks.evidencePageErrorReason = newPageErrors.length ? classifyPageError(newPageErrors[0].text) : null;
  await shot(pro, ctx.outputDir, 'r2-evidence-error-pro');
  if (toast.count > 0) stop('FAIL', `evidence_upload_error_toast_${toast.reason}`);
  if (newPageErrors.length > 0) stop('FAIL', `evidence_upload_page_error_${result.checks.evidencePageErrorReason}`);
  if (!(await markerState(pro))[key]) stop('FAIL', 'evidence_not_visible_for_pro');
  done('pro-upload-evidence');
  await shot(pro, ctx.outputDir, 'r2-evidence-pro');
}

async function closureTail(ctx) {
  const { client, pro } = ctx;
  // 4. Client reads the final PIN (memory only); 5. professional completes.
  stage('client-final-pin');
  const pinLocator = card(client).locator('.v6-pin-callout');
  if (!await waitFor(client, async () => await pinLocator.count() === 1, 'client_pin_visible', 10_000)) stop('BLOCKED', 'client_pin_callout_missing');
  let pin = ((await pinLocator.textContent()) || '').split(':').pop().replace(/\s/g, '');
  result.checks.pinIsFourDigits = /^\d{4}$/.test(pin);
  if (!/^\d{4}$/.test(pin)) stop('BLOCKED', 'final_pin_not_available');
  done('client-final-pin');

  stage('pro-complete');
  const guidance = card(pro).locator('.v6-order-guidance');
  const open = guidance.getByRole('button', { name: 'Ingresar PIN final', exact: true });
  if (await open.count() !== 1) { pin = null; stop('BLOCKED', 'complete_button_missing'); }
  await open.click();
  const entry = card(pro).locator('form.v6-pin-entry');
  await entry.waitFor({ state: 'visible', timeout: 10_000 });
  await entry.locator('input').fill(pin);
  pin = null;
  await entry.getByRole('button', { name: 'Validar PIN', exact: true }).click();
  const completed = await waitFor(pro, async () => (await statusFollowingHistory(pro, 'pro')) === 'completed', 'pro_completed', 30_000);
  result.checks.pinErrorAlertShown = await card(pro).locator('p.v6-alert[role="alert"]').count() > 0;
  if (!completed) stop('FAIL', result.checks.pinErrorAlertShown ? 'completion_rejected_by_backend' : 'completion_not_reflected');
  done('pro-complete');

  stage('client-sees-completed');
  // Stale client: card still present as trabajando => wait the full window, then FAIL (no tab switching to fabricate a refresh).
  if (!await waitFor(client, async () => (await statusFollowingHistory(client, 'client')) === 'completed', 'client_completed_no_reload')) {
    result.checks.completedReflectedWithoutReload = false;
    stop('FAIL', 'completed_not_reflected_on_client_without_reload');
  }
  result.checks.completedReflectedWithoutReload = true;
  // Precise claim: the transition arrived without reload; the existing filter may have required the Historial tab to show it.
  result.checks.completedShownViaHistoryTab = { client: historyOpened.client, pro: historyOpened.pro };
  done('client-sees-completed');

  // 6. Client reports the manual TEST payment, only if the real UI/state offers it.
  stage('client-report-payment');
  const meta = (await card(client).locator('.v6-meta-row').first().textContent()) || '';
  result.checks.paymentMetaNotRequired = /Sin pago online/.test(meta);
  const reportBox = card(client).locator('.v6-payment-box.action', { hasText: 'Reportar pago' });
  if (!await waitFor(client, async () => await reportBox.count() === 1, 'client_report_box', 15_000)) {
    stop('BLOCKED', result.checks.paymentMetaNotRequired ? 'payment_not_required_no_report_flow' : 'payment_report_not_offered_by_state');
  }
  const reportButton = reportBox.locator('button.v6-primary');
  if (await reportButton.count() !== 1) stop('BLOCKED', 'payment_report_button_ambiguous');
  await reportButton.click();
  const reported = await waitFor(client, async () => await card(client).getByText('Esperando confirmación del profesional', { exact: false }).count() > 0, 'client_payment_reported', 20_000);
  if (!reported) stop('BLOCKED', 'payment_report_rejected_or_not_reflected');
  done('client-report-payment');

  // 7. Professional confirms.
  stage('pro-confirm-payment');
  const confirmBox = card(pro).locator('.v6-payment-box.action', { hasText: 'Confirmar recepción' });
  if (!await waitFor(pro, async () => await confirmBox.count() === 1, 'pro_confirm_box_no_reload')) stop('FAIL', 'payment_report_not_reflected_on_pro_without_reload');
  await confirmBox.getByRole('button', { name: 'Pago recibido', exact: true }).click();
  if (!await waitFor(pro, async () => await card(pro).locator('.v6-closure-values dd', { hasText: /^Pago confirmado$/ }).count() > 0, 'pro_payment_confirmed', 20_000)) stop('FAIL', 'payment_confirmation_not_reflected');
  done('pro-confirm-payment');

  // 8. Client rates 5 stars.
  stage('client-rate');
  const ratingForm = card(client).locator('form:has(select[aria-label="Estrellas"])');
  if (!await waitFor(client, async () => await ratingForm.count() === 1, 'client_rating_form')) stop('BLOCKED', 'rating_form_not_available');
  await ratingForm.getByLabel('Estrellas', { exact: true }).selectOption('5');
  await ratingForm.getByPlaceholder('Comentario', { exact: true }).fill(MARKER);
  await ratingForm.getByRole('button', { name: 'Calificar', exact: true }).click();
  if (!await waitFor(client, async () => await card(client).getByText('Tu calificacion de 5 estrellas', { exact: false }).count() > 0, 'client_rating_saved', 20_000)) stop('FAIL', 'rating_not_confirmed');
  done('client-rate');
  await shot(client, ctx.outputDir, 'r2-final-client');
  await shot(pro, ctx.outputDir, 'r2-final-pro');
}

// Resume after the R2 run that persisted the authorized extra and the original final evidence but raised a false UI error.
// Strict read-only preconditions first; ANY deviation (including a partial earlier resume) stops with NEEDS_REVIEW.
// Never re-creates/approves the extra, never re-uploads the original evidence, never deletes anything.
async function resume(ctx) {
  const { client, pro } = ctx;
  stage('resume-preconditions');
  const statuses = { client: await statusOf(client), pro: await statusOf(pro) };
  result.checks.preStatus = statuses;
  if (statuses.client !== 'trabajando' || statuses.pro !== 'trabajando') stop('NEEDS_REVIEW', 'order_not_trabajando');
  for (const [who, page] of [['client', client], ['pro', pro]]) {
    const m = await markerState(page);
    if (m.retestMarker) stop('NEEDS_REVIEW', `partial_resume_retest_marker_present_${who}`);
    if (m.ratedNote) stop('NEEDS_REVIEW', `unexpected_rating_present_${who}`);
    if (m.extraCount !== 1 || !m.extraMarker) stop('NEEDS_REVIEW', `extras_not_exactly_one_qa_marker_${who}`);
    if (m.originalEvidenceCount !== 1) stop('NEEDS_REVIEW', `original_evidence_count_not_one_${who}`);
    // Stage is asserted only when the UI exposes a group label for the item; an unlabeled item is recorded, not assumed.
    const stageLabel = m.originalEvidenceStages[0];
    result.checks[`originalEvidenceStage_${who}`] = stageLabel || 'unavailable';
    if (stageLabel && stageLabel !== 'Trabajo terminado') stop('NEEDS_REVIEW', `original_evidence_stage_not_after_${who}`);
    const extra = card(page).locator('.v6-agreement-changes article', { hasText: MARKER });
    if (await extra.count() !== 1) stop('NEEDS_REVIEW', `extra_card_not_unique_${who}`);
    if (await extra.getByRole('button', { name: 'Aprobar modificación', exact: true }).count() !== 0) stop('NEEDS_REVIEW', `extra_not_approved_${who}`);
    if (await card(page).locator('.v6-closure-values dd', { hasText: /^Pago confirmado$/ }).count() > 0) stop('NEEDS_REVIEW', `payment_already_confirmed_${who}`);
    const eco = await economics(page);
    result.checks[`preEconomics_${who}`] = eco;
    if (eco.base !== BASE_AMOUNT || eco.total !== BASE_AMOUNT + EXTRA_AMOUNT) stop('NEEDS_REVIEW', `economics_not_18000_18100_${who}`);
  }
  done('resume-preconditions');

  // The retest filename must be absent before anything is written (checked above on both sides); upload ONCE.
  await uploadEvidence(ctx, RETEST_FILE_NAME, 'retestMarker');
  // Only the NEW filename counts as success; also confirm the original is still present exactly once (nothing replaced).
  const after = await markerState(pro);
  result.checks.originalEvidenceStillSingle = after.originalEvidenceCount === 1;
  if (!result.checks.originalEvidenceStillSingle) stop('NEEDS_REVIEW', 'original_evidence_changed_after_retest');
  await closureTail(ctx);
}

async function main() {
  let browser = null;
  let cfg = null;
  try {
    cfg = await readConfig();
    result.mode = cfg.mode;
    const outputDir = resolve(cfg.outputDir);
    mkdirSync(outputDir, { recursive: true });
    const { chromium } = loadPlaywright();

    stage('version-before');
    if (!await versionOk(versionFromNode, cfg.expectedCommit)) stop('BLOCKED', 'deployment_commit_mismatch_before');
    done('version-before');

    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const [clientAccount, proAccount] = cfg.accounts;
    const clientCtx = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const proCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const client = await clientCtx.newPage();
    const pro = await proCtx.newPage();
    watch(client, 'client'); watch(pro, 'pro');
    const ctx = { client, pro, outputDir };

    await login(client, clientAccount, 'client');
    await login(pro, proAccount, 'pro');
    await verifyIdentity(client, clientAccount, 'client');
    await verifyIdentity(pro, proAccount, 'pro');
    done('identity');

    stage('open-order');
    // Intent mode follows order participation; ensure the intended experience if it did not.
    await page_ready(client);
    await page_ready(pro);
    await ensureExperience(client, 'Cliente', 'client');
    await ensureExperience(pro, 'Profesional', 'pro');
    await locateOrder(client, 'client');
    await locateOrder(pro, 'pro');
    done('open-order');

    stage('version-after');
    if (!await versionOk(versionFromPage(client), cfg.expectedCommit) || !await versionOk(versionFromPage(pro), cfg.expectedCommit)) stop('BLOCKED', 'deployment_commit_mismatch_after_load');
    done('version-after');

    if (cfg.mode === 'inspect') await inspect(ctx);
    else if (cfg.mode === 'resume') await resume(ctx);
    else await r2(ctx);
    result.status = 'PASS';
    result.reason = null;
  } catch (error) {
    if (error instanceof Stop) { result.status = error.status; result.reason = error.reason; }
    else { result.status = 'FAIL'; result.reason = `unexpected_${scrub(error?.name)}:${scrub(error?.message)}`; }
    if (browser && cfg) {
      // Sanitized diagnostics for the failing state; no reload to hide stale state.
      try {
        const pages = browser.contexts().map(c => c.pages()[0]).filter(Boolean);
        const [client, pro] = pages;
        for (const [who, page] of [['client', client], ['pro', pro]]) {
          if (!page) continue;
          result.diagnostics[who] = { status: await statusOf(page), ...(await snapshot(page)) };
          await shot(page, resolve(cfg.outputDir), `failure-${who}`);
        }
      } catch { /* best effort */ }
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (cfg) { try { writeFileSync(join(resolve(cfg.outputDir), 'result.json'), JSON.stringify(result, null, 2)); } catch { /* ignore */ } }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  }
}

async function page_ready(page) {
  try { await page.locator('.v6-bottom').waitFor({ state: 'visible', timeout: 20_000 }); }
  catch { stop('BLOCKED', 'app_shell_not_ready'); }
  await page.waitForTimeout(1500); // let the pending order intent apply before touching the experience
}

await main();
