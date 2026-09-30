'use client';

import { getV6Supabase } from './v6Supabase';
import type { AdminProviderIdentity, ArcaResult, OwnProviderIdentity, ActivityRequirement } from './providerIdentity';
import type { ActivityReview } from './providerActivity';

async function call<T>(name: string, parameters?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getV6Supabase().rpc(name, parameters);
  // Never surface server details or submitted CUIT from an unexpected constraint error.
  if (error) throw new Error('No pudimos completar la revision de identidad. Revisa los datos o volve a intentar.');
  return data as T;
}
export const getMyProviderIdentity = () => call<OwnProviderIdentity>('get_my_provider_identity');
export const getMyProviderActivityRequirements = () => call<ActivityRequirement[]>('get_my_provider_activity_requirements');
export const submitProviderIdentity = (cuit: string, recovery: boolean) =>
  call<{ received: boolean }>('submit_provider_identity_claim', { p_cuit: cuit, p_recovery: recovery });
export const getAdminProviderIdentity = (professionalId: string) =>
  call<AdminProviderIdentity>('get_admin_provider_identity', { p_professional_id: professionalId });
export const revealProviderCuit = (claimId: string) => call<string>('reveal_provider_cuit', { p_claim_id: claimId });
export const reviewProviderIdentity = (claimId: string, action: string, result: ArcaResult | null = null, ownershipChecked = false) =>
  call<void>('review_provider_identity', { p_claim_id: claimId, p_action: action, p_result: result, p_ownership_checked: ownershipChecked });
export const configureProviderActivity = (activity: ActivityRequirement) => call<void>('configure_provider_activity', {
  p_service_id: activity.service_id, p_specialty_id: activity.specialty_id, p_level: activity.level, p_credential_kinds: activity.credential_kinds,
});
export const getProviderActivityReviews = (professionalId: string) =>
  call<ActivityReview[]>('get_provider_activity_reviews', { p_professional_id: professionalId });
export const reviewProviderActivityDocument = (professionalId: string, serviceId: number, kind: string,
  documentId: string, status: ActivityReview['status'], details: Record<string, unknown>) =>
  call<void>('review_provider_activity_document', { p_professional_id: professionalId, p_service_id: serviceId,
    p_kind: kind, p_document_id: documentId, p_status: status, p_details: details });
