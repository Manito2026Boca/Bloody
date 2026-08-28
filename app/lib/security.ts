export const MIN_PASSWORD_LENGTH = 10;

export function passwordSecurityMessage(password: string, email = '') {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.toLowerCase();
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Usá al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Combiná letras y números.';
  }
  if (/\s/.test(password)) {
    return 'Evitá espacios en la contraseña.';
  }
  const emailName = normalizedEmail.split('@')[0];
  if (emailName && emailName.length >= 4 && normalizedPassword.includes(emailName)) {
    return 'No uses tu email como parte de la contraseña.';
  }
  return null;
}

export function passwordHelpText() {
  return `${MIN_PASSWORD_LENGTH}+ caracteres, con letras y números.`;
}
