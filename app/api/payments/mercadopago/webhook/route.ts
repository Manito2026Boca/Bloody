import { NextResponse } from 'next/server';

import { mercadoPagoReadiness } from '../../../../lib/paymentCapabilities';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const readiness = mercadoPagoReadiness(process.env);

  if (!readiness.enabled) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'mercado_pago_not_configured',
        missingEnv: readiness.missingEnv,
      },
      { status: 501 },
    );
  }

  await request.json().catch(() => null);

  return NextResponse.json(
    {
      ok: false,
      reason: 'webhook_validation_not_implemented',
    },
    { status: 501 },
  );
}
