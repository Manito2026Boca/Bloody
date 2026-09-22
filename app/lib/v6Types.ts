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
export type V6ManualResponseStatus = 'pending' | 'price_confirmation_pending' | 'accepted' | 'rejected' | 'expired' | 'awaiting_client_choice';
export type V6PriceConfirmationStatus = 'pending' | 'confirmed' | 'rejected' | 'expired' | 'unavailable';
export type V6MatchingStatus = 'idle' | 'round_pending' | 'matched' | 'failed';
export type V6MatchingCandidateStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'closed';
export type V6CancellationActor = 'client' | 'professional';
export type V6CancellationReason =
  | 'service_no_longer_needed'
  | 'schedule_changed'
  | 'professional_unavailable_or_delayed'
  | 'unavailable'
  | 'schedule_problem'
  | 'service_not_compatible'
  | 'emergency'
  | 'other';
export type V6CancellationResponsibility = 'client' | 'professional' | 'shared' | 'manito' | 'undetermined';

export type V6OrderStatus =
  | 'open'
  | 'scheduled_open'
  | 'waiting_quotes'
  | 'pending_client_confirmation'
  | 'payment_pending'
  | 'accepted'
  | 'en_camino'
  | 'en_sitio'
  | 'trabajando'
  | 'completed'
  | 'cancelled'
  | 'matching_failed';

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
  requires_completion_evidence?: boolean;
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
  location_id?: string | null;
  required_specialty_id?: number | null;
  recurring_plan_id?: string | null;
  recurrence_due_at?: string | null;
  client_id: string;
  professional_id: string | null;
  service_id: number;
  description: string;
  address: string;
  mode: V6Mode;
  scheduled_at: string | null;
  estimated_duration_minutes?: number | null;
  scheduled_end?: string | null;
  status: V6OrderStatus;
  price: number | null;
  estimated_price?: number | null;
  agreed_price?: number | null;
  agreed_scope?: string | null;
  contracted_at?: string | null;
  accepted_proposal_id?: string | null;
  contract_snapshot?: Record<string, unknown> | null;
  pricing_policy_snapshot?: Record<string, unknown> | null;
  client_price_consent_amount?: number | null;
  client_price_consented_at?: string | null;
  price_confirmation_status?: V6PriceConfirmationStatus | null;
  price_confirmation_professional_id?: string | null;
  price_confirmation_estimated_amount?: number | null;
  price_confirmation_proposed_amount?: number | null;
  price_confirmation_scope?: string | null;
  price_confirmation_components?: Array<Record<string, unknown>> | null;
  price_confirmation_policy_snapshot?: Record<string, unknown> | null;
  price_confirmation_requested_at?: string | null;
  price_confirmation_deadline_at?: string | null;
  price_confirmation_responded_at?: string | null;
  price_confirmation_reason?: string | null;
  assignment_mode?: V6AssignmentMode | null;
  preferred_professional_id?: string | null;
  payment_method?: V6PaymentMethod | null;
  payment_status?: V6PaymentStatus;
  online_payment_required?: boolean;
  payment_required_at?: string | null;
  paid_at?: string | null;
  /** @deprecated Historical compatibility only; use protection_window_days. */
  guarantee_days?: number | null;
  protection_window_days?: number | null;
  eta_minutes?: number | null;
  start_pin?: string | null;
  end_pin?: string | null;
  client_lat: number | null;
  client_lng: number | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  cancellation_actor?: V6CancellationActor | null;
  cancellation_reason?: V6CancellationReason | null;
  cancellation_note?: string | null;
  cancellation_phase?: V6OrderStatus | null;
  cancellation_responsibility?: V6CancellationResponsibility | null;
  cancellation_fee?: number | null;
  match_score?: number | null;
  match_reasons?: string[] | null;
  distance_km?: number | null;
  manual_requested_professional_id?: string | null;
  manual_requested_at?: string | null;
  manual_response_deadline_at?: string | null;
  manual_response_status?: V6ManualResponseStatus | null;
  manual_response_reason?: string | null;
  manual_responded_at?: string | null;
  manual_request_history?: Array<Record<string, unknown>> | null;
  matching_status?: V6MatchingStatus | null;
  matching_started_at?: string | null;
  matching_current_round?: number | null;
  matching_cycle?: number | null;
  matching_round_deadline_at?: string | null;
  matching_failed_at?: string | null;
  matching_candidate_id?: string | null;
  matching_candidate_status?: V6MatchingCandidateStatus | null;
  matching_candidate_round?: number | null;
  matching_candidate_deadline_at?: string | null;
  service?: V6Service | null;
  client?: Pick<V6Profile, 'id' | 'full_name' | 'city'> & { phone?: string | null } | null;
  professional?: Pick<V6Profile, 'id' | 'full_name' | 'city'> & { phone?: string | null } | null;
  reserved_professional?: Pick<V6Profile, 'id' | 'full_name' | 'city'> & { phone?: string | null } | null;
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
  location_id?: string | null;
  required_specialty_id?: number | null;
  id: string;
  client_id: string;
  service_id: number;
  source_order_id: string | null;
  preferred_professional_id: string | null;
  preferred_professional_name?: string | null;
  service_name?: string;
  description: string;
  address: string;
  client_lat: number | null;
  client_lng: number | null;
  estimated_duration_minutes: number;
  anchor_at: string;
  generation_error: string | null;
  latest_order?: { id: string; status: V6OrderStatus; scheduled_at: string; manual_response_status: V6ManualResponseStatus | null } | null;
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

