import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260829172000_lock_order_pins.sql'),
  'utf8',
).toLowerCase();

function blockBetween(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('NORM-013 PIN security migration', () => {
  it('removes direct authenticated table access to PIN columns', () => {
    const selectGrant = blockBetween(
      'grant select (',
      ') on public.orders to authenticated;',
    );
    const insertGrant = blockBetween(
      'grant insert (',
      ') on public.orders to authenticated;',
    );

    expect(migration).toContain('revoke select, insert on public.orders from anon, authenticated');
    expect(selectGrant).not.toContain('start_pin');
    expect(selectGrant).not.toContain('end_pin');
    expect(insertGrant).not.toContain('start_pin');
    expect(insertGrant).not.toContain('end_pin');
  });

  it('publishes orders realtime payloads without PIN columns', () => {
    const realtimeBlock = blockBetween(
      'alter publication supabase_realtime add table public.orders',
      'drop function if exists public.get_order_pin',
    );

    expect(realtimeBlock).not.toContain('start_pin');
    expect(realtimeBlock).not.toContain('end_pin');
  });

  it('keeps client PIN access behind a restricted RPC', () => {
    const rpcBlock = blockBetween(
      'create function public.get_order_pin',
      'revoke all on function public.get_order_pin',
    );

    expect(rpcBlock).toContain('and o.client_id = (select auth.uid())');
    expect(rpcBlock).toContain("o.status = 'en_sitio'");
    expect(rpcBlock).toContain("o.status = 'trabajando'");
    expect(migration).toContain('revoke all on function public.get_order_pin(uuid) from public, anon');
    expect(migration).toContain('grant execute on function public.get_order_pin(uuid) to authenticated');
  });

  it('recreates public order RPCs with sanitized table returns', () => {
    const functions = [
      'accept_order',
      'accept_proposal',
      'advance_order',
      'cancel_order',
      'confirm_order_payment',
      'start_order',
      'complete_order',
    ];

    for (const functionName of functions) {
      const functionBlock = blockBetween(
        `create function public.${functionName}`,
        '$$;',
      );
      expect(functionBlock).toContain('security definer');
      expect(functionBlock).toContain("set search_path = ''");
      expect(functionBlock).not.toContain('start_pin');
      expect(functionBlock).not.toContain('end_pin');
    }
  });

  it('removes PIN columns from professional opportunities', () => {
    const opportunitySignature = blockBetween(
      'create function public.list_professional_opportunities',
      'language plpgsql',
    );

    expect(opportunitySignature).not.toContain('start_pin');
    expect(opportunitySignature).not.toContain('end_pin');
  });
});
