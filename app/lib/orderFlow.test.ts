import { describe, expect, it } from 'vitest';
import {
  canProfessionalAdvanceOrder,
  nextProfessionalOrderAction,
  visibleClientPin,
} from './orderFlow';
import type { V6Order } from './v6Types';

function order(status: V6Order['status'], professionalId = 'pro-1') {
  return {
    status,
    professional_id: professionalId,
    start_pin: '1234',
    end_pin: '9876',
  } as V6Order;
}

describe('orderFlow', () => {
  it('uses semantic professional actions for the tracked service lifecycle', () => {
    expect(nextProfessionalOrderAction('accepted').kind).toBe('mark_en_route');
    expect(nextProfessionalOrderAction('en_camino').kind).toBe('mark_arrived');
    expect(nextProfessionalOrderAction('en_sitio').kind).toBe('start_with_pin');
    expect(nextProfessionalOrderAction('trabajando').kind).toBe('complete_with_pin');
  });

  it('does not let a professional advance completed, cancelled, or payment-pending orders', () => {
    expect(canProfessionalAdvanceOrder(order('payment_pending'), 'pro-1')).toBe(false);
    expect(canProfessionalAdvanceOrder(order('cancelled'), 'pro-1')).toBe(false);
    expect(canProfessionalAdvanceOrder(order('completed'), 'pro-1')).toBe(false);
    expect(canProfessionalAdvanceOrder(order('en_sitio'), 'pro-1')).toBe(true);
    expect(canProfessionalAdvanceOrder(order('en_sitio'), 'pro-2')).toBe(false);
  });

  it('only reveals the correct PIN to the client at the correct stage', () => {
    expect(visibleClientPin(order('accepted'), 'client')).toEqual({
      label: 'PIN inicio',
      value: '1234',
    });
    expect(visibleClientPin(order('trabajando'), 'client')).toEqual({
      label: 'PIN final',
      value: '9876',
    });
    expect(visibleClientPin(order('trabajando'), 'professional')).toBeNull();
    expect(visibleClientPin(order('completed'), 'client')).toBeNull();
  });
});
