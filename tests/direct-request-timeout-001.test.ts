import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260915170000_direct_request_timeout_001.sql',
  'utf8',
).toLowerCase();

describe('DIRECT-REQUEST-TIMEOUT-001', () => {
  it('centralizes direct-request policy at 10 and 30 minutes', () => {
    expect(migration).toContain("'direct_request_timeout_now_minutes', 10");
    expect(migration).toContain("'direct_request_timeout_scheduled_minutes', 30");
    expect(migration).toContain("s.key = 'manual_requests'");
    expect(migration).not.toContain("p_mode = 'quote'");
  });

  it('updates still-pending invitations from their original request time', () => {
    expect(migration).toContain('manual_requested_at + private.manual_request_timeout_interval(mode)');
    expect(migration).toContain("manual_response_status = 'pending'");
    expect(migration).toContain("mode in ('immediate', 'scheduled')");
  });

  it('persists expiry without relying on a rolled-back exception', () => {
    expect(migration).toContain("v_before.manual_response_status = 'expired' or v_before.manual_response_deadline_at <= now()");
    expect(migration).toContain('return private.refresh_manual_order_request_impl(p_order_id);');
    expect(migration).toContain('where o.professional_id = auth.uid()');
  });

  it('keeps helpers private and public acceptance authenticated only', () => {
    expect(migration).toContain('revoke all on function private.manual_request_timeout_interval(text) from public, anon, authenticated');
    expect(migration).toContain('revoke all on function private.accept_order_pre_matching_impl(uuid) from public, anon, authenticated');
    expect(migration).toContain('revoke all on function public.accept_order(uuid) from public, anon');
    expect(migration).toContain('grant execute on function public.accept_order(uuid) to authenticated');
  });
});
