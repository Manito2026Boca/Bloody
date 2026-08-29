'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getV6Supabase } from './v6Supabase';
import type {
  V6AdminComplaintReview,
  V6AdminProfessionalReview,
  V6AdminReviewStatus,
  V6AdminSetting,
  V6AssignmentMode,
  V6ClientAddress,
  V6Complaint,
  V6Message,
  V6Mode,
  V6Notification,
  V6Order,
  V6OrderExtra,
  V6OrderPhoto,
  V6OrderProposal,
  V6Payment,
  V6PaymentMethod,
  V6PaymentProfile,
  V6PortfolioItem,
  V6Profile,
  V6ProfessionalDocument,
  V6ProfessionalOnboarding,
  V6ProfessionalPaymentAccount,
  V6ProfessionalPayoutDetails,
  V6ProfessionalProfile,
  V6ProfessionalService,
  V6ProfessionalSpecialty,
  V6PublicProfessional,
  V6RecurringServicePlan,
  V6Role,
  V6Service,
  V6Specialty,
  V6UserSecurityPreferences,
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

const safeOrderColumns = [
  'id',
  'client_id',
  'professional_id',
  'service_id',
  'description',
  'address',
  'mode',
  'scheduled_at',
  'status',
  'price',
  'client_lat',
  'client_lng',
  'created_at',
  'updated_at',
  'accepted_at',
  'completed_at',
  'assignment_mode',
  'preferred_professional_id',
  'payment_method',
  'guarantee_days',
  'eta_minutes',
  'payment_status',
  'online_payment_required',
  'payment_required_at',
  'paid_at',
].join(',');

const safeOrderSelect = `${safeOrderColumns},service:services(id,slug,name,emoji,base_price,active,allow_immediate,allow_scheduled,allow_quote,supports_recurring),client:profiles!orders_client_id_fkey(id,full_name,city),professional:profiles!orders_professional_id_fkey(id,full_name,city)`;

type V6VisibleOrderPin = {
  order_id: string;
  pin_stage: 'start' | 'end';
  pin_value: string;
};

function orderCanHaveVisibleClientPin(order: Pick<V6Order, 'status'>) {
  return order.status === 'en_sitio' || order.status === 'trabajando';
}

async function attachVisibleOrderPins(orders: V6Order[]) {
  const pinCandidates = orders.filter(orderCanHaveVisibleClientPin);
  if (!pinCandidates.length) return orders;

  const pinResults = await Promise.all(
    pinCandidates.map(async (order) => {
      const { data, error } = await getV6Supabase().rpc('get_order_pin', {
        p_order_id: order.id,
      });
      if (isMissingV5Table(error)) return null;
      fail(error);
      return ((data || []) as V6VisibleOrderPin[])[0] || null;
    }),
  );

  const pinsByOrderId = new Map<string, V6VisibleOrderPin>();
  for (const pin of pinResults) {
    if (pin?.order_id && pin.pin_value) pinsByOrderId.set(pin.order_id, pin);
  }

  return orders.map((order) => {
    const pin = pinsByOrderId.get(order.id);
    if (!pin) return order;
    if (pin.pin_stage === 'start') return { ...order, start_pin: pin.pin_value, end_pin: null };
    return { ...order, start_pin: null, end_pin: pin.pin_value };
  });
}

export async function getV6Profile(userId: string) {
  void userId;
  const { data: rpcData, error: rpcError } = await getV6Supabase().rpc('get_my_profile');
  if (!isMissingV5Table(rpcError)) {
    fail(rpcError);
    return rpcData as V6Profile;
  }

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
  const current = await getV6Profile(userId);
  const { data, error } = await getV6Supabase().rpc('update_my_profile', {
    p_full_name: patch.full_name,
    p_phone: patch.phone === undefined ? current.phone : patch.phone,
    p_city: patch.city === undefined ? current.city : patch.city,
    p_lat: patch.lat === undefined ? current.lat : patch.lat,
    p_lng: patch.lng === undefined ? current.lng : patch.lng,
  });
  if (!isMissingV5Table(error)) {
    fail(error);
    return data as V6Profile;
  }

  const { data: fallbackData, error: fallbackError } = await getV6Supabase()
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .single();
  fail(fallbackError);
  return fallbackData as V6Profile;
}

export async function setV6Availability(userId: string, isAvailable: boolean) {
  void userId;
  const { data, error } = await getV6Supabase().rpc('set_my_availability', {
    p_is_available: isAvailable,
  });
  if (!isMissingV5Table(error)) {
    fail(error);
    return data as V6Profile;
  }

  const { data: fallbackData, error: fallbackError } = await getV6Supabase()
    .from('profiles')
    .update({ is_available: isAvailable })
    .eq('id', userId)
    .select('*')
    .single();
  fail(fallbackError);
  return fallbackData as V6Profile;
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
  const { data: rpcProfiles, error: rpcError } = await supabase.rpc('list_public_professionals');
  if (rpcError && !isMissingV5Table(rpcError)) fail(rpcError);

  let profiles = rpcProfiles as V6PublicProfessional['profile'][] | null;

  if (isMissingV5Table(rpcError)) {
    const { data: fallbackProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id,full_name,city,is_available,lat,lng')
      .eq('role', 'professional')
      .eq('is_available', true)
      .order('full_name');
    fail(profilesError);
    profiles = fallbackProfiles as V6PublicProfessional['profile'][] | null;
  }

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

export async function getV6UserSecurityPreferences(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('user_security_preferences')
    .select('*')
    .eq('profile_id', userId)
    .maybeSingle();
  if (isMissingV5Table(error)) return null;
  fail(error);
  return data as V6UserSecurityPreferences | null;
}

export async function upsertV6UserSecurityPreferences(input: {
  profileId: string;
  accountType: V6UserSecurityPreferences['account_type'];
  taxId?: string | null;
  trustedContact?: string | null;
  hidePhoneInChat: boolean;
}) {
  const { data, error } = await getV6Supabase()
    .from('user_security_preferences')
    .upsert({
      profile_id: input.profileId,
      account_type: input.accountType,
      tax_id: input.taxId || null,
      trusted_contact: input.trustedContact || null,
      hide_phone_in_chat: input.hidePhoneInChat,
    }, { onConflict: 'profile_id' })
    .select('*')
    .single();
  if (isMissingV5Table(error)) return null;
  fail(error);
  return data as V6UserSecurityPreferences;
}

export async function getV6ProfessionalPaymentAccount(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('professional_payment_accounts')
    .select('*')
    .eq('professional_id', userId)
    .eq('provider', 'mercado_pago')
    .maybeSingle();
  if (isMissingV5Table(error)) return null;
  fail(error);
  return data as V6ProfessionalPaymentAccount | null;
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
  const supabase = getV6Supabase();
  const { data, error } = await supabase
    .from('orders')
    .select(safeOrderSelect)
    .order('created_at', { ascending: false })
    .limit(100);
  fail(error);

  const ownOrders = await attachVisibleOrderPins((data || []) as unknown as V6Order[]);
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return ownOrders;

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (profileError || profileData?.role !== 'professional') return ownOrders;

  const { data: opportunityRows, error: opportunityError } = await supabase
    .rpc('list_professional_opportunities');
  if (isMissingV5Table(opportunityError)) return ownOrders;
  fail(opportunityError);

  const merged = new Map<string, V6Order>();
  for (const order of ownOrders) merged.set(order.id, order);
  for (const order of (opportunityRows || []) as V6Order[]) {
    merged.set(order.id, {
      ...order,
      mode: order.mode as V6Mode,
      status: order.status as V6Order['status'],
      payment_method: order.payment_method as V6PaymentMethod | null,
      payment_status: order.payment_status as V6Order['payment_status'],
    } as V6Order);
  }
  return [...merged.values()].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

function initialOrderStatus(mode: V6Mode) {
  if (mode === 'quote') return 'waiting_quotes';
  if (mode === 'scheduled') return 'scheduled_open';
  return 'open';
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
      status: initialOrderStatus(input.mode),
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
    .select(safeOrderColumns)
    .single();
  if (!isMissingV5Table(error)) {
    fail(error);
    return data as unknown as V6Order;
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from('orders')
    .insert({
      client_id: input.clientId,
      service_id: input.serviceId,
      description: input.description,
      address: input.address,
      mode: input.mode,
      status: initialOrderStatus(input.mode),
      scheduled_at: input.scheduledAt,
      price: input.price,
      client_lat: input.lat,
      client_lng: input.lng,
    })
    .select(safeOrderColumns)
    .single();
  fail(legacyError);
  return legacyData as unknown as V6Order;
}

export async function createV6RecurringServicePlan(input: {
  clientId: string;
  serviceId: number;
  sourceOrderId: string;
  frequency: V6RecurringServicePlan['frequency'];
  nextScheduledAt: string | null;
}) {
  const { data, error } = await getV6Supabase()
    .from('recurring_service_plans')
    .insert({
      client_id: input.clientId,
      service_id: input.serviceId,
      source_order_id: input.sourceOrderId,
      frequency: input.frequency,
      next_scheduled_at: input.nextScheduledAt,
    })
    .select('*')
    .single();
  if (isMissingV5Table(error)) return null;
  fail(error);
  return data as V6RecurringServicePlan;
}

export async function listV6OrderProposals(orderId: string) {
  const { data, error } = await getV6Supabase()
    .from('order_proposals')
    .select('*,professional:profiles!order_proposals_professional_id_fkey(id,full_name,city)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6OrderProposal[];
}

export async function listV6PaymentsForOrder(orderId: string) {
  const { data, error } = await getV6Supabase()
    .from('payments')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6Payment[];
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
  void input.professionalId;
  const { data, error } = await getV6Supabase().rpc('send_order_proposal', {
    p_order_id: input.orderId,
    p_labor_price: input.laborPrice,
    p_materials_price: input.materialsPrice,
    p_visit_price: input.visitPrice,
    p_manito_fee: input.manitoFee,
    p_estimated_minutes: input.estimatedMinutes,
    p_availability_label: input.availabilityLabel,
    p_observation: input.observation,
  });
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

export async function confirmV6OrderPayment(orderId: string) {
  const { data, error } = await getV6Supabase().rpc('confirm_order_payment', {
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

export async function startV6Order(orderId: string, pin: string) {
  const { data, error } = await getV6Supabase().rpc('start_order', {
    p_order_id: orderId,
    p_pin: pin,
  });
  fail(error);
  return data as V6Order;
}

export async function completeTrackedV6Order(orderId: string, pin: string) {
  const { data, error } = await getV6Supabase().rpc('complete_order', {
    p_order_id: orderId,
    p_pin: pin,
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
  void input.professionalId;
  const { data, error } = await getV6Supabase().rpc('propose_order_extra', {
    p_order_id: input.orderId,
    p_title: input.title,
    p_amount: input.amount,
  });
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
  const { data, error } = await getV6Supabase().rpc('decide_order_extra', {
    p_extra_id: extraId,
    p_status: status,
  });
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
  void input.openedBy;
  const { data, error } = await getV6Supabase().rpc('open_order_complaint', {
    p_order_id: input.orderId,
    p_reason: input.reason,
    p_detail: input.detail,
  });
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

export async function listV6Notifications(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6Notification[];
}

export async function markV6NotificationsRead(userId: string) {
  const { error } = await getV6Supabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .is('read_at', null);
  if (isMissingV5Table(error)) return;
  fail(error);
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

export async function listV6AdminProfessionalReviews() {
  const { data, error } = await getV6Supabase().rpc('list_admin_professional_reviews');
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6AdminProfessionalReview[];
}

export async function reviewV6ProfessionalOnboarding(input: {
  professionalId: string;
  status: V6AdminReviewStatus;
  notes?: string | null;
  verified?: boolean | null;
  manitoPro?: boolean | null;
}) {
  const { data, error } = await getV6Supabase().rpc('review_professional_onboarding', {
    p_professional_id: input.professionalId,
    p_status: input.status,
    p_notes: input.notes || null,
    p_verified: input.verified ?? null,
    p_manito_pro: input.manitoPro ?? null,
  });
  fail(error);
  return data as V6ProfessionalOnboarding;
}

export async function reviewV6ProfessionalDocument(input: {
  documentId: string;
  status: V6ProfessionalDocument['status'];
  observation?: string | null;
}) {
  const { data, error } = await getV6Supabase().rpc('review_professional_document', {
    p_document_id: input.documentId,
    p_status: input.status,
    p_observation: input.observation || null,
  });
  fail(error);
  return data as V6ProfessionalDocument;
}

export async function listV6AdminComplaintReviews() {
  const { data, error } = await getV6Supabase().rpc('list_admin_complaint_reviews');
  if (isMissingV5Table(error)) return [];
  fail(error);
  return (data || []) as V6AdminComplaintReview[];
}

export async function reviewV6OrderComplaint(input: {
  complaintId: string;
  status: V6Complaint['status'];
  resolutionNote?: string | null;
}) {
  const { data, error } = await getV6Supabase().rpc('review_order_complaint', {
    p_complaint_id: input.complaintId,
    p_status: input.status,
    p_resolution_note: input.resolutionNote || null,
  });
  fail(error);
  return data as V6Complaint;
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
