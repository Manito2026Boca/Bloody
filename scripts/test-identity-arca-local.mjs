// In-memory PostgreSQL smoke; never connects to Supabase or mutates real users.
// Supply an isolated @electric-sql/pglite installation via MANITO_PGLITE_MODULE.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

assert(process.env.MANITO_PGLITE_MODULE, 'Set MANITO_PGLITE_MODULE to the isolated PGlite module path');
const { PGlite } = await import(pathToFileURL(resolve(process.env.MANITO_PGLITE_MODULE)).href);
const db = new PGlite();
try {
  await db.exec(readFileSync('supabase/tests/identity_arca_001_fixture.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20260929194755_identity_arca_001.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/identity_arca_001.sql', 'utf8'));
  console.log('IDENTITY-ARCA local PostgreSQL smoke: PASS (isolated fixture; not Supabase integration or multi-session concurrency)');
} catch (error) {
  // Do not dump query contents or parameters on failure.
  console.error('IDENTITY-ARCA local SQL smoke: FAIL', error.code || 'SQL_ERROR', error.message.replace(/\d{11}/g, '[redacted]'));
  process.exitCode = 1;
} finally { await db.close(); }
