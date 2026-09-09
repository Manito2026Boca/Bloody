import { describe, it, expect } from 'vitest';
import { requireSuccessfulPinAttempt } from '../app/lib/v6PinAttempt';
import { readFileSync } from 'node:fs';

describe('PREP001 PIN result handling', () => {
  it('accepts only explicit success', () => {
    expect(() => requireSuccessfulPinAttempt({ok:true})).not.toThrow();
    for (const value of [null,undefined,[],{}, {ok:false}, {id:'legacy'}]) {
      expect(() => requireSuccessfulPinAttempt(value)).toThrow('No pudimos');
    }
  });
  it('turns a committed rejection into a user error, not success UI', () => {
    expect(() => requireSuccessfulPinAttempt({ok:false,code:'invalid_pin'})).toThrow('PIN incorrecto');
  });
  it('explains cooldown without exposing guesses or counters', () => {
    expect(() => requireSuccessfulPinAttempt({ok:false,code:'cooldown',retry_after_seconds:900})).toThrow('15 minutos');
    expect(() => requireSuccessfulPinAttempt({ok:false,code:'cooldown',retry_after_seconds:86400})).toThrow('24 horas');
  });
  it('handles non-PIN prerequisites and server failures', () => {
    expect(() => requireSuccessfulPinAttempt({ok:false,code:'evidence_required'})).toThrow('foto');
    expect(() => requireSuccessfulPinAttempt({ok:false,code:'unavailable'})).toThrow('disponible');
    expect(() => requireSuccessfulPinAttempt({ok:false,code:'temporarily_unavailable'})).toThrow('No pudimos');
  });
  it('shares a backend validator and removes unlimited implementations', () => {
    const sql=readFileSync('supabase/migrations/20260909211922_prep_001_pin_attempt_hardening.sql','utf8');
    expect(sql).toContain('drop function private.start_order_impl');
    expect(sql).toContain('drop function private.complete_order_impl');
    expect(sql).toContain('for update');
    expect(sql).toContain("private.attempt_order_pin(p_order_id,p_pin,'start')");
    expect(sql).toContain("private.attempt_order_pin(p_order_id,p_pin,'end')");
    expect(sql).toContain('extensions.gen_random_bytes(2)');
  });
});
