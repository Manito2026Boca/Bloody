// Isolated rendering of the actual identity components with synthetic RPC fixtures.
// Does not log in, call Supabase, or mutate any real/QA account.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

assert(process.env.MANITO_PLAYWRIGHT_MODULE, 'Set MANITO_PLAYWRIGHT_MODULE to an isolated Playwright module');
const { chromium } = await import(pathToFileURL(resolve(process.env.MANITO_PLAYWRIGHT_MODULE)).href);
const rpc = `
let own={status:'UNVERIFIED',masked_cuit:null,can_submit:true};
const claim={id:'fixture-claim',type:'INITIAL',status:'PENDING',masked_cuit:'**-********-7',fiscal_status:'PENDING',operational_status:'RESTRICTED',source:null,verified_at:null,verified_by:null,canonical_profile_id:null,conflicting_claims:1,events:[]};
export async function getMyProviderIdentity(){return own}
export async function submitProviderIdentity(){own={status:'PENDING',masked_cuit:'**-********-7',can_submit:false};return {received:true}}
export async function getAdminProviderIdentity(){return {claims:[claim],activities:[{service_id:1,specialty_id:null,level:'LEVEL_2',credential_kinds:['gas_installer_registration']}]}}
export async function revealProviderCuit(){return '99000000007'}
export async function reviewProviderIdentity(id,action,result){if(action==='ARCA')claim.fiscal_status=result==='FOUND'?'VERIFIED':'NEEDS_REVIEW'}
export async function configureProviderActivity(){}
export async function getProviderActivityReviews(){return []}
export async function reviewProviderActivityDocument(){}
`;
const bundle = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {ProviderIdentityPanel} from './app/components/ProviderIdentityPanel';
import {AdminProviderIdentity} from './app/components/AdminProviderIdentity';
const admin=location.pathname==='/admin-fixture';
createRoot(document.getElementById('root')).render(admin?<AdminProviderIdentity professionalId="fixture-pro" serviceNames={{1:'Plomeria'}}/>:<ProviderIdentityPanel profileId="fixture-pro"/>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{
  name: 'identity-fixtures', setup(builder) {
    builder.onResolve({ filter: /providerIdentityApi$/ }, () => ({ path: 'rpc', namespace: 'fixture' }));
    builder.onResolve({ filter: /\/v6Api$/ }, () => ({ path: 'preferences', namespace: 'fixture' }));
    builder.onResolve({ filter: /PwaUpdateProvider$/ }, () => ({ path: 'safety', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'rpc' ? rpc : path === 'preferences' ? 'export async function getV6UserSecurityPreferences(){return null}; export async function listV6ProfessionalDocuments(){return [{id:"fixture-doc",kind:"gas_installer_registration",status:"approved",file_path:"fixture/gas"}]}' : 'export function usePwaForm(){return {blocked:()=>false,dirty(){},begin(){},saved(){},failed(){}}}', loader: 'js' }));
  },
}] });
const stylesheet = readdirSync('.next/static/chunks').filter((name) => name.endsWith('.css')).map((name) => readFileSync(`.next/static/chunks/${name}`, 'utf8')).join('\n');
const server = createServer((request, response) => {
  if (request.url === '/bundle.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text); }
  else if (request.url === '/style.css') { response.setHeader('Content-Type', 'text/css'); response.end(stylesheet); }
  else if (request.url?.includes('/media/') || request.url === '/favicon.ico') { response.statusCode = 204; response.end(); }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><main id="root" style="max-width:720px;margin:auto;padding:16px"></main><script src="/bundle.js"></script></body></html>'); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try { browser = await chromium.launch({ headless: true, channel: process.env.MANITO_BROWSER_CHANNEL || undefined }); }
catch (error) { await new Promise((done) => server.close(done)); throw error; }
const output = resolve('outputs/identity-arca'); mkdirSync(output, { recursive: true });
try {
  for (const [width, height] of [[360, 800], [390, 844], [1280, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base);
    await page.getByLabel('Tu CUIT personal').fill('99-00000000-7');
    await page.screenshot({ path: resolve(output, `provider-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Enviar para revision' }).click();
    await page.getByText('CUIT **-********-7', { exact: true }).waitFor();
    assert(await page.getByLabel('Tu CUIT personal').count() === 0, 'pending cannot silently edit CUIT');
    await page.goto(`${base}/admin-fixture`);
    await page.getByRole('button', { name: 'Revelar para revision' }).click();
    await page.getByText('CUIT 99000000007', { exact: true }).waitFor();
    await page.getByLabel('Resultado de la consulta fiscal').selectOption('UNAVAILABLE');
    await page.getByRole('button', { name: 'Registrar consulta ARCA' }).click();
    await page.getByText('NEEDS_REVIEW', { exact: true }).waitFor();
    await page.screenshot({ path: resolve(output, `admin-${width}.png`), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `admin overflow ${width}`);
    await page.getByRole('button', { name: 'Guardar requisitos' }).scrollIntoViewIfNeeded();
    assert(await page.getByRole('button', { name: 'Guardar requisitos' }).isVisible());
    const sector = page.locator('form').filter({ has: page.getByRole('heading', { name: /Matrícula de instalador de gas/ }) });
    await sector.getByLabel('Número de matrícula / documento / registro').fill('Synthetic registration');
    await sector.getByLabel('Organismo o registro').fill('Synthetic registry');
    await sector.getByLabel('Observación de revisión').fill('Synthetic review');
    await sector.getByLabel('Decisión').selectOption('APPROVED');
    await sector.getByRole('button', { name: 'Registrar revisión sectorial' }).click();
    await sector.getByText('Revisión registrada.').waitFor();
    await page.screenshot({ path: resolve(output, `sector-${width}.png`), fullPage: true });
    assert.deepEqual(errors, [], `runtime errors ${width}`);
    await page.close();
  }
  console.log('Identity browser fixtures: PASS 360x800, 390x844, desktop. Not a real Supabase/Human Test.');
} finally { await browser.close(); await new Promise((done) => server.close(done)); }
