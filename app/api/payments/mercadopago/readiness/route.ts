import { NextResponse } from 'next/server';

import { mercadoPagoReadiness } from '../../../../lib/paymentCapabilities';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(mercadoPagoReadiness(process.env));
}
