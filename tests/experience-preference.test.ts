import { describe, expect, it } from 'vitest';
import { readPreferredExperience, savePreferredExperience } from '../app/lib/experiencePreference';

function device() {
  const data = new Map<string, string>();
  return { data, storage: () => ({ getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); } }) };
}

describe('per-account explicit experience preference', () => {
  it('starts as client without writing a fallback', () => {
    const { data, storage } = device();
    expect(readPreferredExperience('a', storage)).toBe('client');
    expect(data.size).toBe(0);
  });
  it('restores the last explicit choice independently for each account', () => {
    const { data, storage } = device();
    savePreferredExperience('a', 'professional', storage);
    expect(readPreferredExperience('a', storage)).toBe('professional');
    expect(readPreferredExperience('b', storage)).toBe('client');
    savePreferredExperience('b', 'professional', storage);
    savePreferredExperience('a', 'client', storage);
    expect(readPreferredExperience('a', storage)).toBe('client');
    expect(readPreferredExperience('b', storage)).toBe('professional');
    expect([...data.values()]).toEqual(['client', 'professional']);
  });
  it('does not carry preferences to another device', () => {
    const first = device(); const second = device();
    savePreferredExperience('a', 'professional', first.storage);
    expect(readPreferredExperience('a', second.storage)).toBe('client');
  });
  it('rejects invalid values and supports an explicit access fallback without overwriting', () => {
    const { data, storage } = device();
    data.set('manito:preferred-mode:v1:a', 'admin');
    expect(readPreferredExperience('a', storage)).toBe('client');
    savePreferredExperience('a', 'professional', storage);
    expect(readPreferredExperience('a', storage, false)).toBe('client');
    expect(readPreferredExperience('a', storage)).toBe('professional');
  });
  it('survives denied storage, failed reads and failed writes', () => {
    const denied = () => { throw new Error('Denied'); };
    expect(readPreferredExperience('a', denied)).toBe('client');
    expect(() => savePreferredExperience('a', 'professional', denied)).not.toThrow();
    const broken = () => ({ getItem: () => { throw new Error('Read'); }, setItem: () => { throw new Error('Write'); } });
    expect(readPreferredExperience('a', broken)).toBe('client');
    expect(() => savePreferredExperience('a', 'professional', broken)).not.toThrow();
  });
  it('never stores anonymous preferences', () => {
    const { data, storage } = device();
    savePreferredExperience('', 'professional', storage);
    expect(readPreferredExperience('', storage)).toBe('client');
    expect(data.size).toBe(0);
  });
});
