import { NextResponse } from 'next/server';

import { mercadoPagoReadiness } from '../../../../lib/paymentCapabilities';

export const dynamic = 'force-dynamic';

export function GET() {
  const readiness = mercadoPagoReadiness(process.env);

  return NextResponse.json(
    {
      ok: false,
      reason: readiness.enabled ? 'oauth_callback_not_implemented' : 'mercado_pago_not_configured',
      missingEnv: readiness.missingEnv,
    },
    { status: 501 },
  );
}
