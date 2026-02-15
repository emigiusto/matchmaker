import { EloRatingAlgorithm } from '../elo.algorithm';
import { PlayerSnapshot } from '../domain.types';

describe('EloRatingAlgorithm', () => {
  const kFactor = 32;
  const confidenceIncrement = 0.02;
  const confidenceMax = 1;
  const algo = new EloRatingAlgorithm(kFactor, confidenceIncrement, confidenceMax);

  function makeSnapshot(rating: number, confidence: number): PlayerSnapshot {
    return { rating, confidence };
  }

  it('Equal ratings: winner=1500, loser=1500, expectedScore ≈ 0.5, delta ≈ kFactor*volatility*(1-expectedScore)', () => {
    const winner = makeSnapshot(1500, 0.5);
    const loser = makeSnapshot(1500, 0.5);
    const result = algo.compute({ winner, loser });
    // expectedScore ≈ 0.5
    const expectedScore = 1 / (1 + Math.pow(10, (1500 - 1500) / 400));
    expect(expectedScore).toBeCloseTo(0.5, 6);
    // Volatility multiplier for confidence 0.5 is 1.5
    const volatility = 1 + (1 - 0.5); // = 1.5
    const expectedDelta = kFactor * volatility * (1 - expectedScore);
    const winnerDelta = result.winnerNewRating - winner.rating;
    expect(winnerDelta).toBeCloseTo(expectedDelta, 6);
    // Loser delta
    const loserDelta = result.loserNewRating - loser.rating;
    expect(loserDelta).toBeCloseTo(-winnerDelta, 6);
  });

  it('Higher-rated wins: winner=1800, loser=1200, expect small delta', () => {
    const winner = makeSnapshot(1800, 0.5);
    const loser = makeSnapshot(1200, 0.5);
    const result = algo.compute({ winner, loser });
    const winnerDelta = result.winnerNewRating - winner.rating;
    expect(winnerDelta).toBeLessThan(kFactor * 0.5); // Should be less than base delta
  });

  it('Lower-rated wins: winner=1200, loser=1800, expect larger delta', () => {
    const winner = makeSnapshot(1200, 0.5);
    const loser = makeSnapshot(1800, 0.5);
    const result = algo.compute({ winner, loser });
    const winnerDelta = result.winnerNewRating - winner.rating;
    expect(winnerDelta).toBeGreaterThan(kFactor * 0.5); // Should be greater than base delta
  });

  it('Zero-sum invariant: winnerDelta + loserDelta ≈ 0', () => {
    const winner = makeSnapshot(1400, 0.5);
    const loser = makeSnapshot(1600, 0.5);
    const result = algo.compute({ winner, loser });
    const winnerDelta = result.winnerNewRating - winner.rating;
    const loserDelta = result.loserNewRating - loser.rating;
    expect(winnerDelta + loserDelta).toBeCloseTo(0, 10);
  });

  it('Dynamic K-factor: lower confidence → larger rating change, higher confidence → smaller rating change', () => {
    const winnerLowConf = makeSnapshot(1500, 0.2);
    const loserLowConf = makeSnapshot(1500, 0.2);
    const winnerHighConf = makeSnapshot(1500, 1.0);
    const loserHighConf = makeSnapshot(1500, 1.0);
    const resultLow = algo.compute({ winner: winnerLowConf, loser: loserLowConf });
    const resultHigh = algo.compute({ winner: winnerHighConf, loser: loserHighConf });
    const deltaLow = resultLow.winnerNewRating - winnerLowConf.rating;
    const deltaHigh = resultHigh.winnerNewRating - winnerHighConf.rating;
    expect(deltaLow).toBeGreaterThan(deltaHigh);
  });

  it('Confidence increment: increases but does not exceed max', () => {
    const winner = makeSnapshot(1500, 0.99);
    const loser = makeSnapshot(1500, 0.99);
    const result = algo.compute({ winner, loser });
    expect(result.winnerNewConfidence).toBeCloseTo(Math.min(0.99 + confidenceIncrement, confidenceMax), 6);
    expect(result.loserNewConfidence).toBeCloseTo(Math.min(0.99 + confidenceIncrement, confidenceMax), 6);
    expect(result.winnerNewConfidence).toBeLessThanOrEqual(confidenceMax);
    expect(result.loserNewConfidence).toBeLessThanOrEqual(confidenceMax);
  });

  it('Stability: ratings remain finite numbers', () => {
    const winner = makeSnapshot(1500, 0.5);
    const loser = makeSnapshot(1500, 0.5);
    const result = algo.compute({ winner, loser });
    expect(Number.isFinite(result.winnerNewRating)).toBe(true);
    expect(Number.isFinite(result.loserNewRating)).toBe(true);
  });
});
