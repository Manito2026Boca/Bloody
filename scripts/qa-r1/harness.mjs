import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
function dependency(name, anchor) {
  try { return require(name); }
  catch (error) { if (!anchor) throw error; return createRequire(require.resolve(anchor))(name); }
}
const { build } = dependency('esbuild', 'vite');
const ts = dependency('typescript');
const mocks = new Set(['v6Api', 'v6Supabase', 'providerIdentityApi', 'v6ProtectionApi', 'v6RecurringApi', 'v6OrderRealtime', 'webPush']);
function exportedRuntimeNames(source, filename) {
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  return parsed.statements.flatMap(node => {
    if (!node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) return [];
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) return node.name ? [node.name.text] : [];
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.map(decl => decl.name.getText(parsed));
    return [];
  });
}
export async function prepare() {
  const sources = {};
  const bundle = await build({ absWorkingDir: root, entryPoints: ['scripts/qa-r1/entry.tsx'], outfile: 'outputs/qa-r1/bundle.js', bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env': '{}', 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_APP_URL': 'undefined' }, plugins: [{ name: 'r1-isolated-api', setup(builder) {
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: 'next-image', namespace: 'r1-next' }));
    builder.onLoad({ filter: /.*/, namespace: 'r1-next' }, () => ({ contents: "export { Image as default } from 'next/dist/client/image-component';", resolveDir: root }));
    builder.onResolve({ filter: /(?:v6Api|v6Supabase|providerIdentityApi|v6ProtectionApi|v6RecurringApi|v6OrderRealtime|webPush)$/ }, args => {
      const basename = args.path.split('/').at(-1);
      if (mocks.has(basename)) return { path: resolve(args.resolveDir, `${args.path}.ts`), namespace: 'r1-api' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'r1-api' }, args => {
      const source = readFileSync(args.path, 'utf8'); sources[args.path] = source;
      const names = exportedRuntimeNames(source, args.path);
      return { contents: `import {invoke} from ${JSON.stringify(resolve(root, 'scripts/qa-r1/fixtures.ts'))};\n${names.map(name => `export const ${name}=(...args)=>invoke(${JSON.stringify(name)},args);`).join('\n')}`, loader: 'ts', resolveDir: root };
    });
    builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => { throw new Error('Real Supabase SDK reached isolated bundle'); });
    builder.onLoad({ filter: /\.(tsx?|css)$/ }, args => { const source = readFileSync(args.path, 'utf8'); if (!args.path.includes(`${sep}node_modules${sep}`)) sources[args.path] = source; return { contents: source, loader: args.path.endsWith('.module.css') ? 'local-css' : extname(args.path).slice(1) }; });
  } }] });
  const cssPath = resolve(root, 'app/globals.css');
  const originalCss = readFileSync(cssPath, 'utf8'); sources[cssPath] = originalCss;
  const postcss = dependency('postcss', '@tailwindcss/postcss');
  const tailwind = dependency('@tailwindcss/postcss');
  const css = (await postcss([tailwind({ base: root, optimize: false })]).process(originalCss, { from: cssPath })).css + '\n' + bundle.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n');
  const output = resolve(root, 'outputs/qa-r1'); mkdirSync(output, { recursive: true });
  const manifest = { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sources: Object.fromEntries(Object.entries(sources).map(([path, source]) => [path.slice(root.length + 1).replaceAll('\\', '/'), createHash('sha256').update(source).digest('hex')])), css: 'compiled from current app/globals.css with repository Tailwind plugin', mounted: 'complete ManitoV6App + real PwaUpdateProvider + synthetic port', network: 'loopback only' };
  const manifestId = createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 12);
  writeFileSync(resolve(output, `manifest-${manifestId}.json`), JSON.stringify(manifest, null, 2));
  writeFileSync(resolve(output, `bundle-${manifestId}.js`), bundle.outputFiles.find(file => file.path.endsWith('.js')).text);
  writeFileSync(resolve(output, `style-${manifestId}.css`), css);
  const server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'none'; frame-src 'none'; form-action 'self'; base-uri 'none'");
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    const pathname = requestUrl.pathname;
    if (pathname === '/bundle.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles.find(file => file.path.endsWith('.js')).text); }
    else if (pathname === '/style.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); }
    else if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
    else {
      const assetPath = pathname === '/_next/image' ? requestUrl.searchParams.get('url') || '' : pathname;
      const asset = resolve(root, 'public', `.${decodeURIComponent(assetPath)}`);
      if (asset.startsWith(resolve(root, 'public') + sep) && existsSync(asset) && ['.png', '.webp', '.svg', '.ico'].includes(extname(asset))) { response.setHeader('Content-Type', { '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }[extname(asset)]); response.end(readFileSync(asset)); }
      else { response.statusCode = 404; response.end('Unknown isolated resource'); }
    }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return { output, manifestId, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(done => server.close(done)) };
}
export async function runCases(cases) {
  const harness = await prepare();
  const runId = `${new Date().toISOString().replace(/\D/g, '')}-${randomUUID().slice(0, 8)}`;
  if (process.argv.includes('--prepare-only')) { console.log(JSON.stringify({ prepared: true, manifest: harness.manifestId, output: harness.output })); await harness.close(); return; }
  let browser;
  const results = [];
  try {
    assert(process.env.MANITO_PLAYWRIGHT_MODULE, 'Set MANITO_PLAYWRIGHT_MODULE to external Playwright entrypoint; no browser installed by harness');
    const { chromium } = await import(pathToFileURL(resolve(process.env.MANITO_PLAYWRIGHT_MODULE)).href);
    browser = await chromium.launch({ headless: true, channel: process.env.MANITO_BROWSER_CHANNEL || undefined });
    const selection = process.argv.find(arg => arg.startsWith('--case='))?.slice(7);
    for (const test of cases.filter(test => !selection || new RegExp(selection).test(test.name))) {
      const context = await browser.newContext({ viewport: { width: test.width || 390, height: test.height || 844 }, hasTouch: test.touch || false, serviceWorkers: 'block' });
      const errors = [], external = [], consoleErrors = [], failedResources = [];
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === harness.base) return route.continue();
        external.push(route.request().url()); return route.abort('blockedbyclient');
      });
      const page = await context.newPage(); page.setDefaultTimeout(6000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('response', response => { if (response.status() >= 400) failedResources.push({ url: response.url(), status: response.status() }); });
      const result = { name: test.name, manifest: harness.manifestId, runId, status: 'PASS' };
      try {
        if (test.init) await test.init(context, page);
        await page.goto(`${harness.base}/?${new URLSearchParams(test.query || {})}`);
        await page.locator('.v6-bottom').waitFor();
        if (test.query?.actor === 'professional' && test.autoProfessional !== false) {
          await page.getByRole('button', { name: 'Cambiar a experiencia Profesional', exact: true }).click();
          await page.getByRole('heading', { name: 'Hoy', exact: true }).waitFor();
          await settle(page);
        }
        await test.run(page, result, { context, base: harness.base });
      } catch (error) { result.status = 'FAIL'; result.error = error.message; }
      finally {
        result.calls = await page.evaluate(() => window.__qa?.state.calls || []).catch(() => []);
        result.unexpected = await page.evaluate(() => window.__qa?.state.unexpected || []).catch(() => []);
        result.errors = errors; result.external = external; result.consoleErrors = consoleErrors; result.failedResources = failedResources;
        if (errors.length || external.length || consoleErrors.length || failedResources.length || result.unexpected.length) { result.status = 'HARNESS_ERROR'; }
        result.screenshot = `${test.name}-${harness.manifestId}-${runId}.png`;
        await page.screenshot({ path: resolve(harness.output, result.screenshot), fullPage: true });
        results.push(result); console.log(JSON.stringify({ name: result.name, status: result.status, error: result.error, observations: result.observations, unexpected: result.unexpected, errors, external }));
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close(); await harness.close();
    if (results.length) { const report = resolve(harness.output, `results-${process.argv[1].split(/[\\/]/).at(-1)}-${harness.manifestId}-${runId}.json`); writeFileSync(report, JSON.stringify(results, null, 2)); console.log(`Report: ${report}`); }
  }
  if (results.some(result => result.status !== 'PASS')) process.exitCode = 1;
}
export async function calls(page, name) { return page.evaluate(name => window.__qa.calls().filter(call => call.name === name), name); }
export async function settle(page) { await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))); }
export async function openJobs(page) { await page.locator('.v6-bottom').getByRole('button', { name: 'Trabajos', exact: true }).click(); }
