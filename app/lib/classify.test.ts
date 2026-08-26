import { describe, expect, it } from 'vitest';
import { classifyNeed } from './classify';

describe('classifyNeed', () => {
  it('detects plumbing from natural language', () => {
    const result = classifyNeed('Pierde agua debajo de la cocina');

    expect(result.categorySlug).toBe('plomeria');
    expect(result.suggestedMode).toBe('immediate');
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it('routes complex work to quote mode', () => {
    const result = classifyNeed('Necesito pintar un departamento completo');

    expect(result.categorySlug).toBe('pintura');
    expect(result.suggestedMode).toBe('quote');
  });

  it('detects automotive mechanics with accented text', () => {
    const result = classifyNeed('Necesito un mecánico automotor para revisar frenos');

    expect(result.categorySlug).toBe('mecanica_automotor');
    expect(result.suggestedMode).toBe('scheduled');
  });

  it('detects tire repair and roadside wheel issues', () => {
    const result = classifyNeed('Pinché una goma y necesito gomería o auxilio de rueda');

    expect(result.categorySlug).toBe('gomeria');
    expect(result.suggestedMode).toBe('immediate');
  });

  it('routes car body paint work to quote mode', () => {
    const result = classifyNeed('Tengo una abolladura y rayón en el auto');

    expect(result.categorySlug).toBe('chapa_pintura_auto');
    expect(result.suggestedMode).toBe('quote');
  });

  it('keeps unknown text explicit instead of inventing a category', () => {
    const result = classifyNeed('Quiero resolver algo raro');

    expect(result.categorySlug).toBeNull();
    expect(result.confidence).toBeLessThan(0.3);
  });
});
