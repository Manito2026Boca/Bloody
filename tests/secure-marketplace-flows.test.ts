import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/202608280001_secure_marketplace_flows.sql'),
  'utf8',
).toLowerCase();

describe('MANITO secure marketplace flows', () => {
  it('moves professional discovery and opportunity visibility behind RPCs', () => {
    expect(migration).toContain('function public.list_public_professionals()');
    expect(migration).toContain('function public.list_professional_opportunities()');
    expect(migration).toContain("private.order_public_zone(o.address) as address");
    expect(migration).toContain('null::double precision as client_lat');
    expect(migration).toContain('null::double precision as client_lng');
  });

  it('keeps full profile data limited to self, admin, or assigned order participants', () => {
    expect(migration).toContain('create policy profiles_select on public.profiles');
    expect(migration).toContain('id = (select auth.uid())');
    expect(migration).toContain('private.is_manito_admin()');
    expect(migration).toContain('o.professional_id is not null');
    expect(migration).toContain("o.status not in ('open', 'scheduled_open', 'waiting_quotes', 'cancelled')");
  });

  it('requires an authorized professional and enforces manual assignment on accept', () => {
    expect(migration).toContain('private.professional_can_receive_orders(v_uid)');
    expect(migration).toContain("o.assignment_mode <> 'manual'");
    expect(migration).toContain('or o.preferred_professional_id = v_uid');
    expect(migration).toContain("o.status in ('open', 'scheduled_open')");
  });

  it('protects trust fields from self-edits', () => {
    expect(migration).toContain('function private.enforce_professional_profile_trust_fields()');
    expect(migration).toContain('new.verified := old.verified');
    expect(migration).toContain('new.manito_pro := old.manito_pro');
    expect(migration).toContain('new.rating_avg := old.rating_avg');
    expect(migration).toContain('new.jobs_completed := old.jobs_completed');
  });

  it('requires PIN steps before a professional can complete an order', () => {
    expect(migration).toContain("'trabajando'");
    expect(migration).toContain('function public.start_order(p_order_id uuid, p_pin text)');
    expect(migration).toContain('function public.complete_order(p_order_id uuid, p_pin text)');
    expect(migration).toContain("and start_pin = btrim(coalesce(p_pin, ''))");
    expect(migration).toContain("and end_pin = btrim(coalesce(p_pin, ''))");
  });

  it('freezes sensitive commercial mutations behind RPCs', () => {
    expect(migration).toContain('function public.send_order_proposal');
    expect(migration).toContain('function public.propose_order_extra');
    expect(migration).toContain('function public.decide_order_extra');
    expect(migration).toContain('grant select on public.order_proposals to authenticated');
    expect(migration).toContain('grant select on public.order_extras to authenticated');
    expect(migration).toContain("el pago con tarjeta queda pendiente hasta conectar mercado pago");
  });
});
