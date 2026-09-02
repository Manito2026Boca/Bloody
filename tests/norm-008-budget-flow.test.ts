import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = [
  'supabase/migrations/20260902144459_norm_008_budget_flow.sql',
  'supabase/migrations/20260902145122_norm_008_accept_null_payment_fix.sql',
]
  .map((path) => readFileSync(join(process.cwd(), path), 'utf8'))
  .join('\n')
  .toLowerCase();

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

function lastBlockBetween(start: string, end: string) {
  const startIndex = migration.lastIndexOf(start);
  const endIndex = migration.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('NORM-008 budget proposal flow', () => {
  it('adds validity, structured availability and configurable quote policy', () => {
    expect(migration).toContain('add column if not exists valid_until timestamptz');
    expect(migration).toContain('add column if not exists available_from timestamptz');
    expect(migration).toContain("'quote_proposal_ttl_days', 7");
    expect(migration).toContain("'quote_max_active_proposals', 5");
    expect(migration).toContain("admin_settings.quote_proposals");
    expect(types).toContain('valid_until?: string | null');
    expect(types).toContain('available_from?: string | null');
  });

  it('expires sent proposals lazily from backend entry points', () => {
    expect(migration).toContain('function private.expire_order_proposals_impl');
    expect(migration).toContain("status = 'expired'");
    expect(migration).toContain("and op.status = 'sent'");
    expect(migration).toContain('op.valid_until <= now()');
    expect(migration).toContain('perform private.expire_order_proposals_impl(p_order_id)');
    expect(migration).toContain('perform private.expire_order_proposals_impl(v_order_id)');
  });

  it('enforces one editable sent proposal per professional and active proposal limit', () => {
    const sendBlock = blockBetween(
      'create function private.send_order_proposal_impl',
      'create function public.send_order_proposal',
    );
    expect(sendBlock).toContain('pg_advisory_xact_lock');
    expect(sendBlock).toContain("v_existing.status <> 'sent'");
    expect(sendBlock).toContain('private.quote_max_active_proposals()');
    expect(sendBlock).toContain("where public.order_proposals.status = 'sent'");
    expect(sendBlock).toContain('public.order_proposals.valid_until > now()');
    expect(sendBlock).toContain('on conflict (order_id, professional_id) do update');
  });

  it('validates real duration and keeps MANITO fee backend-owned', () => {
    const sendBlock = blockBetween(
      'create function private.send_order_proposal_impl',
      'create function public.send_order_proposal',
    );
    expect(sendBlock).toContain('p_estimated_minutes < 15');
    expect(sendBlock).toContain('p_estimated_minutes > 1440');
    expect(sendBlock).toContain("private.policy_bool(v_policy, 'proposal_fee_enabled', false)");
    expect(sendBlock).toContain("private.policy_number(v_policy, 'proposal_fee', 0)");
    expect(api).toContain('p_available_from');
    expect(component).toContain('setproposalduration');
    expect(component).toContain('setproposalavailablefrom');
    expect(component).toContain('setproposalavailability');
    expect(component).not.toContain("availabilitylabel: 'hoy'");
    expect(component).not.toContain('estimatedminutes: 90,');
  });

  it('accepts only active sent proposals owned by the client order and preserves NORM-003 snapshot', () => {
    const acceptBlock = lastBlockBetween(
      'create or replace function private.accept_proposal_impl',
      'revoke all on function private.accept_proposal_impl',
    );
    expect(acceptBlock).toContain("and op.status = 'sent'");
    expect(acceptBlock).toContain('and op.valid_until > now()');
    expect(acceptBlock).toContain('and o.client_id = v_uid');
    expect(acceptBlock).toContain("and o.status in ('open', 'waiting_quotes')");
    expect(acceptBlock).toContain('private.professional_can_receive_orders(v_proposal.professional_id)');
    expect(acceptBlock).toContain('accepted_proposal_id = v_proposal.id');
    expect(acceptBlock).toContain('contract_snapshot = private.contract_snapshot');
    expect(acceptBlock).toContain('pricing_policy_snapshot = v_policy');
    expect(acceptBlock).toContain('v_requires_online_payment := coalesce');
    expect(acceptBlock).toContain('online_payment_required = v_requires_online_payment');
  });

  it('closes only remaining sent proposals and leaves rejected or expired history intact', () => {
    const acceptBlock = blockBetween(
      'create or replace function private.accept_proposal_impl',
      'drop function if exists public.accept_proposal',
    );
    expect(acceptBlock).toContain("when id = p_proposal_id then 'accepted'");
    expect(acceptBlock).toContain("when status = 'sent' then 'rejected'");
    expect(acceptBlock).toContain('else status');
  });

  it('uses a proposal listing RPC so list refresh can expire and enrich proposals safely', () => {
    expect(migration).toContain('function public.list_order_proposals');
    expect(migration).toContain('perform private.expire_order_proposals_impl(p_order_id)');
    expect(migration).toContain("'rating_avg'");
    expect(migration).toContain("'jobs_completed'");
    expect(migration).toContain("'verified'");
    expect(api).toContain(".rpc('list_order_proposals'");
    expect(api).not.toContain(".from('order_proposals')");
  });

  it('notifies on new proposals and material sent proposal updates without updated_at spam', () => {
    const notifyBlock = blockBetween(
      'create or replace function private.notify_proposal_update',
      'drop trigger if exists trg_order_proposals_notify_material_update',
    );
    expect(notifyBlock).toContain("old.status = 'sent'");
    expect(notifyBlock).toContain("new.status = 'sent'");
    expect(notifyBlock).toContain('new.labor_price is distinct from old.labor_price');
    expect(notifyBlock).toContain('new.available_from is distinct from old.available_from');
    expect(notifyBlock).not.toContain('updated_at is distinct');
    expect(notifyBlock).toContain('presupuesto actualizado');
  });

  it('keeps quote opportunities hidden from new professionals when active capacity is full', () => {
    const opportunitiesBlock = blockBetween(
      'drop function if exists public.list_professional_opportunities',
      'revoke all on function private.current_quote_proposals_policy',
    );
    expect(opportunitiesBlock).toContain("o.mode <> 'quote'");
    expect(opportunitiesBlock).toContain('own_op.professional_id = v_uid');
    expect(opportunitiesBlock).toContain('active_op.status = \'sent\'');
    expect(opportunitiesBlock).toContain('active_op.valid_until > now()');
    expect(opportunitiesBlock).toContain('< private.quote_max_active_proposals()');
  });

  it('shows comparable client cards and professional sent/edit states in the UI', () => {
    expect(component).toContain('proposalstatuslabel');
    expect(component).toContain('proposalavailabilitytext');
    expect(component).toContain('válida hasta');
    expect(component).toContain('trabajos');
    expect(component).toContain('verificado');
    expect(component).toContain('enviar presupuesto');
    expect(component).not.toContain('última propuesta');
  });

  it('locks down proposal mutations and the trigger function execute grant', () => {
    expect(migration).toContain('grant execute on function public.send_order_proposal');
    expect(migration).toContain('grant execute on function public.accept_proposal');
    expect(migration).toContain('grant execute on function public.list_order_proposals');
    expect(migration).toContain('revoke all on function private.prevent_accepted_proposal_changes() from public, anon, authenticated');
    expect(migration).toContain('revoke all on function private.send_order_proposal_impl');
  });
});
