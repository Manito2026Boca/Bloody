import type { ActivityRequirement } from './providerIdentity';

export const baseProviderDocuments = [
  { kind: 'dni_front', label: 'DNI frente' },
  { kind: 'dni_back', label: 'DNI dorso' },
  { kind: 'selfie', label: 'Selfie de verificación' },
  { kind: 'tax', label: 'Constancia fiscal' },
];
export const activityDocumentLabels: Record<string, string> = {
  gas_installer_registration: 'Matrícula de instalador de gas',
  electrical_installer_registration: 'Matrícula para instalaciones eléctricas',
  pest_control_authorization: 'Habilitación para control de plagas',
  transport_vehicle_review: 'Documentación de transporte y vehículo',
};
export const transportChecks = [
  { key: 'pba_cargo', label: 'Transporte de cargas PBA' },
  { key: 'professional_license', label: 'Licencia según vehículo' },
  { key: 'vehicle_documents', label: 'Documentación vehicular' },
  { key: 'motor_insurance', label: 'Seguro automotor' },
  { key: 'vtv', label: 'VTV' },
] as const;
export function providerDocuments(requirements: ActivityRequirement[]) {
  const additional = [...new Set(requirements.flatMap((item) => item.credential_kinds))]
    .filter((kind) => kind !== 'insurance' && !baseProviderDocuments.some((item) => item.kind === kind))
    .map((kind) => ({ kind, label: activityDocumentLabels[kind] || `Credencial de actividad: ${kind.replaceAll('_', ' ')}` }));
  return [...baseProviderDocuments, ...additional];
}
export type ActivityReview = {
  service_id: number; kind: string; status: 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';
  details: Record<string, unknown>; verified_at: string; reviewed_by: string;
};
