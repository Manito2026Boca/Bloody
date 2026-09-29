// Actual independent PostgreSQL sessions in an isolated temporary cluster.
// Never accepts a remote/database URL and never touches Supabase.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

assert(process.env.MANITO_EMBEDDED_PG_MODULE, 'Set MANITO_EMBEDDED_PG_MODULE to an isolated embedded-postgres module');
const { default: EmbeddedPostgres } = await import(pathToFileURL(resolve(process.env.MANITO_EMBEDDED_PG_MODULE)).href);
const socket = createServer(); await new Promise((done) => socket.listen(0, '127.0.0.1', done));
const port = socket.address().port; await new Promise((done) => socket.close(done));
const databaseDir = mkdtempSync(join(tmpdir(), 'manito-identity-pg-'));
assert(resolve(databaseDir).startsWith(resolve(tmpdir()) + sep) && basename(databaseDir).startsWith('manito-identity-pg-'));
const cluster = new EmbeddedPostgres({ databaseDir, port, user: 'identity_test', password: randomBytes(32).toString('hex'),
  persistent: true, createPostgresUser: false, postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
const clients = [];
async function connect() { const client = cluster.getPgClient(); await client.connect(); clients.push(client); return client; }
const A = '00000000-0000-0000-0000-000000000001';
const ADMIN = '00000000-0000-0000-0000-000000000003';
const CLIENT = '00000000-0000-0000-0000-000000000005';
let started = false;
try {
  await cluster.initialise(); await cluster.start(); started = true;
  const setup = await connect();
  await setup.query(readFileSync('supabase/tests/identity_arca_001_fixture.sql', 'utf8'));
  await setup.query(readFileSync('supabase/migrations/20260929194755_identity_arca_001.sql', 'utf8'));
  await setup.query(readFileSync('supabase/tests/identity_arca_001.sql', 'utf8'));
  const actors = Array.from({ length: 12 }, () => randomUUID());
  for (const id of actors) {
    await setup.query("insert into auth.users(id,email,raw_app_meta_data) values($1,'synthetic@invalid','{}')", [id]);
    await setup.query("insert into public.profiles(id,role,full_name) values($1,'professional','Synthetic fixture')", [id]);
  }
  const connections = await Promise.all(actors.map(() => connect()));
  await Promise.all(connections.map(async (client, index) => {
    await client.query('set role authenticated');
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [actors[index]]);
  }));
  const replies = await Promise.all(connections.map((client) => client.query("select public.submit_provider_identity_claim('99000000031',false) as response")));
  assert(replies.every((reply) => JSON.stringify(reply.rows[0].response) === JSON.stringify({ received: true })), 'identical public response');
  const counts = await setup.query("select (select count(*) from private.provider_identities where normalized_cuit='99000000031') as identities,(select count(*) from private.provider_identity_claims where claimant_profile_id=any($1)) as claims", [actors]);
  assert.equal(Number(counts.rows[0].identities), 1); assert.equal(Number(counts.rows[0].claims), 12);

  const admission = await connect(); const review = await connect();
  await setup.query("select set_config('request.jwt.claim.sub',$1,false)", [ADMIN]);
  await setup.query("select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id=$1),'ENABLE')", [A]);
  // Suspension holds the identity lock; reservation admission must wait and then fail.
  await review.query('begin');
  await review.query("select set_config('request.jwt.claim.sub',$1,true)", [ADMIN]);
  await review.query("select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id=$1),'SUSPEND')", [A]);
  const reservation = admission.query("insert into public.orders(client_id,service_id,mode,status,price_confirmation_professional_id) values($1,1,'immediate','pending_client_confirmation',$2)", [CLIENT,A]).then(() => false, () => true);
  // The final assertion is decisive even if scheduling means the wait isn't observed here.
  await review.query('commit'); assert(await reservation, 'suspended reservation rejected');

  await setup.query("select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id=$1),'ENABLE')", [A]);
  await admission.query('begin');
  await admission.query("insert into public.orders(client_id,service_id,mode,status,professional_id,contracted_at) values($1,1,'immediate','accepted',$2,now())", [CLIENT,A]);
  // A successful admission holds the stable service lock through commit.
  await review.query('begin'); await review.query("select set_config('request.jwt.claim.sub',$1,true)", [ADMIN]);
  let configured = false;
  const change = review.query("select public.configure_provider_activity(1,null,'LEVEL_3','{}')").then(() => { configured=true; });
  await setup.query('select pg_sleep(0.1)'); assert.equal(configured, false, 'config serialized behind admission');
  await admission.query('commit'); await change; await review.query('commit');

  const claimant = actors[0];
  await setup.query("select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id=$1),'ARCA','FOUND')", [claimant]);
  await setup.query("insert into public.professional_documents(professional_id,kind,status,file_path) select $1,kind,'approved','local-fixture/'||kind from unnest(array['dni_front','dni_back','selfie','tax']) kind", [claimant]);
  await review.query('begin');
  await review.query("update public.professional_documents set status='rejected' where professional_id=$1 and kind='tax'", [claimant]);
  await admission.query("select set_config('request.jwt.claim.sub',$1,false)", [ADMIN]);
  const binding = admission.query("select public.review_provider_identity((select id from private.provider_identity_claims where claimant_profile_id=$1),'ACCEPT',null,true)", [claimant]).then(() => false, () => true);
  await setup.query('select pg_sleep(0.1)'); await review.query('commit');
  assert(await binding, 'concurrent document rejection prevents canonical linking');
  console.log('Identity PostgreSQL concurrency: PASS (12 sessions, one identity/multiple claims, suspension reservation, config/admission serialization, document rejection/linking).');
} catch (error) {
  console.error('Identity PostgreSQL concurrency: FAIL', error.code || 'TEST_ERROR', String(error.message).replace(/\d{11}/g, '[redacted]'));
  process.exitCode = 1;
} finally {
  for (const client of clients) { try { await client.query('rollback'); await client.end(); } catch {} }
  if (started) await cluster.stop();
  // Generated disposable cluster only. Resolved containment was checked before creation.
  if (resolve(databaseDir).startsWith(resolve(tmpdir()) + sep) && basename(databaseDir).startsWith('manito-identity-pg-')) rmSync(databaseDir, { recursive: true, force: true });
}
