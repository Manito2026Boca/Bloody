import { describe, expect, it } from 'vitest';
import { baseProviderDocuments, providerDocuments, transportChecks } from './providerActivity';

describe('approved activity documents', () => {
  it('does not require insurance universally', () => {
    expect(baseProviderDocuments.map((item) => item.kind)).toEqual(['dni_front', 'dni_back', 'selfie', 'tax']);
    expect(providerDocuments([])).toEqual(baseProviderDocuments);
  });
  it('retains sector-specific requirements and readable labels', () => {
    const requirements = [{ service_id: 3, specialty_id: null, level: 'LEVEL_2' as const, credential_kinds: ['gas_installer_registration'] }];
    expect(providerDocuments(requirements).at(-1)).toEqual({ kind: 'gas_installer_registration', label: 'Matrícula de instalador de gas' });
    expect(providerDocuments([...requirements, ...requirements])).toHaveLength(5);
  });
  it('rejects generic insurance as a credential, without inventing transport registries', () => {
    expect(providerDocuments([{ service_id: 3, specialty_id: null, level: 'LEVEL_1', credential_kinds: ['insurance'] }])).toHaveLength(4);
    expect(transportChecks.map((item) => item.key)).toEqual(['pba_cargo', 'professional_license', 'vehicle_documents', 'motor_insurance', 'vtv']);
  });
});
