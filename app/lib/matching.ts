export type MatchInput = {
  distanceKm: number;
  ratingAvg: number;
  jobsCompleted: number;
  acceptanceRate: number;
  cancellationRate: number;
  punctualityRate: number;
  priceFit: number;
  isFavorite: boolean;
  isManitoPro: boolean;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function calculateMatchScore(input: MatchInput) {
  const distance = clamp01(1 - input.distanceKm / 25);
  const rating = clamp01(input.ratingAvg / 5);
  const volume = clamp01(Math.log10(input.jobsCompleted + 1) / 3);
  const acceptance = clamp01(input.acceptanceRate);
  const cancellation = clamp01(1 - input.cancellationRate);
  const punctuality = clamp01(input.punctualityRate);
  const price = clamp01(input.priceFit);
  const favorite = input.isFavorite ? 1 : 0;
  const pro = input.isManitoPro ? 1 : 0;

  const weighted =
    distance * 0.18 +
    rating * 0.2 +
    volume * 0.1 +
    acceptance * 0.13 +
    cancellation * 0.1 +
    punctuality * 0.12 +
    price * 0.1 +
    favorite * 0.04 +
    pro * 0.03;

  return Math.round(clamp01(weighted) * 100);
}
