export type ManitoPaymentMethod = 'card' | 'wallet' | 'cash';

export type ManitoPaymentCapabilityState = 'online' | 'manual' | 'coming_soon';

export type ManitoPaymentCapability = {
  id: ManitoPaymentMethod;
  label: string;
  state: ManitoPaymentCapabilityState;
  disabled: boolean;
  shortHint: string;
  detail: string;
};

export type MarketplacePaymentConfig = {
  onlineCardEnabled?: boolean;
  professionalCanReceiveOnlinePayments?: boolean;
  professionalHasWalletPaymentLink?: boolean;
};

export const mercadoPagoRequiredEnv = [
  'MERCADO_PAGO_CLIENT_ID',
  'MERCADO_PAGO_CLIENT_SECRET',
  'MERCADO_PAGO_REDIRECT_URI',
  'MERCADO_PAGO_WEBHOOK_SECRET',
] as const;

export function paymentCapabilities(config: MarketplacePaymentConfig = {}): ManitoPaymentCapability[] {
  const cardReady = Boolean(config.onlineCardEnabled && config.professionalCanReceiveOnlinePayments);
  const walletHasLink = Boolean(config.professionalHasWalletPaymentLink);

  return [
    {
      id: 'card',
      label: 'Tarjeta',
      state: cardReady ? 'online' : 'coming_soon',
      disabled: !cardReady,
      shortHint: cardReady ? 'Online' : 'Próximamente',
      detail: cardReady
        ? 'El cliente paga por Mercado Pago y MANITO confirma el cobro por webhook.'
        : 'Falta activar Mercado Pago marketplace y vincular la cuenta del profesional.',
    },
    {
      id: 'wallet',
      label: 'Cuenta DNI / billetera',
      state: 'manual',
      disabled: false,
      shortHint: walletHasLink ? 'QR/link cargado' : 'Manual',
      detail: walletHasLink
        ? 'El prestador ya dejó cargado un QR o link de cobro; el pago queda coordinado dentro del pedido.'
        : 'El prestador comparte QR o link por el chat y el cliente registra el pago en MANITO.',
    },
    {
      id: 'cash',
      label: 'Efectivo',
      state: 'manual',
      disabled: false,
      shortHint: 'Manual',
      detail: 'MANITO deja constancia del método, pero no confirma el dinero automáticamente.',
    },
  ];
}

export function missingMercadoPagoEnv(env: Record<string, string | undefined>) {
  return mercadoPagoRequiredEnv.filter((key) => !env[key]?.trim());
}

export function mercadoPagoReadiness(env: Record<string, string | undefined>) {
  const missingEnv = missingMercadoPagoEnv(env);

  return {
    enabled: missingEnv.length === 0,
    mode: missingEnv.length === 0 ? 'ready_for_integration' : 'not_configured',
    requiredEnv: [...mercadoPagoRequiredEnv],
    missingEnv,
  };
}
