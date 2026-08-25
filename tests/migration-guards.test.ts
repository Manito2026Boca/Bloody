import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/202608250001_initial_manito_mvp.sql'),
  'utf8',
).toLowerCase();

describe('Supabase V6 migration guards', () => {
  it('keeps the V6 Real shared-backend contract', () => {
    for (const table of [
      'profiles',
      'services',
      'professional_services',
      'orders',
      'messages',
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }

    expect(migration).toContain("status text not null default 'open'");
    expect(migration).toContain("'accepted'");
    expect(migration).toContain("'en_camino'");
    expect(migration).toContain("'en_sitio'");
    expect(migration).toContain("'completed'");
  });

  it('keeps sensitive authorization out of user-editable metadata', () => {
    expect(migration).not.toContain("auth.jwt() -> 'user_metadata'");
    expect(migration).not.toContain("auth.jwt()->'user_metadata'");
    expect(migration).not.toContain("new.raw_user_meta_data->>'role'");
    expect(migration).not.toContain("raw_user_meta_data ->> 'role'");
  });

  it('enables RLS and API grants on all exposed V6 tables', () => {
    for (const table of [
      'profiles',
      'services',
      'professional_services',
      'orders',
      'messages',
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }

    expect(migration).toContain('grant select on public.profiles to authenticated');
    expect(migration).toContain('grant select, insert on public.orders to authenticated');
    expect(migration).toContain('grant select, insert on public.messages to authenticated');
  });

  it('uses public RPC wrappers backed by private privileged implementations', () => {
    for (const rpc of ['complete_profile', 'accept_order', 'advance_order', 'cancel_order']) {
      expect(migration).toContain(`function public.${rpc}`);
    }

    expect(migration).toContain('function private.accept_order_impl');
    expect(migration).toContain('security definer');
    expect(migration).toContain('and o.status = \'open\'');
    expect(migration).toContain('and o.professional_id is null');
    expect(migration).toContain('returning o.* into v_order');
    expect(migration).toContain("v_role not in ('client', 'professional')");
    expect(migration).toContain('revoke all on function public.accept_order(uuid)');
  });

  it('adds orders and messages to Supabase Realtime without touching the realtime schema', () => {
    expect(migration).toContain('alter publication supabase_realtime add table public.orders');
    expect(migration).toContain('alter publication supabase_realtime add table public.messages');
    expect(migration).not.toContain('alter schema realtime');
    expect(migration).not.toContain('create table realtime.');
  });
});
