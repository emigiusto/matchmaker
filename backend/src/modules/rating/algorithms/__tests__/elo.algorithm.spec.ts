import { vi } from 'vitest';
import { EloRatingAlgorithm } from '../elo.algorithm';
import { EloPlayerSnapshot, PlayerSnapshot } from '../domain.types';

describe('EloRatingAlgorithm - Inactivity Decay', () => {
  const kFactor = 32;
  const confidenceIncrement = 0.02;
    const confidenceMax = 1; // Maximum confidence value
  const confidenceDecayRate = 0.01;
  const inactivityThresholdDays = 14;
  const minConfidence = 0.1;
  const algo = new EloRatingAlgorithm(kFactor, confidenceIncrement, confidenceMax, confidenceDecayRate, inactivityThresholdDays, minConfidence);

    function makeSnapshot(rating: number, confidence: number, lastMatchAt?: Date): EloPlayerSnapshot {
      return { rating, confidence, lastMatchAt: lastMatchAt ?? baseDate };
    }

  const baseDate = new Date('2026-02-15T12:00:00Z');
  const msPerDay = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseDate);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('No decay when lastMatchAt within threshold', () => {
    const lastMatchAt = new Date(baseDate.getTime() - (inactivityThresholdDays - 1) * msPerDay);
    const winner = makeSnapshot(1500, 0.5, lastMatchAt);
    const loser = makeSnapshot(1500, 0.5, lastMatchAt);
    const result = algo.compute({ winner, loser });
    expect(result.winnerNewConfidence).toBeCloseTo(Math.min(0.5 + confidenceIncrement, confidenceMax), 6);
    expect(result.loserNewConfidence).toBeCloseTo(Math.min(0.5 + confidenceIncrement, confidenceMax), 6);
  });

  it('Decay applied when inactivity exceeds threshold', () => {
    const daysOver = 3;
    const lastMatchAt = new Date(baseDate.getTime() - (inactivityThresholdDays + daysOver) * msPerDay);
    const winner = makeSnapshot(1500, 0.5, lastMatchAt);
    const loser = makeSnapshot(1500, 0.5, lastMatchAt);
    const expectedDecayed = Math.max(minConfidence, 0.5 - daysOver * confidenceDecayRate);
    const result = algo.compute({ winner, loser });
    expect(result.winnerNewConfidence).toBeCloseTo(Math.min(expectedDecayed + confidenceIncrement, confidenceMax), 6);
    expect(result.loserNewConfidence).toBeCloseTo(Math.min(expectedDecayed + confidenceIncrement, confidenceMax), 6);
  });

  it('Larger inactivity leads to larger decay', () => {
    const daysOverSmall = 2;
    const daysOverLarge = 10;
    const lastMatchAtSmall = new Date(baseDate.getTime() - (inactivityThresholdDays + daysOverSmall) * msPerDay);
    const lastMatchAtLarge = new Date(baseDate.getTime() - (inactivityThresholdDays + daysOverLarge) * msPerDay);
    const winnerSmall = makeSnapshot(1500, 0.5, lastMatchAtSmall);
    const winnerLarge = makeSnapshot(1500, 0.5, lastMatchAtLarge);
    const resultSmall = algo.compute({ winner: winnerSmall, loser: winnerSmall });
    const resultLarge = algo.compute({ winner: winnerLarge, loser: winnerLarge });
    const decayedSmall = Math.max(minConfidence, 0.5 - daysOverSmall * confidenceDecayRate);
    const decayedLarge = Math.max(minConfidence, 0.5 - daysOverLarge * confidenceDecayRate);
    expect(resultSmall.winnerNewConfidence).toBeGreaterThan(resultLarge.winnerNewConfidence);
    expect(decayedSmall).toBeGreaterThan(decayedLarge);
  });

  it('Decay affects rating volatility (larger delta)', () => {
    const daysOver = 8;
    const lastMatchAt = new Date(baseDate.getTime() - (inactivityThresholdDays + daysOver) * msPerDay);
    const winnerDecayed = makeSnapshot(1500, 0.5, lastMatchAt);
    const winnerFresh = makeSnapshot(1500, 0.5, baseDate);
    const loser = makeSnapshot(1500, 0.5, baseDate);
    const resultDecayed = algo.compute({ winner: winnerDecayed, loser });
    const resultFresh = algo.compute({ winner: winnerFresh, loser });
    const deltaDecayed = resultDecayed.winnerNewRating - winnerDecayed.rating;
    const deltaFresh = resultFresh.winnerNewRating - winnerFresh.rating;
    expect(deltaDecayed).toBeGreaterThan(deltaFresh);
  });

  it('Confidence never drops below minConfidence', () => {
    const daysOver = 100;
    const lastMatchAt = new Date(baseDate.getTime() - (inactivityThresholdDays + daysOver) * msPerDay);
    const winner = makeSnapshot(1500, 0.12, lastMatchAt);
    const loser = makeSnapshot(1500, 0.12, lastMatchAt);
    const result = algo.compute({ winner, loser });
    expect(result.winnerNewConfidence).toBeGreaterThanOrEqual(minConfidence);
    expect(result.loserNewConfidence).toBeGreaterThanOrEqual(minConfidence);
  });
});