export type V6UserSecurityPreferences = {
  profile_id: string;
  account_type: 'particular' | 'empresa' | 'consorcio';
  tax_id: string | null;
  trusted_contact: string | null;
  hide_phone_in_chat: boolean;
  created_at: string;
  updated_at: string;
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
    | 'initiated'
    | 'pending'
    | 'awaiting_client_action'
    | 'reported'
    | 'confirmed'
    | 'disputed'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'refunded'
    | 'partially_refunded'
    | 'expired';
  payment_method: string | null;
  failure_reason: string | null;
  reported_at?: string | null;
  confirmed_at?: string | null;
  disputed_at?: string | null;
  reported_by?: string | null;
  confirmed_by?: string | null;
  disputed_by?: string | null;
  receipt_path?: string | null;
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
  trust_rating_avg?: number | null;
  trust_review_count?: number;
  trust_completed_jobs?: number;
  identity_reviewed?: boolean;
  professional_documents_reviewed?: boolean;
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
  available_from?: string | null;
  observation: string | null;
  status: 'sent' | 'accepted' | 'rejected' | 'expired';
  valid_until?: string | null;
  created_at: string;
  updated_at: string;
  professional?: Pick<V6Profile, 'id' | 'full_name' | 'city'> & {
    phone?: string | null;
    rating_avg?: number | null;
    jobs_completed?: number | null;
    verified?: boolean | null;
    manito_pro?: boolean | null;
    trust_rating_avg?: number | null;
    trust_review_count?: number | null;
    trust_completed_jobs?: number | null;
    identity_reviewed?: boolean | null;
    professional_documents_reviewed?: boolean | null;
  } | null;
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
  file_name: string | null;
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

export type V6ClaimType = 'work_quality' | 'incomplete_work' | 'damage' | 'unexpected_charge' | 'professional_conduct' | 'other';
export type V6ResolutionType = 'revisit' | 'correction' | 'replacement_professional' | 'credit' | 'partial_refund' | 'full_refund' | 'rejected' | 'other';

export type V6Complaint = {
  id: string;
  order_id: string;
  opened_by: string;
  reason: string;
  detail: string | null;
  status: 'open' | 'under_review' | 'awaiting_professional' | 'resolved' | 'rejected';
  claim_type: V6ClaimType | null;
  opened_by_role: 'client' | null;
  protection_window_days: number | null;
  professional_response: string | null;
  professional_responded_at: string | null;
  resolution_type: V6ResolutionType | null;
  resolution_amount: number | null;
  resolution_note: string | null;
  resolved_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type V6ComplaintEvidence = {
  id: string;
  complaint_id: string;
  uploaded_by: string;
  file_path: string;
  file_name: string;
  caption: string | null;
  created_at: string;
};

export type V6ComplaintContext = {
  complaint: V6Complaint;
  order: Pick<V6Order, 'id' | 'completed_at' | 'agreed_scope' | 'agreed_price' | 'accepted_proposal_id' | 'contract_snapshot' | 'cancelled_at' | 'cancellation_reason'>;
  proposal: V6OrderProposal | null;
  extras: V6OrderExtra[];
  order_evidence: V6OrderPhoto[];
  complaint_evidence: V6ComplaintEvidence[];
  payments: Pick<V6Payment, 'id' | 'amount' | 'status' | 'created_at'>[];
  payment_events: Array<{ id: string; event_type: string; created_at: string }>;
  messages: V6Message[];
  ratings: V6Rating[];
  events: Array<{ id: number; event_type: string; actor_id: string | null; from_status: V6Complaint['status'] | null; to_status: V6Complaint['status']; created_at: string }>;
};

export type V6AdminComplaintReview = V6Complaint & {
  service_name: string;
  order_status: V6OrderStatus;
  order_price: number | null;
  service_total: number | null;
  client_name: string;
  client_city: string | null;
  professional_name: string | null;
  professional_city: string | null;
};

export type V6AdminSetting = {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
};

export type V6AdminReviewStatus =
  | 'in_review'
  | 'approved'
  | 'observed'
  | 'rejected'
  | 'suspended';

export type V6AdminReviewService = {
  service_id: number;
  service_name: string;
  service_slug: string;
  price_from: number | null;
  specialties: Array<{
    specialty_id: number;
    specialty_name: string;
  }>;
};

export type V6AdminReviewDocument = Pick<
  V6ProfessionalDocument,
  'id' | 'kind' | 'label' | 'status' | 'file_path' | 'observation' | 'created_at' | 'updated_at'
> & {
  file_accessible?: boolean;
  format_allowed?: boolean;
};

export type V6AdminVerificationRequirement = {
  kind: string;
  label: string;
  category: 'identity' | 'professional';
};

export type V6AdminVerificationEvent = {
  id: number;
  document_id: string | null;
  event_type: 'onboarding_status' | 'document_status';
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};

export type V6AdminProfessionalReviewSummary = {
  professional_id: string;
  full_name: string;
  email: string | null;
  city: string | null;
  onboarding_status: V6ProfessionalOnboarding['status'];
  identity_status: 'verified' | 'requires_review' | 'requires_correction' | 'incomplete';
  professional_verification_status: 'verified' | 'requires_review' | 'requires_correction' | 'incomplete';
  queue_state: 'ready' | 'incomplete' | 'correction' | 'approved' | 'rejected';
  primary_service_name: string | null;
  service_names: string[];
  documents_present: number;
  documents_required: number;
  submitted_at: string | null;
  reviewed_at: string | null;
  onboarding_updated_at: string;
  total_count: number;
};

export type V6AdminProfessionalReview = {
  professional_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  is_available: boolean;
  onboarding_status: V6ProfessionalOnboarding['status'];
  current_step: number;
  onboarding_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  onboarding_updated_at: string | null;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  work_city: string | null;
  service_radius_km: number | null;
  work_days: string[] | null;
  work_starts_at: string | null;
  work_ends_at: string | null;
  insurance_label: string | null;
  verified: boolean;
  manito_pro: boolean;
  rating_avg: number;
  jobs_completed: number;
  services: V6AdminReviewService[];
  documents: V6AdminReviewDocument[];
  requirements?: V6AdminVerificationRequirement[];
  history?: V6AdminVerificationEvent[];
};

export type V6Message = {
  id: number;
  order_id: string;
  workroom_id: string;
  sender_id: string;
  body: string;
  kind: 'text' | 'image';
  file_path: string | null;
  file_name: string | null;
  client_nonce: string | null;
  created_at: string;
};

export type V6Workroom = {
  id: string;
  order_id: string;
  proposal_id: string | null;
  client_id: string;
  professional_id: string;
  phase: 'precontractual' | 'contracted';
  status: 'open' | 'read_only';
  last_activity_at: string;
  order_status: V6OrderStatus;
  mode: V6Mode;
  address: string;
  scheduled_at: string | null;
  description: string;
  agreed_price: number | null;
  estimated_price: number | null;
  contracted_at: string | null;
  service_name: string;
  counterpart_name: string;
  last_item: string | null;
  last_item_kind: V6Message['kind'] | null;
  last_item_at: string | null;
  unread_count: number;
};

export type V6WorkroomTimelineItem = {
  item_id: string;
  item_type: 'message' | 'event';
  created_at: string;
  sender_id: string | null;
  body: string | null;
  message_kind: V6Message['kind'] | null;
  file_path: string | null;
  file_name: string | null;
  event_kind: string | null;
  title: string | null;
  detail: string | null;
  action_key: string | null;
  entity_id: string | null;
  event_status: string | null;
};

export type V6WorkroomTimelinePage = {
  items: V6WorkroomTimelineItem[];
  has_more: boolean;
};

export type V6Notification = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  order_id: string | null;
  kind:
    | 'order_created'
    | 'order_status'
    | 'proposal_received'
    | 'extra_requested'
    | 'message_received'
    | 'payment_status'
    | 'appointment'
    | 'manual_request'
    | 'manual_request_expired'
    | 'manual_request_rejected'
    | 'manual_request_auto'
    | 'complaint_opened'
    | 'complaint_awaiting_professional'
    | 'complaint_response'
    | 'complaint_resolved';
  title: string;
  body: string;
  read_at: string | null;
  archived_at: string | null;
  action_key: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  dedupe_key: string | null;
  action_pending: boolean;
  created_at: string;
};

export type V6NotificationPage = {
  items: V6Notification[];
  total: number;
  unreadCount: number;
};

export const V6_STATUS_LABEL: Record<V6OrderStatus, string> = {
  open: 'Buscando profesional',
  scheduled_open: 'Buscando profesional para el día elegido',
  waiting_quotes: 'Esperando presupuestos',
  pending_client_confirmation: 'Esperando tu confirmación',
  payment_pending: 'Pago pendiente',
  accepted: 'Profesional confirmado',
  en_camino: 'Está en camino',
  en_sitio: 'El profesional llegó',
  trabajando: 'Trabajo en curso',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
  matching_failed: 'Sin profesional disponible',
};

export const V6_MODE_LABEL: Record<V6Mode, string> = {
  immediate: 'Ahora',
  scheduled: 'Programado',
  quote: 'Presupuesto',
};
