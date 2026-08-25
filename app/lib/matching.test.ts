import { describe, expect, it } from 'vitest';
import { calculateMatchScore } from './matching';

describe('calculateMatchScore', () => {
  it('rewards close, reliable, high-rated professionals', () => {
    const score = calculateMatchScore({
      distanceKm: 2.3,
      ratingAvg: 4.9,
      jobsCompleted: 386,
      acceptanceRate: 0.94,
      cancellationRate: 0.02,
      punctualityRate: 0.97,
      priceFit: 0.86,
      isFavorite: true,
      isManitoPro: true,
    });

    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('penalizes distance and reliability issues', () => {
    const score = calculateMatchScore({
      distanceKm: 28,
      ratingAvg: 3.8,
      jobsCompleted: 4,
      acceptanceRate: 0.55,
      cancellationRate: 0.28,
      punctualityRate: 0.62,
      priceFit: 0.4,
      isFavorite: false,
      isManitoPro: false,
    });

    expect(score).toBeLessThan(60);
  });
});
