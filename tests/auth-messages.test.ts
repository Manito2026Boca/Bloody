import { describe, expect, it } from 'vitest';
import { friendlyAuthError, isEmailNotConfirmedError } from '../app/lib/authMessages';

describe('auth messages', () => {
  it('normalizes unconfirmed email errors', () => {
    const error = new Error('Email not confirmed');

    expect(isEmailNotConfirmedError(error)).toBe(true);
    expect(friendlyAuthError(error)).toBe(
      'Primero confirmá tu correo. Podemos enviarte el enlace nuevamente.',
    );
  });

  it('does not reveal whether an account exists on invalid credentials', () => {
    expect(friendlyAuthError(new Error('Invalid login credentials'))).toBe(
      'El email o la contraseña no son correctos.',
    );
  });

  it('maps resend rate limits to a user-safe message', () => {
    expect(friendlyAuthError(new Error('Email rate limit exceeded'))).toBe(
      'Por seguridad, esperá unos minutos antes de volver a intentar.',
    );
  });
});
