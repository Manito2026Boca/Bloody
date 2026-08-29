import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260829095955_normalize_rls_grants.sql'),
  'utf8',
).toLowerCase();

const storageFollowUpMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260829100630_normalize_storage_grants.sql'),
  'utf8',
).toLowerCase();

const functionSearchPathMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260829101000_lock_function_search_path.sql'),
  'utf8',
).toLowerCase();

const combinedMigrations = `${migration}\n${storageFollowUpMigration}\n${functionSearchPathMigration}`;

describe('NORM-002 RLS and grant normalization', () => {
  it('removes anonymous business and storage access', () => {
    expect(migration).toContain('revoke all on all tables in schema public from anon');
    expect(migration).toContain('revoke all on all sequences in schema public from anon');
    expect(combinedMigrations).toContain('revoke all on storage.buckets from public, anon');
    expect(combinedMigrations).toContain('revoke all on storage.objects from public, anon');
    expect(storageFollowUpMigration).toContain(
      'revoke all on storage.buckets from public, anon, authenticated',
    );
    expect(storageFollowUpMigration).toContain(
      'revoke all on storage.objects from public, anon, authenticated',
    );
    expect(combinedMigrations).not.toMatch(/grant\s+[^;]+\s+to\s+anon\b/);
  });

  it('keeps sensitive marketplace writes behind RPCs or server-owned flows', () => {
    for (const grant of [
      'grant select on public.order_proposals to authenticated',
      'grant select on public.order_extras to authenticated',
      'grant select on public.payments to authenticated',
      'grant select on public.complaints to authenticated',
      'grant select on public.professional_payment_accounts to authenticated',
      'grant select on public.payment_events to authenticated',
    ]) {
      expect(migration).toContain(grant);
    }

    expect(migration).toContain('grant select, insert on public.orders to authenticated');
    expect(migration).toContain('drop policy if exists orders_client_update_v5_details');
    expect(migration).not.toMatch(/grant\s+[^;]*update[^;]*on\s+public\.orders\s+to\s+authenticated/);
    expect(migration).not.toMatch(/grant\s+[^;]*insert[^;]*on\s+public\.payments\s+to\s+authenticated/);
    expect(migration).not.toMatch(/grant\s+[^;]*update[^;]*on\s+public\.payments\s+to\s+authenticated/);
  });

  it('keeps profile private fields out of broad table selects', () => {
    expect(migration).toContain('grant select (');
    expect(migration).toContain(') on public.profiles to authenticated');
    expect(migration).not.toContain('grant select on public.profiles to authenticated');
    expect(migration).toContain('grant update (');
    expect(migration).toContain('phone');
  });

  it('guards professional review fields from self-approval', () => {
    expect(migration).toContain('function private.enforce_professional_document_review_fields()');
    expect(migration).toContain("new.status not in ('pending', 'uploaded')");
    expect(migration).toContain('la revision de documentos la realiza manito');
    expect(migration).toContain('professional_documents_select_self_or_admin');
    expect(migration).toContain('professional_documents_insert_self');
    expect(migration).toContain('professional_documents_update_self_or_admin');
  });

  it('requires a completed own order before inserting a rating', () => {
    expect(migration).toContain('create policy ratings_client_insert on public.ratings');
    expect(migration).toContain('client_id = (select auth.uid())');
    expect(migration).toContain('o.client_id = (select auth.uid())');
    expect(migration).toContain('o.professional_id = ratings.professional_id');
    expect(migration).toContain("o.status = 'completed'");
  });

  it('leaves NORM-013 for a dedicated PIN pass', () => {
    expect(migration).toContain('"pin_scope": "norm-013 explicitly left unchanged"');
    expect(migration).not.toContain('list_my_order_pins');
  });

  it('locks helper function search paths reported by Supabase advisors', () => {
    expect(functionSearchPathMigration).toContain('function public.touch_updated_at()');
    expect(functionSearchPathMigration).toContain('function private.order_public_zone(p_address text)');
    expect(functionSearchPathMigration).toContain('function private.distance_km(');
    expect(functionSearchPathMigration.match(/set search_path = ''/g)).toHaveLength(3);
  });
});
