import { DeterministicRatingAlgorithm } from '../deterministic.algorithm';
import { RatingConfig, PlayerSnapshot } from '../domain.types';

describe('DeterministicRatingAlgorithm', () => {
    it('Monotonicity: delta decreases as winner rating increases (vs same opponent)', () => {
      const opponent = makeSnapshot(3.0, 0.3);
      const weakWinner = makeSnapshot(3.0, 0.3);
      const mediumWinner = makeSnapshot(4.0, 0.3);
      const strongWinner = makeSnapshot(6.0, 0.3);

      const d1 = algo.compute({ winner: weakWinner, loser: opponent }).winnerNewRating - weakWinner.rating;
      const d2 = algo.compute({ winner: mediumWinner, loser: opponent }).winnerNewRating - mediumWinner.rating;
      const d3 = algo.compute({ winner: strongWinner, loser: opponent }).winnerNewRating - strongWinner.rating;

      expect(d1).toBeGreaterThanOrEqual(d2);
      expect(d2).toBeGreaterThanOrEqual(d3);
    });
  const config: RatingConfig = {
    baseGain: 0.1,
    upsetMultiplier: 1.5,
    maxDelta: 0.25,
    lossFactor: 0.5,
    confidenceIncrement: 0.02,
    confidenceMax: 1,
    defaultRating: 3.0,
    defaultConfidence: 0.3,
    minExpectedGain: 0.03,
    enableHistoryTracking: true,
  };
  const algo = new DeterministicRatingAlgorithm(config);

  function makeSnapshot(rating: number, confidence: number): PlayerSnapshot {
    return { rating, confidence };
  }

  it('Equal ratings: winner=3.0, loser=3.0, delta > 0, loser rating decreased correctly', () => {
    const winner = makeSnapshot(3.0, 0.3);
    const loser = makeSnapshot(3.0, 0.3);
    const result = algo.compute({ winner, loser });
    expect(result.winnerNewRating).toBeGreaterThan(winner.rating);
    expect(result.loserNewRating).toBeLessThan(loser.rating);
    const delta = result.winnerNewRating - winner.rating;
    expect(delta).toBeGreaterThan(0);
    expect(result.loserNewRating).toBeCloseTo(loser.rating - delta * config.lossFactor, 6);
  });

  it('Upset case: winner=3.0, loser=4.0, delta > expected win case', () => {
    const winner = makeSnapshot(3.0, 0.3);
    const loser = makeSnapshot(4.0, 0.3);
    const result = algo.compute({ winner, loser });
    const expectedWin = algo.compute({ winner: makeSnapshot(4.0, 0.3), loser: makeSnapshot(3.0, 0.3) });
    const upsetDelta = result.winnerNewRating - winner.rating;
    const expectedDelta = expectedWin.winnerNewRating - 4.0;
    expect(upsetDelta).toBeGreaterThan(expectedDelta);
  });

  it('Expected win: winner=4.0, loser=3.0, delta < upset case', () => {
    const winner = makeSnapshot(4.0, 0.3);
    const loser = makeSnapshot(3.0, 0.3);
    const result = algo.compute({ winner, loser });
    const upset = algo.compute({ winner: makeSnapshot(3.0, 0.3), loser: makeSnapshot(4.0, 0.3) });
    const expectedDelta = result.winnerNewRating - winner.rating;
    const upsetDelta = upset.winnerNewRating - 3.0;
    expect(expectedDelta).toBeLessThan(upsetDelta);
  });

  it('Delta capped: large rating difference, delta does not exceed maxDelta', () => {
    const winner = makeSnapshot(1.0, 0.3);
    const loser = makeSnapshot(10.0, 0.3);
    const result = algo.compute({ winner, loser });
    const delta = result.winnerNewRating - winner.rating;
    expect(delta).toBeLessThanOrEqual(config.maxDelta);
  });

  it('Delta never below minExpectedGain', () => {
    const winner = makeSnapshot(10.0, 0.3);
    const loser = makeSnapshot(1.0, 0.3);
    const result = algo.compute({ winner, loser });
    const delta = result.winnerNewRating - winner.rating;
    const epsilon = 1e-8;
    expect(delta + epsilon).toBeGreaterThanOrEqual(config.minExpectedGain);
  });

  it('Confidence update: increments correctly and never exceeds confidenceMax', () => {
    const winner = makeSnapshot(3.0, 0.99);
    const loser = makeSnapshot(3.0, 0.99);
    const result = algo.compute({ winner, loser });
    expect(result.winnerNewConfidence).toBeCloseTo(Math.min(0.99 + config.confidenceIncrement, config.confidenceMax), 6);
    expect(result.loserNewConfidence).toBeCloseTo(Math.min(0.99 + config.confidenceIncrement, config.confidenceMax), 6);
    expect(result.winnerNewConfidence).toBeLessThanOrEqual(config.confidenceMax);
    expect(result.loserNewConfidence).toBeLessThanOrEqual(config.confidenceMax);
  });

  it('Determinism: same input returns same output', () => {
    const winner = makeSnapshot(3.5, 0.5);
    const loser = makeSnapshot(2.5, 0.5);
    const result1 = algo.compute({ winner, loser });
    const result2 = algo.compute({ winner, loser });
    expect(result1).toEqual(result2);
  });
});
