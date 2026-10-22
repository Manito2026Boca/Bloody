import { prepare } from './harness.mjs';

const harness = await prepare();
console.log(`MANITO R1 local synthetic UI: ${harness.base}`);
console.log(`Mock API, real components/PWA, external connections blocked. Manifest: ${harness.manifestId}`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try { await harness.close(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
