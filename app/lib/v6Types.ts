export type V6Role = 'client' | 'professional' | 'admin';

export type V6Mode = 'immediate' | 'scheduled' | 'quote';

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
