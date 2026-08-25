export type WorkspaceRole = 'client' | 'professional' | 'company' | 'admin';

export type ServiceMode = 'immediate' | 'scheduled' | 'quote';

export type ProfessionalStatus =
  | 'incomplete'
  | 'submitted'
  | 'in_review'
  | 'documents_observed'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type OrderStatus =
  | 'requested'
  | 'searching_professional'
  | 'confirmed'
  | 'professional_en_route'
  | 'professional_arrived'
  | 'work_started'
  | 'waiting_extra_approval'
  | 'completed'
  | 'paid'
  | 'canceled'
  | 'claimed';

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  birth_date: string | null;
  dni: string | null;
  default_workspace: WorkspaceRole;
  app_role: WorkspaceRole;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  supports_immediate: boolean;
  supports_scheduled: boolean;
  supports_quote: boolean;
  base_visit_price_cents: number | null;
};

export type ProfessionalProfile = {
  id: string;
  public_name: string;
  bio: string | null;
  years_experience: number | null;
  city: string | null;
  service_radius_km: number;
  rating_avg: number;
  jobs_completed: number;
  status: ProfessionalStatus;
  is_available: boolean;
  manito_pro: boolean;
};

export type Order = {
  id: string;
  client_id: string;
  category_id: string;
  specialty_id: string | null;
  assigned_professional_id: string | null;
  service_mode: ServiceMode;
  status: OrderStatus;
  problem_description: string;
  address_line: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  scheduled_for: string | null;
  estimated_price_cents: number | null;
  final_price_cents: number | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  order_id: string;
  sender_id: string;
  body: string;
  image_path: string | null;
  created_at: string;
};

export type Review = {
  id: string;
  order_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating_general: number;
  punctuality: number | null;
  quality: number | null;
  cleanliness: number | null;
  price_fairness: number | null;
  comment: string | null;
  created_at: string;
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  requested: 'Solicitado',
  searching_professional: 'Buscando profesional',
  confirmed: 'Confirmado',
  professional_en_route: 'Profesional en camino',
  professional_arrived: 'Profesional llego',
  work_started: 'Trabajo iniciado',
  waiting_extra_approval: 'Esperando adicional',
  completed: 'Trabajo finalizado',
  paid: 'Pagado',
  canceled: 'Cancelado',
  claimed: 'Reclamado',
};

export const SERVICE_MODE_LABEL: Record<ServiceMode, string> = {
  immediate: 'Inmediato',
  scheduled: 'Programado',
  quote: 'Presupuesto',
};
