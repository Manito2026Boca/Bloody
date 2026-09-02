import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260901033000_norm_006_matching_rounds.sql'),
  'utf8',
).toLowerCase();

const api = readFileSync(join(process.cwd(), 'app/lib/v6Api.ts'), 'utf8').toLowerCase();
const component = readFileSync(
  join(process.cwd(), 'app/components/ManitoV6App.tsx'),
  'utf8',
).toLowerCase();

function blockBetween(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('NORM-006 automatic immediate matching rounds', () => {
  it('stores automatic matching state separately from order assignment', () => {
    expect(migration).toContain('matching_status text');
    expect(migration).toContain('matching_started_at timestamptz');
    expect(migration).toContain('matching_current_round integer not null default 0');
    expect(migration).toContain('matching_cycle integer not null default 1');
    expect(migration).toContain('matching_round_deadline_at timestamptz');
    expect(migration).toContain('matching_failed_at timestamptz');
    expect(migration).toContain("'matching_failed'");
  });

  it('adds an invitation table with round, deadline, score and non-secret candidate state', () => {
    expect(migration).toContain('create table if not exists public.order_match_candidates');
    expect(migration).toContain('round_number integer not null');
    expect(migration).toContain('cycle_number integer not null default 1');
    expect(migration).toContain('deadline_at timestamptz not null');
    expect(migration).toContain("status text not null default 'pending'");
    expect(migration).toContain("'pending', 'accepted', 'rejected', 'expired', 'closed'");
    expect(migration).toContain('unique (order_id, professional_id, cycle_number)');
  });

  it('keeps candidate rows protected by RLS and explicit Data API grants', () => {
    expect(migration).toContain('alter table public.order_match_candidates enable row level security');
    expect(migration).toContain('revoke all on table public.order_match_candidates from public, anon, authenticated');
    expect(migration).toContain('grant select on table public.order_match_candidates to authenticated');
    expect(migration).toContain('create policy order_match_candidates_select_participants');
    expect(migration).toContain('professional_id = (select auth.uid())');
    expect(migration).toContain('o.client_id = (select auth.uid())');
    expect(migration).not.toContain('private.is_admin((select auth.uid()))');
  });

  it('centralizes round size, timeout, max rounds and radius expansion in admin_settings.matching', () => {
    expect(migration).toContain("'matching'");
    expect(migration).toContain("'matching_batch_size', 3");
    expect(migration).toContain("'matching_round_timeout_seconds', 90");
    expect(migration).toContain("'matching_max_rounds', 3");
    expect(migration).toContain("'initial_radius_km', 8");
    expect(migration).toContain("'radius_increment_km', 4");
    expect(migration).toContain("'max_radius_km', 20");
    expect(migration).toContain('private.current_matching_policy()');
    expect(migration).toContain('private.matching_round_radius_km');
  });

  it('starts only immediate automatic orders through backend rounds', () => {
    const startBlock = blockBetween(
      'create or replace function private.start_immediate_matching_round_impl',
      'create or replace function private.expire_immediate_matching_impl',
    );

    expect(startBlock).toContain("v_order.mode <> 'immediate'");
    expect(startBlock).toContain("coalesce(v_order.assignment_mode, 'auto') <> 'auto'");
    expect(startBlock).toContain('v_order.professional_id is not null');
    expect(startBlock).toContain("v_order.status not in ('open', 'matching_failed')");
    expect(startBlock).toContain('while v_round <= v_max_rounds loop');
    expect(startBlock).toContain('limit v_batch_size');
  });

  it('selects eligible candidates by service, availability, approval and radius without repeating a cycle', () => {
    const startBlock = blockBetween(
      'create or replace function private.start_immediate_matching_round_impl',
      'create or replace function private.expire_immediate_matching_impl',
    );

    expect(startBlock).toContain('join public.professional_services ps on ps.service_id = o.service_id');
    expect(startBlock).toContain("p.role = 'professional'");
    expect(startBlock).toContain('p.is_available = true');
    expect(startBlock).toContain('private.professional_can_receive_orders(p.id)');
    expect(startBlock).toContain('private.distance_km');
    expect(startBlock).toContain('c.cycle_number = v_cycle');
    expect(startBlock).toContain('not exists');
  });

  it('ranks invitations with explainable factors and approximate location only', () => {
    const startBlock = blockBetween(
      'create or replace function private.start_immediate_matching_round_impl',
      'create or replace function private.expire_immediate_matching_impl',
    );

    expect(startBlock).toContain("'especialidad compatible'");
    expect(startBlock).toContain("'servicio compatible'");
    expect(startBlock).toContain("'verificado por manito'");
    expect(startBlock).toContain('pp.jobs_completed');
    expect(startBlock).toContain('private.order_public_zone(o.address)');
  });

  it('expires rounds lazily and advances to the next round when no pending invitations remain', () => {
    const expireBlock = blockBetween(
      'create or replace function private.expire_immediate_matching_impl',
      'create or replace function private.refresh_immediate_matching_for_professional_impl',
    );

    expect(expireBlock).toContain("set status = 'expired'");
    expect(expireBlock).toContain('deadline_at <= now()');
    expect(expireBlock).toContain("v_order.matching_status = 'round_pending'");
    expect(expireBlock).toContain('not exists');
    expect(expireBlock).toContain('private.start_immediate_matching_round_impl(p_order_id, false)');
  });

  it('marks the order as matching_failed after max rounds without cancelling it', () => {
    const startBlock = blockBetween(
      'create or replace function private.start_immediate_matching_round_impl',
      'create or replace function private.expire_immediate_matching_impl',
    );

    expect(startBlock).toContain("status = 'matching_failed'");
    expect(startBlock).toContain("matching_status = 'failed'");
    expect(startBlock).toContain('matching_failed_at = now()');
    expect(startBlock).toContain('no encontramos profesional disponible');
    expect(startBlock).not.toContain("status = 'cancelled'");
  });

  it('allows only an invited pending professional to accept an immediate automatic order', () => {
    const acceptBlock = blockBetween(
      'create or replace function private.accept_order_impl',
      'drop function if exists public.accept_order',
    );

    expect(acceptBlock).toContain('private.expire_immediate_matching_impl(p_order_id)');
    expect(acceptBlock).toContain("v_before.mode = 'immediate'");
    expect(acceptBlock).toContain("coalesce(v_before.assignment_mode, 'auto') = 'auto'");
    expect(acceptBlock).toContain('c.professional_id = v_uid');
    expect(acceptBlock).toContain("c.status = 'pending'");
    expect(acceptBlock).toContain('c.deadline_at > now()');
    expect(acceptBlock).toContain("set status = 'accepted'");
    expect(acceptBlock).toContain("set status = 'closed'");
    expect(acceptBlock).toContain("matching_status = 'matched'");
  });

  it('keeps first-wins behavior through the existing accept core and closes the remaining round', () => {
    const acceptBlock = blockBetween(
      'create or replace function private.accept_order_impl',
      'drop function if exists public.accept_order',
    );

    expect(acceptBlock).toContain('private.accept_order_pre_matching_impl(p_order_id)');
    expect(acceptBlock).toContain('professional_id <> v_uid');
    expect(acceptBlock).toContain("and status = 'pending'");
  });

  it('adds an authenticated rejection RPC that can immediately advance exhausted rounds', () => {
    const rejectBlock = blockBetween(
      'create or replace function private.reject_matching_candidate_impl',
      'drop function if exists public.reject_matching_candidate',
    );

    expect(rejectBlock).toContain("set status = 'rejected'");
    expect(rejectBlock).toContain('response_reason = p_reason');
    expect(rejectBlock).toContain('c.professional_id = v_uid');
    expect(rejectBlock).toContain("c.status = 'pending'");
    expect(rejectBlock).toContain('c.deadline_at > now()');
    expect(rejectBlock).toContain('private.start_immediate_matching_round_impl(p_order_id, false)');
  });

  it('keeps manual fallback explicit while starting automatic round infrastructure afterward', () => {
    expect(migration).toContain('after insert or update of assignment_mode, status, mode, professional_id');
    expect(migration).toContain("coalesce(new.assignment_mode, 'auto') = 'auto'");
    expect(migration).toContain("new.mode = 'immediate'");
    expect(migration).toContain('private.start_immediate_matching_round_impl(new.id, false)');
    expect(migration).not.toContain('create or replace function private.fallback_manual_order_to_auto_impl');
  });

  it('keeps scheduled and quote opportunities compatible with previous modules', () => {
    const opportunitiesBlock = blockBetween(
      'create function public.list_professional_opportunities',
      'revoke all on function public.accept_order',
    );

    expect(opportunitiesBlock).toContain("o.mode <> 'immediate'");
    expect(opportunitiesBlock).toContain("coalesce(o.assignment_mode, 'auto') <> 'manual'");
    expect(opportunitiesBlock).toContain('private.professional_schedule_contains');
    expect(opportunitiesBlock).toContain('not private.professional_has_schedule_conflict');
  });

  it('removes the global immediate board by requiring a pending candidate row', () => {
    const opportunitiesBlock = blockBetween(
      'create function public.list_professional_opportunities',
      'revoke all on function public.accept_order',
    );

    expect(opportunitiesBlock).toContain("o.mode = 'immediate'");
    expect(opportunitiesBlock).toContain("coalesce(o.assignment_mode, 'auto') = 'auto'");
    expect(opportunitiesBlock).toContain("mc.status = 'pending'");
    expect(opportunitiesBlock).toContain('mc.deadline_at > now()');
    expect(opportunitiesBlock).not.toContain("o.assignment_mode <> 'manual'");
  });

  it('exposes public RPCs only to authenticated and keeps private helpers uncallable', () => {
    expect(migration).toContain('revoke all on function public.reject_matching_candidate(uuid, text) from public, anon');
    expect(migration).toContain('revoke all on function public.refresh_immediate_matching(uuid) from public, anon');
    expect(migration).toContain('revoke all on function public.retry_immediate_matching(uuid) from public, anon');
    expect(migration).toContain('grant execute on function public.reject_matching_candidate(uuid, text) to authenticated');
    expect(migration).toContain('grant execute on function public.refresh_immediate_matching(uuid) to authenticated');
    expect(migration).toContain('grant execute on function public.retry_immediate_matching(uuid) to authenticated');
    expect(migration).toContain('revoke all on function private.start_immediate_matching_round_impl(uuid, boolean) from public, anon, authenticated');
    expect(migration).toContain('revoke all on function private.reject_matching_candidate_impl(uuid, text) from public, anon, authenticated');
  });

  it('does not publish candidate rows or private coordinates through Realtime opportunities', () => {
    const realtimeBlock = blockBetween(
      'alter publication supabase_realtime add table public.orders',
      "insert into public.admin_settings (key, value)\nvalues ('norm_006_matching_rounds'",
    );

    expect(realtimeBlock).toContain('matching_status');
    expect(realtimeBlock).toContain('matching_round_deadline_at');
    expect(realtimeBlock).not.toContain('order_match_candidates');
    expect(realtimeBlock).not.toContain('start_pin');
    expect(realtimeBlock).not.toContain('end_pin');
  });

  it('updates frontend types, API and UI for round invitations and retry', () => {
    expect(api).toContain("'matching_status'");
    expect(api).toContain("rpc('reject_matching_candidate'");
    expect(api).toContain("rpc('refresh_immediate_matching'");
    expect(api).toContain("rpc('retry_immediate_matching'");
    expect(api).toContain('expiredimmediatematchingorders');
    expect(component).toContain('ispendingautomaticmatchinginvitation');
    expect(component).toContain('no puedo tomarlo');
    expect(component).toContain('reintentar búsqueda');
    expect(component).toContain('sin profesional disponible');
  });
});
