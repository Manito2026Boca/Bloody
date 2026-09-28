import { describe, expect, it } from 'vitest';
import {
  PUBLIC_ORIGIN,
  LEGACY_AUTH_ORIGINS,
  authReturnOrigin,
  buildAppIntentUrl,
  isReservedLegacyPath,
  parseDomainIntent,
  resolveDomainOrigins,
} from '../app/lib/domainMigrationContract';
import {
  domainMigrationIntentContext as context,
  domainMigrationOrderId as uuid,
  domainMigrationOrigins as origins,
} from './fixtures/domainMigration';

describe('DOMAIN-MIGRATION-001 C0', () => {
  it('requires an explicit app origin in production and never falls back to a technical host', () => {
    expect(() => resolveDomainOrigins({ environment: 'production' })).toThrow('NEXT_PUBLIC_APP_URL');
    expect(() => resolveDomainOrigins({ configuredAppOrigin: 'https://example.com/path', environment: 'production' })).toThrow();
    expect(() => resolveDomainOrigins({ configuredAppOrigin: 'http://manitoapp.com.ar', environment: 'production' })).toThrow();
    expect(() => resolveDomainOrigins({ configuredAppOrigin: 'https://user:pass@manitoapp.com.ar', environment: 'production' })).toThrow();
    expect(origins.appOrigin).toBe('https://app.manitoapp.com.ar');
    expect(origins.publicOrigin).toBe(PUBLIC_ORIGIN);
  });

  it('uses the local origin for development without sending Auth to production', () => {
    const local = resolveDomainOrigins({ runtimeOrigin: 'http://localhost:3010', environment: 'development' });
    expect(local.appOrigin).toBe('http://localhost:3010');
    expect(() => resolveDomainOrigins({ configuredAppOrigin: 'http://example.com', environment: 'development' })).toThrow();
  });

  it('accepts only explicit app and legacy origins for Auth return', () => {
    expect(authReturnOrigin(origins.appOrigin, origins)).toBe(origins.appOrigin);
    for (const legacy of LEGACY_AUTH_ORIGINS) expect(authReturnOrigin(legacy, origins)).toBe(legacy);
    expect(() => authReturnOrigin('https://manitoapp.com.ar.attacker.test', origins)).toThrow();
    expect(() => authReturnOrigin('https://manitoapp.com.ar/redirect', origins)).toThrow();
  });

  it('round-trips only catalogued service and approved mode', () => {
    const link = buildAppIntentUrl({ kind: 'service', service: 'plomeria', mode: 'ahora' }, context);
    expect(link).toBe('https://app.manitoapp.com.ar/?intent=service&service=plomeria&mode=ahora');
    expect(parseDomainIntent(link, context)).toEqual({
      ok: true, intent: { kind: 'service', service: 'plomeria', mode: 'ahora' },
    });
    expect(parseDomainIntent('https://app.manitoapp.com.ar/?intent=service&service=desconocido', context)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseDomainIntent('https://app.manitoapp.com.ar/?intent=service&service=plomeria&mode=', context)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('validates professional, order, workroom, and notification destinations', () => {
    for (const intent of [
      { kind: 'professional' } as const,
      { kind: 'order', orderId: uuid } as const,
      { kind: 'workroom', orderId: uuid } as const,
      { kind: 'notification', notificationId: uuid } as const,
    ]) {
      expect(parseDomainIntent(buildAppIntentUrl(intent, context), context)).toEqual({ ok: true, intent });
    }
    expect(parseDomainIntent('https://app.manitoapp.com.ar/?notification=bad', context)).toEqual({ ok: false, reason: 'invalid' });
    expect(() => buildAppIntentUrl({ kind: 'order', orderId: '../admin' }, context)).toThrow();
  });

  it('rejects foreign origins, open redirects, duplicate keys, and sensitive extras', () => {
    expect(parseDomainIntent('https://evil.example/?intent=professional', context)).toEqual({ ok: false, reason: 'untrusted-origin' });
    expect(parseDomainIntent('https://app.manitoapp.com.ar/?intent=professional&next=https://evil.example', context)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseDomainIntent('https://app.manitoapp.com.ar/?intent=service&service=plomeria&service=electricidad', context)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseDomainIntent('https://app.manitoapp.com.ar/?intent=professional&email=user@example.com', context)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseDomainIntent('https://app.manitoapp.com.ar/?intent=professional#access_token=secret', context)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseDomainIntent('https://app.manitoapp.com.ar/', context)).toEqual({ ok: false, reason: 'not-intent' });
  });

  it('accepts a public-site intent only when explicitly parsing the public origin', () => {
    const source = 'https://manitoapp.com.ar/?intent=service&service=plomeria';
    expect(parseDomainIntent(source, context)).toEqual({ ok: false, reason: 'untrusted-origin' });
    expect(parseDomainIntent(source, context, 'public')).toEqual({ ok: true, intent: { kind: 'service', service: 'plomeria' } });
  });

  it('reserves legacy routing without swallowing editorial pages', () => {
    expect(isReservedLegacyPath('/auth/callback')).toBe(true);
    expect(isReservedLegacyPath('/admin')).toBe(true);
    expect(isReservedLegacyPath('/sw.js')).toBe(true);
    expect(isReservedLegacyPath('/_next/static/chunk.js')).toBe(false);
    expect(isReservedLegacyPath('/brand/manito-icon-192.png')).toBe(false);
    expect(isReservedLegacyPath('/servicios/plomeria')).toBe(false);
  });
});
