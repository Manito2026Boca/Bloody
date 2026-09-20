import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { V6Order, V6Workroom } from '../app/lib/v6Types';
import {
  compareProfessionalOrders,
  professionalEconomicState,
  professionalOrderBucket,
  professionalPrimaryActionLabel,
  proposalWorkroomState,
} from '../app/lib/professionalCockpit';

const app = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const styles = readFileSync('app/globals.css', 'utf8');

const baseOrder = {
  id: 'order', client_id: 'client', professional_id: 'pro', service_id: 1,
  description: 'Trabajo', address: 'Mar del Plata', mode: 'immediate', status: 'accepted',
  price: 100, estimated_price: 100, agreed_price: 120, contracted_at: '2026-09-19T10:00:00Z',
  scheduled_at: null, client_lat: null, client_lng: null, created_at: '2026-09-19T09:00:00Z',
  updated_at: '2026-09-19T10:00:00Z', accepted_at: '2026-09-19T10:00:00Z', completed_at: null,
  payment_status: 'unpaid',
} as V6Order;

function room(overrides: Partial<V6Workroom> = {}) {
  return {
    id: 'room', order_id: 'order', proposal_id: 'proposal', client_id: 'client', professional_id: 'pro',
    phase: 'precontractual', status: 'open', last_activity_at: '2026-09-19T10:00:00Z',
    order_status: 'waiting_quotes', mode: 'quote', address: 'Mar del Plata', scheduled_at: null,
    description: 'Trabajo', agreed_price: null, estimated_price: 100, contracted_at: null,
    service_name: 'Plomería', counterpart_name: 'Cliente', last_item: null, last_item_kind: null,
    last_item_at: null, unread_count: 0, ...overrides,
  } as V6Workroom;
}

describe('BLUEPRINT-B06 professional cockpit', () => {
  it('separates execution, upcoming commitments and history', () => {
    const now = new Date('2026-09-19T12:00:00Z').getTime();
    expect(professionalOrderBucket({ ...baseOrder, status: 'trabajando' }, now)).toBe('active');
    expect(professionalOrderBucket({ ...baseOrder, scheduled_at: '2026-09-20T12:00:00Z' }, now)).toBe('upcoming');
    expect(professionalOrderBucket({ ...baseOrder, status: 'completed' }, now)).toBe('history');
  });

  it('prioritizes work in execution over travel and accepted work', () => {
    const rows = [
      { ...baseOrder, id: 'accepted', status: 'accepted' as const },
      { ...baseOrder, id: 'travel', status: 'en_camino' as const },
      { ...baseOrder, id: 'working', status: 'trabajando' as const },
    ].sort(compareProfessionalOrders);
    expect(rows.map((row) => row.id)).toEqual(['working', 'travel', 'accepted']);
  });

  it('uses contextual action and real economic state copy', () => {
    expect(professionalPrimaryActionLabel({ ...baseOrder, status: 'en_sitio' })).toBe('Iniciar trabajo');
    expect(professionalEconomicState(baseOrder)).toBe('Precio acordado');
    expect(professionalEconomicState({ ...baseOrder, payment_status: 'paid' })).toBe('Pago confirmado');
  });

  it('distinguishes proposal lifecycle from contracted work', () => {
    expect(proposalWorkroomState(room())).toBe('Esperando al cliente');
    expect(proposalWorkroomState(room({ status: 'read_only' }))).toBe('Propuesta vencida');
    expect(proposalWorkroomState(room({ phase: 'contracted', order_status: 'accepted' }))).toBe('Propuesta aceptada');
    expect(proposalWorkroomState(room({ status: 'read_only', order_status: 'accepted' }))).toBe('Propuesta no elegida');
  });

  it('puts expiring responses, execution and next work ahead of secondary indicators', () => {
    expect(app.indexOf('NECESITA TU RESPUESTA')).toBeLessThan(app.indexOf('TRABAJO ACTUAL'));
    expect(app).toContain('ESPERANDO AL CLIENTE');
    expect(app).not.toContain('Neto estimado');
  });

  it('keeps opportunities, proposals and work as distinct surfaces', () => {
    expect(app).toContain('Presupuestos enviados');
    expect(app).toContain('proposalWorkroomState(room)');
    expect(app).toContain('No enviaste presupuestos todavía');
    expect(app).toContain('regularOpportunities.slice(0, 3)');
  });

  it('integrates Workroom unread state and preserves session cleanup', () => {
    expect(app).toContain('workroom?.unread_count');
    expect(app).toContain('subscribeV6WorkroomList(refresh)');
    expect(app).toContain('removeV6Channel(channel)');
    expect(app).toContain('removeAllChannels()');
  });

  it('shows operational onboarding states without conflating identity review', () => {
    for (const copy of ['Tu perfil está en revisión', 'Hay información para corregir', 'Completá tu perfil profesional']) {
      expect(app).toContain(copy);
    }
    expect(app).toContain('Identidad revisada');
    expect(app).toContain("onboardingStatus === 'approved' || professionalProfile?.verified === true");
  });

  it('keeps agenda and cockpit layouts usable on narrow screens', () => {
    expect(app).toContain('Todavía no configuraste tus horarios.');
    expect(app).toContain('professionalEconomicState(order)');
    expect(styles).toContain('.v6-proposal-workroom { grid-template-columns: minmax(0, 1fr); }');
    expect(styles).toContain('.v6-focus-card-head { display: grid; grid-template-columns: 42px minmax(0, 1fr); }');
  });
});
