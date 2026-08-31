import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260831100000_norm_005_scheduled_reservation_guard.sql'),
  'utf8',
).toLowerCase();

const component = readFileSync(
  join(process.cwd(), 'app/components/ManitoV6App.tsx'),
  'utf8',
).toLowerCase();

const api = readFileSync(
  join(process.cwd(), 'app/lib/v6Api.ts'),
  'utf8',
).toLowerCase();

function blockBetween(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('NORM-005 scheduled reservation guard', () => {
  it('normalizes scheduled orders with duration, end and scheduling policy defaults', () => {
    expect(migration).toContain('estimated_duration_minutes integer');
    expect(migration).toContain('scheduled_end timestamptz');
    expect(migration).toContain("'default_duration_minutes', 120");
    expect(migration).toContain("'schedule_buffer_minutes', 0");
    expect(migration).toContain('admin_settings');
    expect(migration).toContain("key = 'scheduling'");
  });

  it('derives scheduled_end through a backend trigger instead of trusting user input', () => {
    const triggerBlock = blockBetween(
      'create or replace function private.set_order_schedule_bounds',
      'update public.orders o',
    );

    expect(triggerBlock).toContain("new.mode = 'scheduled' and new.scheduled_at is null");
    expect(triggerBlock).toContain('new.estimated_duration_minutes := greatest');
    expect(triggerBlock).toContain('new.scheduled_end := private.schedule_end_from');
    expect(migration).toContain('create trigger trg_orders_schedule_bounds');
  });

  it('backfills legacy scheduled orders conservatively', () => {
    expect(migration).toContain('where o.scheduled_at is not null');
    expect(migration).toContain('coalesce(o.estimated_duration_minutes, o.eta_minutes, private.schedule_default_duration_minutes())');
    expect(migration).toContain('private.schedule_end_from');
  });

  it('keeps Ahora dependent on current availability but not Programar', () => {
    const acceptBlock = blockBetween(
      'create or replace function private.accept_order_impl',
      'create or replace function private.accept_proposal_impl',
    );
    const opportunitiesBlock = blockBetween(
      'create function public.list_professional_opportunities',
      'revoke all on function public.accept_order',
    );

    expect(acceptBlock).toContain("o.mode <> 'immediate' or exists");
    expect(acceptBlock).toContain('p.is_available = true');
    expect(acceptBlock).toContain("o.mode <> 'scheduled'");
    expect(opportunitiesBlock).toContain("o.mode <> 'immediate' or v_profile.is_available = true");
    expect(opportunitiesBlock).toContain('private.professional_schedule_contains');
  });

  it('validates full scheduled slots against work day and work hours', () => {
    const containsBlock = blockBetween(
      'create or replace function private.professional_schedule_contains',
      'create or replace function private.professional_has_schedule_conflict',
    );

    expect(containsBlock).toContain("array['lun','mar','mie','jue','vie']::text[]");
    expect(containsBlock).toContain("at time zone 'america/argentina/buenos_aires'");
    expect(containsBlock).toContain('>= coalesce(pp.work_starts_at');
    expect(containsBlock).toContain('<= coalesce(pp.work_ends_at');
    expect(containsBlock).toContain('p_end > p_start');
  });

  it('detects overlaps with the required formula and configurable buffer', () => {
    const conflictBlock = blockBetween(
      'create or replace function private.professional_has_schedule_conflict',
      'create or replace function private.set_order_schedule_bounds',
    );

    expect(conflictBlock).toContain("o.status in ('payment_pending', 'accepted', 'en_camino', 'en_sitio', 'trabajando')");
    expect(conflictBlock).toContain('p_start < (');
    expect(conflictBlock).toContain('p_end > (');
    expect(conflictBlock).toContain('private.schedule_buffer_minutes()');
    expect(conflictBlock).not.toContain("'completed'");
    expect(conflictBlock).not.toContain("'cancelled'");
  });

  it('serializes scheduled accepts per professional to avoid race double booking', () => {
    const acceptBlock = blockBetween(
      'create or replace function private.accept_order_impl',
      'create or replace function private.accept_proposal_impl',
    );
    const proposalBlock = blockBetween(
      'create or replace function private.accept_proposal_impl',
      'drop function if exists public.accept_order',
    );

    expect(acceptBlock).toContain('pg_advisory_xact_lock(hashtextextended(v_uid::text, 0))');
    expect(proposalBlock).toContain('pg_advisory_xact_lock(hashtextextended(v_proposal.professional_id::text, 0))');
  });

  it('uses the same backend conflict boundary for direct accepts and accepted proposals', () => {
    const acceptBlock = blockBetween(
      'create or replace function private.accept_order_impl',
      'create or replace function private.accept_proposal_impl',
    );
    const proposalBlock = blockBetween(
      'create or replace function private.accept_proposal_impl',
      'drop function if exists public.accept_order',
    );

    expect(acceptBlock).toContain('private.professional_has_schedule_conflict');
    expect(acceptBlock).toContain('ya tenes otro trabajo programado en ese horario');
    expect(proposalBlock).toContain('private.professional_has_schedule_conflict');
    expect(proposalBlock).toContain('el profesional ya tiene otro trabajo programado en ese horario');
  });

  it('filters professional opportunities by service, zone, complete schedule and conflict', () => {
    const opportunitiesBlock = blockBetween(
      'create function public.list_professional_opportunities',
      'revoke all on function public.accept_order',
    );

    expect(opportunitiesBlock).toContain('join public.professional_services ps');
    expect(opportunitiesBlock).toContain('ps.service_id = o.service_id');
    expect(opportunitiesBlock).toContain('private.distance_km');
    expect(opportunitiesBlock).toContain('private.professional_schedule_contains');
    expect(opportunitiesBlock).toContain('not private.professional_has_schedule_conflict');
  });

  it('keeps public RPC wrappers safe and adds only non-secret schedule fields', () => {
    const wrapperBlock = blockBetween(
      'create function public.accept_order',
      'drop function if exists public.list_professional_opportunities',
    );

    expect(wrapperBlock).toContain('estimated_duration_minutes integer');
    expect(wrapperBlock).toContain('scheduled_end timestamptz');
    expect(wrapperBlock).not.toContain('start_pin');
    expect(wrapperBlock).not.toContain('end_pin');
    expect(migration).toContain('revoke all on function public.accept_order(uuid) from public, anon');
    expect(migration).toContain('grant execute on function public.accept_order(uuid) to authenticated');
  });

  it('keeps Realtime orders explicit and still excludes PINs', () => {
    const realtimeBlock = migration.slice(migration.indexOf('alter publication supabase_realtime add table public.orders'));

    expect(realtimeBlock).toContain('estimated_duration_minutes');
    expect(realtimeBlock).toContain('scheduled_end');
    expect(realtimeBlock).not.toContain('start_pin');
    expect(realtimeBlock).not.toContain('end_pin');
  });

  it('updates the frontend API surface without making frontend the authority', () => {
    expect(api).toContain("'estimated_duration_minutes'");
    expect(api).toContain("'scheduled_end'");
    expect(api).toContain('estimateddurationminutes?: number | null');
    expect(api).toContain('estimated_duration_minutes: input.estimateddurationminutes || null');
    expect(component).toContain('scheduledreservationdurationminutes = 120');
    expect(component).toContain('estimateddurationminutes: mode === \'scheduled\'');
  });
});
