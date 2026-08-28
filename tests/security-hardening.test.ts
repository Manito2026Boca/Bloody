import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootFiles = [
  'app/lib/v6Supabase.ts',
  'README.md',
  'next.config.ts',
  'supabase/migrations/202608270005_security_hardening.sql',
].map((path) => readFileSync(join(process.cwd(), path), 'utf8'));

describe('MANITO security hardening', () => {
  it('does not keep the shared beta publishable key hardcoded', () => {
    const joined = rootFiles.join('\n');
    expect(joined).not.toContain('sb_publishable_txzdjLhKue77cWaozTxlbA_Awq0H16s');
  });

  it('keeps sensitive account preferences behind RLS', () => {
    const migration = rootFiles[3].toLowerCase();
    expect(migration).toContain('create table if not exists public.user_security_preferences');
    expect(migration).toContain('alter table public.user_security_preferences enable row level security');
    expect(migration).toContain('profile_id = (select auth.uid())');
  });

  it('ships browser security headers', () => {
    const config = rootFiles[2].toLowerCase();
    expect(config).toContain('content-security-policy');
    expect(config).toContain('strict-transport-security');
    expect(config).toContain('x-frame-options');
    expect(config).toContain('permissions-policy');
  });
});
