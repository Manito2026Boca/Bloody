import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260914150000_admin_001_independent_membership.sql', 'utf8');
const app = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const adminPage = readFileSync('app/admin/AdminPageClient.tsx', 'utf8');

describe('ADMIN-001', () => {
  it('models admin as a private additive capability', () => {
    expect(migration).toContain('private.manito_admin_memberships');
    expect(migration).toContain('revoke all on table private.manito_admin_memberships from public, anon, authenticated');
    expect(migration).toContain("lower('jere.rouan97@gmail.com')");
    expect(migration).not.toContain("set role = 'admin'");
  });

  it('keeps the existing backend admin helper as the authorization boundary', () => {
    expect(migration).toContain('create or replace function private.is_manito_admin');
    expect(migration).toContain('membership.revoked_at is null');
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
  });

  it('exposes only the current user capability and no grant operation', () => {
    expect(migration).toContain('public.get_my_manito_capabilities()');
    expect(migration).toContain("jsonb_build_object('admin', private.is_manito_admin(auth.uid()))");
    expect(migration).not.toContain('grant_admin');
  });

  it('shows a protected admin destination only after capability detection', () => {
    expect(app).toContain('isAdmin={isAdmin}');
    expect(app).toContain('href="/admin"');
    expect(adminPage).toContain('if (!authorized)');
    expect(adminPage).toContain('<AdminVerificationInbox setNotice={setNotice} />');
  });
});
