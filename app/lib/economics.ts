import type { V6Order, V6OrderExtra } from './v6Types';

export const legacyOrderPriceNote =
  'orders.price is a legacy compatibility amount; use estimated_price for estimates and agreed_price for contracts.';

export function orderEstimatedAmount(order: Pick<V6Order, 'estimated_price' | 'price' | 'service'>) {
  return order.estimated_price ?? order.price ?? order.service?.base_price ?? null;
}

export function orderContractAmount(order: Pick<V6Order, 'agreed_price' | 'price'>) {
  return order.agreed_price ?? order.price ?? null;
}

export function approvedExtrasTotal(extras: Array<Pick<V6OrderExtra, 'amount' | 'status'>>) {
  return extras
    .filter((extra) => extra.status === 'approved')
    .reduce((total, extra) => total + Number(extra.amount || 0), 0);
}

export function orderServiceTotal(
  order: Pick<V6Order, 'agreed_price' | 'price'>,
  extras: Array<Pick<V6OrderExtra, 'amount' | 'status'>> = [],
) {
  const base = orderContractAmount(order);
  if (base == null) return null;
  return Number(base) + approvedExtrasTotal(extras);
}

export function orderDisplayAmount(
  order: Pick<V6Order, 'agreed_price' | 'estimated_price' | 'price' | 'service'>,
) {
  return order.agreed_price ?? order.estimated_price ?? order.price ?? order.service?.base_price ?? null;
}

function policyNumber(policy: Record<string, unknown> | null | undefined, key: string) {
  const value = policy?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function orderCommissionAmount(
  order: Pick<V6Order, 'pricing_policy_snapshot' | 'agreed_price' | 'price'>,
  extras: Array<Pick<V6OrderExtra, 'amount' | 'status'>> = [],
) {
  const total = orderServiceTotal(order, extras);
  if (total == null) return 0;
  return Math.round((total * policyNumber(order.pricing_policy_snapshot, 'commission_percent')) / 100);
}
