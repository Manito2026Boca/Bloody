import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260903025147_norm_009_cancellation_flow.sql'),
  'utf8',
).toLowerCase();
const api = readFileSync(join(process.cwd(), 'app/lib/v6Api.ts'), 'utf8').toLowerCase();
const component = readFileSync(join(process.cwd(), 'app/components/ManitoV6App.tsx'), 'utf8').toLowerCase();
const types = readFileSync(join(process.cwd(), 'app/lib/v6Types.ts'), 'utf8').toLowerCase();

function blockBetween(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('NORM-009 cancellation flow', () => {
  it('adds traceable cancellation fields to orders without creating a separate table', () => {
    for (const column of [
      'cancelled_by uuid',
      'cancelled_at timestamptz',
      'cancellation_actor text',
      'cancellation_reason text',
      'cancellation_note text',
      'cancellation_phase text',
      'cancellation_responsibility text',
      'cancellation_fee numeric',
    ]) {
      expect(migration).toContain(column);
    }
    expect(migration).not.toContain('create table public.order_cancellations');
    expect(types).toContain('v6cancellationreason');
    expect(types).toContain('cancellation_responsibility?: v6cancellationresponsibility');
    expect(api).toContain("'cancellation_phase'");
  });

  it('keeps cancellation actor, reason, phase and responsibility constrained', () => {
    expect(migration).toContain("cancellation_actor in ('client', 'professional')");
    expect(migration).toContain("'service_no_longer_needed'");
    expect(migration).toContain("'professional_unavailable_or_delayed'");
    expect(migration).toContain("'service_not_compatible'");
    expect(migration).toContain("cancellation_phase is null or cancellation_phase in");
    expect(migration).toContain("'matching_failed'");
    expect(migration).toContain("cancellation_responsibility is null or cancellation_responsibility in");
    expect(migration).toContain("'undetermined'");
    expect(migration).toContain('orders_cancellation_fee_check');
  });

  it('moves cancel_order to reasoned RPC input while keeping fee and responsibility backend-owned', () => {
    const cancelBlock = blockBetween(
      'create function private.cancel_order_impl',
      'create function public.cancel_order',
    );
    expect(cancelBlock).toContain('v_uid uuid := auth.uid()');
    expect(cancelBlock).toContain("v_order.client_id = v_uid");
    expect(cancelBlock).toContain("v_order.professional_id = v_uid");
    expect(cancelBlock).toContain('private.cancellation_responsibility(v_actor, v_reason)');
    expect(cancelBlock).toContain('cancellation_fee = 0');
    expect(api).toContain("p_reason: reason");
    expect(api).toContain("p_note: note || null");
    expect(api).not.toContain('cancellation_fee:');
    expect(api).not.toContain('cancellation_responsibility:');
  });

  it('allows the required client and professional cancellation states only', () => {
    const cancelBlock = blockBetween(
      'create function private.cancel_order_impl',
      'create function public.cancel_order',
    );
    expect(cancelBlock).toContain("'open'");
    expect(cancelBlock).toContain("'scheduled_open'");
    expect(cancelBlock).toContain("'waiting_quotes'");
    expect(cancelBlock).toContain("'matching_failed'");
    expect(cancelBlock).toContain("'payment_pending'");
    expect(cancelBlock).toContain("'accepted'");
    expect(cancelBlock).toContain("'en_camino'");
    expect(cancelBlock).toContain("'en_sitio'");
    expect(cancelBlock).toContain("if v_order.status = 'trabajando'");
    expect(cancelBlock).toContain('el trabajo ya comenzó. usá soporte para resolver esta situación.');
    expect(cancelBlock).toContain("if v_order.status in ('completed', 'cancelled')");
    expect(cancelBlock).toContain("if v_order.status not in ('accepted', 'en_camino', 'en_sitio')");
  });

  it('closes pending matching, manual and quote subflows without deleting history', () => {
    const cancelBlock = blockBetween(
      'create function private.cancel_order_impl',
      'create function public.cancel_order',
    );
    expect(cancelBlock).toContain('update public.order_match_candidates');
    expect(cancelBlock).toContain("status = 'closed'");
    expect(cancelBlock).toContain("response_reason = coalesce(response_reason, 'order_cancelled')");
    expect(cancelBlock).toContain('update public.order_proposals');
    expect(cancelBlock).toContain("status = 'rejected'");
    expect(cancelBlock).toContain("where order_id = v_order.id");
    expect(cancelBlock).toContain("manual_response_status = case");
    expect(cancelBlock).toContain("then 'expired'");
    expect(cancelBlock).not.toContain('delete from public.order_match_candidates');
    expect(cancelBlock).not.toContain('delete from public.order_proposals');
  });

  it('blocks cancellation when real payment activity exists and only cancels technical pending payments', () => {
    const cancelBlock = blockBetween(
      'create function private.cancel_order_impl',
      'create function public.cancel_order',
    );
    expect(cancelBlock).toContain("p.status in ('reported', 'confirmed', 'approved', 'disputed')");
    expect(cancelBlock).toContain('usá soporte para resolver esta situación.');
    expect(cancelBlock).toContain("status = 'cancelled'");
    expect(cancelBlock).toContain("status in ('initiated', 'pending', 'awaiting_client_action')");
    expect(cancelBlock).toContain('private.record_payment_event');
    expect(cancelBlock).toContain('order_cancelled_before_payment_activity');
  });

  it('preserves contract fields and records the previous phase at cancellation time', () => {
    const cancelBlock = blockBetween(
      'create function private.cancel_order_impl',
      'create function public.cancel_order',
    );
    expect(cancelBlock).toContain('cancellation_phase = v_order.status');
    expect(cancelBlock).toContain('cancelled_by = v_uid');
    expect(cancelBlock).toContain('cancelled_at = now()');
    expect(cancelBlock).not.toContain('agreed_price = null');
    expect(cancelBlock).not.toContain('agreed_scope = null');
    expect(cancelBlock).not.toContain('contract_snapshot = null');
    expect(cancelBlock).not.toContain('accepted_proposal_id = null');
    expect(cancelBlock).not.toContain('pricing_policy_snapshot = null');
  });

  it('prevents deciding extras after cancellation or other non-operational states', () => {
    const extraBlock = blockBetween(
      'create or replace function private.decide_order_extra_impl',
      'create or replace function private.notify_order_status_change',
    );
    expect(extraBlock).toContain("o.status in ('en_sitio', 'trabajando')");
    expect(extraBlock).toContain("oe.status = 'pending'");
    expect(extraBlock).toContain('el adicional ya fue decidido o el pedido ya no admite esta acción');
  });

  it('keeps cancellation notifications on existing order_status kind with readable reason text', () => {
    const notifyBlock = blockBetween(
      'create or replace function private.notify_order_status_change',
      'revoke all on function private.cancellation_reason_label',
    );
    expect(notifyBlock).toContain("when 'cancelled' then 'pedido cancelado'");
    expect(notifyBlock).toContain('private.cancellation_reason_label(new.cancellation_reason)');
    expect(notifyBlock).toContain('el pedido fue cancelado. motivo:');
    expect(notifyBlock).toContain("'order_status'");
    expect(migration).toContain('notif-debt-001');
  });

  it('exposes a simple client/professional cancellation UI without showing fee controls', () => {
    expect(component).toContain('clientcancellationreasons');
    expect(component).toContain('professionalcancellationreasons');
    expect(component).toContain('showcancellationform');
    expect(component).toContain('cancelar servicio');
    expect(component).toContain('confirmar cancelación');
    expect(component).toContain("'matching_failed'");
    expect(component).toContain("'payment_pending'");
    expect(component).toContain("'accepted', 'en_camino', 'en_sitio'");
    expect(component).toContain('cancellationreasonlabel');
    expect(component).toContain('cancellationresponsibilitylabel');
    expect(component).not.toContain('setcancellationfee');
  });

  it('locks function grants and fixes cancel_order_impl search_path', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain('revoke all on function private.cancel_order_impl(uuid, text, text) from public, anon, authenticated');
    expect(migration).toContain('revoke all on function public.cancel_order(uuid, text, text) from public, anon, authenticated');
    expect(migration).toContain('grant execute on function public.cancel_order(uuid, text, text) to authenticated');
  });
});
