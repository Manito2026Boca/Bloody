import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/202608280002_admin_review_workbench.sql'),
  'utf8',
).toLowerCase();

describe('MANITO admin review workbench', () => {
  it('exposes professional review data only through an admin-gated RPC', () => {
    expect(migration).toContain('function public.list_admin_professional_reviews()');
    expect(migration).toContain('security definer');
    expect(migration).toContain('where private.is_manito_admin()');
    expect(migration).toContain('jsonb_build_object');
    expect(migration).toContain("'file_path', d.file_path");
  });

  it('lets only MANITO admins approve or observe professional onboarding', () => {
    expect(migration).toContain('function public.review_professional_onboarding');
    expect(migration).toContain('if not private.is_manito_admin() then');
    expect(migration).toContain("v_status not in ('in_review', 'approved', 'observed', 'rejected', 'suspended')");
    expect(migration).toContain("set role = case when role = 'admin' then role else 'professional' end");
    expect(migration).toContain("when v_status = 'approved' then true");
    expect(migration).toContain("when v_status in ('observed', 'rejected', 'suspended') then false");
  });

  it('moves document review behind an admin RPC and protects private media access', () => {
    expect(migration).toContain('function public.review_professional_document');
    expect(migration).toContain("v_status not in ('approved', 'observed', 'rejected')");
    expect(migration).toContain('drop policy if exists manito_media_select_own on storage.objects');
    expect(migration).toContain('or private.is_manito_admin()');
  });

  it('grants only authenticated execution on public review RPCs', () => {
    expect(migration).toContain('revoke all on function public.list_admin_professional_reviews() from public, anon');
    expect(migration).toContain('revoke all on function public.review_professional_onboarding(uuid, text, text, boolean, boolean) from public, anon');
    expect(migration).toContain('revoke all on function public.review_professional_document(uuid, text, text) from public, anon');
    expect(migration).toContain('grant execute on function public.list_admin_professional_reviews() to authenticated');
    expect(migration).toContain('grant execute on function public.review_professional_onboarding(uuid, text, text, boolean, boolean) to authenticated');
    expect(migration).toContain('grant execute on function public.review_professional_document(uuid, text, text) to authenticated');
  });
});
