'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { requireSupabase } from './supabaseClient';
import type {
  Category,
  Message,
  Order,
  OrderStatus,
  ProfessionalProfile,
  Profile,
  ServiceMode,
} from './types';

export type CreateOrderInput = {
  userId: string;
  categoryId: string;
  serviceMode: ServiceMode;
  description: string;
  addressLine: string;
  city: string;
  lat: number | null;
  lng: number | null;
  scheduledFor: string | null;
  estimatedPriceCents: number | null;
};

export type ProfessionalOnboardingInput = {
  publicName: string;
  bio: string;
  yearsExperience: number;
  city: string;
  radiusKm: number;
  categoryIds: string[];
  priceFromCents: number;
  visitPriceCents: number;
};

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('Supabase no devolvio datos.');
  return data;
}

export async function getProfile(userId: string) {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as Profile | null;
}

export async function updateProfile(userId: string, patch: Partial<Profile>) {
  const allowedPatch = {
    first_name: patch.first_name,
    last_name: patch.last_name,
    phone: patch.phone,
    avatar_url: patch.avatar_url,
    birth_date: patch.birth_date,
    dni: patch.dni,
    default_workspace: patch.default_workspace,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await requireSupabase()
    .from('profiles')
    .update(allowedPatch)
    .eq('id', userId)
    .select('*')
    .single();

  return unwrap(data as Profile | null, error);
}

export async function listCategories() {
  const { data, error } = await requireSupabase()
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
}

export async function createOrder(input: CreateOrderInput) {
  const { data, error } = await requireSupabase()
    .from('orders')
    .insert({
      client_id: input.userId,
      category_id: input.categoryId,
      service_mode: input.serviceMode,
      status: 'searching_professional',
      problem_description: input.description,
      address_line: input.addressLine,
      city: input.city,
      lat: input.lat,
      lng: input.lng,
      scheduled_for: input.scheduledFor,
      estimated_price_cents: input.estimatedPriceCents,
    })
    .select('*')
    .single();

  return unwrap(data as Order | null, error);
}

export async function listClientOrders(userId: string) {
  const { data, error } = await requireSupabase()
    .from('orders')
    .select('*')
    .eq('client_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function listOpenOrders() {
  const { data, error } = await requireSupabase()
    .from('orders')
    .select('*')
    .eq('status', 'searching_professional')
    .is('assigned_professional_id', null)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function listAssignedOrders(userId: string) {
  const { data, error } = await requireSupabase()
    .from('orders')
    .select('*')
    .eq('assigned_professional_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function getProfessionalProfile(userId: string) {
  const { data, error } = await requireSupabase()
    .from('professional_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ProfessionalProfile | null;
}

export async function submitProfessionalProfile(
  input: ProfessionalOnboardingInput,
) {
  const { data, error } = await requireSupabase().rpc(
    'submit_professional_profile',
    {
      p_public_name: input.publicName,
      p_bio: input.bio,
      p_years_experience: input.yearsExperience,
      p_city: input.city,
      p_radius_km: input.radiusKm,
      p_category_ids: input.categoryIds,
      p_price_from_cents: input.priceFromCents,
      p_visit_price_cents: input.visitPriceCents,
    },
  );

  return unwrap(data as ProfessionalProfile | null, error);
}

export async function setProfessionalAvailability(isAvailable: boolean) {
  const { data, error } = await requireSupabase().rpc(
    'set_professional_available',
    {
      p_is_available: isAvailable,
    },
  );

  return unwrap(data as ProfessionalProfile | null, error);
}

export async function acceptOrder(orderId: string) {
  const { data, error } = await requireSupabase().rpc('accept_order', {
    p_order_id: orderId,
  });

  return unwrap(data as Order | null, error);
}

export async function advanceOrder(orderId: string, status: OrderStatus) {
  const { data, error } = await requireSupabase().rpc('advance_order_status', {
    p_order_id: orderId,
    p_status: status,
  });

  return unwrap(data as Order | null, error);
}

export async function adminReviewProfessional(
  professionalId: string,
  status: 'approved' | 'rejected' | 'documents_observed' | 'suspended',
) {
  const { data, error } = await requireSupabase().rpc(
    'admin_review_professional',
    {
      p_professional_id: professionalId,
      p_status: status,
    },
  );

  return unwrap(data as ProfessionalProfile | null, error);
}

export async function listPendingProfessionals() {
  const { data, error } = await requireSupabase()
    .from('professional_profiles')
    .select('*')
    .in('status', ['submitted', 'in_review', 'documents_observed'])
    .order('submitted_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ProfessionalProfile[];
}

export async function listAdminOrders() {
  const { data, error } = await requireSupabase()
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function listMessages(orderId: string) {
  const { data, error } = await requireSupabase()
    .from('messages')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function sendMessage(
  orderId: string,
  senderId: string,
  body: string,
) {
  const { data, error } = await requireSupabase()
    .from('messages')
    .insert({
      order_id: orderId,
      sender_id: senderId,
      body,
    })
    .select('*')
    .single();

  return unwrap(data as Message | null, error);
}

export function subscribeToOrder(
  orderId: string,
  onChange: (order: Order) => void,
) {
  const channel = requireSupabase()
    .channel(`order-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      (payload) => onChange(payload.new as Order),
    )
    .subscribe();

  return channel;
}

export function subscribeToOrders(onChange: () => void) {
  const channel = requireSupabase()
    .channel('orders-feed')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
      },
      onChange,
    )
    .subscribe();

  return channel;
}

export function subscribeToMessages(
  orderId: string,
  onInsert: (message: Message) => void,
) {
  const channel = requireSupabase()
    .channel(`messages-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `order_id=eq.${orderId}`,
      },
      (payload) => onInsert(payload.new as Message),
    )
    .subscribe();

  return channel;
}

export function removeChannel(channel: RealtimeChannel | null) {
  if (channel) {
    void requireSupabase().removeChannel(channel);
  }
}
