import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const api = readFileSync('app/lib/v6Api.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260914143000_ux_001r_final_client_addresses.sql', 'utf8');
const opportunityMigration = readFileSync('supabase/migrations/20260915023000_ux_001r_final_opportunity_specialty.sql', 'utf8');
const paymentNotificationMigration = readFileSync('supabase/migrations/20260915120000_ux_001r_final_payment_notifications.sql', 'utf8');

describe('UX-001R final refinement', () => {
  it('keeps a durable client default address separate from each order location', () => {
    expect(app).toContain('accountAddresses={clientAddresses}');
    expect(app).toContain("locationAuthority === 'saved'");
    expect(app).toContain('Cada trabajo conserva su propia ubicación.');
    expect(api).toContain("rpc('upsert_client_address'");
    expect(app).toContain('accountAddressHydrated.current');
    expect(app).toContain("setLocationAuthority('saved')");
    expect(app).toContain('geocodeManualLocation(input.line, input.city)');
  });

  it('maintains exactly one default address atomically for the authenticated owner', () => {
    expect(migration).toContain('client_addresses_one_default_per_client');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('v_existing.client_id <> v_uid');
    expect(migration).toContain('revoke all on function public.upsert_client_address(jsonb) from public, anon');
  });

  it('never promotes an order GPS choice into the account default automatically', () => {
    const captureLocation = app.slice(app.indexOf('async function captureLocation()'), app.indexOf('function confirmDetectedPhoneLocation()'));
    expect(captureLocation).not.toContain('upsertV6ClientAddress');
    expect(captureLocation).not.toContain('onAddressesChange');
  });

  it('reapplies the latest default address for every new request and rehydrates edits', () => {
    expect(app).toContain('function applyDefaultOrderAddress()');
    const recommendation = app.slice(app.indexOf('function applyRecommendation'), app.indexOf('function applyExample'));
    const chooseService = app.slice(app.indexOf('function chooseService'), app.indexOf('async function nextRequestStep'));
    expect(recommendation).toContain('if (!editingOrder) applyDefaultOrderAddress()');
    expect(chooseService).toContain('if (!editingOrder) applyDefaultOrderAddress()');
    expect(app).toContain('hydratedEditingOrderId.current === editingOrder.id');
    expect(app).toContain('setAddress(parsedAddress.line)');
    expect(app).toContain('setSelectedProfessionalId(editingOrder.preferred_professional_id');
  });

  it('surfaces direct requests in both professional Today and Jobs', () => {
    expect(app).toContain('NECESITA TU RESPUESTA');
    expect(app).toContain('NECESITAN RESPUESTA');
    expect(app).toContain('professionalWorkOrders');
    expect(app).toContain('manualRequestCanBeRejectedBy');
    expect(opportunityMigration).toContain('o.required_specialty_id');
    expect(opportunityMigration).toContain("revoke all on function public.list_professional_opportunities() from public, anon");
    expect(api).toContain('function singleRpcRow');
    expect(api).toContain("singleRpcRow(data as V6Order | V6Order[] | null, 'No se pudo confirmar el trabajo aceptado.')");
    expect(app).toContain('refreshedOrders.find((order) => order.id === acceptedOrder.id) || acceptedOrder');
  });

  it('makes direct-request notifications navigate to the owning work item', () => {
    expect(app).toContain('setFocusedOrderId(orderId)');
    expect(app).toContain('data-order-id={order.id}');
    expect(app).toContain("setAppMode('professional')");
  });

  it('clears identity-bound state and realtime channels when the account changes', () => {
    expect(app).toContain('const userChanged = lastAuthUser.current !== nextUserId');
    expect(app).toContain('void supabase.removeAllChannels()');
    expect(app).toContain('setClientAddresses([])');
    expect(app).toContain("setAppMode('client')");
  });

  it('keeps retry single-flight and exposes recovery when matching finds nobody', () => {
    expect(app).toContain('if (retryingMatchingRef.current) return');
    expect(app).toContain('No encontramos profesionales disponibles.');
    expect(app).toContain('Reintentar búsqueda');
    expect(app).toContain('Editar solicitud');
  });

  it('uses a mobile-safe inline PIN entry instead of a browser prompt', () => {
    const advance = app.slice(app.indexOf('async function advance()'), app.indexOf('async function cancel('));
    expect(advance).not.toContain('window.prompt');
    expect(app).toContain('className="v6-pin-entry"');
    expect(app).toContain('inputMode="numeric"');
    expect(app).toContain('Validar PIN');
  });

  it('asks for completion evidence only when the selected service requires it', () => {
    expect(app).toContain('order.service?.requires_completion_evidence');
    expect(app).toContain('Al terminar, pedí al cliente el PIN final.');
  });

  it('keeps manual payment notifications specific and generated once at the RPC boundary', () => {
    expect(paymentNotificationMigration).toContain("new.payment_method in ('cash', 'wallet', 'transfer')");
    expect(paymentNotificationMigration).toContain("new.payment_status in ('pending', 'paid')");
    expect(paymentNotificationMigration).toContain("n.title = 'Pago actualizado'");
    expect(paymentNotificationMigration).toContain('revoke all on function private.notify_order_status_change() from public, anon, authenticated');
  });
});
