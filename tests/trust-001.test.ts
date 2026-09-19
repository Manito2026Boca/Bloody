import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  completedJobsLabel,
  declaredExperienceLabel,
  professionalReputationLabel,
  professionalTrustBadges,
} from '../app/lib/professionalTrust';

const app = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260919042736_trust_001_verifiable_signals.sql',
  'utf8',
).toLowerCase();

describe('TRUST-001 verifiable professional signals', () => {
  it('presents a professional without real reviews as new', () => {
    expect(professionalReputationLabel({ trust_review_count: 0, trust_rating_avg: null })).toBe('Nuevo en MANITO');
    expect(professionalReputationLabel(undefined)).toBe('Nuevo en MANITO');
  });

  it('formats only real rating averages and review counts', () => {
    expect(professionalReputationLabel({ trust_review_count: 1, trust_rating_avg: 5 })).toBe('5,0 · 1 reseña');
    expect(professionalReputationLabel({ trust_review_count: 18, trust_rating_avg: 4.86 })).toBe('4,9 · 18 reseñas');
  });

  it('labels completed work and declared experience without conflating them', () => {
    expect(completedJobsLabel({ trust_completed_jobs: 1 })).toBe('1 trabajo completado en MANITO');
    expect(completedJobsLabel({ trust_completed_jobs: 0 })).toBeNull();
    expect(declaredExperienceLabel({ years_experience: 6 })).toBe('Experiencia declarada: 6 años');
  });

  it('shows verification badges only from explicit evidence flags', () => {
    expect(professionalTrustBadges({})).toEqual([]);
    expect(professionalTrustBadges({ identity_reviewed: true }).map((badge) => badge.label)).toEqual(['Identidad revisada']);
    expect(professionalTrustBadges({ professional_documents_reviewed: true })[0]?.explanation).toContain('No certifica');
  });

  it('contains no synthetic rating or response-time fallback in client surfaces', () => {
    expect(app).not.toContain('rating_avg || 4.8');
    expect(app).not.toContain('response_minutes || 35');
    expect(app).not.toContain("? 'Verificado' : 'Verificación pendiente'");
  });

  it('loads the own public profile independently from auxiliary onboarding data', () => {
    expect(app).toMatch(/getV6ProfessionalProfile\(profile\.id\)[\s\S]*?\.then\(\(nextProfessionalProfile\)/);
    expect(app).not.toMatch(/Promise\.all\(\[\s*getV6ProfessionalProfile\(profile\.id\),/);
  });

  it('derives reputation from completed matching orders and never returns document payloads', () => {
    expect(migration).toContain("o.status = 'completed'");
    expect(migration).toContain('o.client_id = r.client_id');
    expect(migration).toContain('o.professional_id = r.professional_id');
    expect(migration).not.toContain("'file_path'");
    expect(migration).not.toContain("'observation'");
  });

  it('requires a completed owned order before accepting a rating', () => {
    expect(migration).toContain('create policy ratings_client_insert');
    expect(migration).toContain('o.client_id = (select auth.uid())');
    expect(migration).toContain('o.professional_id = ratings.professional_id');
  });

  it('keeps private helpers closed and exposes only authenticated aggregate RPCs', () => {
    expect(migration).toContain('revoke all on function private.professional_public_trust(uuid) from public, anon, authenticated');
    expect(migration).toContain('revoke all on function public.list_public_professional_trust() from public, anon');
    expect(migration).toContain('grant execute on function public.list_public_professional_trust() to authenticated');
  });
});
