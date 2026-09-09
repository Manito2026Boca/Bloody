import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ channel: vi.fn(), on: vi.fn(), subscribe: vi.fn() }));
vi.mock('../app/lib/v6Supabase', () => ({ getV6Supabase: () => ({ channel: mocks.channel }) }));
import { subscribeV6OrderDetails } from '../app/lib/v6OrderRealtime';
import { subscribeV6Orders } from '../app/lib/v6Api';

describe('NORM-014 Realtime invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const channel = { on: mocks.on, subscribe: mocks.subscribe };
    mocks.channel.mockReturnValue(channel);
    mocks.on.mockReturnValue(channel);
    mocks.subscribe.mockReturnValue(channel);
  });
  it('subscribes to all participant detail tables scoped to one order', () => {
    const refresh = vi.fn();
    subscribeV6OrderDetails('owned-order', refresh);
    for (const table of ['order_proposals','order_extras','payments','order_photos']) {
      const binding = mocks.on.mock.calls.find(([, filter]) => filter.table === table);
      expect(binding?.[1]).toEqual({event:'*',schema:'public',table,filter:'order_id=eq.owned-order'});
      binding?.[2]({ new: { id: 'untrusted-payload' } });
    }
    expect(refresh).toHaveBeenCalledTimes(4);
  });
  it.each([subscribeV6Orders, (f: () => void) => subscribeV6OrderDetails('id', f)])('reconciles when Postgres is ready, not merely websocket joined', subscribe => {
    const refresh = vi.fn(); subscribe(refresh);
    const system = mocks.on.mock.calls.find(([type]) => type === 'system')![2];
    system({ status:'error',extension:'postgres_changes' });
    expect(refresh).not.toHaveBeenCalled();
    system({ status:'ok',extension:'postgres_changes' });
    expect(refresh).toHaveBeenCalledOnce();
    system({ status:'ok',extension:'postgres_changes' });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
