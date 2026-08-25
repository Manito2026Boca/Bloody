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

  it('keeps unknown text explicit instead of inventing a category', () => {
    const result = classifyNeed('Quiero resolver algo raro');

    expect(result.categorySlug).toBeNull();
    expect(result.confidence).toBeLessThan(0.3);
  });
});
