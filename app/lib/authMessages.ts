export function isEmailNotConfirmedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('email not confirmed');
}

export function friendlyAuthError(error: unknown, fallback = 'No se pudo completar la operación.') {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('jwt issued at future')) {
    return 'Tu sesión quedó trabada porque el dispositivo tiene la hora desfasada. Activá fecha y hora automática y volvé a entrar a MANITO.';
  }

  if (isEmailNotConfirmedError(error)) {
    return 'Primero confirmá tu correo. Podemos enviarte el enlace nuevamente.';
  }

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid credentials') ||
    normalized.includes('email not found') ||
    normalized.includes('user not found')
  ) {
    return 'El email o la contraseña no son correctos.';
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('security purposes') ||
    normalized.includes('too many requests')
  ) {
    return 'Por seguridad, esperá unos minutos antes de volver a intentar.';
  }

  if (normalized.includes('already registered') || normalized.includes('already exists')) {
    return 'Si ya tenés cuenta, ingresá con tu contraseña. Si todavía no confirmaste el correo, podés reenviar el enlace.';
  }

  if (normalized.includes('already confirmed')) {
    return 'Ese correo ya fue confirmado. Ingresá con tu contraseña.';
  }

  if (normalized.includes('signup') && normalized.includes('disabled')) {
    return 'El registro está deshabilitado en este momento.';
  }

  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'No pudimos conectar con MANITO. Revisá tu conexión e intentá de nuevo.';
  }

  return fallback;
}
