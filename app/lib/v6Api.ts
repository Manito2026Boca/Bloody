'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getV6Supabase } from './v6Supabase';
import type {
  V6AdminSetting,
  V6AssignmentMode,
  V6ClientAddress,
  V6Complaint,
  V6Message,
  V6Mode,
  V6Order,
  V6OrderExtra,
  V6OrderPhoto,
  V6OrderProposal,
  V6PaymentMethod,
  V6PaymentProfile,
  V6PortfolioItem,
  V6Profile,
  V6ProfessionalDocument,
  V6ProfessionalOnboarding,
  V6ProfessionalPayoutDetails,
  V6ProfessionalProfile,
  V6ProfessionalService,
  V6ProfessionalSpecialty,
  V6PublicProfessional,
  V6Role,
  V6Service,
  V6Specialty,
} from './v6Types';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function isMissingV5Table(error: { message: string; code?: string } | null) {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.message.includes('Could not find') ||
    error.message.includes('schema cache') ||
    error.message.includes('does not exist')
  );
}

function safeStorageFileName(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'archivo';
}

export async function getV6Profile(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  fail(error);
  return data as V6Profile;
}

export async function completeV6Profile(input: {
  fullName: string;
  role: V6Role;
  phone?: string;
  city?: string;
}) {
  const { data, error } = await getV6Supabase().rpc('complete_profile', {
    p_full_name: input.fullName,
    p_role: input.role,
    p_phone: input.phone || null,
    p_city: input.city || null,
  });
  fail(error);
  return data as V6Profile;
}

export async function updateV6Profile(
  userId: string,
  patch: Pick<V6Profile, 'full_name'> &
    Partial<Pick<V6Profile, 'phone' | 'city' | 'lat' | 'lng'>>,
) {
  const { data, error } = await getV6Supabase()
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .single();
  fail(error);
  return data as V6Profile;
}

export async function setV6Availability(userId: string, isAvailable: boolean) {
  const { data, error } = await getV6Supabase()
    .from('profiles')
    .update({ is_available: isAvailable })
    .eq('id', userId)
    .select('*')
    .single();
  fail(error);
  return data as V6Profile;
}

export async function listV6Services() {
  const { data, error } = await getV6Supabase()
    .from('services')
    .select('*')
    .eq('active', true)
    .order('id');
  fail(error);
  return (data || []) as V6Service[];
}

export async function listV6Specialties() {
  const { data, error } = await getV6Supabase()
    .from('specialties')
    .select('*')
    .eq('active', true)
    .order('service_id')
    .order('position')
    .order('name');
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6Specialty[];
}

export async function listV6ProfessionalServices(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('professional_services')
    .select('*')
    .eq('professional_id', userId);
  fail(error);
  return (data || []) as V6ProfessionalService[];
}

export async function listV6ProfessionalSpecialties(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('professional_specialties')
    .select('*')
    .eq('professional_id', userId);
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6ProfessionalSpecialty[];
}

export async function listV6PublicProfessionals() {
  const supabase = getV6Supabase();
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id,full_name,city,is_available,lat,lng')
    .eq('role', 'professional')
    .eq('is_available', true)
    .order('full_name');
  fail(profilesError);

  const professionalIds = ((profiles || []) as V6PublicProfessional['profile'][]).map((profile) => profile.id);
  if (!professionalIds.length) return [];

  const [professionalProfilesResult, servicesResult, specialtiesResult] = await Promise.all([
    supabase
      .from('professional_profiles')
      .select('*')
      .in('professional_id', professionalIds),
    supabase
      .from('professional_services')
      .select('*')
      .in('professional_id', professionalIds),
    supabase
      .from('professional_specialties')
      .select('*')
      .in('professional_id', professionalIds),
  ]);

  if (isMissingV5Table(professionalProfilesResult.error)) return [];
  if (isMissingV5Table(servicesResult.error)) return [];
  if (isMissingV5Table(specialtiesResult.error)) return [];
  fail(professionalProfilesResult.error);
  fail(servicesResult.error);
  fail(specialtiesResult.error);

  const publicProfiles = (profiles || []) as V6PublicProfessional['profile'][];
  const professionalProfiles = (professionalProfilesResult.data || []) as V6ProfessionalProfile[];
  const professionalServices = (servicesResult.data || []) as V6ProfessionalService[];
  const professionalSpecialties = (specialtiesResult.data || []) as V6ProfessionalSpecialty[];

  return publicProfiles
    .map((profile) => ({
      profile,
      professional_profile:
        professionalProfiles.find((item) => item.professional_id === profile.id) || null,
      services: professionalServices.filter((item) => item.professional_id === profile.id),
      specialties: professionalSpecialties.filter((item) => item.professional_id === profile.id),
    }))
    .filter((professional) => professional.services.length > 0) as V6PublicProfessional[];
}

