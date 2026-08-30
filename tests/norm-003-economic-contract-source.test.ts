import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  approvedExtrasTotal,
  orderCommissionAmount,
  orderContractAmount,
  orderDisplayAmount,
  orderEstimatedAmount,
  orderServiceTotal,
} from '../app/lib/economics';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260829182000_norm_003_economic_contract_source.sql'),
  'utf8',
).toLowerCase();

const component = readFileSync(
  join(process.cwd(), 'app/components/ManitoV6App.tsx'),
  'utf8',
).toLowerCase();

function blockBetween(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('NORM-003 economic contract source', () => {
  it('adds separate estimate, contract, proposal and snapshot columns', () => {
    for (const column of [
      'estimated_price',
      'agreed_price',
      'agreed_scope',
      'contracted_at',
      'accepted_proposal_id',
      'contract_snapshot',
      'pricing_policy_snapshot',
    ]) {
      expect(migration).toContain(column);
    }
  });

  it('keeps orders.price only as a documented legacy compatibility amount', () => {
    expect(migration).toContain('legacy compatibility amount');
    expect(migration).toContain('new economic logic must prefer estimated_price');
  });

  it('lets estimates exist before contracting without making them the contract', () => {
    const order = { estimated_price: 12000, price: 99999, service: { base_price: 8000 } };
    expect(orderEstimatedAmount(order as never)).toBe(12000);
    expect(migration).toContain("where status in ('open', 'scheduled_open', 'waiting_quotes')");
    expect(migration).toContain('agreed_price = null');
  });

  it('freezes direct accepts with agreed price, scope, contracted_at and policy snapshot', () => {
    const acceptBlock = blockBetween('create or replace function private.accept_order_impl', 'create or replace function private.send_order_proposal_impl');
    expect(acceptBlock).toContain('agreed_scope = left(c.description, 2000)');
    expect(acceptBlock).toContain('agreed_price = c.base_amount + c.scheduled_fee');
    expect(acceptBlock).toContain('contracted_at = now()');
    expect(acceptBlock).toContain('pricing_policy_snapshot = v_policy');
    expect(acceptBlock).toContain('contract_snapshot = private.contract_snapshot');
  });

  it('does not let the frontend scheduled surcharge define the contract', () => {
    expect(component).not.toContain("mode === 'scheduled' ? 2000");
    expect(migration).toContain("admin_settings.commercial.scheduled_fee");
  });

  it('keeps direct contract amounts independent from later professional rate changes', () => {
    const acceptBlock = blockBetween('create or replace function private.accept_order_impl', 'create or replace function private.send_order_proposal_impl');
    expect(acceptBlock).toContain('pricing_policy_snapshot = v_policy');
    expect(acceptBlock).toContain('contract_snapshot = private.contract_snapshot');
    expect(acceptBlock).not.toContain('update public.professional_services');
  });

  it('accepts quote proposals into a contract snapshot and accepted_proposal_id', () => {
    const proposalBlock = blockBetween('create or replace function private.accept_proposal_impl', 'create or replace function private.confirm_order_payment_impl');
    expect(proposalBlock).toContain('accepted_proposal_id = v_proposal.id');
    expect(proposalBlock).toContain('agreed_price = v_agreed_price');
    expect(proposalBlock).toContain('contract_snapshot = private.contract_snapshot');
    expect(proposalBlock).toContain("'type', 'labor'");
    expect(proposalBlock).toContain("'type', 'materials'");
    expect(proposalBlock).toContain("'type', 'visit'");
    expect(proposalBlock).toContain("'type', 'manito_fee'");
  });

  it('protects accepted proposals from retrospective edits', () => {
    const immutableBlock = blockBetween('create or replace function private.prevent_accepted_proposal_changes', 'drop trigger if exists trg_order_proposals_accepted_immutable');
    expect(immutableBlock).toContain("old.status = 'accepted'");
    expect(immutableBlock).toContain('new.labor_price is distinct from old.labor_price');
    expect(immutableBlock).toContain('new.materials_price is distinct from old.materials_price');
    expect(immutableBlock).toContain('new.visit_price is distinct from old.visit_price');
    expect(immutableBlock).toContain('new.manito_fee is distinct from old.manito_fee');
  });

  it('calculates service total from agreed price plus approved extras only', () => {
    const order = { agreed_price: 10000, price: 99999 };
    const extras = [
      { amount: 3000, status: 'pending' },
      { amount: 4000, status: 'rejected' },
      { amount: 5000, status: 'approved' },
    ];

    expect(approvedExtrasTotal(extras as never)).toBe(5000);
    expect(orderServiceTotal(order as never, extras as never)).toBe(15000);
    expect(orderContractAmount(order as never)).toBe(10000);
  });

  it('keeps approved extras immutable and does not mutate agreed_price', () => {
    const immutableBlock = blockBetween('create or replace function private.prevent_approved_extra_changes', 'drop trigger if exists trg_order_extras_approved_immutable');
    expect(immutableBlock).toContain("old.status = 'approved'");
    expect(immutableBlock).toContain('new.amount is distinct from old.amount');
    expect(immutableBlock).not.toContain('agreed_price');
  });

  it('centralizes commission on pricing policy snapshots instead of frontend hardcodes', () => {
    const order = {
      agreed_price: 10000,
      price: null,
      pricing_policy_snapshot: { commission_percent: 15 },
    };

    expect(orderCommissionAmount(order as never)).toBe(1500);
    expect(component).not.toContain('0.12');
    expect(component).not.toContain('12%');
  });

  it('stores the commercial policy in each contract snapshot', () => {
    expect(migration).toContain('private.current_commercial_policy()');
    expect(migration).toContain('pricing_policy_snapshot = v_policy');
    expect(migration).toContain("'pricing_policy', p_pricing_policy");
  });

  it('uses backend obligation totals for transition payments', () => {
    const paymentBlock = blockBetween('create or replace function private.confirm_order_payment_impl', 'create or replace function private.prevent_accepted_proposal_changes');
    expect(paymentBlock).toContain('v_service_total := private.order_service_total_amount(v_order.id)');
    expect(paymentBlock).toContain('v_amount := private.order_client_total_amount(v_order.id)');
    expect(paymentBlock).not.toContain('v_amount := coalesce(v_order.price');
  });

  it('keeps legacy orders visible through display fallbacks without making price primary', () => {
    expect(orderDisplayAmount({
      agreed_price: null,
      estimated_price: null,
      price: 22000,
      service: { base_price: 18000 },
    } as never)).toBe(22000);
    expect(orderDisplayAmount({
      agreed_price: null,
      estimated_price: 12000,
      price: 22000,
      service: { base_price: 18000 },
    } as never)).toBe(12000);
  });

  it('backfills conservatively and marks legacy snapshots best effort', () => {
    expect(migration).toContain("'legacy_backfill'");
    expect(migration).toContain("'historical_accuracy', 'best_effort'");
    expect(migration).toContain('accepted_proposal_backfill');
    expect(migration).toContain('legacy_direct_order_backfill');
  });
});
