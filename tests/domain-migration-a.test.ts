import { describe, expect, it } from 'vitest';
import { buildSameOriginAuthCallbackUrl } from '../app/lib/authCallback';
import { consumePendingDomainIntent, storeIncomingDomainIntent } from '../app/lib/domainIntentSession';
import {
  domainMigrationIntentContext as context,
  domainMigrationOrigins as origins,
  domainMigrationOrderId as orderId,
} from './fixtures/domainMigration';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('domain migration Auth and intent adapters', () => {
  it('keeps email callbacks on the initiating allowed origin', () => {
    expect(buildSameOriginAuthCallbackUrl(origins.appOrigin, 'recovery', origins)).toBe(
      'https://app.manitoapp.com.ar/auth/callback?flow=recovery',
    );
    expect(buildSameOriginAuthCallbackUrl(origins.publicOrigin, 'signup', origins)).toBe(
      'https://manitoapp.com.ar/auth/callback?flow=signup',
    );
    expect(buildSameOriginAuthCallbackUrl('https://bloody-eta.vercel.app', 'recovery', origins)).toBe(
      'https://bloody-eta.vercel.app/auth/callback?flow=recovery',
    );
    expect(() => buildSameOriginAuthCallbackUrl('https://evil.example', 'signup', origins)).toThrow();
    expect(() => buildSameOriginAuthCallbackUrl('https://manitoapp.com.ar.evil.example', 'signup', origins)).toThrow();
  });

  it('persists only a validated intent and consumes it once after login', () => {
    const storage = memoryStorage();
    expect(storeIncomingDomainIntent(
      'https://app.manitoapp.com.ar/?intent=service&service=plomeria&mode=ahora', context, storage,
    )).toEqual({ ok: true, intent: { kind: 'service', service: 'plomeria', mode: 'ahora' } });
    expect(consumePendingDomainIntent(context, storage)).toEqual({ kind: 'service', service: 'plomeria', mode: 'ahora' });
    expect(consumePendingDomainIntent(context, storage)).toBeNull();
  });

  it('rejects foreign hosts, redirect keys, unknown services and fragments', () => {
    const storage = memoryStorage();
    for (const url of [
      `https://evil.example/?intent=order&order=${orderId}`,
      'https://app.manitoapp.com.ar/?intent=professional&next=https://evil.example',
      'https://app.manitoapp.com.ar/?intent=service&service=unknown',
      'https://app.manitoapp.com.ar/?intent=professional#access_token=secret',
    ]) {
      expect(storeIncomingDomainIntent(url, context, storage).ok).toBe(false);
      expect(consumePendingDomainIntent(context, storage)).toBeNull();
    }
  });

  it('rejects tampered stored intent objects before navigation', () => {
    const storage = memoryStorage();
    storage.setItem('manito_pending_domain_intent_v1', JSON.stringify({ kind: 'order', orderId: 'not-a-uuid' }));
    expect(consumePendingDomainIntent(context, storage)).toBeNull();
  });
});
