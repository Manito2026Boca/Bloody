export type V6Role = 'client' | 'professional' | 'admin';

export type V6Mode = 'immediate' | 'scheduled' | 'quote';
export type V6AssignmentMode = 'auto' | 'manual';
export type V6PaymentMethod = 'card' | 'wallet' | 'cash' | 'transfer';

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
};

export type V6ProfessionalService = {
  professional_id: string;
  service_id: number;
  price_from: number | null;
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

export type V6PaymentProfile = {
  id: string;
  profile_id: string;
  type: V6PaymentMethod;
  label: string;
  last4: string | null;
  is_default: boolean;
  created_at: string;
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
