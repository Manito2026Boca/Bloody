export type AuthEmailFlow = 'signup' | 'recovery';

export function buildAuthCallbackUrl(appUrl: string, flow: AuthEmailFlow) {
  const callback = new URL('/auth/callback', appUrl.endsWith('/') ? appUrl : `${appUrl}/`);
  callback.searchParams.set('flow', flow);
  return callback.toString();
}

export function readAuthEmailFlow(
  query: URLSearchParams,
  hash: URLSearchParams,
): AuthEmailFlow {
  const value = query.get('flow') || query.get('type') || hash.get('type');
  return value === 'recovery' ? 'recovery' : 'signup';
}

export function confirmationLinkErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('jwt issued at future')) {
    return 'Tu email fue validado, pero el celular parece tener la hora desfasada. Activá fecha y hora automática y tocá Entrar a MANITO.';
  }
  if (normalized.includes('expired') || normalized.includes('otp_expired')) {
    return 'Este enlace venció. Volvé a MANITO para pedir uno nuevo.';
  }
  if (
    normalized.includes('already used') ||
    normalized.includes('invalid token') ||
    normalized.includes('token has been revoked') ||
    normalized.includes('otp_disabled')
  ) {
    return 'Este enlace ya fue utilizado o dejó de ser válido. Volvé a MANITO para pedir uno nuevo.';
  }
  return 'No pudimos confirmar el enlace. Volvé a MANITO e intentá pedir uno nuevo.';
}
