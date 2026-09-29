import type { ArcaResult } from './providerIdentity';
import { isValidCuit } from './providerIdentity';

// Future server-side fiscal adapter. Never grants ownership or changes operational status.
export interface ProviderIdentityVerifier {
  verify(input: { normalizedCuit: string }): Promise<{
    result: ArcaResult; source: 'MANUAL_ARCA' | 'ARCA_WS'; checkedAt: string;
    matchedFields?: { legalName: string };
  }>;
}
export class ManualArcaVerifier implements ProviderIdentityVerifier {
  constructor(private readonly recordedReview: { result: ArcaResult; checkedAt: string }) {}
  async verify(input: { normalizedCuit: string }) {
    if (!isValidCuit(input.normalizedCuit)) throw new Error('Datos fiscales no validos');
    return { ...this.recordedReview, source: 'MANUAL_ARCA' as const };
  }
}
