import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { orderEconomicPresentation, orderServiceTotal } from '../app/lib/economics';

const app = readFileSync(join(process.cwd(), 'app/components/ManitoV6App.tsx'), 'utf8');
const agreement = readFileSync(join(process.cwd(), 'app/components/AgreementSummary.tsx'), 'utf8');
const directAcceptance = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260909225833_prep_match_001_eligibility.sql'),
  'utf8',
).toLowerCase();
const quoteFlow = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260902144459_norm_008_budget_flow.sql'),
  'utf8',
).toLowerCase();

describe('AGREEMENT-001 clear economic representation', () => {
  it('never promotes an estimate to an agreement in presentation helpers', () => {
    expect(orderEconomicPresentation({
      estimated_price: 15000,
      agreed_price: null,
      price: 15000,
      contracted_at: null,
      contract_snapshot: null,
      service: { base_price: 12000 },
    } as never)).toEqual({ kind: 'estimate', amount: 15000 });

    expect(orderEconomicPresentation({
      estimated_price: 15000,
      agreed_price: 18000,
      price: 18000,
      contracted_at: '2026-09-18T12:00:00Z',
      contract_snapshot: { schema_version: 1 },
      service: { base_price: 12000 },
    } as never)).toEqual({ kind: 'agreement', amount: 18000 });
  });

  it('renders one role-neutral agreement card from frozen contract fields', () => {
    expect(app).toContain('<AgreementSummary order={order} extras={extras} acceptedProposal={acceptedProposal} />');
    expect(agreement).toContain('ACUERDO CONFIRMADO');
    expect(agreement).toContain('ESTIMACIÓN');
    expect(agreement).toContain('MODIFICACIONES APROBADAS');
    expect(agreement).toContain('order.agreed_scope');
    expect(agreement).toContain('orderEconomicPresentation(order)');
    expect(agreement).not.toContain('profile.role');
  });

  it('shows unknown economic components as unknown rather than free', () => {
    expect(agreement).toContain('Sin importe indicado');
    expect(agreement).toContain('Sin definir en el acuerdo');
    expect(app).toContain('Importe no informado');
    expect(app).toContain('Sin conceptos informados');
  });

  it('keeps approved extras separate from agreed_price', () => {
    expect(orderServiceTotal(
      { agreed_price: 10000, price: 10000 } as never,
      [
        { amount: 1000, status: 'pending' },
        { amount: 2000, status: 'rejected' },
        { amount: 3000, status: 'approved' },
      ] as never,
    )).toBe(13000);
    expect(agreement).toContain("extra.status === 'approved'");
    expect(app).toContain('El precio acordado original no cambia');
  });

  it('keeps proposal comparison consistent and blocks expired proposals in the UI and backend', () => {
    for (const label of ['Alcance', 'Mano de obra', 'Materiales', 'Visita', 'Otros conceptos', 'Disponibilidad', 'Duración', 'Válida hasta', 'Total propuesto']) {
      expect(app).toContain(label);
    }
    expect(app).toContain("proposal.status === 'sent' && !proposalIsExpiredByClock(proposal)");
    expect(quoteFlow).toContain("and op.status = 'sent'");
    expect(quoteFlow).toContain('and op.valid_until > now()');
  });

  it('documents the existing direct acceptance path without changing its consent rule', () => {
    expect(app).toContain('todavía no es un precio acordado');
    expect(directAcceptance).toContain('agreed_price = c.base_amount + c.scheduled_fee');
    expect(directAcceptance).toContain('contract_snapshot = private.contract_snapshot');
  });
});
