import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
const [outputArg, explicitOrigin] = process.argv.slice(2);
const originArg = explicitOrigin || process.env.NEXT_PUBLIC_APP_URL;
if (!outputArg || !originArg) throw new Error('Usage: node public/legacy-compat/build.mjs <public-web-output> <APP_ORIGIN>');
const appOrigin = new URL(originArg);
if (appOrigin.protocol !== 'https:' || appOrigin.origin !== originArg || appOrigin.origin === 'https://manitoapp.com.ar') {
  throw new Error('APP_ORIGIN must be the configured HTTPS app origin.');
}
const output = resolve(outputArg);
const commit = process.env.VERCEL_GIT_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const build = {
  schemaVersion: 1, protocolVersion: 1, appVersion: 'legacy-bridge-1',
  buildId: randomUUID(), commit, builtAt: new Date().toISOString(),
};
const version = JSON.stringify(build);
const worker = (await readFile(join(source, 'sw.js'), 'utf8'))
  .replace(/^const WORKER_BUILD = .*;$/m, `const WORKER_BUILD = ${version};`);
if (!worker.includes(`const WORKER_BUILD = ${version};`)) throw new Error('Legacy worker identity marker missing.');
const bridge = (await readFile(join(source, 'continuar.html'), 'utf8')).replace('__APP_ORIGIN__', appOrigin.origin);
if (bridge.includes('__APP_ORIGIN__')) throw new Error('Bridge origin was not configured.');
const files = new Map([
  ['sw.js', worker],
  ['pwa-version.json', `${version}\n`],
  ['manifest.webmanifest', await readFile(join(source, 'manifest.webmanifest'), 'utf8')],
  ['offline.html', await readFile(join(source, 'offline.html'), 'utf8')],
  ['continuar/index.html', bridge],
  ['legacy-compat/entry.js', await readFile(join(source, 'entry.js'), 'utf8')],
  ['legacy-compat/bridge.js', await readFile(join(source, 'bridge.js'), 'utf8')],
]);
const brandSource = resolve(source, '..', 'brand');
const brandFiles = ['manito-icon-512.png', 'manito-maskable-512.png'];
for (const path of [...files.keys(), ...brandFiles.map((name) => `brand/${name}`)]) {
  try { await access(join(output, path)); } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  throw new Error(`Public-web output path collision: ${path}`);
}
for (const [path, content] of files) {
  const destination = join(output, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content, { flag: 'wx' });
}
await mkdir(join(output, 'brand'), { recursive: true });
for (const name of brandFiles) {
  await copyFile(join(brandSource, name), join(output, 'brand', name));
}
process.stdout.write(`Legacy compatibility build ${build.buildId} from ${commit}\n`);
