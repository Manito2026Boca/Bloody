export type ProfessionalTrustData = {
  trust_rating_avg?: number | null;
  trust_review_count?: number | null;
  trust_completed_jobs?: number | null;
  identity_reviewed?: boolean | null;
  professional_documents_reviewed?: boolean | null;
  years_experience?: number | null;
};

function count(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

export function professionalReputationLabel(data: ProfessionalTrustData | null | undefined) {
  const reviews = count(data?.trust_review_count);
  if (!reviews || data?.trust_rating_avg == null) return 'Nuevo en MANITO';
  const rating = Number(data.trust_rating_avg).toLocaleString('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${rating} · ${reviews} ${reviews === 1 ? 'reseña' : 'reseñas'}`;
}

export function completedJobsLabel(data: ProfessionalTrustData | null | undefined) {
  const jobs = count(data?.trust_completed_jobs);
  if (!jobs) return null;
  return `${jobs} ${jobs === 1 ? 'trabajo completado' : 'trabajos completados'} en MANITO`;
}

export function declaredExperienceLabel(data: ProfessionalTrustData | null | undefined) {
  const years = count(data?.years_experience);
  if (!years) return null;
  return `Experiencia declarada: ${years} ${years === 1 ? 'año' : 'años'}`;
}

export function professionalTrustBadges(data: ProfessionalTrustData | null | undefined) {
  return [
    data?.identity_reviewed
      ? {
          id: 'identity',
          label: 'Identidad revisada',
          explanation: 'MANITO revisó la documentación de identidad presentada.',
        }
      : null,
    data?.professional_documents_reviewed
      ? {
          id: 'professional_documents',
          label: 'Documentación profesional revisada',
          explanation: 'MANITO revisó documentación profesional presentada. No certifica idoneidad ni habilitación legal.',
        }
      : null,
  ].filter((badge): badge is { id: string; label: string; explanation: string } => Boolean(badge));
}
