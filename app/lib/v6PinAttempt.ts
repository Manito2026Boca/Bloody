/** Business failures are HTTP-success responses so PostgreSQL commits the attempt. */
export function requireSuccessfulPinAttempt(value: unknown): void {
  const result = value as { ok?: boolean; code?: string; retry_after_seconds?: number } | null;
  if (result?.ok === true) return;
  if (result?.code === 'invalid_pin') throw new Error('PIN incorrecto. Revisalo con el cliente y probá nuevamente.');
  if (result?.code === 'cooldown') {
    const seconds = Number(result.retry_after_seconds);
    const wait = Number.isFinite(seconds) && seconds > 0
      ? seconds <= 3600 ? `${Math.ceil(seconds / 60)} minutos` : `${Math.ceil(seconds / 3600)} horas`
      : 'unos minutos';
    throw new Error(`Demasiados intentos. Probá nuevamente en ${wait}.`);
  }
  if (result?.code === 'evidence_required') throw new Error('Agregá al menos una foto del trabajo terminado antes de finalizar.');
  if (result?.code === 'unavailable') throw new Error('El pedido no está disponible para esta acción. Actualizá e intentá nuevamente.');
  throw new Error('No pudimos confirmar la acción. Probá nuevamente.');
}
