import type { V6Order, V6OrderStatus, V6Role } from './v6Types';

export type ProfessionalOrderAction =
  | { kind: 'wait_payment'; label: 'Esperando pago' }
  | { kind: 'mark_en_route'; label: 'Salir hacia domicilio' }
  | { kind: 'mark_arrived'; label: 'Marcar llegada' }
  | { kind: 'start_with_pin'; label: 'Ingresar PIN inicio'; prompt: string }
  | { kind: 'complete_with_pin'; label: 'Ingresar PIN final'; prompt: string }
  | { kind: 'none'; label: 'Finalizar trabajo' };

export const orderStatusFlow: V6OrderStatus[] = [
  'payment_pending',
  'accepted',
  'en_camino',
  'en_sitio',
  'trabajando',
  'completed',
];

export function nextProfessionalOrderAction(status: V6OrderStatus): ProfessionalOrderAction {
  if (status === 'payment_pending') return { kind: 'wait_payment', label: 'Esperando pago' };
  if (status === 'accepted') return { kind: 'mark_en_route', label: 'Salir hacia domicilio' };
  if (status === 'en_camino') return { kind: 'mark_arrived', label: 'Marcar llegada' };
  if (status === 'en_sitio') {
    return {
      kind: 'start_with_pin',
      label: 'Ingresar PIN inicio',
      prompt: 'Pedile al cliente el PIN de inicio para comenzar el trabajo.',
    };
  }
  if (status === 'trabajando') {
    return {
      kind: 'complete_with_pin',
      label: 'Ingresar PIN final',
      prompt: 'Pedile al cliente el PIN final para cerrar el trabajo.',
    };
  }
  return { kind: 'none', label: 'Finalizar trabajo' };
}

export function canProfessionalAdvanceOrder(order: V6Order, profileId: string) {
  return (
    order.professional_id === profileId &&
    !['completed', 'cancelled', 'payment_pending'].includes(order.status)
  );
}

export function visibleClientPin(order: Pick<V6Order, 'status' | 'start_pin' | 'end_pin'>, role: V6Role) {
  if (role !== 'client') return null;
  if (order.status === 'en_sitio') {
    return { label: 'PIN inicio', value: order.start_pin || 'pendiente' };
  }
  if (order.status === 'trabajando') {
    return { label: 'PIN final', value: order.end_pin || 'pendiente' };
  }
  return null;
}
