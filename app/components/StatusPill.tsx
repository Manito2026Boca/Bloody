import type { OrderStatus, ProfessionalStatus } from '../lib/types';

type Props = {
  children: React.ReactNode;
  tone?: 'green' | 'orange' | 'blue' | 'red';
};

export function StatusPill({ children, tone = 'green' }: Props) {
  const className = tone === 'green' ? 'pill' : `pill ${tone}`;
  return <span className={className}>{children}</span>;
}

export function toneForOrder(status: OrderStatus): Props['tone'] {
  if (status === 'canceled' || status === 'claimed') return 'red';
  if (status === 'confirmed' || status === 'professional_en_route') {
    return 'blue';
  }
  if (status === 'completed' || status === 'paid') return 'green';
  return 'orange';
}

export function toneForProfessional(status: ProfessionalStatus): Props['tone'] {
  if (status === 'approved') return 'green';
  if (status === 'rejected' || status === 'suspended') return 'red';
  if (status === 'documents_observed') return 'orange';
  return 'blue';
}
