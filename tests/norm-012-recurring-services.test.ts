import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../app/lib/v6Supabase', () => ({ getV6Supabase: () => ({ rpc }) }));
import { createV6RecurringServicePlan, createV6Order } from '../app/lib/v6Api';
import { changeRecurringPlanStatus, listRecurringPlans, updateRecurringPlan } from '../app/lib/v6RecurringApi';

describe('NORM-012 recurring API behavior', () => {
  beforeEach(() => rpc.mockReset());
  it('creates through an owned source, without client identity or next date', async () => {
    rpc.mockResolvedValue({ data: { id: 'plan' }, error: null });
    await expect(createV6RecurringServicePlan({ sourceOrderId: 'order', frequency: 'weekly' })).resolves.toEqual({ id: 'plan' });
    expect(rpc).toHaveBeenCalledWith('create_recurring_plan', { p_source_order_id: 'order', p_frequency: 'weekly' });
  });
  it('does not report success for a missing table or failed RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'missing', code: '42P01' } });
    await expect(createV6RecurringServicePlan({ sourceOrderId: 'order', frequency: 'weekly' })).rejects.toThrow();
  });
  it('does not report success for an empty RPC response', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(createV6RecurringServicePlan({ sourceOrderId: 'order', frequency: 'monthly' })).rejects.toThrow();
  });
  it('scheduled creation ignores frontend price and client identity', async () => {
    rpc.mockResolvedValue({ data: { id: 'order' }, error: null });
    await createV6Order({ clientId: 'untrusted', serviceId: 1, description: 'Need', address: 'City', mode: 'scheduled',
      scheduledAt: '2027-01-01T12:00:00Z', price: 999999, estimatedPrice: 999999, lat: null, lng: null });
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe('create_scheduled_order');
    expect(args.p_data).not.toHaveProperty('client_id');
    expect(args.p_data).not.toHaveProperty('price');
    expect(args.p_data).not.toHaveProperty('estimated_price');
  });
  it.each(['pause','resume','cancel'] as const)('uses explicit %s RPC', async action => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await changeRecurringPlanStatus('plan', action);
    expect(rpc).toHaveBeenCalledWith(action + '_recurring_plan', { p_plan_id: 'plan' });
  });
  it('propagates edit failure instead of announcing success', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } });
    await expect(updateRecurringPlan('plan', { frequency: 'weekly' })).rejects.toThrow();
  });
  it('does not treat a failed listing as an empty account', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(listRecurringPlans()).rejects.toThrow();
  });
});

describe('NORM-012 migration and integration guards', () => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const sql = readdirSync(dir).filter(f => f.includes('norm_012')).map(f => readFileSync(join(dir,f),'utf8')).join('\n');
  const component = readFileSync(join(process.cwd(),'app/components/ManitoV6App.tsx'),'utf8');
  it('keeps a single plan architecture and refuses unexpected legacy data', () => {
    expect(sql).toContain('exists(select 1 from public.recurring_orders)');
    expect(sql).toContain('drop table public.recurring_orders;');
    expect(sql).not.toContain('drop table public.recurring_orders cascade');
  });
  it('enforces occurrence identity and one operational Order', () => {
    expect(sql).toContain('orders_recurring_occurrence_unique');
    expect(sql).toContain('orders_recurring_one_operational');
    expect(sql).toContain('for update skip locked');
  });
  it('shares scheduled creation without reimplementing acceptance or matching', () => {
    expect(sql).toContain('private.create_scheduled_request');
    expect(sql).toContain('private.manual_order_target_is_valid');
    expect(sql).not.toContain('create or replace function private.accept_order');
    expect(sql).not.toContain('create function private.start_immediate_matching');
  });
  it('protects awaiting choice from invented invitations', () => {
    expect(sql).toContain('orders_manual_choice_without_invitation');
    expect(sql).toContain("in ('rejected', 'expired', 'awaiting_client_choice')");
    expect(component).toContain("order.mode === 'scheduled' ? 'Buscar profesionales' : 'Buscar automáticamente'");
  });
  it('runs internally on cron and denies user execution', () => {
    expect(sql).toContain("cron.schedule('manito-recurring-services'");
    expect(sql).toContain('revoke all on function private.generate_due_recurring_orders() from public,anon,authenticated');
    expect(sql).toContain('"generation_lead_days":7');
  });
});
