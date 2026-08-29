export type ProfessionalOnboardingRequirementInput = {
  servicesCount: number;
  specialtiesCount: number;
  completedDocumentsCount: number;
  requiredDocumentsCount: number;
  fullName: string;
  phone: string;
  city: string;
  headline: string;
  bio: string;
  yearsExperience: string;
  workZone: string;
  workRadius: string;
  workDaysCount: number;
  workStart: string;
  workEnd: string;
  hasPayoutDetails: boolean;
  portfolioCount: number;
};

export type ProfessionalOnboardingRequirement = {
  id: string;
  label: string;
  complete: boolean;
  blocking: boolean;
};

function hasText(value: string, minLength = 1) {
  return value.trim().length >= minLength;
}

function validPositiveNumber(value: string, min = 0, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max;
}

export function professionalOnboardingRequirements(
  input: ProfessionalOnboardingRequirementInput,
): ProfessionalOnboardingRequirement[] {
  return [
    {
      id: 'services',
      label: 'Elegí al menos un rubro',
      complete: input.servicesCount > 0,
      blocking: true,
    },
    {
      id: 'public_profile',
      label: 'Completá título, descripción y experiencia',
      complete:
        hasText(input.headline, 8) &&
        hasText(input.bio, 20) &&
        validPositiveNumber(input.yearsExperience, 0, 80),
      blocking: true,
    },
    {
      id: 'personal_data',
      label: 'Completá nombre, teléfono y ciudad',
      complete: hasText(input.fullName, 3) && hasText(input.phone, 6) && hasText(input.city, 2),
      blocking: true,
    },
    {
      id: 'documents',
      label: 'Subí todos los documentos obligatorios',
      complete:
        input.requiredDocumentsCount > 0 &&
        input.completedDocumentsCount >= input.requiredDocumentsCount,
      blocking: true,
    },
    {
      id: 'work_zone',
      label: 'Definí zona, radio, días y horario',
      complete:
        hasText(input.workZone, 2) &&
        validPositiveNumber(input.workRadius, 1, 150) &&
        input.workDaysCount > 0 &&
        hasText(input.workStart) &&
        hasText(input.workEnd) &&
        input.workStart < input.workEnd,
      blocking: true,
    },
    {
      id: 'payout',
      label: 'Cargá al menos un dato de cobro',
      complete: input.hasPayoutDetails,
      blocking: true,
    },
    {
      id: 'specialties',
      label: 'Sumá especialidades para mejores recomendaciones',
      complete: input.specialtiesCount > 0,
      blocking: false,
    },
    {
      id: 'portfolio',
      label: 'Agregá un trabajo al portfolio',
      complete: input.portfolioCount > 0,
      blocking: false,
    },
  ];
}

export function missingBlockingRequirements(requirements: ProfessionalOnboardingRequirement[]) {
  return requirements.filter((requirement) => requirement.blocking && !requirement.complete);
}
