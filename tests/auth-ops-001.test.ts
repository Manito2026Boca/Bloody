import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildAuthCallbackUrl,
  confirmationLinkErrorMessage,
  readAuthEmailFlow,
} from '../app/lib/authCallback';

const app = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const confirmation = readFileSync('app/components/AuthConfirmationScreen.tsx', 'utf8');
const worker = readFileSync('public/sw.js', 'utf8');

describe('AUTH-OPS-001 public email auth', () => {
  it('uses explicit signup and recovery callback flows', () => {
    expect(buildAuthCallbackUrl('https://bloody-eta.vercel.app/', 'signup')).toBe(
      'https://bloody-eta.vercel.app/auth/callback?flow=signup',
    );
    expect(buildAuthCallbackUrl('https://bloody-eta.vercel.app', 'recovery')).toBe(
      'https://bloody-eta.vercel.app/auth/callback?flow=recovery',
    );
    expect(readAuthEmailFlow(new URLSearchParams('flow=recovery&code=x'), new URLSearchParams())).toBe('recovery');
    expect(readAuthEmailFlow(new URLSearchParams('code=x'), new URLSearchParams('type=signup'))).toBe('signup');
    expect(app).toContain("getAuthCallbackUrl('signup')");
    expect(app).toContain("getAuthCallbackUrl('recovery')");
    expect(confirmation).toContain("emailFlow === 'recovery'");
  });

  it('gives safe guidance for expired and already-used links', () => {
    expect(confirmationLinkErrorMessage(new Error('otp_expired'))).toContain('enlace venció');
    expect(confirmationLinkErrorMessage(new Error('invalid token'))).toContain('ya fue utilizado');
  });

  it('keeps confirmation pending instead of treating the account as missing', () => {
    expect(app).toContain('setAwaitingConfirmation(true)');
    expect(app).toContain('Tu correo todavía no fue confirmado.');
    expect(app).toContain('Reenviar correo');
    expect(app).toContain('Cambiar correo o volver');
    expect(app).toContain('setResendCooldown(60)');
  });

  it('does not cache auth callbacks in the PWA shell', () => {
    expect(worker).toContain("requestUrl.pathname.startsWith('/auth/')");
  });

  it('ships branded templates without embedding credentials', () => {
    for (const path of ['supabase/templates/confirmation.html', 'supabase/templates/recovery.html']) {
      const template = readFileSync(path, 'utf8');
      expect(template).toContain('{{ .ConfirmationURL }}');
      expect(template).toContain('MANITO');
      expect(template).not.toMatch(/service_role|sb_secret_|smtp_pass|password\s*=/i);
    }
  });
});
