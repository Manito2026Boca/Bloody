import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260831140000_norm_007_manual_request_lifecycle.sql'),
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

describe('NORM-007 manual request lifecycle', () => {
  it('adds current manual request state and history without changing assignment state names', () => {
    expect(migration).toContain('manual_requested_professional_id uuid');
    expect(migration).toContain('manual_requested_at timestamptz');
    expect(migration).toContain('manual_response_deadline_at timestamptz');
    expect(migration).toContain('manual_response_status text');
    expect(migration).toContain('manual_response_reason text');
    expect(migration).toContain('manual_responded_at timestamptz');
    expect(migration).toContain("manual_request_history jsonb not null default '[]'::jsonb");
    expect(migration).toContain("'pending', 'accepted', 'rejected', 'expired'");
  });

  it('centralizes manual timeout policy in admin_settings', () => {
    expect(migration).toContain("'manual_requests'");
    expect(migration).toContain("'manual_immediate_timeout_seconds', 180");
    expect(migration).toContain("'manual_scheduled_timeout_minutes', 60");
    expect(migration).toContain('private.current_manual_request_policy()');
    expect(migration).toContain('private.manual_request_timeout_interval');
  });

  it('opens manual requests through a backend trigger and notifies only the chosen pro', () => {
    const defaultBlock = blockBetween(
      'create or replace function private.set_manual_request_defaults',
      'create or replace function private.notify_manual_request_target',
    );
    const notifyBlock = blockBetween(
      'create or replace function private.notify_manual_request_target',
      'update public.orders o',
    );

    expect(defaultBlock).toContain("new.assignment_mode = 'manual'");
    expect(defaultBlock).toContain('new.manual_requested_professional_id := new.preferred_professional_id');
    expect(defaultBlock).toContain("new.manual_response_status := coalesce(new.manual_response_status, 'pending')");
    expect(defaultBlock).toContain('new.manual_response_deadline_at := private.manual_request_deadline');
    expect(notifyBlock).toContain('new.preferred_professional_id');
    expect(notifyBlock).toContain("'manual_request'");
    expect(notifyBlock).not.toContain('assignment_mode = \'auto\'');
  });

  it('keeps direct manual opportunities visible only to the requested professional while pending', () => {
    const opportunitiesBlock = blockBetween(
      'create function public.list_professional_opportunities',
      'revoke all on function public.accept_order',
    );

    expect(opportunitiesBlock).toContain("o.assignment_mode <> 'manual'");
    expect(opportunitiesBlock).toContain('o.manual_requested_professional_id = v_uid');
    expect(opportunitiesBlock).toContain("o.manual_response_status = 'pending'");
    expect(opportunitiesBlock).toContain('o.manual_response_deadline_at > now()');
    expect(opportunitiesBlock).toContain("o.mode <> 'immediate' or v_profile.is_available = true");
    expect(opportunitiesBlock).toContain('private.professional_schedule_contains');
    expect(opportunitiesBlock).toContain('not private.professional_has_schedule_conflict');
  });

  it('lets only the requested professional accept a pending manual request before timeout', () => {
    const acceptBlock = blockBetween(
      'create or replace function private.accept_order_impl',
      'drop function if exists public.accept_order',
    );

    expect(acceptBlock).toContain('private.refresh_manual_order_request_impl(p_order_id)');
    expect(acceptBlock).toContain("v_before.assignment_mode = 'manual'");
    expect(acceptBlock).toContain('v_before.preferred_professional_id is distinct from v_uid');
    expect(acceptBlock).toContain('v_before.manual_requested_professional_id is distinct from v_uid');
    expect(acceptBlock).toContain("v_before.manual_response_status <> 'pending'");
    expect(acceptBlock).toContain('v_before.manual_response_deadline_at <= now()');
    expect(acceptBlock).toContain('private.accept_order_core_impl(p_order_id)');
    expect(acceptBlock).toContain("manual_response_status = 'accepted'");
    expect(acceptBlock).toContain('manual_responded_at = now()');
  });

  it('adds a reject RPC that does not cancel the order or auto-fallback', () => {
    const rejectBlock = blockBetween(
      'create or replace function private.reject_manual_order_request_impl',
      'create or replace function private.manual_order_target_is_valid',
    );

    expect(rejectBlock).toContain('manual_requested_professional_id = v_uid');
    expect(rejectBlock).toContain("manual_response_status = 'pending'");
    expect(rejectBlock).toContain("manual_response_status = 'rejected'");
    expect(rejectBlock).toContain("'manual_request_rejected'");
    expect(rejectBlock).not.toContain("assignment_mode = 'auto'");
    expect(rejectBlock).not.toContain("status = 'cancelled'");
  });

  it('expires manual requests lazily without converting to automatic matching', () => {
    const refreshBlock = blockBetween(
      'create or replace function private.refresh_manual_order_request_impl',
      'create or replace function private.reject_manual_order_request_impl',
    );

    expect(refreshBlock).toContain("manual_response_status = 'expired'");
    expect(refreshBlock).toContain('manual_response_deadline_at <= now()');
    expect(refreshBlock).toContain("'manual_request_expired'");
    expect(refreshBlock).not.toContain("assignment_mode = 'auto'");
    expect(refreshBlock).not.toContain("preferred_professional_id = null");
  });

  it('lets the client choose a different valid professional only after rejection or timeout', () => {
    const chooseBlock = blockBetween(
      'create or replace function private.choose_manual_order_professional_impl',
      'create or replace function private.fallback_manual_order_to_auto_impl',
    );

    expect(chooseBlock).toContain('client_id = v_uid');
    expect(chooseBlock).toContain("manual_response_status in ('rejected', 'expired')");
    expect(chooseBlock).toContain('private.manual_order_target_is_valid');
    expect(chooseBlock).toContain('manual_request_history = v_history');
    expect(chooseBlock).toContain("manual_response_status = 'pending'");
    expect(chooseBlock).toContain('manual_requested_professional_id = p_professional_id');
  });

  it('lets the client explicitly switch to automatic search after rejection or timeout', () => {
    const fallbackBlock = blockBetween(
      'create or replace function private.fallback_manual_order_to_auto_impl',
      'create or replace function private.accept_order_impl',
    );

    expect(fallbackBlock).toContain('client_id = v_uid');
    expect(fallbackBlock).toContain("manual_response_status in ('rejected', 'expired')");
    expect(fallbackBlock).toContain("assignment_mode = 'auto'");
    expect(fallbackBlock).toContain('preferred_professional_id = null');
    expect(fallbackBlock).toContain('manual_request_history = v_history');
    expect(fallbackBlock).toContain("'manual_request_auto'");
  });

  it('keeps public manual lifecycle RPCs authenticated and private helpers uncallable', () => {
    expect(migration).toContain('revoke all on function public.reject_manual_order_request(uuid, text) from public, anon');
    expect(migration).toContain('revoke all on function public.refresh_manual_order_request(uuid) from public, anon');
    expect(migration).toContain('revoke all on function public.choose_manual_order_professional(uuid, uuid) from public, anon');
    expect(migration).toContain('revoke all on function public.fallback_manual_order_to_auto(uuid) from public, anon');
    expect(migration).toContain('grant execute on function public.reject_manual_order_request(uuid, text) to authenticated');
    expect(migration).toContain('grant execute on function public.refresh_manual_order_request(uuid) to authenticated');
    expect(migration).toContain('revoke all on function private.reject_manual_order_request_impl(uuid, text) from public, anon, authenticated');
    expect(migration).toContain('revoke all on function private.choose_manual_order_professional_impl(uuid, uuid) from public, anon, authenticated');
  });

  it('publishes current manual state through Realtime without secrets or history', () => {
    const realtimeBlock = blockBetween(
      'alter publication supabase_realtime add table public.orders',
      "insert into public.admin_settings (key, value)\nvalues ('norm_007_manual_request_lifecycle'",
    );

    expect(realtimeBlock).toContain('manual_requested_professional_id');
    expect(realtimeBlock).toContain('manual_response_deadline_at');
    expect(realtimeBlock).toContain('manual_response_status');
    expect(realtimeBlock).not.toContain('start_pin');
    expect(realtimeBlock).not.toContain('end_pin');
    expect(realtimeBlock).not.toContain('manual_request_history');
  });

  it('updates the frontend API and UI for reject, choose-another and fallback actions', () => {
    expect(api).toContain("'manual_requested_professional_id'");
    expect(api).toContain("rpc('reject_manual_order_request'");
    expect(api).toContain("rpc('choose_manual_order_professional'");
    expect(api).toContain("rpc('fallback_manual_order_to_auto'");
    expect(component).toContain('solicitud directa');
    expect(component).toContain('rechazar solicitud');
    expect(component).toContain('elegir otro profesional');
    expect(component).toContain('buscar automáticamente');
    expect(component).toContain('manualrequestneedsclientdecision');
  });
});
