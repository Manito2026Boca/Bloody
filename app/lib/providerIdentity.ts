export type FiscalStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NEEDS_REVIEW';
export type OwnProviderIdentity = {
  status: FiscalStatus | 'ACCEPTED' | 'QA';
  masked_cuit: string | null;
  can_submit?: boolean;
  operational_status?: 'ENABLED' | 'RESTRICTED' | 'SUSPENDED' | 'QA';
};
export type ArcaResult = 'FOUND' | 'NOT_FOUND' | 'MISMATCH' | 'UNAVAILABLE';
export type ActivityRequirement = {
  service_id: number; specialty_id: number | null;
  level: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3' | null; credential_kinds: string[];
};
export type IdentityClaimReview = {
  id: string; type: string; status: string; masked_cuit: string;
  fiscal_status: FiscalStatus; operational_status: string; source: string | null;
  verified_at: string | null; verified_by: string | null; canonical_profile_id: string | null;
  conflicting_claims: number; reason: string | null; reviewed_at: string | null; reviewed_by: string | null;
  events: { type: string; reason: string; actor: string | null; at: string }[];
};
export type AdminProviderIdentity = { claims: IdentityClaimReview[]; activities: ActivityRequirement[] };

export function normalizeCuit(value: string): string | null {
  return /^[0-9 .-]+$/.test(value) ? value.replace(/[^0-9]/g, '') : null;
}
export function isValidCuit(value: string): boolean {
  const normalized = normalizeCuit(value);
  if (!normalized || !/^\d{11}$/.test(normalized) || normalized === '00000000000') return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(normalized[index]) * weight, 0);
  const digit = 11 - sum % 11;
  return Number(normalized[10]) === (digit === 11 ? 0 : digit === 10 ? 9 : digit);
}
export function providerIdentityCopy(identity: OwnProviderIdentity | null): string {
  if (!identity) return 'No pudimos comprobar tu identidad. Volve a intentar.';
  if (identity.status === 'QA') return 'Cuenta ficticia QA habilitada para pruebas.';
  if (identity.operational_status === 'SUSPENDED') return 'Tu operacion profesional esta suspendida. Consulta a MANITO.';
  if (identity.status === 'VERIFIED') return identity.operational_status === 'ENABLED'
    ? 'Identidad vinculada y CUIT revisado. Cada actividad tiene sus propios requisitos.'
    : 'Identidad vinculada y CUIT revisado. Falta la habilitacion operativa MANITO.';
  if (identity.status === 'PENDING' || identity.status === 'NEEDS_REVIEW') return 'Recibimos tus datos. La revision sigue pendiente; podes completar tu perfil.';
  if (identity.status === 'REJECTED') return 'La solicitud no fue aprobada. Revisa tus datos o solicita ayuda a MANITO.';
  return 'Para recibir nuevos trabajos, necesitamos revisar tu CUIT y documentacion.';
}
