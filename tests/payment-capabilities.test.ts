import { describe, expect, it } from 'vitest';

import {
  mercadoPagoReadiness,
  missingMercadoPagoEnv,
  paymentCapabilities,
} from '../app/lib/paymentCapabilities';

describe('payment capabilities', () => {
  it('keeps card disabled until marketplace and professional account are ready', () => {
    expect(paymentCapabilities()[0]).toMatchObject({
      id: 'card',
      state: 'coming_soon',
      disabled: true,
    });

    expect(paymentCapabilities({ onlineCardEnabled: true })[0]).toMatchObject({
      id: 'card',
      state: 'coming_soon',
      disabled: true,
    });

    expect(
      paymentCapabilities({
        onlineCardEnabled: true,
        professionalCanReceiveOnlinePayments: true,
      })[0],
    ).toMatchObject({
      id: 'card',
      state: 'online',
      disabled: false,
    });
  });

  it('shows wallet and cash as manual beta flows', () => {
    const methods = paymentCapabilities({ professionalHasWalletPaymentLink: true });

    expect(methods.find((method) => method.id === 'wallet')).toMatchObject({
      state: 'manual',
      disabled: false,
      shortHint: 'QR/link cargado',
    });
    expect(methods.find((method) => method.id === 'cash')).toMatchObject({
      state: 'manual',
      disabled: false,
    });
  });

  it('reports Mercado Pago readiness without exposing secret values', () => {
    expect(missingMercadoPagoEnv({ MERCADO_PAGO_CLIENT_ID: 'abc' })).toEqual([
      'MERCADO_PAGO_CLIENT_SECRET',
      'MERCADO_PAGO_REDIRECT_URI',
      'MERCADO_PAGO_WEBHOOK_SECRET',
    ]);

    expect(
      mercadoPagoReadiness({
        MERCADO_PAGO_CLIENT_ID: 'client',
        MERCADO_PAGO_CLIENT_SECRET: 'secret',
        MERCADO_PAGO_REDIRECT_URI: 'https://example.com/callback',
        MERCADO_PAGO_WEBHOOK_SECRET: 'webhook',
      }),
    ).toMatchObject({
      enabled: true,
      mode: 'ready_for_integration',
      missingEnv: [],
    });
  });
});
