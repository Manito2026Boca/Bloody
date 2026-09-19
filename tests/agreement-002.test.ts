import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260918202042_agreement_002_price_confirmation.sql'),
  'utf8',
).toLowerCase();
const api = readFileSync(join(process.cwd(), 'app/lib/v6Api.ts'), 'utf8');
const app = readFileSync(join(process.cwd(), 'app/components/ManitoV6App.tsx'), 'utf8');
const safeRpcMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260919014748_agreement_002_safe_rpc_results.sql'),
  'utf8',
).toLowerCase();

describe('AGREEMENT-002 price confirmation', () => {
  it('contracts immediately only after exact prior consent', () => {
    expect(migration).toContain('client_price_consented_at is not null');
    expect(migration).toContain('client_price_consent_amount = v_price');
    expect(migration).toContain("'direct_accept_exact_consent'");
  });

  it('persists a non-contractual reservation for estimates or changed prices', () => {
    expect(migration).toContain("status = 'pending_client_confirmation'");
    expect(migration).toContain('price_confirmation_professional_id = v_uid');
    expect(migration).toContain('price_confirmation_proposed_amount = v_price');
    expect(migration).toContain('professional_id remains null until the client confirms');
  });

  it('centralizes timeout policy and keeps it out of the frontend', () => {
    expect(migration).toContain("values ('price_confirmation'");
    expect(migration).toContain("'immediate_minutes', 5");
    expect(migration).toContain("'scheduled_minutes', 30");
    expect(app).not.toContain('priceConfirmationTimeoutMinutes');
  });

  it('freezes the stored proposal rather than recalculating on confirmation', () => {
    expect(migration).toContain('v_order.price_confirmation_proposed_amount');
    expect(migration).toContain('v_order.price_confirmation_policy_snapshot');
    expect(migration).toContain('v_order.price_confirmation_components');
  });

  it('limits confirmation and rejection to the owning client', () => {
    expect(migration).toContain("v_order.client_id <> v_uid");
    expect(migration).toContain("v_order.client_id <> auth.uid()");
    expect(migration).toContain('revoke all on function public.confirm_order_price(uuid) from public,anon');
    expect(migration).toContain('revoke all on function public.reject_order_price(uuid) from public,anon');
  });

  it('releases rejected and expired reservations back into matching', () => {
    expect(migration).toContain("return private.release_price_confirmation_impl(p_order_id, 'expired'");
    expect(migration).toContain("return private.release_price_confirmation_impl(p_order_id,'rejected'");
    expect(migration).toContain("matching_status = case when mode = 'immediate'");
    expect(migration).toContain("then 'idle'");
  });

  it('protects concurrency and scheduled conflicts', () => {
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended(p_order_id::text, 802))');
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended(v_professional::text, 0))');
    expect(migration).toContain('professional_has_schedule_conflict');
  });

  it('keeps the reservation visible to both participants without assigning the professional', () => {
    expect(migration).toContain("status='pending_client_confirmation' and price_confirmation_professional_id=(select auth.uid())");
    expect(api).toContain('reserved_professional:profiles!orders_price_confirmation_professional_id_fkey');
    expect(app).toContain('Esperando confirmación del Cliente');
  });

  it('provides actionable client controls and realtime refresh', () => {
    expect(api).toContain("rpc('confirm_order_price'");
    expect(api).toContain("rpc('reject_order_price'");
    expect(app).toContain('Confirmar y contratar');
    expect(app).toContain('No aceptar');
    expect(migration).toContain('review_price_confirmation');
  });

  it('keeps NORM-013 PIN values out of every new public RPC response', () => {
    expect(safeRpcMigration.match(/- 'start_pin' - 'end_pin'/g)).toHaveLength(5);
    expect(safeRpcMigration).not.toContain('returns public.orders');
    expect(safeRpcMigration).not.toContain('returns setof public.orders');
  });
});
