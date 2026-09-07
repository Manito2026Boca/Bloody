import type { V6ClaimType, V6Complaint, V6Order, V6ResolutionType } from './v6Types';

export const claimLabels: Record<V6ClaimType, string> = {
  work_quality: 'Problema con la calidad del trabajo',
  incomplete_work: 'Trabajo incompleto',
  damage: 'Daño',
  unexpected_charge: 'Cobro no acordado',
  professional_conduct: 'Conducta del profesional',
  other: 'Otro',
};
export const complaintStatusLabels: Record<V6Complaint['status'], string> = {
  open: 'Abierto', under_review: 'En revisión', awaiting_professional: 'Esperando respuesta del profesional',
  resolved: 'Resuelto', rejected: 'No corresponde / Rechazado',
};
export const resolutionLabels: Record<V6ResolutionType, string> = {
  revisit: 'Revisita', correction: 'Corrección', replacement_professional: 'Profesional reemplazante',
  credit: 'Crédito', partial_refund: 'Devolución parcial', full_refund: 'Devolución total', rejected: 'Rechazado', other: 'Otra resolución',
};
export const isTerminalComplaint = (status: V6Complaint['status']) => status === 'resolved' || status === 'rejected';
export const isMonetaryResolution = (type: V6ResolutionType | null) => type !== null && ['credit', 'partial_refund', 'full_refund'].includes(type);

export function protectionDeadline(order: Pick<V6Order, 'status' | 'completed_at' | 'protection_window_days'>): number | null {
  if (order.status !== 'completed' || !order.completed_at || order.protection_window_days == null) return null;
  const days = order.protection_window_days;
  const completed = Date.parse(order.completed_at);
  if (!Number.isFinite(completed) || !Number.isInteger(days) || days < 0) return null;
  return completed + days * 86400000;
}

export function canOpenProtection(order: V6Order, userId: string, cases: V6Complaint[], now = Date.now()) {
  const deadline = protectionDeadline(order);
  return order.client_id === userId && deadline !== null && deadline > now &&
    !cases.some((item) => !isTerminalComplaint(item.status));
}
