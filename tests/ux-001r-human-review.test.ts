import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const api = readFileSync('app/lib/v6Api.ts', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');
const migration = readFileSync('supabase/migrations/20260911170000_ux_001r_human_review_fixes.sql', 'utf8');
const retryFix = readFileSync('supabase/migrations/20260911180000_ux_001r_retry_single_dispatch.sql', 'utf8');

describe('UX-001R human review regressions', () => {
  it('makes the header location actionable and provides GPS confirmation plus manual fallback', () => {
    expect(app).toContain('onClick={() => setLocationEditorOpen(true)}');
    expect(app).toContain('Ubicación detectada');
    expect(app).toContain('Usar esta ubicación');
    expect(app).toContain('Ingresar ubicación manualmente');
    expect(app).toContain('reverseGeocodePhoneLocation(lat, lng)');
  });

  it('preserves PREP-MATCH location inputs and specialty', () => {
    expect(api).toContain("rpc('edit_uncontracted_order'");
    expect(api).toContain('required_specialty_id');
    expect(api).toContain('client_lat');
    expect(api).toContain('client_lng');
    expect(migration).toContain('private.order_professional_eligible(v_order, v_order.preferred_professional_id)');
  });

  it('only edits an owned request before contract and never edits active proposals', () => {
    expect(migration).toContain('v_order.client_id <> v_uid');
    expect(migration).toContain('v_order.contracted_at is not null');
    expect(migration).toContain("p.status = 'sent'");
    expect(migration).toContain("grant execute on function public.edit_uncontracted_order(uuid, jsonb) to authenticated");
    expect(migration).toContain('revoke all on function public.edit_uncontracted_order(uuid, jsonb) from public, anon');
  });

  it('gives matching retry visible feedback and guards duplicate submissions', () => {
    expect(app).toContain('retryingMatchingRef.current');
    expect(app).toContain('Buscando profesionales...');
    expect(app).toContain('Editar solicitud');
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended(p_order_id::text, 607))');
    expect(migration).toContain("interval '2 seconds'");
    expect(retryFix).toContain("matching_status = 'idle'");
    expect(retryFix).not.toContain('start_immediate_matching_round_impl');
  });

  it('does not produce generic notifications for internal matching transitions', () => {
    expect(migration).toContain("new.status in ('open', 'scheduled_open', 'waiting_quotes', 'matching_failed')");
    expect(migration).not.toContain("else 'Pedido actualizado'");
  });

  it('uses progressive disclosure and immediate visual state for professional services', () => {
    expect(app).toContain('Servicios seleccionados');
    expect(app).toContain('+ Agregar servicio');
    expect(app).toContain('setProServices(nextServiceIds.map');
    expect(app).toContain('setProServices(previousServices)');
    expect(app).toContain('Guardando cambios...');
  });

  it('shows useful agenda empty and configured states', () => {
    expect(app).toContain('Todavía no configuraste tus horarios.');
    expect(app).toContain('Configurar horarios');
    expect(app).not.toContain("'--:--'");
  });

  it('contains responsive protections for money, sheets and bottom navigation', () => {
    expect(css).toContain('white-space: nowrap');
    expect(css).toContain('100dvh');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('.v6-notification-panel');
  });
});
