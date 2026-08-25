'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getV6Supabase } from './v6Supabase';
import type {
  V6Message,
  V6Mode,
  V6Order,
  V6Profile,
  V6ProfessionalService,
  V6Role,
  V6Service,
} from './v6Types';

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
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
  patch: Pick<V6Profile, 'full_name' | 'phone' | 'city'>,
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

export async function listV6ProfessionalServices(userId: string) {
  const { data, error } = await getV6Supabase()
    .from('professional_services')
    .select('*')
    .eq('professional_id', userId);
  fail(error);
  return (data || []) as V6ProfessionalService[];
}

export async function saveV6ProfessionalServices(
  userId: string,
  serviceIds: number[],
  services: V6Service[],
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
      services.find((service) => service.id === serviceId)?.base_price || null,
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
  scheduledAt: string | null;
  price: number | null;
  lat: number | null;
  lng: number | null;
}) {
  const { data, error } = await getV6Supabase()
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