describe('EloRatingAlgorithm', () => {
  const kFactor = 32;
  const confidenceIncrement = 0.02;
  const confidenceMax = 1;
  const confidenceDecayRate = 0.01;
  const inactivityThresholdDays = 14;
  const minConfidence = 0.1;
  const algo = new EloRatingAlgorithm(kFactor, confidenceIncrement, confidenceMax, confidenceDecayRate, inactivityThresholdDays, minConfidence);

  function makeSnapshot(rating: number, confidence: number, lastMatchAt: Date): EloPlayerSnapshot {
    return { rating, confidence, lastMatchAt };
  }

  it('Monotonicity: delta decreases as winner rating increases (vs same opponent)', () => {
    const now = new Date();
    const opponent = makeSnapshot(1200, 0.5, now);
    const weakWinner = makeSnapshot(1200, 0.5, now);
    const mediumWinner = makeSnapshot(1400, 0.5, now);
    const strongWinner = makeSnapshot(1800, 0.5, now);

    const d1 = algo.compute({ winner: weakWinner, loser: opponent }).winnerNewRating - weakWinner.rating;
    const d2 = algo.compute({ winner: mediumWinner, loser: opponent }).winnerNewRating - mediumWinner.rating;
    const d3 = algo.compute({ winner: strongWinner, loser: opponent }).winnerNewRating - strongWinner.rating;

    expect(d1).toBeGreaterThanOrEqual(d2);
    expect(d2).toBeGreaterThanOrEqual(d3);
  });

  it('Equal confidence: deltas match classic ELO', () => {
    const now = new Date();
    const winner = makeSnapshot(1500, 0.5, now);
    const loser = makeSnapshot(1500, 0.5, now);
    const result = algo.compute({ winner, loser });
    const expectedScore = 1 / (1 + Math.pow(10, (1500 - 1500) / 400));
    expect(expectedScore).toBeCloseTo(0.5, 6);
    const volatility = 1 + (1 - 0.5); // = 1.5
    const winnerK = kFactor * volatility;
    const loserK = kFactor * volatility;
    const expectedWinnerDelta = winnerK * (1 - expectedScore);
    const expectedLoserDelta = loserK * (0 - (1 - expectedScore));
    const winnerDelta = result.winnerNewRating - winner.rating;
    const loserDelta = result.loserNewRating - loser.rating;
    expect(winnerDelta).toBeCloseTo(expectedWinnerDelta, 6);
    expect(loserDelta).toBeCloseTo(expectedLoserDelta, 6);
  });

  it('Lower confidence player changes more than higher confidence player', () => {
    const now = new Date();
    const winner = makeSnapshot(1500, 0.2, now);
    const loser = makeSnapshot(1500, 1.0, now);
    const result = algo.compute({ winner, loser });
    const winnerVolatility = 1 + (1 - 0.2); // 1.8
    const loserVolatility = 1 + (1 - 1.0); // 1.0
    const winnerK = kFactor * winnerVolatility;
    const loserK = kFactor * loserVolatility;
    const expectedScore = 0.5;
    const expectedWinnerDelta = winnerK * (1 - expectedScore);
    const expectedLoserDelta = loserK * (0 - (1 - expectedScore));
    const winnerDelta = result.winnerNewRating - winner.rating;
    const loserDelta = result.loserNewRating - loser.rating;
    expect(winnerDelta).toBeCloseTo(expectedWinnerDelta, 6);
    expect(loserDelta).toBeCloseTo(expectedLoserDelta, 6);
    expect(Math.abs(winnerDelta)).toBeGreaterThan(Math.abs(loserDelta));
  });

  it('Confidence increment: increases but does not exceed max', () => {
    const now = new Date();
    const winner = makeSnapshot(1500, 0.99, now);
    const loser = makeSnapshot(1500, 0.99, now);
    const result = algo.compute({ winner, loser });
    expect(result.winnerNewConfidence).toBeCloseTo(Math.min(0.99 + confidenceIncrement, confidenceMax), 6);
    expect(result.loserNewConfidence).toBeCloseTo(Math.min(0.99 + confidenceIncrement, confidenceMax), 6);
    expect(result.winnerNewConfidence).toBeLessThanOrEqual(confidenceMax);
    expect(result.loserNewConfidence).toBeLessThanOrEqual(confidenceMax);
  });

  it('Confidence decays when inactivity exceeds threshold', () => {
    const now = new Date();
    const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const winner = makeSnapshot(1500, 0.5, daysAgo(inactivityThresholdDays + 5));
    const loser = makeSnapshot(1500, 0.5, daysAgo(1));
    const result = algo.compute({ winner, loser });
    // Winner confidence should decay: 5 days over threshold
    const expectedDecayed = Math.max(minConfidence, 0.5 - 5 * confidenceDecayRate);
    expect(result.winnerNewConfidence).toBeCloseTo(Math.min(expectedDecayed + confidenceIncrement, confidenceMax), 6);
    // Loser confidence should not decay
    expect(result.loserNewConfidence).toBeCloseTo(Math.min(0.5 + confidenceIncrement, confidenceMax), 6);
  });

  it('Confidence never drops below minConfidence', () => {
    const now = new Date();
    const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const winner = makeSnapshot(1500, 0.12, daysAgo(inactivityThresholdDays + 5));
    const loser = makeSnapshot(1500, 0.12, daysAgo(inactivityThresholdDays + 100));
    const result = algo.compute({ winner, loser });
    expect(result.winnerNewConfidence).toBeGreaterThanOrEqual(minConfidence);
    expect(result.loserNewConfidence).toBeGreaterThanOrEqual(minConfidence);
  });

  it('After decay, volatility increases accordingly', () => {
    const now = new Date();
    const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const winner = makeSnapshot(1500, 0.5, daysAgo(inactivityThresholdDays + 10));
    const loser = makeSnapshot(1500, 0.5, daysAgo(1));
    // Winner confidence decays
    const decayed = Math.max(minConfidence, 0.5 - 10 * confidenceDecayRate);
    const winnerVolatility = 1 + (1 - decayed);
    const winnerK = kFactor * winnerVolatility;
    const expectedScore = 0.5;
    const expectedWinnerDelta = winnerK * (1 - expectedScore);
    const result = algo.compute({ winner, loser });
    const winnerDelta = result.winnerNewRating - winner.rating;
    expect(winnerDelta).toBeCloseTo(expectedWinnerDelta, 6);
  });

  it('Stability: ratings remain finite numbers', () => {
    const now = new Date();
    const winner = makeSnapshot(1500, 0.5, now);
    const loser = makeSnapshot(1500, 0.5, now);
    const result = algo.compute({ winner, loser });
    expect(Number.isFinite(result.winnerNewRating)).toBe(true);
    expect(Number.isFinite(result.loserNewRating)).toBe(true);
  });
});
