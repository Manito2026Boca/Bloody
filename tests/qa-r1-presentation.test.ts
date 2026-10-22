import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { V6_STATUS_LABEL, type V6Order, type V6Role } from '../app/lib/v6Types';

// Exercise the actual private presentation helpers without mounting the app or Auth.
const source = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const ast = ts.createSourceFile('app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['orderHasCurrentEta', 'orderStatusText', 'orderNextStepText', 'manualRequestIsPending',
  'manualRequestIsExpiredByClock', 'manualRequestNeedsClientDecision', 'manualResponseStatusText'];
const declarations = ast.statements.filter((node): node is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(node) && Boolean(node.name && names.includes(node.name.text)));
if (declarations.length !== names.length) throw new Error('Presentation helper missing');
const compiled = ts.transpileModule(declarations.map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const helpers = new Function('V6_STATUS_LABEL', `${compiled}\nreturn {${names.join(',')}};`)(V6_STATUS_LABEL) as {
  orderStatusText: (order: V6Order, count?: number, role?: V6Role) => string;
  orderNextStepText: (order: V6Order, role: V6Role, context?: { payment?: string; rated?: boolean }) => string;
  manualResponseStatusText: (order: V6Order) => string;
  orderHasCurrentEta: (order: V6Order) => boolean;
};
const order = (changes: Partial<V6Order> = {}) => ({
  id: 'synthetic-order', status: 'open', mode: 'immediate', assignment_mode: 'manual',
  professional_id: null, manual_response_status: 'pending',
  manual_response_deadline_at: '2099-01-01T00:00:00Z', ...changes,
}) as V6Order;

describe('QA R1 truthful presentation', () => {
  it.each(['rejected', 'expired', 'awaiting_client_choice'] as const)('prioritizes direct request recovery: %s', status => {
    const fixture = order({ manual_response_status: status });
    expect(helpers.orderStatusText(fixture)).toBe('Elegí cómo seguir');
    expect(helpers.orderNextStepText(fixture, 'client')).toContain('Elegí otro profesional');
    expect(helpers.orderNextStepText(fixture, 'professional')).toContain('El Cliente debe decidir');
  });
  it('handles a pending request whose deadline passed without mutating its state', () => {
    const fixture = order({ manual_response_deadline_at: '2000-01-01T00:00:00Z' });
    expect(helpers.orderStatusText(fixture)).toBe('Elegí cómo seguir');
    expect(helpers.manualResponseStatusText(fixture)).toBe('Solicitud vencida');
    expect(fixture.manual_response_status).toBe('pending');
  });
  it('uses viewer-aware confirmation with a neutral default', () => {
    const fixture = order({ status: 'pending_client_confirmation' });
    expect(helpers.orderStatusText(fixture, 0, 'client')).toBe('Esperando tu confirmación');
    expect(helpers.orderStatusText(fixture, 0, 'professional')).toBe('Esperando confirmación del Cliente');
    expect(helpers.orderStatusText(fixture)).toBe('Esperando confirmación del precio');
  });
  it.each(['pending', 'price_confirmation_pending', 'accepted', 'rejected', 'expired', 'awaiting_client_choice'] as const)(
    'translates manual enum %s', status => {
      expect(helpers.manualResponseStatusText(order({ manual_response_status: status }))).not.toBe(status);
    });
  it('does not mistake unknown completion data for unpaid or unrated', () => {
    const fixture = order({ status: 'completed', professional_id: 'synthetic-pro' });
    expect(helpers.orderNextStepText(fixture, 'client')).not.toMatch(/pendiente|Podés calificar/);
    expect(helpers.orderNextStepText(fixture, 'client', { payment: 'confirmed' })).not.toContain('Podés calificar');
    expect(helpers.orderNextStepText(fixture, 'client', { payment: 'confirmed', rated: true })).toContain('historial');
    expect(helpers.orderNextStepText(fixture, 'client', { payment: 'confirmed', rated: false })).toContain('Podés calificar');
    expect(helpers.orderNextStepText(fixture, 'professional', { payment: 'confirmed' })).toContain('historial');
  });
  it('distinguishes reported, disputed and pending payments', () => {
    const fixture = order({ status: 'completed' });
    expect(helpers.orderNextStepText(fixture, 'client', { payment: 'reported' })).toContain('Esperá la confirmación');
    expect(helpers.orderNextStepText(fixture, 'professional', { payment: 'reported' })).toContain('Revisá el pago informado');
    expect(helpers.orderNextStepText(fixture, 'client', { payment: 'disputed' })).toContain('requiere revisión');
    expect(helpers.orderNextStepText(fixture, 'client', { payment: 'pending' })).toContain('pago pendiente');
  });
  it('shows an estimate only while an assigned professional is expected to arrive', () => {
    for (const status of ['accepted', 'en_camino'] as const) {
      expect(helpers.orderHasCurrentEta(order({ status, professional_id: 'synthetic-pro', eta_minutes: 15 }))).toBe(true);
    }
    for (const status of ['open', 'en_sitio', 'trabajando', 'completed', 'cancelled'] as const) {
      expect(helpers.orderHasCurrentEta(order({ status, professional_id: 'synthetic-pro', eta_minutes: 15 }))).toBe(false);
    }
    expect(helpers.orderHasCurrentEta(order({ status: 'accepted', eta_minutes: 15 }))).toBe(false);
    expect(helpers.orderHasCurrentEta(order({ status: 'accepted', professional_id: 'synthetic-pro', eta_minutes: -1 }))).toBe(false);
  });
});
