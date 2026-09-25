import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.hoisted(() => vi.fn());
vi.mock('../app/lib/v6Supabase', () => ({ getV6Supabase: () => ({ from }) }));

import {
  addV6ProfessionalService,
  removeV6ProfessionalService,
  saveV6SpecialtiesForService,
} from '../app/lib/v6Api';
import type { V6Service, V6Specialty } from '../app/lib/v6Types';

function query(data: unknown, error: { message: string } | null = null) {
  const q = {
    select: vi.fn(() => q),
    insert: vi.fn(() => q),
    delete: vi.fn(() => q),
    eq: vi.fn(() => q),
    in: vi.fn(() => q),
    single: vi.fn(() => Promise.resolve({ data, error })),
    then: (resolve: (value: { data: unknown; error: { message: string } | null }) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  return q;
}

const catalog = [
  { id: 11, service_id: 1, name: 'Tarea A' },
  { id: 12, service_id: 1, name: 'Tarea B' },
  { id: 21, service_id: 2, name: 'Tarea C' },
] as V6Specialty[];

describe('PRO-SPECIALTIES-UX-001 persistence', () => {
  beforeEach(() => from.mockReset());

  it('writes only the edited service and preserves other services', async () => {
    const read = query([{ professional_id: 'pro', service_id: 1, specialty_id: 11 }]);
    const insert = query(null);
    const remove = query(null);
    const after = query([{ professional_id: 'pro', service_id: 1, specialty_id: 12 }]);
    from.mockReturnValueOnce(read).mockReturnValueOnce(insert).mockReturnValueOnce(remove).mockReturnValueOnce(after);

    const result = await saveV6SpecialtiesForService('pro', 1, [12], catalog);
    expect(result.map((row) => row.specialty_id)).toEqual([12]);
    expect(insert.insert).toHaveBeenCalledWith([{ professional_id: 'pro', service_id: 1, specialty_id: 12 }]);
    expect(remove.in).toHaveBeenCalledWith('specialty_id', [11]);
    for (const q of [read, remove, after]) {
      expect(q.eq).toHaveBeenCalledWith('professional_id', 'pro');
      expect(q.eq).toHaveBeenCalledWith('service_id', 1);
    }
    expect(from.mock.calls.every(([table]) => table === 'professional_specialties')).toBe(true);
  });

  it('does not write for an unchanged selection', async () => {
    from.mockReturnValueOnce(query([{ specialty_id: 11 }])).mockReturnValueOnce(query([{ specialty_id: 11 }]));
    await saveV6SpecialtiesForService('pro', 1, [11], catalog);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('rejects a specialty belonging to another service before any request', async () => {
    await expect(saveV6SpecialtiesForService('pro', 1, [21], catalog)).rejects.toThrow('Especialidad inválida');
    expect(from).not.toHaveBeenCalled();
  });

  it('surfaces a failed save so the same draft can be retried', async () => {
    from.mockReturnValueOnce(query([])).mockReturnValueOnce(query(null, { message: 'Network error' }));
    await expect(saveV6SpecialtiesForService('pro', 1, [11], catalog)).rejects.toThrow('Network error');
    from.mockReturnValueOnce(query([])).mockReturnValueOnce(query(null)).mockReturnValueOnce(query([{ specialty_id: 11 }]));
    await expect(saveV6SpecialtiesForService('pro', 1, [11], catalog)).resolves.toHaveLength(1);
  });

  it('adds and removes one service without rewriting the catalog', async () => {
    const add = query({ service_id: 1 });
    const remove = query(null);
    from.mockReturnValueOnce(add).mockReturnValueOnce(remove);
    await addV6ProfessionalService('pro', { id: 1, base_price: 123 } as V6Service);
    await removeV6ProfessionalService('pro', 1);
    expect(add.insert).toHaveBeenCalledWith({ professional_id: 'pro', service_id: 1, price_from: 123 });
    expect(remove.eq).toHaveBeenCalledWith('professional_id', 'pro');
    expect(remove.eq).toHaveBeenCalledWith('service_id', 1);
  });
});