export async function saveV6ProfessionalSpecialties(
  userId: string,
  specialtyIds: number[],
  specialties: V6Specialty[],
) {
  const supabase = getV6Supabase();
  const { error: deleteError } = await supabase
    .from('professional_specialties')
    .delete()
    .eq('professional_id', userId);
  if (isMissingV5Table(deleteError)) return [];
  fail(deleteError);

  if (!specialtyIds.length) return [];

  const rows = specialtyIds
    .map((specialtyId) => {
      const specialty = specialties.find((item) => item.id === specialtyId);
      if (!specialty) return null;
      return {
        professional_id: userId,
        service_id: specialty.service_id,
        specialty_id: specialty.id,
      };
    })
    .filter(
      (row): row is { professional_id: string; service_id: number; specialty_id: number } =>
        Boolean(row),
    );

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from('professional_specialties')
    .insert(rows)
    .select('*');
  fail(error);
  return (data || []) as V6ProfessionalSpecialty[];
}

export async function listV6ClientAddresses(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('client_addresses')
    .select('*')
    .eq('client_id', userId)
    .order('created_at', { ascending: false });
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6ClientAddress[];
}

export async function upsertV6ClientAddress(input: {
  id?: string;
  clientId: string;
  label: string;
  line: string;
  city?: string | null;
  lat: number | null;
  lng: number | null;
  isDefault?: boolean;
}) {
  const { data, error } = await getV6Supabase()
    .from('client_addresses')
    .upsert({
      id: input.id,
      client_id: input.clientId,
      label: input.label,
      line: input.line,
      city: input.city || null,
      lat: input.lat,
      lng: input.lng,
      is_default: Boolean(input.isDefault),
    })
    .select('*')
    .single();
  fail(error);
  return data as V6ClientAddress;
}

