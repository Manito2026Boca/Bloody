function normalizedErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isRecoverableMissingProfileError(error: unknown) {
  const message = normalizedErrorMessage(error);
  return (
    message.includes('no existe tu perfil manito') ||
    message.includes('no existe tu perfil') ||
    message.includes('no se encontro tu perfil') ||
    message.includes('profile not found') ||
    message.includes('no rows returned')
  );
}
