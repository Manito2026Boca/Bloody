import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { orderServiceTotal } from '../app/lib/economics';

const migration = readFileSync('supabase/migrations/20260922033840_blueprint_b08_supported_closure.sql', 'utf8').toLowerCase();
const app = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const closure = readFileSync('app/components/ClosureSummary.tsx', 'utf8');
const protection = readFileSync('app/components/ProtectionManito.tsx', 'utf8');
const api = readFileSync('app/lib/v6Api.ts', 'utf8');
const realtime = readFileSync('app/lib/v6OrderRealtime.ts', 'utf8');

describe('BLUEPRINT-B08 supported closure', () => {
  it('shows a shared economic checkpoint before the professional enters the final PIN', () => {
    expect(app.indexOf('<ClosureCheckpoint')).toBeLessThan(app.indexOf('className="v6-order-guidance"'));
    expect(closure).toContain('ANTES DE FINALIZAR');
    expect(closure).toContain('El PIN final confirma que el trabajo termino. El pago se registra por separado.');
  });

  it('keeps approved extras separate and derives the service total', () => {
    expect(orderServiceTotal(
      { agreed_price: 20_000, price: 20_000 } as never,
      [
        { amount: 2_500, status: 'approved' },
        { amount: 9_000, status: 'pending' },
        { amount: 4_000, status: 'rejected' },
      ] as never,
    )).toBe(22_500);
    expect(closure).toContain('order.agreed_price');
    expect(closure).toContain("extra.status === 'approved'");
  });

  it('keeps evidence conditional on the existing service configuration', () => {
    expect(app).toContain('order.service?.requires_completion_evidence');
    expect(closure).toContain('requires_completion_evidence');
    expect(closure).toContain("photo.stage === 'after'");
  });

  it('renders one stable final summary for both participants', () => {
    expect(app).toContain('<CompletedWorkSummary');
    expect(app).not.toMatch(/profile\.role === 'client'[\s\S]{0,80}<CompletedWorkSummary/);
    expect(closure).toContain('TRABAJO FINALIZADO');
    expect(closure).toContain('PIN final validado');
    expect(closure).toContain('El pago se registra por separado');
  });

  it('submits ratings through an authenticated, server-authoritative RPC', () => {
    expect(api).toContain(".rpc('submit_order_rating'");
    expect(migration).toContain('where o.id = p_order_id and o.client_id = v_uid');
    expect(migration).toContain("v_order.status <> 'completed'");
    expect(migration).toContain('v_order.professional_id');
    expect(migration).toContain('set search_path =');
  });

  it('makes rating submission idempotent and removes direct browser inserts', () => {
    expect(migration).toContain('on conflict (order_id, client_id) do nothing');
    expect(migration).toContain('revoke insert on public.ratings from authenticated');
    expect(migration).toContain('drop policy if exists ratings_client_insert');
    expect(api).not.toContain(".from('ratings')\n    .insert");
    expect(app).toContain('&& !rating &&');
  });

  it('does not expose the rating RPC to PUBLIC or anon', () => {
    expect(migration).toContain('revoke all on function public.submit_order_rating(uuid,integer,text) from public, anon, authenticated');
    expect(migration).toContain('grant execute on function public.submit_order_rating(uuid,integer,text) to authenticated');
  });

  it('preserves evidence, payment, completion, rating and protection in the timeline', () => {
    for (const source of ['from public.order_photos', 'from public.payments', 'from public.ratings', 'from public.complaint_events']) {
      expect(migration).toContain(source);
    }
    expect(migration).toContain("'completed', 'trabajo finalizado', 'pin final validado'");
    expect(migration).not.toContain('start_pin');
    expect(migration).not.toContain('end_pin');
  });

  it('updates closure and workroom views through existing realtime channels', () => {
    expect(realtime).toContain("'ratings'");
    expect(realtime).toContain("'complaints'");
    expect(app).toContain('listV6OrderRatings(order.id)');
  });

  it('uses the existing frozen Protection window and cautious promises', () => {
    expect(migration).toContain("'protection_window','existing_frozen_order_policy'");
    expect(protection).toContain('La revisión no garantiza una resolución específica.');
    expect(protection).toContain('Solicitar revisión');
  });

  it('gives Admin the contractual total including only approved extras', () => {
    expect(migration).toContain("e.status='approved'");
    expect(migration).toContain("'service_total'");
    expect(protection).toContain('item.service_total');
    expect(protection).toContain('Total del servicio:');
  });

  it('keeps terminal case data and investigation context visible', () => {
    expect(protection).toContain('Historial del caso');
    expect(protection).toContain('Evidencia del trabajo');
    expect(protection).toContain('Evidencia del reclamo');
    expect(protection).toContain('Resolver y cerrar');
  });
});

