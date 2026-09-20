import type { V6Order, V6Workroom } from './v6Types';

export type ProfessionalOrderBucket = 'active' | 'upcoming' | 'history';

const executionPriority: Partial<Record<V6Order['status'], number>> = {
  trabajando: 0,
  en_sitio: 1,
  en_camino: 2,
  payment_pending: 3,
  pending_client_confirmation: 4,
  accepted: 5,
};

export function professionalOrderBucket(order: V6Order, now = Date.now()): ProfessionalOrderBucket {
  if (order.status === 'completed' || order.status === 'cancelled') return 'history';
  const scheduledAt = order.scheduled_at ? new Date(order.scheduled_at).getTime() : Number.NaN;
  if (
    Number.isFinite(scheduledAt) &&
    scheduledAt > now &&
    ['accepted', 'pending_client_confirmation', 'payment_pending'].includes(order.status)
  ) {
    return 'upcoming';
  }
  return 'active';
}

export function compareProfessionalOrders(left: V6Order, right: V6Order) {
  const priority = (executionPriority[left.status] ?? 20) - (executionPriority[right.status] ?? 20);
  if (priority) return priority;
  const leftDate = new Date(left.scheduled_at || left.created_at).getTime();
  const rightDate = new Date(right.scheduled_at || right.created_at).getTime();
  return leftDate - rightDate;
}

export function professionalPrimaryActionLabel(order: V6Order) {
  if (order.status === 'accepted') return 'Ir al trabajo';
  if (order.status === 'en_camino') return 'Avisar llegada';
  if (order.status === 'en_sitio') return 'Iniciar trabajo';
  if (order.status === 'trabajando') return 'Finalizar trabajo';
  if (order.status === 'payment_pending') return 'Ver pago pendiente';
  if (order.status === 'pending_client_confirmation') return 'Ver reserva';
  return 'Ver trabajo';
}

export function professionalEconomicState(order: V6Order) {
  if (order.payment_status === 'paid') return 'Pago confirmado';
  if (order.payment_status === 'pending' || order.payment_status === 'authorized') return 'Pago pendiente';
  if (order.payment_status === 'rejected') return 'Pago en revisión';
  if (order.payment_status === 'refunded' || order.payment_status === 'partially_refunded') return 'Pago reintegrado';
  return order.agreed_price != null || order.contracted_at ? 'Precio acordado' : 'Importe estimado';
}

export function proposalWorkroomState(room: V6Workroom) {
  if (room.phase === 'contracted') return 'Propuesta aceptada';
  if (room.status === 'open') return 'Esperando al cliente';
  if (room.order_status === 'waiting_quotes' || room.order_status === 'open') return 'Propuesta vencida';
  if (room.order_status === 'cancelled') return 'Solicitud cerrada';
  return 'Propuesta no elegida';
}

export function workroomForOrder(workrooms: V6Workroom[], orderId: string) {
  return workrooms.find((room) => room.order_id === orderId && room.phase === 'contracted')
    || workrooms.find((room) => room.order_id === orderId)
    || null;
}