export async function listV6PaymentProfiles(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('payment_methods')
    .select('*')
    .eq('profile_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (isMissingV5Table(error)) return [];
  fail(error);
  const unique = new Map<V6PaymentMethod, V6PaymentProfile>();
  for (const item of (data || []) as V6PaymentProfile[]) {
    if (!unique.has(item.type)) unique.set(item.type, item);
  }
  return [...unique.values()];
}

export async function addV6PaymentProfile(input: {
  profileId: string;
  type: V6PaymentMethod;
  label: string;
  last4?: string | null;
  isDefault?: boolean;
}) {
  const supabase = getV6Supabase();
  if (input.isDefault) {
    const { error: resetError } = await supabase
      .from('payment_methods')
      .update({ is_default: false })
      .eq('profile_id', input.profileId);
    fail(resetError);
  }
  const { data, error } = await getV6Supabase()
    .from('payment_methods')
    .upsert({
      profile_id: input.profileId,
      type: input.type,
      label: input.label,
      last4: input.last4 || null,
      is_default: input.isDefault ?? false,
    }, { onConflict: 'profile_id,type' })
    .select('*')
    .single();
  fail(error);
  return data as V6PaymentProfile;
}

export async function saveV6ProfessionalServices(
  userId: string,
  serviceIds: number[],
  services: V6Service[],
  rates: Record<number, number | null> = {},
) {
  const supabase = getV6Supabase();
  const { error: deleteError } = await supabase
    .from('professional_services')
    .delete()
    .eq('professional_id', userId);
  fail(deleteError);

  if (!serviceIds.length) return [];

  const rows = serviceIds.map((serviceId) => ({
    professional_id: userId,
    service_id: serviceId,
    price_from:
      rates[serviceId] ??
      services.find((service) => service.id === serviceId)?.base_price ??
      null,
  }));
  const { data, error } = await supabase
    .from('professional_services')
    .insert(rows)
    .select('*');
  fail(error);
  return (data || []) as V6ProfessionalService[];
}

export async function listV6Orders() {
  const { data, error } = await getV6Supabase()
    .from('orders')
    .select(
      '*,service:services(id,slug,name,emoji,base_price,active),client:profiles!orders_client_id_fkey(id,full_name,phone,city),professional:profiles!orders_professional_id_fkey(id,full_name,phone,city)',
    )
    .order('created_at', { ascending: false })
    .limit(100);
  fail(error);
  return (data || []) as V6Order[];
}

export async function createV6Order(input: {
  clientId: string;
  serviceId: number;
  description: string;
  address: string;
  mode: V6Mode;
  assignmentMode?: V6AssignmentMode;
  preferredProfessionalId?: string | null;
  paymentMethod?: V6PaymentMethod | null;
  guaranteeDays?: number;
  etaMinutes?: number | null;
  scheduledAt: string | null;
  price: number | null;
  lat: number | null;
  lng: number | null;
}) {
  const supabase = getV6Supabase();
  const { data, error } = await supabase
    .from('orders')
    .insert({
      client_id: input.clientId,
      service_id: input.serviceId,
      description: input.description,
      address: input.address,
      mode: input.mode,
      assignment_mode: input.assignmentMode || 'auto',
      preferred_professional_id: input.preferredProfessionalId || null,
      payment_method: input.paymentMethod || null,
      guarantee_days: input.guaranteeDays ?? 7,
      eta_minutes: input.etaMinutes || null,
      scheduled_at: input.scheduledAt,
      price: input.price,
      client_lat: input.lat,
      client_lng: input.lng,
    })
    .select('*')
    .single();
  if (!isMissingV5Table(error)) {
    fail(error);
    return data as V6Order;
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from('orders')
    .insert({
      client_id: input.clientId,
      service_id: input.serviceId,
      description: input.description,
      address: input.address,
      mode: input.mode,
      scheduled_at: input.scheduledAt,
      price: input.price,
      client_lat: input.lat,
      client_lng: input.lng,
    })
    .select('*')
    .single();
  fail(legacyError);
  return legacyData as V6Order;
}

export async function listV6OrderProposals(orderId: string) {
  const { data, error } = await getV6Supabase()
    .from('order_proposals')
    .select('*,professional:profiles!order_proposals_professional_id_fkey(id,full_name,phone,city)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6OrderProposal[];
}

export async function sendV6OrderProposal(input: {
  orderId: string;
  professionalId: string;
  laborPrice: number;
  materialsPrice: number;
  visitPrice: number;
  manitoFee: number;
  estimatedMinutes: number;
  availabilityLabel: string;
  observation: string;
}) {
  const { data, error } = await getV6Supabase()
    .from('order_proposals')
    .upsert({
      order_id: input.orderId,
      professional_id: input.professionalId,
      labor_price: input.laborPrice,
      materials_price: input.materialsPrice,
      visit_price: input.visitPrice,
      manito_fee: input.manitoFee,
      estimated_minutes: input.estimatedMinutes,
      availability_label: input.availabilityLabel,
      observation: input.observation,
      status: 'sent',
    })
    .select('*')
    .single();
  fail(error);
  return data as V6OrderProposal;
}

export async function acceptV6Proposal(proposalId: string) {
  const { data, error } = await getV6Supabase().rpc('accept_proposal', {
    p_proposal_id: proposalId,
  });
  fail(error);
  return data as V6Order;
}

export async function acceptV6Order(orderId: string) {
  const { data, error } = await getV6Supabase().rpc('accept_order', {
    p_order_id: orderId,
  });
  fail(error);
  return data as V6Order;
}

export async function advanceV6Order(orderId: string) {
  const { data, error } = await getV6Supabase().rpc('advance_order', {
    p_order_id: orderId,
  });
  fail(error);
  return data as V6Order;
}

export async function cancelV6Order(orderId: string) {
  const { data, error } = await getV6Supabase().rpc('cancel_order', {
    p_order_id: orderId,
  });
  fail(error);
  return data as V6Order;
}

export async function listV6OrderExtras(orderId: string) {
  const { data, error } = await getV6Supabase()
    .from('order_extras')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6OrderExtra[];
}

export async function addV6OrderExtra(input: {
  orderId: string;
  professionalId: string;
  title: string;
  amount: number;
}) {
  const { data, error } = await getV6Supabase()
    .from('order_extras')
    .insert({
      order_id: input.orderId,
      professional_id: input.professionalId,
      title: input.title,
      amount: input.amount,
    })
    .select('*')
    .single();
  fail(error);
  return data as V6OrderExtra;
}

export async function listV6OrderPhotos(orderId: string) {
  const { data, error } = await getV6Supabase()
    .from('order_photos')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at');
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6OrderPhoto[];
}

export async function addV6OrderPhoto(input: {
  orderId: string;
  uploadedBy: string;
  stage: V6OrderPhoto['stage'];
  filePath: string;
  caption?: string | null;
}) {
  const { data, error } = await getV6Supabase()
    .from('order_photos')
    .insert({
      order_id: input.orderId,
      uploaded_by: input.uploadedBy,
      stage: input.stage,
      file_path: input.filePath,
      caption: input.caption || null,
    })
    .select('*')
    .single();
  fail(error);
  return data as V6OrderPhoto;
}

export async function getV6MediaSignedUrl(filePath: string) {
  const { data, error } = await getV6Supabase()
    .storage
    .from('manito-media')
    .createSignedUrl(filePath, 600);
  if (error) return null;
  return data.signedUrl;
}

export async function decideV6OrderExtra(extraId: string, status: 'approved' | 'rejected') {
  const { data, error } = await getV6Supabase()
    .from('order_extras')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', extraId)
    .select('*')
    .single();
  fail(error);
  return data as V6OrderExtra;
}

export async function addV6Rating(input: {
  orderId: string;
  clientId: string;
  professionalId: string;
  stars: number;
  comment: string;
}) {
  const { data, error } = await getV6Supabase()
    .from('ratings')
    .insert({
      order_id: input.orderId,
      client_id: input.clientId,
      professional_id: input.professionalId,
      stars: input.stars,
      comment: input.comment || null,
    })
    .select('*')
    .single();
  fail(error);
  return data;
}

export async function addV6Complaint(input: {
  orderId: string;
  openedBy: string;
  reason: string;
  detail: string;
}) {
  const { data, error } = await getV6Supabase()
    .from('complaints')
    .insert({
      order_id: input.orderId,
      opened_by: input.openedBy,
      reason: input.reason,
      detail: input.detail || null,
    })
    .select('*')
    .single();
  fail(error);
  return data as V6Complaint;
}

export async function listV6Complaints(orderId: string) {
  const { data, error } = await getV6Supabase()
    .from('complaints')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  fail(error);
  return (data || []) as V6Complaint[];
}

export async function listV6Messages(orderId: string) {
  const { data, error } = await getV6Supabase()
    .from('messages')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at');
  fail(error);
  return (data || []) as V6Message[];
}

export async function sendV6Message(orderId: string, senderId: string, body: string) {
  const { data, error } = await getV6Supabase()
    .from('messages')
    .insert({ order_id: orderId, sender_id: senderId, body })
    .select('*')
    .single();
  fail(error);
  return data as V6Message;
}

export async function getV6ProfessionalProfile(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('professional_profiles')
    .select('*')
    .eq('professional_id', userId)
    .maybeSingle();
  if (isMissingV5Table(error)) return null;
  fail(error);
  return data as V6ProfessionalProfile | null;
}

export async function getV6ProfessionalPayoutDetails(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('professional_payout_details')
    .select('*')
    .eq('professional_id', userId)
    .maybeSingle();
  if (isMissingV5Table(error)) return null;
  fail(error);
  return data as V6ProfessionalPayoutDetails | null;
}

export async function upsertV6ProfessionalPayoutDetails(input: {
  professionalId: string;
  payoutAlias?: string | null;
  payoutCbu?: string | null;
  walletPaymentLink?: string | null;
}) {
  const { data, error } = await getV6Supabase()
    .from('professional_payout_details')
    .upsert({
      professional_id: input.professionalId,
      payout_alias: input.payoutAlias || null,
      payout_cbu: input.payoutCbu || null,
      wallet_payment_link: input.walletPaymentLink || null,
    })
    .select('*')
    .single();
  if (isMissingV5Table(error)) return null;
  fail(error);
  return data as V6ProfessionalPayoutDetails;
}

export async function upsertV6ProfessionalProfile(input: {
  professionalId: string;
  headline: string;
  bio: string;
  yearsExperience: number;
  publicSlug?: string | null;
  responseMinutes?: number | null;
  insuranceLabel?: string | null;
  workCity?: string | null;
  serviceRadiusKm?: number | null;
  workDays?: string[];
  workStartsAt?: string | null;
  workEndsAt?: string | null;
}) {
  const { data, error } = await getV6Supabase()
    .from('professional_profiles')
    .upsert({
      professional_id: input.professionalId,
      headline: input.headline,
      bio: input.bio,
      years_experience: input.yearsExperience,
      public_slug: input.publicSlug || null,
      response_minutes: input.responseMinutes || null,
      insurance_label: input.insuranceLabel || null,
      work_city: input.workCity || null,
      service_radius_km: input.serviceRadiusKm || 8,
      work_days: input.workDays?.length ? input.workDays : ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'],
      work_starts_at: input.workStartsAt || '08:00',
      work_ends_at: input.workEndsAt || '18:00',
    })
    .select('*')
    .single();
  fail(error);
  return data as V6ProfessionalProfile;
}

export async function getV6ProfessionalOnboarding(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('professional_onboarding')
    .select('*')
    .eq('professional_id', userId)
    .maybeSingle();
  if (isMissingV5Table(error)) return null;
  fail(error);
  return data as V6ProfessionalOnboarding | null;
}

export async function upsertV6ProfessionalOnboarding(input: {
  professionalId: string;
  status: V6ProfessionalOnboarding['status'];
  currentStep: number;
  notes?: string | null;
}) {
  const { data, error } = await getV6Supabase()
    .from('professional_onboarding')
    .upsert({
      professional_id: input.professionalId,
      status: input.status,
      current_step: input.currentStep,
      notes: input.notes || null,
      submitted_at: input.status === 'submitted' ? new Date().toISOString() : null,
    })
    .select('*')
    .single();
  fail(error);
  return data as V6ProfessionalOnboarding;
}

export async function listV6ProfessionalDocuments(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('professional_documents')
    .select('*')
    .eq('professional_id', userId)
    .order('created_at');
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6ProfessionalDocument[];
}

export async function upsertV6ProfessionalDocument(input: {
  id?: string;
  professionalId: string;
  kind: string;
  label: string;
  status: V6ProfessionalDocument['status'];
  filePath?: string | null;
  observation?: string | null;
}) {
  const { data, error } = await getV6Supabase()
    .from('professional_documents')
    .upsert({
      id: input.id,
      professional_id: input.professionalId,
      kind: input.kind,
      label: input.label,
      status: input.status,
      file_path: input.filePath || null,
      observation: input.observation || null,
    })
    .select('*')
    .single();
  fail(error);
  return data as V6ProfessionalDocument;
}

export async function uploadV6MediaFile(input: {
  ownerId: string;
  area: 'documents' | 'portfolio' | 'orders';
  file: File;
}) {
  const fileName = safeStorageFileName(input.file.name);
  const path = `${input.ownerId}/${input.area}/${Date.now()}-${fileName}`;
  const { data, error } = await getV6Supabase()
    .storage
    .from('manito-media')
    .upload(path, input.file, {
      cacheControl: '3600',
      contentType: input.file.type || undefined,
      upsert: false,
    });
  fail(error);
  if (!data?.path) throw new Error('No se pudo guardar el archivo.');
  return data.path;
}

export async function listV6Portfolio(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('professional_portfolio')
    .select('*')
    .eq('professional_id', userId)
    .order('created_at', { ascending: false });
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6PortfolioItem[];
}

export async function addV6PortfolioItem(input: {
  professionalId: string;
  title: string;
  description: string;
  beforePath?: string | null;
  afterPath?: string | null;
  serviceId?: number | null;
}) {
  const { data, error } = await getV6Supabase()
    .from('professional_portfolio')
    .insert({
      professional_id: input.professionalId,
      title: input.title,
      description: input.description || null,
      before_path: input.beforePath || null,
      after_path: input.afterPath || null,
      service_id: input.serviceId || null,
    })
    .select('*')
    .single();
  fail(error);
  return data as V6PortfolioItem;
}

export async function listV6AdminSettings() {
  const { data, error } = await getV6Supabase()
    .from('admin_settings')
    .select('*')
    .order('key');
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6AdminSetting[];
}

export function subscribeV6Orders(onChange: () => void) {
  const channel = getV6Supabase()
    .channel('manito-v6-orders')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      onChange,
    )
    .subscribe();
  return channel;
}

export function subscribeV6Messages(
  orderId: string,
  onInsert: (message: V6Message) => void,
) {
  const channel = getV6Supabase()
    .channel(`manito-v6-chat-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `order_id=eq.${orderId}`,
      },
      (payload) => onInsert(payload.new as V6Message),
    )
    .subscribe();
  return channel;
}

export function removeV6Channel(channel: RealtimeChannel | null) {
  if (channel) {
    void getV6Supabase().removeChannel(channel);
  }
}
