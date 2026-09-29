import { describe, expect, it } from 'vitest';
import { isValidCuit, normalizeCuit, providerIdentityCopy } from './providerIdentity';
import { ManualArcaVerifier } from './providerIdentityVerifier';

describe('private provider identity', () => {
  it('normalizes common separators without accepting arbitrary letters', () => {
    expect(normalizeCuit('99-00000000-7')).toBe('99000000007');
    expect(normalizeCuit('99.00000000.7')).toBe('99000000007');
    expect(normalizeCuit('x99000000007')).toBeNull();
  });
  it('checks all ten weights and the final digit', () => {
    expect(isValidCuit('99-00000000-7')).toBe(true);
    for (let digit = 0; digit < 10; digit++) expect(isValidCuit(`9900000000${digit}`)).toBe(digit === 7);
    expect(isValidCuit('00000000000')).toBe(false);
    expect(isValidCuit('9900000000')).toBe(false);
    expect(isValidCuit('')).toBe(false);
  });
  it('never presents fiscal verification as operative permission', () => {
    expect(providerIdentityCopy({ status: 'VERIFIED', masked_cuit: null, operational_status: 'RESTRICTED' })).toContain('Falta');
    expect(providerIdentityCopy({ status: 'VERIFIED', masked_cuit: null, operational_status: 'SUSPENDED' })).toContain('suspendida');
    expect(providerIdentityCopy({ status: 'PENDING', masked_cuit: null })).toContain('revision');
  });
  it('manual verifier returns normalized facts, no ownership or operation decision', async () => {
    expect(await new ManualArcaVerifier({ result: 'UNAVAILABLE', checkedAt: '2026-09-29T00:00:00Z' }).verify({ normalizedCuit: '99000000007' })).toEqual({ result: 'UNAVAILABLE', source: 'MANUAL_ARCA', checkedAt: '2026-09-29T00:00:00Z' });
  });
});
