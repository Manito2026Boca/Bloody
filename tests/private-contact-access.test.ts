import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/202608280003_private_contact_access.sql'),
  'utf8',
).toLowerCase();

const api = readFileSync(join(process.cwd(), 'app/lib/v6Api.ts'), 'utf8').toLowerCase();

describe('MANITO private contact access', () => {
  it('keeps phone and email outside public profile column grants', () => {
    expect(migration).toContain('function public.get_my_profile()');
    expect(migration).toContain('function public.update_my_profile');
    expect(migration).toContain('function public.set_my_availability');
    expect(migration).toContain('revoke select on public.profiles from authenticated');
    expect(migration).toContain('grant select (');
    expect(migration).toContain('"private_columns": ["email", "phone"]');
    expect(migration).not.toContain('grant select (email');
    expect(migration).not.toContain('grant select (phone');
  });

  it('requires an authenticated own user for profile RPCs', () => {
    expect(migration).toContain('v_uid uuid := auth.uid()');
    expect(migration).toContain("raise exception 'tenés que iniciar sesión'");
    expect(migration).toContain('where id = v_uid');
  });

  it('does not request counterpart phones in order and proposal joins', () => {
    expect(api).toContain('get_my_profile');
    expect(api).toContain('update_my_profile');
    expect(api).toContain('set_my_availability');
    expect(api).not.toContain('orders_client_id_fkey(id,full_name,phone,city)');
    expect(api).not.toContain('order_proposals_professional_id_fkey(id,full_name,phone,city)');
  });
});
