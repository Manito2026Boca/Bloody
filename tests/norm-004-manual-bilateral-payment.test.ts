import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = [
  '20260830102000_norm_004_manual_bilateral_payment.sql',
  '20260830104000_norm_004_payment_rpc_search_path.sql',
].map((file) => (
  readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8')
)).join('\n').toLowerCase();

const component = readFileSync(
  join(process.cwd(), 'app/components/ManitoV6App.tsx'),
  'utf8',
).toLowerCase();

const api = readFileSync(
  join(process.cwd(), 'app/lib/v6Api.ts'),
  'utf8',
).toLowerCase();

function blockBetween(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('NORM-004 manual bilateral payment', () => {
  it('adds bilateral manual payment states without removing legacy approved', () => {
    expect(migration).toContain("'reported'");
    expect(migration).toContain("'confirmed'");
    expect(migration).toContain("'disputed'");
    expect(migration).toContain("'approved'");
  });

  it('keeps client reporting separate from professional confirmation', () => {
    const reportBlock = blockBetween('create or replace function private.report_order_payment_impl', 'create or replace function private.confirm_manual_payment_impl');
    expect(reportBlock).toContain("status = 'completed'");
    expect(reportBlock).toContain("payment_method in ('cash', 'wallet', 'transfer')");
    expect(reportBlock).toContain("status = 'reported'");
    expect(reportBlock).not.toContain("status = 'confirmed'");
    expect(reportBlock).not.toContain("payment_status = 'paid'");
  });

  it('only lets the client of the completed order report manual payment', () => {
    const reportBlock = blockBetween('create or replace function private.report_order_payment_impl', 'create or replace function private.confirm_manual_payment_impl');
    expect(reportBlock).toContain('client_id = v_uid');
    expect(reportBlock).toContain('professional_id is not null');
  });

  it('only lets the assigned professional confirm a reported payment', () => {
    const confirmBlock = blockBetween('create or replace function private.confirm_manual_payment_impl', 'create or replace function private.dispute_manual_payment_impl');
    expect(confirmBlock).toContain('professional_id = v_uid');
    expect(confirmBlock).toContain("status = 'reported'");
    expect(confirmBlock).toContain("status = 'confirmed'");
    expect(confirmBlock).toContain('confirmed_at = now()');
  });

  it('lets the assigned professional dispute without marking confirmed', () => {
    const disputeBlock = blockBetween('create or replace function private.dispute_manual_payment_impl', 'drop function if exists public.report_order_payment');
    expect(disputeBlock).toContain('professional_id = v_uid');
    expect(disputeBlock).toContain("status = 'reported'");
    expect(disputeBlock).toContain("status = 'disputed'");
    expect(disputeBlock).not.toContain("status = 'confirmed'");
  });

  it('uses NORM-003 backend totals for amount, fee and professional net', () => {
    const reportBlock = blockBetween('create or replace function private.report_order_payment_impl', 'create or replace function private.confirm_manual_payment_impl');
    expect(reportBlock).toContain('v_service_total := private.order_service_total_amount(v_order.id)');
    expect(reportBlock).toContain('v_amount := private.order_client_total_amount(v_order.id)');
    expect(reportBlock).toContain('v_fee := private.order_commission_amount(v_service_total, v_policy)');
    expect(reportBlock).toContain('greatest(0, v_service_total - v_fee)');
  });

  it('does not accept frontend amount or fee as payment truth', () => {
    const start = api.indexOf('export async function reportv6orderpayment');
    const end = api.indexOf('export async function confirmv6manualpayment', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const reportApiBlock = api.slice(start, end);
    expect(reportApiBlock).toContain("rpc('report_order_payment'");
    expect(reportApiBlock).not.toContain('p_amount');
    expect(reportApiBlock).not.toContain('p_manito_fee');
    expect(reportApiBlock).not.toContain('p_professional_amount');
  });

  it('stores payment events for every bilateral transition', () => {
    expect(migration).toContain("'client_reported_payment'");
    expect(migration).toContain("'professional_confirmed_receipt'");
    expect(migration).toContain("'professional_disputed_receipt'");
    expect(migration).toContain('private.record_payment_event');
  });

  it('allows participants to read payment events but not unrelated users', () => {
    const policyBlock = blockBetween('create policy payment_events_select_participants_or_admin', 'create or replace function private.report_order_payment_impl');
    expect(policyBlock).toContain('p.client_id = (select auth.uid())');
    expect(policyBlock).toContain('p.professional_id = (select auth.uid())');
    expect(policyBlock).toContain("admin_profile.role = 'admin'");
  });

  it('syncs orders.payment_status as compatibility, not as the payment state source', () => {
    const syncBlock = blockBetween('create or replace function private.sync_order_payment_status', 'drop trigger if exists trg_payments_sync_order_status');
    expect(syncBlock).toContain("status in ('confirmed', 'approved')");
    expect(syncBlock).toContain("status in ('initiated', 'pending', 'awaiting_client_action', 'reported')");
    expect(syncBlock).toContain("status in ('disputed', 'rejected')");
    expect(syncBlock).toContain("when coalesce(v_has_confirmed, false) then 'paid'");
    expect(syncBlock).toContain("when coalesce(v_has_reported, false) then 'pending'");
  });

  it('does not require manual payment before the work starts', () => {
    expect(component).toContain("order.status === 'completed'");
    expect(component).not.toContain("order.status === 'payment_pending' && profile.role === 'client'");
  });

  it('shows client and professional UX for the bilateral manual flow', () => {
    expect(component).toContain('entregué el efectivo');
    expect(component).toContain('transferencia cuenta dni realizada');
    expect(component).toContain('esperando confirmación del profesional');
    expect(component).toContain('pago recibido');
    expect(component).toContain('reportar un problema');
  });

  it('preserves legacy confirm_order_payment as a report-only compatibility alias', () => {
    const legacyBlock = blockBetween('drop function if exists public.confirm_order_payment', 'revoke all on function public.report_order_payment');
    expect(legacyBlock).toContain('private.report_order_payment_impl(p_order_id, null)');
    expect(legacyBlock).not.toContain('private.confirm_manual_payment_impl');
  });

  it('keeps public RPC execution restricted to authenticated users', () => {
    expect(migration).toContain('revoke all on function public.report_order_payment(uuid, text) from public, anon');
    expect(migration).toContain('revoke all on function public.confirm_manual_payment(uuid) from public, anon');
    expect(migration).toContain('revoke all on function public.dispute_manual_payment(uuid, text) from public, anon');
    expect(migration).toContain('grant execute on function public.report_order_payment(uuid, text) to authenticated');
    expect(migration).toContain('grant execute on function public.confirm_manual_payment(uuid) to authenticated');
    expect(migration).toContain('grant execute on function public.dispute_manual_payment(uuid, text) to authenticated');
  });

  it('hardens payment SECURITY DEFINER implementation search paths', () => {
    expect(migration).toContain("alter function private.report_order_payment_impl(uuid, text) set search_path = ''");
    expect(migration).toContain("alter function private.confirm_manual_payment_impl(uuid) set search_path = ''");
    expect(migration).toContain("alter function private.dispute_manual_payment_impl(uuid, text) set search_path = ''");
  });

  it('prepares optional receipts without treating them as automatic confirmation', () => {
    expect(migration).toContain('receipt_path text');
    expect(migration).toContain('a receipt is evidence, not automatic confirmation');
    expect(migration).toContain("'receipt_attached'");
    expect(migration).not.toContain('receipt_path is not null then');
  });

  it('documents NORM-004 as a scoped manual pilot without Mercado Pago implementation', () => {
    expect(migration).toContain("'manual_methods', jsonb_build_array('cash', 'wallet', 'transfer')");
    expect(migration).toContain("'payment_source', 'norm-003 client_total backend obligation'");
    expect(migration).not.toContain('mercadopago');
    expect(migration).not.toContain('oauth');
  });
});
