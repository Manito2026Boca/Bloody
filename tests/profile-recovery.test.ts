import { describe, expect, it } from 'vitest';
import { isRecoverableMissingProfileError } from '../app/lib/profileRecovery';

describe('profile recovery', () => {
  it('recovers the explicit MANITO missing profile error', () => {
    expect(isRecoverableMissingProfileError(new Error('No existe tu perfil MANITO'))).toBe(true);
  });

  it('recovers the user-facing missing profile fallback', () => {
    expect(isRecoverableMissingProfileError(new Error('No se encontró tu perfil.'))).toBe(true);
  });

  it('does not recover unrelated session errors', () => {
    expect(isRecoverableMissingProfileError(new Error('JWT issued at future'))).toBe(false);
  });
});
