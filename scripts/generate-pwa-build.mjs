import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root);
const commit = process.env.VERCEL_GIT_COMMIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
const pkg = JSON.parse(readFileSync(file('package.json'), 'utf8'));
const identity = {
  schemaVersion: 1,
  protocolVersion: 1,
  appVersion: pkg.version,
  buildId: randomUUID(),
  commit,
  builtAt: new Date().toISOString(),
};
const json = JSON.stringify(identity);
writeFileSync(file('app/lib/pwaBuildIdentity.ts'), `import type { PwaBuildIdentity } from './pwaUpdateContract';\n\nexport const CURRENT_PWA_BUILD: PwaBuildIdentity = ${json};\n`);
writeFileSync(file('public/pwa-version.json'), `${json}\n`);
const workerPath = file('public/sw.js');
const worker = readFileSync(workerPath, 'utf8');
const updated = worker.replace(/^const WORKER_BUILD = .*;$/m, `const WORKER_BUILD = ${json};`);
if (updated === worker) throw new Error('Worker identity marker missing or build ID did not change');
writeFileSync(workerPath, updated);
