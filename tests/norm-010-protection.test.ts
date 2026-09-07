import { describe, expect, it } from 'vitest';
import { canOpenProtection, isMonetaryResolution, isTerminalComplaint, protectionDeadline } from '../app/lib/v6Protection';
import type { V6Complaint, V6Order } from '../app/lib/v6Types';

const completed = Date.parse('2026-09-01T15:00:00Z');
const order = { id: 'order', client_id: 'client', professional_id: 'pro', status: 'completed', completed_at: new Date(completed).toISOString(), protection_window_days: 3 } as V6Order;
describe('NORM-010 protection eligibility and resolution presentation', () => {
  it('uses the frozen window and ignores legacy guarantee_days', () => {
    expect(protectionDeadline({ ...order, guarantee_days: 70 } as V6Order)).toBe(completed + 3 * 86400000);
    expect(protectionDeadline({ ...order, protection_window_days: null, guarantee_days: 7 } as V6Order)).toBeNull();
  });
  it.each(['open', 'accepted', 'trabajando', 'cancelled'] as const)('does not offer claims for %s', (status) => {
    expect(canOpenProtection({ ...order, status }, 'client', [], completed)).toBe(false);
  });
  it('only offers claims to the owner within the exact deadline', () => {
    expect(canOpenProtection(order, 'client', [], completed)).toBe(true);
    expect(canOpenProtection(order, 'pro', [], completed)).toBe(false);
    expect(canOpenProtection(order, 'stranger', [], completed)).toBe(false);
    expect(canOpenProtection(order, 'client', [], completed + 3 * 86400000)).toBe(false);
  });
  it.each(['open', 'under_review', 'awaiting_professional'] as const)('blocks another active %s case', (status) => {
    expect(canOpenProtection(order, 'client', [{ status } as V6Complaint], completed)).toBe(false);
  });
  it.each(['resolved', 'rejected'] as const)('allows a new case after %s while the window remains open', (status) => {
    expect(isTerminalComplaint(status)).toBe(true);
    expect(canOpenProtection(order, 'client', [{ status } as V6Complaint], completed)).toBe(true);
  });
  it.each(['credit', 'partial_refund', 'full_refund'] as const)('identifies %s as a money decision', (type) => {
    expect(isMonetaryResolution(type)).toBe(true);
  });
  it('does not treat operational resolutions as money decisions', () => {
    expect(isMonetaryResolution('revisit')).toBe(false);
    expect(isMonetaryResolution('correction')).toBe(false);
  });
  it('fails closed for missing completion date and invalid window', () => {
    expect(protectionDeadline({ ...order, completed_at: null })).toBeNull();
    expect(protectionDeadline({ ...order, protection_window_days: -1 })).toBeNull();
    expect(protectionDeadline({ ...order, protection_window_days: 0 })).toBe(completed);
  });
});
