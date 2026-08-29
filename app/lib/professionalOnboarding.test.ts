import { describe, expect, it } from 'vitest';
import {
  missingBlockingRequirements,
  professionalOnboardingRequirements,
} from './professionalOnboarding';

const completeInput = {
  servicesCount: 2,
  specialtiesCount: 3,
  completedDocumentsCount: 6,
  requiredDocumentsCount: 6,
  fullName: 'Garrafa Sanchez',
  phone: '2235551212',
  city: 'Mar del Plata',
  headline: 'Gasista matriculado para urgencias',
  bio: 'Trabajo con revisión clara, presupuesto antes de empezar y garantía MANITO.',
  yearsExperience: '12',
  workZone: 'Mar del Plata',
  workRadius: '12',
  workDaysCount: 5,
  workStart: '08:00',
  workEnd: '18:00',
  hasPayoutDetails: true,
  portfolioCount: 1,
};

describe('professionalOnboardingRequirements', () => {
  it('marks a complete professional onboarding as submittable', () => {
    const requirements = professionalOnboardingRequirements(completeInput);

    expect(missingBlockingRequirements(requirements)).toHaveLength(0);
    expect(requirements.every((requirement) => requirement.complete)).toBe(true);
  });

  it('keeps optional specialties and portfolio from blocking submission', () => {
    const requirements = professionalOnboardingRequirements({
      ...completeInput,
      specialtiesCount: 0,
      portfolioCount: 0,
    });

    expect(missingBlockingRequirements(requirements)).toHaveLength(0);
    expect(requirements.find((requirement) => requirement.id === 'specialties')?.blocking).toBe(false);
    expect(requirements.find((requirement) => requirement.id === 'portfolio')?.blocking).toBe(false);
  });

  it('blocks submission when core identity, documents, zone, or payout data is missing', () => {
    const requirements = professionalOnboardingRequirements({
      ...completeInput,
      phone: '',
      completedDocumentsCount: 4,
      workEnd: '07:00',
      hasPayoutDetails: false,
    });

    expect(missingBlockingRequirements(requirements).map((requirement) => requirement.id)).toEqual([
      'personal_data',
      'documents',
      'work_zone',
      'payout',
    ]);
  });
});
