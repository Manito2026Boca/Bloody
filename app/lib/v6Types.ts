export type V6Role = 'client' | 'professional' | 'admin';

export type V6Mode = 'immediate' | 'scheduled' | 'quote';
export type V6AssignmentMode = 'auto' | 'manual';
export type V6PaymentMethod = 'card' | 'wallet' | 'cash' | 'transfer';
export type V6PaymentStatus =
  | 'unpaid'
  | 'not_required'
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'rejected'
  | 'refunded'
  | 'partially_refunded';
export type V6PaymentProvider = 'mercado_pago' | 'manual' | 'cash' | 'wallet';

export type V6OrderStatus =
  | 'open'
  | 'accepted'
  | 'en_camino'
  | 'en_sitio'
  | 'completed'
  | 'cancelled';

export type V6Profile = {
  id: string;
  email: string | null;
  full_name: string;
  role: V6Role;
  phone: string | null;
  city: string | null;
  is_available: boolean;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string;
};

export type V6Service = {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  base_price: number | null;
  active: boolean;
  allow_immediate?: boolean;
  allow_scheduled?: boolean;
  allow_quote?: boolean;
  supports_recurring?: boolean;
};

export type V6ProfessionalService = {
  professional_id: string;
  service_id: number;
  price_from: number | null;
};

export type V6Specialty = {
  id: number;
  service_id: number;
  name: string;
  position: number;
  active: boolean;
  created_at: string;
};

export type V6ProfessionalSpecialty = {
  professional_id: string;
  service_id: number;
  specialty_id: number;
  created_at: string;
};

export type V6PublicProfessional = {
  profile: Pick<V6Profile, 'id' | 'full_name' | 'city' | 'is_available' | 'lat' | 'lng'>;
  professional_profile: V6ProfessionalProfile | null;
  services: V6ProfessionalService[];
  specialties: V6ProfessionalSpecialty[];
};

export type V6Order = {
  id: string;
  client_id: string;
  professional_id: string | null;
  service_id: number;
  description: string;
  address: string;
  mode: V6Mode;
  scheduled_at: string | null;
  status: V6OrderStatus;
  price: number | null;
  assignment_mode?: V6AssignmentMode | null;
  preferred_professional_id?: string | null;
  payment_method?: V6PaymentMethod | null;
  payment_status?: V6PaymentStatus;
  online_payment_required?: boolean;
  payment_required_at?: string | null;
  paid_at?: string | null;
  guarantee_days?: number | null;
  eta_minutes?: number | null;
  start_pin?: string | null;
  end_pin?: string | null;
  client_lat: number | null;
  client_lng: number | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  service?: V6Service | null;
  client?: Pick<V6Profile, 'id' | 'full_name' | 'phone' | 'city'> | null;
  professional?: Pick<V6Profile, 'id' | 'full_name' | 'phone' | 'city'> | null;
};

export type V6ClientAddress = {
  id: string;
  client_id: string;
  label: string;
  line: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type V6RecurringServicePlan = {
  id: string;
  client_id: string;
  service_id: number;
  source_order_id: string | null;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  status: 'active' | 'paused' | 'cancelled';
  next_scheduled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type V6PaymentProfile = {
  id: string;
  profile_id: string;
  type: V6PaymentMethod;
  label: string;
  last4: string | null;
  is_default: boolean;
  created_at: string;
};

export type V6ProfessionalPaymentAccount = {
  id: string;
  professional_id: string;
  provider: 'mercado_pago';
  status: 'not_connected' | 'pending_oauth' | 'connected' | 'restricted' | 'disconnected';
  external_account_id: string | null;
  nickname: string | null;
  country: string;
  currency: string;
  can_receive_online_payments: boolean;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type V6Payment = {
  id: string;
  order_id: string;
  client_id: string;
  professional_id: string | null;
  source_type: 'original' | 'additional' | 'protection_adjustment' | 'refund';
  extra_id: string | null;
  proposal_id: string | null;
  provider: V6PaymentProvider;
  provider_account_id: string | null;
  external_preference_id: string | null;
  external_payment_id: string | null;
  checkout_url: string | null;
  amount: number;
  manito_fee: number;
  professional_amount: number;
  currency: string;
  status:
    | 'pending'
    | 'awaiting_client_action'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'refunded'
    | 'partially_refunded'
    | 'expired';
  payment_method: string | null;
  failure_reason: string | null;
  created_at: string;
  approved_at: string | null;
  refunded_at: string | null;
  updated_at: string;
};

export type V6ProfessionalProfile = {
  professional_id: string;
  headline: string;
  bio: string;
  years_experience: number;
  public_slug: string | null;
  verified: boolean;
  manito_pro: boolean;
  rating_avg: number;
  jobs_completed: number;
  response_minutes: number | null;
  insurance_label: string | null;
  work_city?: string | null;
  service_radius_km?: number | null;
  work_days?: string[] | null;
  work_starts_at?: string | null;
  work_ends_at?: string | null;
  updated_at: string;
};

export type V6ProfessionalPayoutDetails = {
  professional_id: string;
  payout_alias: string | null;
  payout_cbu: string | null;
  wallet_payment_link: string | null;
  updated_at: string;
};

export type V6ProfessionalOnboarding = {
  professional_id: string;
  status: 'draft' | 'submitted' | 'in_review' | 'approved' | 'observed' | 'rejected' | 'suspended';
  current_step: number;
  notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

export type V6ProfessionalDocument = {
  id: string;
  professional_id: string;
  kind: string;
  label: string;
  status: 'pending' | 'uploaded' | 'approved' | 'observed' | 'rejected';
  file_path: string | null;
  observation: string | null;
  created_at: string;
  updated_at: string;
};

export type V6PortfolioItem = {
  id: string;
  professional_id: string;
  title: string;
  description: string | null;
  before_path: string | null;
  after_path: string | null;
  service_id: number | null;
  created_at: string;
};

export type V6OrderProposal = {
  id: string;
  order_id: string;
  professional_id: string;
  labor_price: number;
  materials_price: number;
  visit_price: number;
  manito_fee: number;
  estimated_minutes: number | null;
  availability_label: string | null;
  observation: string | null;
  status: 'sent' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
  updated_at: string;
  professional?: Pick<V6Profile, 'id' | 'full_name' | 'phone' | 'city'> | null;
};

export type V6OrderExtra = {
  id: string;
  order_id: string;
  professional_id: string;
  title: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at: string | null;
};

export type V6OrderPhoto = {
  id: string;
  order_id: string;
  uploaded_by: string;
  stage: 'before' | 'during' | 'after';
  file_path: string;
  caption: string | null;
  created_at: string;
};

export type V6Rating = {
  id: string;
  order_id: string;
  client_id: string;
  professional_id: string;
  stars: number;
  comment: string | null;
  created_at: string;
};

export type V6Complaint = {
  id: string;
  order_id: string;
  opened_by: string;
  reason: string;
  detail: string | null;
  status: 'open' | 'in_review' | 'resolved' | 'rejected';
  created_at: string;
  updated_at: string;
};

export type V6AdminSetting = {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
};

export type V6Message = {
  id: number;
  order_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export const V6_STATUS_LABEL: Record<V6OrderStatus, string> = {
  open: 'Buscando',
  accepted: 'Confirmado',
  en_camino: 'En camino',
  en_sitio: 'En el lugar',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
};

export const V6_MODE_LABEL: Record<V6Mode, string> = {
  immediate: 'Ahora',
  scheduled: 'Programado',
  quote: 'Presupuesto',
};
